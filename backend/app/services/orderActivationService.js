import Order from "../models/order.js";
import Store from "../models/store.js";
import DeliveryAssignment from "../models/deliveryAssignment.js";
import {
  WORKFLOW_STATUS,
  legacyStatusFromWorkflow,
  DEFAULT_DELIVERY_TIMEOUT_MS,
} from "../constants/orderWorkflow.js";
import { compensateOrderCancellation } from "./orderCompensation.js";
import {
  emitOrderStatusUpdate,
  emitDeliveryBroadcastForSeller,
} from "./orderSocketEmitter.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import { requireCanonicalOrderId } from "../utils/orderLookup.js";
import { getPlatformDeliveryProvider } from "./finance/financeSettingsService.js";
import { FULFILLMENT_METHOD } from "../constants/deliveryPolicy.js";
import {
  scheduleDeliveryTimeoutJob,
  deliveryBroadcastPayloadFromOrder,
} from "./orderWorkflowService.js";
import { isSellerSubscriptionOperational } from "./subscriptionService.js";
import Seller from "../models/seller.js";

const INITIAL_DELIVERY_RADIUS_M = () =>
  parseInt(process.env.INITIAL_DELIVERY_RADIUS_METERS || "5000", 10);

async function isSellerOperational(storeId) {
  const store = await Store.findById(storeId).select("ownerId isActive isVerified applicationStatus").lean();
  if (!store?.isActive || !store?.isVerified) return false;
  const seller = await Seller.findById(store.ownerId).select("businessModel").lean();
  if (!seller) return true;
  if (seller.businessModel === "subscription") {
    return isSellerSubscriptionOperational(store.ownerId);
  }
  return true;
}

/**
 * Activate a scheduled order: SCHEDULED_HOLD -> DELIVERY_SEARCH / EXTERNAL_LOGISTICS_PENDING
 */
export async function processOrderActivationJob({ orderId }) {
  orderId = await requireCanonicalOrderId(orderId);
  const now = new Date();
  const order = await Order.findOne({
    orderId,
    workflowVersion: { $gte: 2 },
    workflowStatus: WORKFLOW_STATUS.SCHEDULED_HOLD,
  });

  if (!order) return;

  if (order.schedule?.activationAt && new Date(order.schedule.activationAt) > now) {
    return;
  }

  const operational = await isSellerOperational(order.seller);
  if (!operational) {
    const updated = await Order.findOneAndUpdate(
      { orderId, workflowStatus: WORKFLOW_STATUS.SCHEDULED_HOLD },
      {
        $set: {
          workflowStatus: WORKFLOW_STATUS.CANCELLED,
          status: "cancelled",
          cancelledBy: "system",
          cancelReason: "Seller not operational at activation time",
        },
      },
      { new: true },
    );
    if (updated) {
      await compensateOrderCancellation(updated, orderId);
      emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CANCELLED, {
        orderId,
        customerId: updated.customer,
        userId: updated.customer,
        sellerId: updated.seller,
        customerMessage: "Order cancelled because seller was unavailable.",
      });
    }
    return;
  }

  const fulfillmentMethod = order.fulfillmentMethod || FULFILLMENT_METHOD.PLATFORM_LOGISTICS;
  const useCustomerPickup = fulfillmentMethod === FULFILLMENT_METHOD.CUSTOMER_PICKUP;
  const useExternal =
    fulfillmentMethod === FULFILLMENT_METHOD.SELLER_DELIVERY ||
    order.logisticsMode === "external";
  let nextStatus = WORKFLOW_STATUS.DELIVERY_SEARCH;
  if (useCustomerPickup) {
    nextStatus = WORKFLOW_STATUS.SELLER_ACCEPTED;
  } else if (useExternal) {
    nextStatus = WORKFLOW_STATUS.EXTERNAL_LOGISTICS_PENDING;
  }

  const updateSet = {
    workflowStatus: nextStatus,
    status: legacyStatusFromWorkflow(nextStatus),
    "schedule.activatedAt": now,
  };

  if (!useExternal && !useCustomerPickup) {
    const deliveryMs = DEFAULT_DELIVERY_TIMEOUT_MS();
    updateSet.deliverySearchExpiresAt = new Date(now.getTime() + deliveryMs);
    updateSet.deliverySearchMeta = {
      radiusMeters: INITIAL_DELIVERY_RADIUS_M(),
      attempt: 1,
      lastBroadcastAt: now,
    };
  }

  const updated = await Order.findOneAndUpdate(
    {
      orderId,
      workflowVersion: { $gte: 2 },
      workflowStatus: WORKFLOW_STATUS.SCHEDULED_HOLD,
    },
    { $set: updateSet },
    { new: true },
  )
    .populate("customer", "name phone")
    .populate("seller", "shopName address name location serviceRadius");

  if (!updated) return;

  if (!useExternal && !useCustomerPickup) {
    await scheduleDeliveryTimeoutJob(orderId, 1);
    await DeliveryAssignment.create({
      orderMongoId: updated._id,
      orderId: updated.orderId,
      status: "broadcasting",
      radiusMeters: INITIAL_DELIVERY_RADIUS_M(),
      attempt: 1,
      expiresAt: updated.deliverySearchExpiresAt,
    });
    await emitDeliveryBroadcastForSeller(
      updated.seller,
      deliveryBroadcastPayloadFromOrder(updated),
    );
  }

  emitOrderStatusUpdate(
    orderId,
    { workflowStatus: nextStatus, scheduledActivated: true },
    updated.customer?._id || updated.customer,
  );
  emitNotificationEvent(NOTIFICATION_EVENTS.SCHEDULED_ACTIVATED, {
    orderId,
    customerId: updated.customer?._id || updated.customer,
    userId: updated.customer?._id || updated.customer,
    sellerId: updated.seller?._id || updated.seller,
  });
}

export async function activateDueScheduledOrdersSweep() {
  const now = new Date();
  const due = await Order.find({
    workflowVersion: { $gte: 2 },
    workflowStatus: WORKFLOW_STATUS.SCHEDULED_HOLD,
    "schedule.activationAt": { $lte: now },
  })
    .select("orderId")
    .limit(50)
    .lean();

  for (const row of due) {
    try {
      await processOrderActivationJob({ orderId: row.orderId });
    } catch (err) {
      console.warn("[activateDueScheduledOrdersSweep]", row.orderId, err.message);
    }
  }
  return due.length;
}
