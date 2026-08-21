import mongoose from "mongoose";
import Order from "../models/order.js";
import DeliveryAssignment from "../models/deliveryAssignment.js";
import Delivery from "../models/delivery.js";
import OrderOtp from "../models/orderOtp.js";
import Store from "../models/store.js";
import {
  WORKFLOW_STATUS,
  legacyStatusFromWorkflow,
  workflowFromLegacyStatus,
  DEFAULT_SELLER_TIMEOUT_MS,
  DEFAULT_DELIVERY_TIMEOUT_MS,
  FULFILLMENT_TYPE,
} from "../constants/orderWorkflow.js";
import { compensateOrderCancellation } from "./orderCompensation.js";
import {
  sellerTimeoutQueue,
  deliveryTimeoutQueue,
  JOB_NAMES,
} from "../queues/orderQueues.js";
import { getRedisClient } from "../config/redis.js";
import {
  emitOrderStatusUpdate,
  emitToSeller,
  emitDeliveryBroadcastForSeller,
  emitToCustomer,
  emitToDelivery,
  retractDeliveryBroadcastForOrder,
} from "./orderSocketEmitter.js";
import { distanceMeters } from "../utils/geoUtils.js";
import { applyDeliveredSettlement } from "./orderSettlement.js";
import { requireCanonicalOrderId } from "../utils/orderLookup.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import { getPlatformDeliveryProvider } from "./finance/financeSettingsService.js";
import {
  resolveFulfillmentAtSellerAccept,
  resolveStoreDeliveryPolicy,
} from "./deliveryOptionResolver.js";
import { FULFILLMENT_METHOD } from "../constants/deliveryPolicy.js";
import { assertTransition } from "./orderStateMachine.js";
import {
  scheduleOrderActivationJob,
} from "./orderSchedulingService.js";
import { markOrderReadyForCustomerPickup } from "./customerPickupService.js";

const DELIVERY_SEARCH_MAX_ATTEMPTS = () =>
  parseInt(process.env.DELIVERY_SEARCH_MAX_ATTEMPTS || "3", 10);

const DELIVERY_RADIUS_MULTIPLIER = () =>
  parseFloat(process.env.DELIVERY_RADIUS_MULTIPLIER || "1.5");
const INITIAL_DELIVERY_RADIUS_M = () =>
  parseInt(process.env.INITIAL_DELIVERY_RADIUS_METERS || "5000", 10);

/** Payload for `delivery:broadcast` + Notification.data — lets the app show a modal without relying on GET /available alone. */
export function deliveryBroadcastPayloadFromOrder(order, extra = {}) {
  const seller =
    order.seller && typeof order.seller === "object" && order.seller !== null
      ? order.seller
      : null;
  const sellerAddress =
    typeof seller?.address === "string" && seller.address.trim()
      ? seller.address.trim()
      : null;
  const pickup = seller?.shopName
    ? sellerAddress
      ? `${seller.shopName} - ${sellerAddress}`
      : seller.shopName
    : "Seller";
  const drop =
    typeof order.address?.address === "string" && order.address.address.trim()
      ? order.address.address.trim()
      : "Customer address";
  const meta = order.deliverySearchMeta || {};
  const sid = seller?._id ?? order.seller;

  const sellerCoords = seller?.location?.coordinates;
  const dropCoords = order.address?.location?.coordinates;
  let distanceKm;
  if (
    Array.isArray(sellerCoords) && sellerCoords.length >= 2 &&
    Array.isArray(dropCoords) && dropCoords.length >= 2
  ) {
    const meters = distanceMeters(sellerCoords[1], sellerCoords[0], dropCoords[1], dropCoords[0]);
    if (Number.isFinite(meters)) distanceKm = Math.round((meters / 1000) * 10) / 10;
  }

  const earningsEstimate = Number(order.paymentBreakdown?.riderPayoutTotal);

  return {
    orderId: order.orderId,
    workflowStatus: order.workflowStatus || WORKFLOW_STATUS.DELIVERY_SEARCH,
    sellerId: sid != null ? String(sid) : undefined,
    radiusMeters: meta.radiusMeters ?? INITIAL_DELIVERY_RADIUS_M(),
    preview: {
      pickup,
      drop,
      total: order.pricing?.total ?? 0,
      distanceKm,
      earnings: Number.isFinite(earningsEstimate) ? earningsEstimate : undefined,
    },
    deliverySearchExpiresAt: order.deliverySearchExpiresAt,
    ...extra,
  };
}
const PICKUP_RADIUS_M = () =>
  parseInt(process.env.PICKUP_RADIUS_METERS || "150", 10);
const OTP_RADIUS_M = () =>
  parseInt(process.env.DELIVERY_OTP_RADIUS_METERS || "150", 10);
const OTP_EXPIRY_MS = () =>
  parseInt(process.env.DELIVERY_OTP_EXPIRY_MS || "300000", 10);

export function resolveWorkflowStatus(order) {
  if (order.workflowVersion >= 2 && order.workflowStatus) {
    return order.workflowStatus;
  }
  return workflowFromLegacyStatus(order.status);
}

function resolveCustomerCancellationMode(order) {
  if (!order) return "blocked";

  const workflowStatus = resolveWorkflowStatus(order);
  const rawStatus = String(order.status || "").toLowerCase();

  if (
    workflowStatus === WORKFLOW_STATUS.CANCELLED ||
    workflowStatus === WORKFLOW_STATUS.DELIVERED ||
    rawStatus === "cancelled" ||
    rawStatus === "delivered"
  ) {
    return "blocked";
  }

  if (
    workflowStatus === WORKFLOW_STATUS.SELLER_PENDING ||
    rawStatus === "pending"
  ) {
    return "instant";
  }

  if (!order.deliveryBoy && ["confirmed", "packed"].includes(rawStatus)) {
    return "approval";
  }

  if (
    !order.deliveryBoy &&
    [
      WORKFLOW_STATUS.SELLER_ACCEPTED,
      WORKFLOW_STATUS.DELIVERY_SEARCH,
      WORKFLOW_STATUS.EXTERNAL_LOGISTICS_PENDING,
    ].includes(workflowStatus)
  ) {
    return "approval";
  }

  return "blocked";
}

/**
 * After creating a new order document (v2), schedule seller timeout and emit.
 */
export async function afterPlaceOrderV2(orderDoc) {
  const orderId = orderDoc.orderId;
  await scheduleSellerTimeoutJob(orderId);
  emitToSeller(orderDoc.seller?.toString(), {
    event: "order:new",
    payload: {
      orderId,
      workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
      sellerPendingExpiresAt: orderDoc.sellerPendingExpiresAt,
    },
  });
}

const BULL_ADD_TIMEOUT_MS = () =>
  parseInt(process.env.BULL_ADD_TIMEOUT_MS || "10000", 10);

export async function scheduleSellerTimeoutJob(orderId) {
  const delay = DEFAULT_SELLER_TIMEOUT_MS();
  const addPromise = sellerTimeoutQueue
    .add(
      JOB_NAMES.SELLER_TIMEOUT,
      { orderId },
      {
        delay,
        jobId: `order:${orderId}:seller`,
        removeOnComplete: true,
      },
    )
    .catch((err) => {
      console.warn("[scheduleSellerTimeoutJob] add failed", orderId, err.message);
    });
  const timeoutMs = BULL_ADD_TIMEOUT_MS();
  try {
    await Promise.race([
      addPromise,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`seller-timeout queue add exceeded ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
  } catch (e) {
    console.warn("[scheduleSellerTimeoutJob]", orderId, e.message);
  }
}

export async function removeSellerTimeoutJob(orderId) {
  const timeoutMs = BULL_ADD_TIMEOUT_MS();
  const work = (async () => {
    const job = await sellerTimeoutQueue.getJob(`order:${orderId}:seller`);
    if (job) await job.remove();
  })().catch((err) => {
    console.warn("[removeSellerTimeoutJob] get/remove failed", orderId, err.message);
  });
  try {
    await Promise.race([
      work,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`remove seller job exceeded ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
  } catch (e) {
    console.warn("[removeSellerTimeoutJob]", orderId, e.message);
  }
}

export async function scheduleDeliveryTimeoutJob(orderId, attempt = 1) {
  const delay = DEFAULT_DELIVERY_TIMEOUT_MS();
  const jobId = `order:${orderId}:delivery:${attempt}`;
  const addPromise = deliveryTimeoutQueue
    .add(
      JOB_NAMES.DELIVERY_TIMEOUT,
      { orderId, attempt },
      {
        delay,
        jobId,
        removeOnComplete: true,
      },
    )
    .catch((err) => {
      console.warn(
        "[scheduleDeliveryTimeoutJob] add failed",
        orderId,
        err.message,
      );
    });
  const timeoutMs = BULL_ADD_TIMEOUT_MS();
  try {
    await Promise.race([
      addPromise,
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(`delivery-timeout queue add exceeded ${timeoutMs}ms`),
            ),
          timeoutMs,
        ),
      ),
    ]);
  } catch (e) {
    console.warn("[scheduleDeliveryTimeoutJob]", orderId, e.message);
  }
}

export async function removeDeliveryTimeoutJob(orderId, attempt = 1) {
  const timeoutMs = BULL_ADD_TIMEOUT_MS();
  const jobKey = `order:${orderId}:delivery:${attempt}`;
  const work = (async () => {
    const job = await deliveryTimeoutQueue.getJob(jobKey);
    if (job) await job.remove();
  })().catch((err) => {
    console.warn("[removeDeliveryTimeoutJob] get/remove failed", orderId, err.message);
  });
  try {
    await Promise.race([
      work,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`remove delivery job exceeded ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
  } catch (e) {
    console.warn("[removeDeliveryTimeoutJob]", orderId, e.message);
  }
}

/**
 * Seller accepts: SELLER_PENDING -> DELIVERY_SEARCH (atomic).
 */
export async function sellerAcceptAtomic(sellerId, orderId) {
  orderId = await requireCanonicalOrderId(orderId);
  const now = new Date();
  const sellerMs = DEFAULT_SELLER_TIMEOUT_MS();
  const deliveryMs = DEFAULT_DELIVERY_TIMEOUT_MS();

  const existingOrder = await Order.findOne({ orderId, seller: sellerId })
    .select("logisticsMode workflowStatus fulfillmentType schedule fulfillmentMethod fulfillmentMeta")
    .lean();

  const store = await Store.findById(sellerId).lean();
  const acceptResolution = await resolveFulfillmentAtSellerAccept(existingOrder, store);
  const fulfillmentMethod =
    acceptResolution.fulfillmentMethod ||
    existingOrder?.fulfillmentMethod ||
    FULFILLMENT_METHOD.PLATFORM_LOGISTICS;
  const logisticsMode = acceptResolution.logisticsMode || existingOrder?.logisticsMode;
  const useCustomerPickup = fulfillmentMethod === FULFILLMENT_METHOD.CUSTOMER_PICKUP;
  const useExternalLogistics =
    fulfillmentMethod === FULFILLMENT_METHOD.SELLER_DELIVERY ||
    logisticsMode === "external";
  const isScheduled =
    existingOrder?.fulfillmentType === FULFILLMENT_TYPE.SCHEDULED ||
    existingOrder?.fulfillmentType === FULFILLMENT_TYPE.PREORDER;

  if (isScheduled) {
    const updatedScheduled = await Order.findOneAndUpdate(
      {
        orderId,
        seller: sellerId,
        workflowVersion: { $gte: 2 },
        workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
        sellerPendingExpiresAt: { $gt: now },
        $or: [
          { paymentMode: { $ne: "ONLINE" } },
          { paymentStatus: "PAID" },
        ],
      },
      {
        $set: {
          workflowStatus: WORKFLOW_STATUS.SCHEDULED_HOLD,
          status: legacyStatusFromWorkflow(WORKFLOW_STATUS.SCHEDULED_HOLD),
          sellerAcceptedAt: now,
        },
        $unset: { expiresAt: 1 },
      },
      { new: true },
    )
      .populate("customer", "name phone")
      .populate("seller", "shopName address name location serviceRadius");

    if (!updatedScheduled) {
      const err = new Error("Order not available for acceptance or expired");
      err.statusCode = 409;
      throw err;
    }

    void removeSellerTimeoutJob(orderId);

    const activationAt =
      updatedScheduled.schedule?.activationAt ||
      new Date(now.getTime() + 60 * 60 * 1000);
    const orderMongoId = updatedScheduled._id;
    void scheduleOrderActivationJob(orderId, activationAt)
      .then((jobId) =>
        Order.updateOne(
          { _id: orderMongoId },
          {
            $set: {
              "schedule.activationAt": activationAt,
              "schedule.activationJobId": jobId,
            },
          },
        ),
      )
      .catch((err) => {
        console.warn(
          "[sellerAcceptAtomic] activation job schedule failed",
          orderId,
          err.message,
        );
      });

    emitOrderStatusUpdate(
      updatedScheduled.orderId,
      { workflowStatus: WORKFLOW_STATUS.SCHEDULED_HOLD, scheduledHold: true },
      updatedScheduled.customer?._id || updatedScheduled.customer,
    );
    emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CONFIRMED, {
      orderId: updatedScheduled.orderId,
      customerId: updatedScheduled.customer?._id || updatedScheduled.customer,
      userId: updatedScheduled.customer?._id || updatedScheduled.customer,
      sellerId: updatedScheduled.seller?._id || updatedScheduled.seller,
    });
    return updatedScheduled;
  }

  let nextWorkflowStatus = WORKFLOW_STATUS.DELIVERY_SEARCH;
  if (useCustomerPickup) {
    nextWorkflowStatus = WORKFLOW_STATUS.SELLER_ACCEPTED;
  } else if (useExternalLogistics) {
    nextWorkflowStatus = WORKFLOW_STATUS.EXTERNAL_LOGISTICS_PENDING;
  }

  const updateSet = {
    workflowStatus: nextWorkflowStatus,
    status: legacyStatusFromWorkflow(nextWorkflowStatus),
    sellerAcceptedAt: now,
    fulfillmentMethod,
    logisticsMode,
  };

  if (acceptResolution.autoSwitched) {
    updateSet["fulfillmentMeta.autoSwitched"] = true;
    updateSet["fulfillmentMeta.switchReason"] = acceptResolution.switchReason || "";
  }

  if (nextWorkflowStatus === WORKFLOW_STATUS.DELIVERY_SEARCH) {
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
      seller: sellerId,
      workflowVersion: { $gte: 2 },
      workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
      sellerPendingExpiresAt: { $gt: now },
      $or: [
        { paymentMode: { $ne: "ONLINE" } },
        { paymentStatus: "PAID" },
      ],
    },
    {
      $set: updateSet,
      $unset: { expiresAt: 1 },
    },
    { new: true },
  )
    .populate("customer", "name phone")
    .populate("seller", "shopName address name location serviceRadius");

  if (!updated) {
    const err = new Error("Order not available for acceptance or expired");
    err.statusCode = 409;
    throw err;
  }

  void removeSellerTimeoutJob(orderId);

  if (useExternalLogistics || useCustomerPickup) {
    emitOrderStatusUpdate(
      updated.orderId,
      {
        workflowStatus: nextWorkflowStatus,
        fulfillmentMethod,
        autoSwitched: acceptResolution.autoSwitched || false,
      },
      updated.customer?._id || updated.customer,
    );
    emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CONFIRMED, {
      orderId: updated.orderId,
      customerId: updated.customer?._id || updated.customer,
      userId: updated.customer?._id || updated.customer,
      sellerId: updated.seller?._id || updated.seller,
    }).catch(() => {});
    return updated;
  }

  await scheduleDeliveryTimeoutJob(orderId, 1);

  await DeliveryAssignment.create({
    orderMongoId: updated._id,
    orderId: updated.orderId,
    status: "broadcasting",
    radiusMeters: INITIAL_DELIVERY_RADIUS_M(),
    attempt: 1,
    expiresAt: updated.deliverySearchExpiresAt,
  });

  emitOrderStatusUpdate(
    updated.orderId,
    {
      workflowStatus: WORKFLOW_STATUS.DELIVERY_SEARCH,
      deliverySearchExpiresAt: updated.deliverySearchExpiresAt,
    },
    updated.customer?._id || updated.customer,
  );
  await emitDeliveryBroadcastForSeller(
    updated.seller,
    deliveryBroadcastPayloadFromOrder(updated),
  );

  emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CONFIRMED, {
    orderId: updated.orderId,
    customerId: updated.customer?._id || updated.customer,
    userId: updated.customer?._id || updated.customer,
    sellerId: updated.seller?._id || updated.seller,
  });

  return updated;
}

/**
 * Seller rejects: SELLER_PENDING -> CANCELLED + compensation.
 */
export async function sellerRejectAtomic(sellerId, orderId, reason) {
  const trimmedReason = String(reason || "").trim();
  if (trimmedReason.length < 10) {
    const err = new Error("Please provide a cancellation reason (at least 10 characters)");
    err.statusCode = 400;
    throw err;
  }

  orderId = await requireCanonicalOrderId(orderId);
  const now = new Date();
  const order = await Order.findOneAndUpdate(
    {
      orderId,
      seller: sellerId,
      workflowVersion: { $gte: 2 },
      workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
      sellerPendingExpiresAt: { $gt: now },
    },
    {
      $set: {
        workflowStatus: WORKFLOW_STATUS.CANCELLED,
        status: "cancelled",
        cancelledBy: "seller",
        cancelReason: trimmedReason,
      },
    },
    { new: true },
  );

  if (!order) {
    const err = new Error("Order not available to reject");
    err.statusCode = 409;
    throw err;
  }

  await removeSellerTimeoutJob(orderId);
  await compensateOrderCancellation(order, orderId);

  emitOrderStatusUpdate(order.orderId, {
    workflowStatus: WORKFLOW_STATUS.CANCELLED,
  }, order.customer);
  emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CANCELLED, {
    orderId: order.orderId,
    customerId: order.customer,
    userId: order.customer,
    sellerId: order.seller,
    customerMessage: `Your order was cancelled by the seller. Reason: ${trimmedReason}`,
    sellerMessage: `Order #${order.orderId} was cancelled.`,
  });
  return order;
}

/**
 * Seller advances order after accept (self-delivery / external / customer pickup).
 * Platform logistics (rider flow) is rejected — rider updates those statuses.
 */
export async function sellerUpdateStatusAtomic(sellerId, orderId, nextLegacyStatus, additionalData = {}) {
  orderId = await requireCanonicalOrderId(orderId);
  const legacy = String(nextLegacyStatus || "").toLowerCase();

  const order = await Order.findOne({ orderId, seller: sellerId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  if (Number(order.workflowVersion) < 2) {
    return null; // caller falls back to legacy path
  }

  const ws = String(order.workflowStatus || "").toUpperCase();
  const method = String(
    order.fulfillmentMethod ||
      (order.logisticsMode === "external"
        ? FULFILLMENT_METHOD.SELLER_DELIVERY
        : order.logisticsMode === "pickup"
          ? FULFILLMENT_METHOD.CUSTOMER_PICKUP
          : FULFILLMENT_METHOD.PLATFORM_LOGISTICS),
  ).toLowerCase();

  const alreadyAccepted =
    ws &&
    ws !== WORKFLOW_STATUS.SELLER_PENDING &&
    ws !== WORKFLOW_STATUS.CREATED &&
    ws !== WORKFLOW_STATUS.PREORDER_HOLD;

  if (legacy === "confirmed") {
    if (alreadyAccepted) {
      return order; // idempotent
    }
    return sellerAcceptAtomic(sellerId, orderId);
  }

  if (legacy === "cancelled") {
    const trimmedReason = String(additionalData.cancelReason || "").trim();
    if (trimmedReason.length < 10) {
      const err = new Error("Please provide a cancellation reason (at least 10 characters)");
      err.statusCode = 400;
      throw err;
    }

    if (ws === WORKFLOW_STATUS.SELLER_PENDING) {
      return sellerRejectAtomic(sellerId, orderId, trimmedReason);
    }

    // Order already accepted / in progress — seller can no longer cancel it
    // outright, but (mirroring the customer cancellation-approval flow) can
    // still ask admin to step in, as long as no delivery partner has been
    // assigned yet.
    if (order.cancellationRequest?.status === "pending") {
      const err = new Error("A cancellation request is already pending admin approval");
      err.statusCode = 409;
      throw err;
    }

    const mode = resolveCustomerCancellationMode(order);
    if (mode !== "approval") {
      const err = new Error(
        "This order can no longer be cancelled — a delivery partner may already be assigned, or it has been delivered.",
      );
      err.statusCode = 409;
      throw err;
    }

    const now = new Date();
    const updatedRequest = await Order.findOneAndUpdate(
      {
        orderId,
        seller: sellerId,
        deliveryBoy: null,
        status: { $nin: ["cancelled", "delivered"] },
      },
      {
        $set: {
          cancellationRequest: {
            status: "pending",
            reason: trimmedReason,
            requestedAt: now,
            requestedBy: "seller",
            reviewedAt: null,
            reviewedBy: null,
            adminNote: "",
          },
        },
      },
      { new: true },
    );

    if (!updatedRequest) {
      const err = new Error("Unable to submit cancellation request");
      err.statusCode = 400;
      throw err;
    }

    return { __pendingApproval: true, order: updatedRequest };
  }

  const platformManaged =
    method === FULFILLMENT_METHOD.PLATFORM_LOGISTICS ||
    order.logisticsMode === "zinto" ||
    [
      WORKFLOW_STATUS.DELIVERY_SEARCH,
      WORKFLOW_STATUS.DELIVERY_ASSIGNED,
      WORKFLOW_STATUS.PICKUP_READY,
      WORKFLOW_STATUS.OUT_FOR_DELIVERY,
    ].includes(ws);

  if (
    platformManaged &&
    method !== FULFILLMENT_METHOD.SELLER_DELIVERY &&
    method !== FULFILLMENT_METHOD.CUSTOMER_PICKUP &&
    ["packed", "out_for_delivery", "delivered", "ready_for_pickup"].includes(legacy)
  ) {
    const err = new Error(
      "Platform delivery statuses are updated by the delivery partner after you accept the order.",
    );
    err.statusCode = 400;
    throw err;
  }

  let nextWorkflow = null;
  if (legacy === "packed" || legacy === "ready_for_pickup") {
    nextWorkflow =
      method === FULFILLMENT_METHOD.CUSTOMER_PICKUP
        ? WORKFLOW_STATUS.CUSTOMER_PICKUP_READY
        : WORKFLOW_STATUS.PICKUP_READY;
  } else if (legacy === "out_for_delivery") {
    nextWorkflow = WORKFLOW_STATUS.OUT_FOR_DELIVERY;
  } else if (legacy === "delivered") {
    nextWorkflow = WORKFLOW_STATUS.DELIVERED;
  } else {
    const err = new Error(`Unsupported status update: ${legacy}`);
    err.statusCode = 400;
    throw err;
  }

  assertTransition(ws, nextWorkflow);

  if (nextWorkflow === WORKFLOW_STATUS.CUSTOMER_PICKUP_READY) {
    // Customer-pickup orders need a real OTP/QR generated and hashed at rest —
    // delegate to the dedicated service instead of a bare status $set, which
    // previously left the order looking "ready for pickup" with no verifiable
    // code ever generated (customer and seller both saw an empty OTP box).
    const pickupResult = await markOrderReadyForCustomerPickup(sellerId, orderId);
    const updatedOrder = await Order.findOne({ orderId, seller: sellerId })
      .populate("customer", "name phone")
      .populate("seller", "shopName address name location serviceRadius");
    if (!updatedOrder) {
      const err = new Error("Could not update order status — state may have changed");
      err.statusCode = 409;
      throw err;
    }
    const orderObj = updatedOrder.toObject();
    orderObj.pickupOtp = pickupResult.otp;
    orderObj.pickupQrToken = pickupResult.qrToken;
    orderObj.pickupExpiresAt = pickupResult.expiresAt;
    return orderObj;
  }

  const now = new Date();
  const $set = {
    workflowStatus: nextWorkflow,
    status: legacyStatusFromWorkflow(nextWorkflow),
    orderStatus: legacyStatusFromWorkflow(nextWorkflow),
  };
  if (nextWorkflow === WORKFLOW_STATUS.PICKUP_READY) {
    $set.pickupReadyAt = now;
  }
  if (nextWorkflow === WORKFLOW_STATUS.OUT_FOR_DELIVERY) {
    $set.outForDeliveryAt = now;
    if (Array.isArray(additionalData.pickupProofImages) && additionalData.pickupProofImages.length) {
      $set.pickupProofImages = additionalData.pickupProofImages;
    }
  }
  if (nextWorkflow === WORKFLOW_STATUS.DELIVERED) {
    $set.deliveredAt = now;
    if (Array.isArray(additionalData.deliveryProofImages) && additionalData.deliveryProofImages.length) {
      $set.deliveryProofImages = additionalData.deliveryProofImages;
    }
  }

  const updated = await Order.findOneAndUpdate(
    { orderId, seller: sellerId, workflowStatus: ws },
    { $set },
    { new: true },
  )
    .populate("customer", "name phone")
    .populate("seller", "shopName address name location serviceRadius");

  if (!updated) {
    const err = new Error("Could not update order status — state may have changed");
    err.statusCode = 409;
    throw err;
  }

  if (nextWorkflow === WORKFLOW_STATUS.DELIVERED) {
    await applyDeliveredSettlement(updated, orderId);
  }

  emitOrderStatusUpdate(
    orderId,
    { workflowStatus: nextWorkflow, status: updated.status },
    updated.customer?._id || updated.customer,
  );

  if (nextWorkflow === WORKFLOW_STATUS.PICKUP_READY || nextWorkflow === WORKFLOW_STATUS.CUSTOMER_PICKUP_READY) {
    emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_PACKED, {
      orderId,
      customerId: updated.customer?._id || updated.customer,
      userId: updated.customer?._id || updated.customer,
      sellerId: updated.seller?._id || updated.seller,
    });
  }
  if (nextWorkflow === WORKFLOW_STATUS.OUT_FOR_DELIVERY) {
    emitNotificationEvent(NOTIFICATION_EVENTS.OUT_FOR_DELIVERY, {
      orderId,
      customerId: updated.customer?._id || updated.customer,
      userId: updated.customer?._id || updated.customer,
      sellerId: updated.seller?._id || updated.seller,
      deliveryId: updated.deliveryBoy,
    });
  }
  if (nextWorkflow === WORKFLOW_STATUS.DELIVERED) {
    emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_DELIVERED, {
      orderId,
      customerId: updated.customer?._id || updated.customer,
      userId: updated.customer?._id || updated.customer,
      sellerId: updated.seller?._id || updated.seller,
      deliveryId: updated.deliveryBoy,
    });
  }

  return updated;
}

/**
 * Lets a seller signal "I've finished packing" on a platform-logistics order
 * even though they don't own the PICKUP_READY transition itself (that still
 * only flips once the assigned rider marks arrival at the store). This does
 * NOT change workflowStatus or the dispatch/broadcast timing — it just records
 * sellerPackedAt and, if a rider is already assigned, lets them know packing
 * is done so they can plan their pickup.
 */
export async function sellerMarkPackedSignalAtomic(sellerId, orderId) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId, seller: sellerId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  const ws = String(order.workflowStatus || "").toUpperCase();
  const packableStatuses = [
    WORKFLOW_STATUS.DELIVERY_SEARCH,
    WORKFLOW_STATUS.DELIVERY_ASSIGNED,
  ];
  if (!packableStatuses.includes(ws)) {
    const err = new Error("This order isn't awaiting platform pickup right now");
    err.statusCode = 409;
    throw err;
  }
  if (order.sellerPackedAt) {
    return order; // idempotent
  }

  const updated = await Order.findOneAndUpdate(
    { orderId, seller: sellerId, workflowStatus: ws },
    { $set: { sellerPackedAt: new Date() } },
    { new: true },
  );
  if (!updated) {
    const err = new Error("Unable to mark order as packed");
    err.statusCode = 409;
    throw err;
  }

  if (updated.deliveryBoy) {
    emitToDelivery(updated.deliveryBoy, {
      event: "order:packed",
      payload: { orderId: updated.orderId },
    });
  }
  emitOrderStatusUpdate(
    updated.orderId,
    { sellerPackedAt: updated.sellerPackedAt },
    updated.customer,
    updated.seller,
  );

  return updated;
}

function toDeliveryObjectId(deliveryId) {
  if (deliveryId == null) return null;
  try {
    const s = String(deliveryId);
    if (!mongoose.Types.ObjectId.isValid(s)) return null;
    return new mongoose.Types.ObjectId(s);
  } catch {
    return null;
  }
}

/**
 * First delivery partner to accept wins (atomic).
 */
export async function deliveryAcceptAtomic(deliveryId, orderId, idempotencyKey) {
  orderId = await requireCanonicalOrderId(orderId);
  const deliveryOid = toDeliveryObjectId(deliveryId);
  if (!deliveryOid) {
    const err = new Error("Invalid delivery account");
    err.statusCode = 400;
    throw err;
  }

  if (idempotencyKey) {
    try {
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `idem:delivery_accept:${orderId}:${idempotencyKey}`;
        const hit = await redis.get(cacheKey);
        if (hit) {
          const order = await Order.findOne({ orderId }).lean();
          return { order, duplicate: true };
        }
      }
    } catch {
      /* idempotency optional if Redis unavailable */
    }
  }

  const now = new Date();
  const updated = await Order.findOneAndUpdate(
    {
      orderId,
      workflowVersion: { $gte: 2 },
      workflowStatus: WORKFLOW_STATUS.DELIVERY_SEARCH,
      deliveryBoy: null,
      deliverySearchExpiresAt: { $gt: now },
      skippedBy: { $nin: [deliveryOid] },
    },
    {
      $set: {
        deliveryBoy: deliveryOid,
        workflowStatus: WORKFLOW_STATUS.DELIVERY_ASSIGNED,
        status: legacyStatusFromWorkflow(WORKFLOW_STATUS.DELIVERY_ASSIGNED),
        assignedAt: now,
        deliveryRiderStep: 1,
      },
      $inc: { assignmentVersion: 1 },
    },
    { new: true },
  );

  if (!updated) {
    const o = await Order.findOne({ orderId }).lean();
    if (!o) {
      const err = new Error("Order not found");
      err.statusCode = 404;
      throw err;
    }
    let msg = "Order already assigned or not available";
    if (o.deliverySearchExpiresAt && new Date(o.deliverySearchExpiresAt) <= now) {
      msg =
        "Accept window has expired. Wait for the next delivery request.";
    } else if (o.deliveryBoy) {
      msg = "Another rider already accepted this order.";
    } else if (
      (o.skippedBy || []).some((id) => id.toString() === deliveryOid.toString())
    ) {
      msg =
        "You rejected this order earlier, so it cannot be accepted now.";
    } else if (o.workflowStatus !== WORKFLOW_STATUS.DELIVERY_SEARCH) {
      msg = "This order is no longer open for delivery.";
    }
    const err = new Error(msg);
    err.statusCode = 409;
    throw err;
  }

  await removeDeliveryTimeoutJob(orderId, updated.deliverySearchMeta?.attempt || 1);

  const lastBroadcast = await DeliveryAssignment.findOne({
    orderId,
    status: "broadcasting",
  }).sort({ createdAt: -1 });
  if (lastBroadcast) {
    lastBroadcast.status = "assigned";
    lastBroadcast.winnerDeliveryId = deliveryOid;
    await lastBroadcast.save();
  }

  if (idempotencyKey) {
    try {
      const redis = getRedisClient();
      if (redis) {
        await redis.set(
          `idem:delivery_accept:${orderId}:${idempotencyKey}`,
          "1",
          "EX",
          86400,
        );
      }
    } catch {
      /* ignore */
    }
  }

  emitNotificationEvent(NOTIFICATION_EVENTS.DELIVERY_ASSIGNED, {
    orderId: updated.orderId,
    deliveryId: deliveryOid,
    customerId: updated.customer,
    sellerId: updated.seller,
  });

  await retractDeliveryBroadcastForOrder(updated.orderId, deliveryOid);

  emitOrderStatusUpdate(
    updated.orderId,
    {
      workflowStatus: WORKFLOW_STATUS.DELIVERY_ASSIGNED,
      deliveryBoyId: deliveryOid.toString(),
    },
    updated.customer,
    updated.seller,
  );

  return { order: updated, duplicate: false };
}

/**
 * Admin manually assigns a specific rider to an order awaiting delivery search —
 * an override for when the automatic broadcast/accept flow is stuck. Skips the
 * broadcast-specific gates (accept window, per-rider skip list) since the admin
 * is deliberately bypassing that matching mechanism.
 */
export async function adminAssignRiderAtomic(adminId, orderId, riderId) {
  orderId = await requireCanonicalOrderId(orderId);
  const deliveryOid = toDeliveryObjectId(riderId);
  if (!deliveryOid) {
    const err = new Error("Invalid delivery partner");
    err.statusCode = 400;
    throw err;
  }

  const rider = await Delivery.findById(deliveryOid).select("name isOnline isVerified location").lean();
  if (!rider) {
    const err = new Error("Delivery partner not found");
    err.statusCode = 404;
    throw err;
  }
  if (!rider.isVerified) {
    const err = new Error("This delivery partner is not verified yet");
    err.statusCode = 400;
    throw err;
  }
  if (!rider.isOnline) {
    const err = new Error("This delivery partner is currently offline");
    err.statusCode = 400;
    throw err;
  }

  const now = new Date();
  const updated = await Order.findOneAndUpdate(
    {
      orderId,
      workflowVersion: { $gte: 2 },
      workflowStatus: WORKFLOW_STATUS.DELIVERY_SEARCH,
      deliveryBoy: null,
    },
    {
      $set: {
        deliveryBoy: deliveryOid,
        workflowStatus: WORKFLOW_STATUS.DELIVERY_ASSIGNED,
        status: legacyStatusFromWorkflow(WORKFLOW_STATUS.DELIVERY_ASSIGNED),
        assignedAt: now,
        deliveryRiderStep: 1,
        assignedByAdmin: adminId || null,
      },
      $inc: { assignmentVersion: 1 },
    },
    { new: true },
  ).populate("seller", "location shopName address");

  if (!updated) {
    const o = await Order.findOne({ orderId }).lean();
    if (!o) {
      const err = new Error("Order not found");
      err.statusCode = 404;
      throw err;
    }
    const msg = o.deliveryBoy
      ? "This order already has a delivery partner assigned."
      : "This order is not currently awaiting delivery-partner assignment.";
    const err = new Error(msg);
    err.statusCode = 409;
    throw err;
  }

  await removeDeliveryTimeoutJob(orderId, updated.deliverySearchMeta?.attempt || 1);

  const lastBroadcast = await DeliveryAssignment.findOne({
    orderId,
    status: "broadcasting",
  }).sort({ createdAt: -1 });
  if (lastBroadcast) {
    lastBroadcast.status = "assigned";
    lastBroadcast.winnerDeliveryId = deliveryOid;
    await lastBroadcast.save();
  }

  emitNotificationEvent(NOTIFICATION_EVENTS.DELIVERY_ASSIGNED, {
    orderId: updated.orderId,
    deliveryId: deliveryOid,
    customerId: updated.customer,
    sellerId: updated.seller?._id || updated.seller,
  });

  await retractDeliveryBroadcastForOrder(updated.orderId, deliveryOid);

  // Unlike the auto-broadcast/accept flow, this order was assigned directly
  // by an admin — the rider never goes through the accept-window race, so
  // this is a real-time "here's your order" alert, not a broadcast to
  // compete for. type: "ADMIN_ASSIGNED" tells the delivery app to skip the
  // accept-endpoint call (the order is already theirs) and just show it.
  // Without this, the only signal the rider got was a best-effort FCM push
  // via emitNotificationEvent above — no in-app ringtone/alert, since that's
  // driven exclusively by the "delivery:broadcast" socket event.
  emitToDelivery(deliveryOid, {
    event: "delivery:broadcast",
    payload: deliveryBroadcastPayloadFromOrder(updated, {
      type: "ADMIN_ASSIGNED",
      deliverySearchExpiresAt: null,
    }),
  });

  emitOrderStatusUpdate(
    updated.orderId,
    {
      workflowStatus: WORKFLOW_STATUS.DELIVERY_ASSIGNED,
      deliveryBoyId: deliveryOid.toString(),
    },
    updated.customer,
    updated.seller,
  );

  let distanceKm = null;
  const sellerCoords = updated.seller?.location?.coordinates;
  const riderCoords = rider.location?.coordinates;
  if (
    Array.isArray(sellerCoords) && sellerCoords.length === 2 &&
    Array.isArray(riderCoords) && riderCoords.length === 2 &&
    !(riderCoords[0] === 0 && riderCoords[1] === 0)
  ) {
    distanceKm = Math.round(
      (distanceMeters(sellerCoords[1], sellerCoords[0], riderCoords[1], riderCoords[0]) / 1000) * 10,
    ) / 10;
  }

  return { order: updated, rider, distanceKm };
}

export async function processSellerTimeoutJob({ orderId }) {
  const now = new Date();
  const order = await Order.findOne({ orderId, workflowVersion: { $gte: 2 } });
  if (!order || order.workflowStatus !== WORKFLOW_STATUS.SELLER_PENDING) return;

  if (order.sellerPendingExpiresAt && order.sellerPendingExpiresAt > now) {
    return;
  }

  const updated = await Order.findOneAndUpdate(
    {
      orderId,
      workflowVersion: { $gte: 2 },
      workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
    },
    {
      $set: {
        workflowStatus: WORKFLOW_STATUS.CANCELLED,
        status: "cancelled",
        cancelledBy: "system",
        cancelReason: "Seller timeout (60s)",
      },
    },
    { new: true },
  );

  if (!updated) return;

  await compensateOrderCancellation(updated, orderId);

  emitOrderStatusUpdate(orderId, { workflowStatus: WORKFLOW_STATUS.CANCELLED }, updated.customer, updated.seller);
  emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CANCELLED, {
    orderId: updated.orderId,
    customerId: updated.customer,
    userId: updated.customer,
    sellerId: updated.seller,
    customerMessage: "Your order was cancelled because seller did not accept in time.",
    sellerMessage: `Order #${updated.orderId} was cancelled due to timeout.`,
  });
}

export async function processDeliveryTimeoutJob({ orderId, attempt }) {
  const now = new Date();
  const order = await Order.findOne({ orderId, workflowVersion: { $gte: 2 } });
  if (!order || order.workflowStatus !== WORKFLOW_STATUS.DELIVERY_SEARCH) return;

  if (order.deliverySearchExpiresAt && order.deliverySearchExpiresAt > now) {
    return;
  }

  const meta = order.deliverySearchMeta || {};
  const currentAttempt = meta.attempt || attempt || 1;
  const maxAttempts = DELIVERY_SEARCH_MAX_ATTEMPTS();

  if (currentAttempt < maxAttempts) {
    const nextRadius = Math.round(
      (meta.radiusMeters || INITIAL_DELIVERY_RADIUS_M()) *
        DELIVERY_RADIUS_MULTIPLIER(),
    );
    const deliveryMs = DEFAULT_DELIVERY_TIMEOUT_MS();
    const nextExpiry = new Date(now.getTime() + deliveryMs);

    await Order.findOneAndUpdate(
      {
        orderId,
        workflowVersion: { $gte: 2 },
        workflowStatus: WORKFLOW_STATUS.DELIVERY_SEARCH,
      },
      {
        $set: {
          deliverySearchExpiresAt: nextExpiry,
          deliverySearchMeta: {
            radiusMeters: nextRadius,
            attempt: currentAttempt + 1,
            lastBroadcastAt: now,
          },
        },
      },
    );

    await scheduleDeliveryTimeoutJob(orderId, currentAttempt + 1);

    const orderRich = await Order.findOne({ orderId })
      .populate("seller", "shopName address name location serviceRadius")
      .lean();
    if (orderRich) {
      await emitDeliveryBroadcastForSeller(
        orderRich.seller,
        deliveryBroadcastPayloadFromOrder(orderRich, {
          retryAttempt: currentAttempt + 1,
        }),
      );
    }
    return;
  }

  const orderForFallback = await Order.findOne({
    orderId,
    workflowVersion: { $gte: 2 },
    workflowStatus: WORKFLOW_STATUS.DELIVERY_SEARCH,
  }).lean();

  if (orderForFallback) {
    const store = await Store.findById(orderForFallback.seller).lean();
    const policy = resolveStoreDeliveryPolicy(store || {});

    if (
      policy.sellerDelivery &&
      orderForFallback.fulfillmentMethod === FULFILLMENT_METHOD.PLATFORM_LOGISTICS
    ) {
      const fallback = await Order.findOneAndUpdate(
        { orderId, workflowStatus: WORKFLOW_STATUS.DELIVERY_SEARCH },
        {
          $set: {
            workflowStatus: WORKFLOW_STATUS.EXTERNAL_LOGISTICS_PENDING,
            status: legacyStatusFromWorkflow(WORKFLOW_STATUS.EXTERNAL_LOGISTICS_PENDING),
            fulfillmentMethod: FULFILLMENT_METHOD.SELLER_DELIVERY,
            logisticsMode: "external",
            "fulfillmentMeta.autoSwitched": true,
            "fulfillmentMeta.switchReason": "platform_rider_unavailable",
          },
        },
        { new: true },
      );
      if (fallback) {
        emitOrderStatusUpdate(
          orderId,
          {
            workflowStatus: WORKFLOW_STATUS.EXTERNAL_LOGISTICS_PENDING,
            fulfillmentMethod: FULFILLMENT_METHOD.SELLER_DELIVERY,
            autoSwitched: true,
          },
          fallback.customer,
        );
        return;
      }
    }

    if (policy.customerPickup) {
      const fallback = await Order.findOneAndUpdate(
        { orderId, workflowStatus: WORKFLOW_STATUS.DELIVERY_SEARCH },
        {
          $set: {
            workflowStatus: WORKFLOW_STATUS.SELLER_ACCEPTED,
            status: legacyStatusFromWorkflow(WORKFLOW_STATUS.SELLER_ACCEPTED),
            fulfillmentMethod: FULFILLMENT_METHOD.CUSTOMER_PICKUP,
            logisticsMode: "pickup",
            "fulfillmentMeta.autoSwitched": true,
            "fulfillmentMeta.switchReason": "platform_rider_unavailable_pickup",
          },
        },
        { new: true },
      );
      if (fallback) {
        emitOrderStatusUpdate(
          orderId,
          {
            workflowStatus: WORKFLOW_STATUS.SELLER_ACCEPTED,
            fulfillmentMethod: FULFILLMENT_METHOD.CUSTOMER_PICKUP,
            autoSwitched: true,
          },
          fallback.customer,
        );
        emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CONFIRMED, {
          orderId: fallback.orderId,
          customerId: fallback.customer,
          userId: fallback.customer,
          sellerId: fallback.seller,
          customerMessage:
            "No rider was available. Your order was switched to store pickup.",
        });
        return;
      }
    }
  }

  const updated = await Order.findOneAndUpdate(
    {
      orderId,
      workflowVersion: { $gte: 2 },
      workflowStatus: WORKFLOW_STATUS.DELIVERY_SEARCH,
    },
    {
      $set: {
        workflowStatus: WORKFLOW_STATUS.CANCELLED,
        status: "cancelled",
        cancelledBy: "system",
        cancelReason: "No delivery partner (timeout)",
      },
    },
    { new: true },
  );

  if (!updated) return;

  await compensateOrderCancellation(updated, orderId);
  emitOrderStatusUpdate(orderId, { workflowStatus: WORKFLOW_STATUS.CANCELLED }, updated.customer);
  emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CANCELLED, {
    orderId: updated.orderId,
    customerId: updated.customer,
    userId: updated.customer,
    sellerId: updated.seller,
    customerMessage:
      "Order was cancelled because no delivery partner was available.",
    sellerMessage:
      `Order #${updated.orderId} was cancelled because no delivery partner was available.`,
  });
}

export async function customerCancelV2(customerId, orderId, reason) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId, customer: customerId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  const ws = resolveWorkflowStatus(order);
  if (ws !== WORKFLOW_STATUS.SELLER_PENDING) {
    const err = new Error("Order cannot be cancelled after confirmation");
    err.statusCode = 400;
    throw err;
  }

  const updated = await Order.findOneAndUpdate(
    {
      orderId,
      customer: customerId,
      workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
    },
    {
      $set: {
        workflowStatus: WORKFLOW_STATUS.CANCELLED,
        status: "cancelled",
        cancelledBy: "customer",
        cancelReason: reason || "Cancelled by customer",
      },
    },
    { new: true },
  );

  if (!updated) {
    const err = new Error("Unable to cancel");
    err.statusCode = 400;
    throw err;
  }

  await removeSellerTimeoutJob(orderId);
  await compensateOrderCancellation(updated, orderId);
  emitOrderStatusUpdate(orderId, { workflowStatus: WORKFLOW_STATUS.CANCELLED }, updated.customer);
  emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CANCELLED, {
    orderId: updated.orderId,
    customerId: updated.customer,
    userId: updated.customer,
    sellerId: updated.seller,
    customerMessage: "Your order has been cancelled successfully.",
    sellerMessage: `Order #${updated.orderId} was cancelled by customer.`,
  });
  return updated;
}

export async function requestCustomerCancellationApproval(customerId, orderId, reason) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId, customer: customerId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  if (order.cancellationRequest?.status === "pending") {
    const err = new Error("Cancellation request is already pending admin approval");
    err.statusCode = 409;
    throw err;
  }

  const mode = resolveCustomerCancellationMode(order);
  if (mode !== "approval") {
    const err = new Error("Order cannot be cancelled after delivery partner assignment");
    err.statusCode = 400;
    throw err;
  }

  const now = new Date();
  const updated = await Order.findOneAndUpdate(
    {
      orderId,
      customer: customerId,
      deliveryBoy: null,
      status: { $nin: ["cancelled", "delivered"] },
    },
    {
      $set: {
        cancellationRequest: {
          status: "pending",
          reason: String(reason || "Cancellation requested by customer").trim(),
          requestedAt: now,
          requestedBy: "customer",
          reviewedAt: null,
          reviewedBy: null,
          adminNote: "",
        },
      },
    },
    { new: true },
  );

  if (!updated) {
    const err = new Error("Unable to submit cancellation request");
    err.statusCode = 400;
    throw err;
  }

  return updated;
}

export async function approveCustomerCancellationRequest(adminId, orderId, adminNote) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  if (order.cancellationRequest?.status !== "pending") {
    const err = new Error("No pending cancellation request found for this order");
    err.statusCode = 409;
    throw err;
  }

  if (resolveCustomerCancellationMode(order) !== "approval") {
    const err = new Error("Cancellation request can no longer be approved");
    err.statusCode = 409;
    throw err;
  }

  const now = new Date();
  const cancellationNote = String(
    adminNote || order.cancellationRequest?.reason || "Cancelled by admin on customer request",
  )
    .trim()
    .slice(0, 500);

  const updateSet = {
    status: "cancelled",
    orderStatus: "cancelled",
    cancelledBy: "admin",
    cancelReason: cancellationNote,
    cancellationRequest: {
      ...(order.cancellationRequest?.toObject?.() || order.cancellationRequest || {}),
      status: "approved",
      reviewedAt: now,
      reviewedBy: adminId,
      adminNote: cancellationNote,
    },
  };

  if (order.workflowVersion >= 2 || order.workflowStatus) {
    updateSet.workflowStatus = WORKFLOW_STATUS.CANCELLED;
  }

  const updated = await Order.findOneAndUpdate(
    {
      _id: order._id,
      "cancellationRequest.status": "pending",
      deliveryBoy: null,
      status: { $nin: ["cancelled", "delivered"] },
    },
    {
      $set: updateSet,
    },
    { new: true },
  );

  if (!updated) {
    const err = new Error("Unable to approve cancellation request");
    err.statusCode = 409;
    throw err;
  }

  await removeSellerTimeoutJob(orderId);
  if (resolveWorkflowStatus(order) === WORKFLOW_STATUS.DELIVERY_SEARCH) {
    await removeDeliveryTimeoutJob(orderId, order.deliverySearchMeta?.attempt || 1);
  }

  await compensateOrderCancellation(updated, orderId);
  emitOrderStatusUpdate(
    updated.orderId,
    { workflowStatus: WORKFLOW_STATUS.CANCELLED },
    updated.customer,
  );
  const requestedBySeller = order.cancellationRequest?.requestedBy === "seller";
  emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CANCELLED, {
    orderId: updated.orderId,
    customerId: updated.customer,
    userId: updated.customer,
    sellerId: updated.seller,
    customerMessage: requestedBySeller
      ? `Your order was cancelled by the seller. Reason: ${cancellationNote}`
      : `Your cancellation request was approved. Reason: ${cancellationNote}`,
    sellerMessage: `Order #${updated.orderId} was cancelled after admin approval.`,
  });

  return updated;
}

export async function rejectCustomerCancellationRequest(adminId, orderId, adminNote) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  if (order.cancellationRequest?.status !== "pending") {
    const err = new Error("No pending cancellation request found for this order");
    err.statusCode = 409;
    throw err;
  }

  const rejectionNote = String(adminNote || "Cancellation request was rejected by admin")
    .trim()
    .slice(0, 500);

  const updated = await Order.findOneAndUpdate(
    {
      _id: order._id,
      "cancellationRequest.status": "pending",
      status: { $nin: ["cancelled", "delivered"] },
    },
    {
      $set: {
        cancellationRequest: {
          ...(order.cancellationRequest?.toObject?.() || order.cancellationRequest || {}),
          status: "rejected",
          reviewedAt: new Date(),
          reviewedBy: adminId,
          adminNote: rejectionNote,
        },
      },
    },
    { new: true },
  );

  if (!updated) {
    const err = new Error("Unable to reject cancellation request");
    err.statusCode = 409;
    throw err;
  }

  emitToCustomer(updated.customer?.toString?.() || String(updated.customer), {
    event: "order:cancellation-request:rejected",
    payload: {
      orderId: updated.orderId,
      adminNote: rejectionNote,
      status: "rejected",
    },
  });
  // The socket event above only reaches a customer with the app open right
  // now — this is what actually notifies them if they're offline (push +
  // in-app notification list), which previously never happened at all.
  emitNotificationEvent(NOTIFICATION_EVENTS.CANCELLATION_REQUEST_REJECTED, {
    orderId: updated.orderId,
    customerId: updated.customer,
    userId: updated.customer,
    adminNote: rejectionNote,
  });

  return updated;
}

/**
 * Rider at seller location — step 1 → 2 (DELIVERY_ASSIGNED → PICKUP_READY).
 */
export async function markArrivedAtStoreAtomic(deliveryId, orderId, lat, lng) {
  orderId = await requireCanonicalOrderId(orderId);
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    const err = new Error("Valid lat/lng required");
    err.statusCode = 400;
    throw err;
  }

  const order = await Order.findOne({
    orderId,
    deliveryBoy: deliveryId,
    workflowVersion: { $gte: 2 },
  });

  if (!order || order.workflowStatus !== WORKFLOW_STATUS.DELIVERY_ASSIGNED) {
    const err = new Error("Invalid state: arrive at store first");
    err.statusCode = 409;
    throw err;
  }

  const seller = await Store.findById(order.seller).select("location").lean();
  const coords = seller?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) {
    const err = new Error("Seller location not configured");
    err.statusCode = 400;
    throw err;
  }
  const [slng, slat] = coords;
  const d = distanceMeters(lat, lng, slat, slng);
  /*
  if (d > PICKUP_RADIUS_M()) {
    const err = new Error(`Too far from store (>${PICKUP_RADIUS_M()}m)`);
    err.statusCode = 400;
    throw err;
  }
  */

  const now = new Date();
  const updated = await Order.findOneAndUpdate(
    {
      orderId,
      workflowStatus: WORKFLOW_STATUS.DELIVERY_ASSIGNED,
      deliveryBoy: deliveryId,
    },
    {
      $set: {
        workflowStatus: WORKFLOW_STATUS.PICKUP_READY,
        status: legacyStatusFromWorkflow(WORKFLOW_STATUS.PICKUP_READY),
        pickupReadyAt: now,
        deliveryRiderStep: 2,
      },
    },
    { new: true },
  );

  if (!updated) {
    const err = new Error("Could not mark arrived at store");
    err.statusCode = 409;
    throw err;
  }

  emitOrderStatusUpdate(
    orderId,
    { workflowStatus: WORKFLOW_STATUS.PICKUP_READY },
    updated.customer,
    updated.seller,
  );
  emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_PACKED, {
    orderId: updated.orderId,
    customerId: updated.customer,
    userId: updated.customer,
    sellerId: updated.seller,
    deliveryId: updated.deliveryBoy,
  });
  emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_READY, {
    orderId: updated.orderId,
    deliveryId: updated.deliveryBoy,
    sellerId: updated.seller,
  });
  return updated;
}

export async function confirmPickupAtomic(deliveryId, orderId, lat, lng) {
  orderId = await requireCanonicalOrderId(orderId);
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    const err = new Error("Valid lat/lng required");
    err.statusCode = 400;
    throw err;
  }

  const order = await Order.findOne({
    orderId,
    deliveryBoy: deliveryId,
    workflowVersion: { $gte: 2 },
  });

  const prePickup = new Set([
    WORKFLOW_STATUS.DELIVERY_ASSIGNED,
    WORKFLOW_STATUS.PICKUP_READY,
  ]);
  if (!order || !prePickup.has(order.workflowStatus)) {
    const err = new Error("Invalid state for pickup confirmation");
    err.statusCode = 409;
    throw err;
  }

  const seller = await Store.findById(order.seller).select("location").lean();
  const coords = seller?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) {
    const err = new Error("Seller location not configured");
    err.statusCode = 400;
    throw err;
  }
  const [slng, slat] = coords;
  const d = distanceMeters(lat, lng, slat, slng);
  /*
  if (d > PICKUP_RADIUS_M()) {
    const err = new Error(`Too far from store (>${PICKUP_RADIUS_M()}m)`);
    err.statusCode = 400;
    throw err;
  }
  */

  const now = new Date();
  const updated = await Order.findOneAndUpdate(
    {
      orderId,
      workflowStatus: { $in: [...prePickup] },
      deliveryBoy: deliveryId,
    },
    {
      $set: {
        workflowStatus: WORKFLOW_STATUS.OUT_FOR_DELIVERY,
        status: legacyStatusFromWorkflow(WORKFLOW_STATUS.OUT_FOR_DELIVERY),
        pickupConfirmedAt: now,
        outForDeliveryAt: now,
        deliveryRiderStep: 3,
      },
    },
    { new: true },
  );

  if (!updated) {
    const err = new Error("Pickup confirm failed");
    err.statusCode = 409;
    throw err;
  }

  emitOrderStatusUpdate(
    orderId,
    {
      workflowStatus: WORKFLOW_STATUS.OUT_FOR_DELIVERY,
    },
    updated.customer,
    updated.seller,
  );
  emitNotificationEvent(NOTIFICATION_EVENTS.OUT_FOR_DELIVERY, {
    orderId: updated.orderId,
    customerId: updated.customer,
    userId: updated.customer,
    deliveryId: updated.deliveryBoy,
    sellerId: updated.seller,
  });
  return updated;
}

/**
 * OUT_FOR_DELIVERY (or legacy out_for_delivery): advance UI step 3 → 4 (near customer / ready for OTP).
 */
export async function advanceDeliveryRiderUiAtomic(deliveryId, orderId) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({
    orderId,
    deliveryBoy: deliveryId,
  });

  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  const v2 = order.workflowVersion >= 2;
  if (v2) {
    if (order.workflowStatus !== WORKFLOW_STATUS.OUT_FOR_DELIVERY) {
      const err = new Error("Order is not out for delivery");
      err.statusCode = 409;
      throw err;
    }
  } else if (order.status !== "out_for_delivery") {
    const err = new Error("Order is not out for delivery");
    err.statusCode = 409;
    throw err;
  }

  const updated = await Order.findOneAndUpdate(
    {
      _id: order._id,
      deliveryBoy: order.deliveryBoy,
    },
    { $set: { deliveryRiderStep: 4 } },
    { new: true },
  );

  if (!updated) {
    const err = new Error("Could not update progress");
    err.statusCode = 409;
    throw err;
  }

  return updated;
}

export async function requestHandoffOtpAtomic(deliveryId, orderId, lat, lng) {
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    const err = new Error("Valid lat/lng required");
    err.statusCode = 400;
    throw err;
  }

  const order = await Order.findOne({
    orderId,
    deliveryBoy: deliveryId,
    workflowVersion: { $gte: 2 },
  });

  if (!order || order.workflowStatus !== WORKFLOW_STATUS.OUT_FOR_DELIVERY) {
    const err = new Error("Order not ready for OTP");
    err.statusCode = 409;
    throw err;
  }

  const cust = order.address?.location;
  if (
    typeof cust?.lat !== "number" ||
    typeof cust?.lng !== "number" ||
    !Number.isFinite(cust.lat) ||
    !Number.isFinite(cust.lng)
  ) {
    const err = new Error("Customer address coordinates missing");
    err.statusCode = 400;
    throw err;
  }

  const d = distanceMeters(lat, lng, cust.lat, cust.lng);
  if (d > OTP_RADIUS_M()) {
    const err = new Error(`Too far from customer (>${OTP_RADIUS_M()}m)`);
    err.statusCode = 400;
    throw err;
  }

  const redis = getRedisClient();
  if (redis) {
    try {
      const key = `otp_req:${orderId}`;
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, 300);
      if (n > 3) {
        const err = new Error("OTP request rate limit exceeded");
        err.statusCode = 429;
        throw err;
      }
    } catch (e) {
      if (e.statusCode === 429) throw e;
    }
  }

  const code = String(Math.floor(1000 + Math.random() * 9000));
  const codeHash = OrderOtp.hashCode(code);

  await OrderOtp.deleteMany({
    orderId,
    consumedAt: null,
  });

  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS());
  await OrderOtp.create({
    orderId,
    orderMongoId: order._id,
    codeHash,
    expiresAt,
    lastGeneratedAt: new Date(),
  });

  emitToCustomer(order.customer.toString(), {
    event: "order:otp",
    payload: { orderId, code, expiresAt },
  });

  // Emitting the specialized event that DeliveryOtpDisplay expects
  emitToCustomer(order.customer.toString(), {
    event: "delivery:otp:generated",
    payload: { 
      orderId, 
      otp: code, 
      expiresAt, 
      deliveryPersonNearby: true 
    },
  });
  emitOrderStatusUpdate(orderId, { otpSent: true }, order.customer);

  return { expiresAt, message: "OTP sent to customer" };
}

export async function verifyHandoffOtpAndDeliver(deliveryId, orderId, code) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({
    orderId,
    deliveryBoy: deliveryId,
    workflowVersion: { $gte: 2 },
  });

  if (!order || order.workflowStatus !== WORKFLOW_STATUS.OUT_FOR_DELIVERY) {
    const err = new Error("Invalid state for delivery completion");
    err.statusCode = 409;
    throw err;
  }

  const otp = await OrderOtp.findOne({
    orderId,
    consumedAt: null,
  }).sort({ createdAt: -1 });

  if (!otp) {
    const err = new Error("No active OTP");
    err.statusCode = 400;
    throw err;
  }
  if (otp.expiresAt < new Date()) {
    const err = new Error("OTP expired");
    err.statusCode = 400;
    throw err;
  }
  if (otp.attempts >= otp.maxAttempts) {
    const err = new Error("Too many OTP attempts");
    err.statusCode = 429;
    throw err;
  }

  const match = OrderOtp.hashCode(String(code)) === otp.codeHash;
  if (!match) {
    await OrderOtp.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
    const err = new Error("Invalid OTP");
    err.statusCode = 400;
    throw err;
  }

  await OrderOtp.updateOne(
    { _id: otp._id },
    { $set: { consumedAt: new Date() } },
  );

  const now = new Date();
  const updated = await Order.findOneAndUpdate(
    {
      orderId,
      workflowStatus: WORKFLOW_STATUS.OUT_FOR_DELIVERY,
      deliveryBoy: deliveryId,
    },
    {
      $set: {
        workflowStatus: WORKFLOW_STATUS.DELIVERED,
        status: "delivered",
        deliveredAt: now,
      },
    },
    { new: true },
  );

  if (!updated) {
    const err = new Error("Could not finalize delivery");
    err.statusCode = 409;
    throw err;
  }

  // BUGFIX: Verify customer field is preserved after update
  if (!updated.customer) {
    console.error(`[ORDER_BUG] Customer field lost during delivery completion`, {
      orderId,
      _id: updated._id,
      timestamp: new Date().toISOString(),
    });
    const err = new Error("Order data integrity error: customer reference lost during update");
    err.statusCode = 500;
    throw err;
  }

  await applyDeliveredSettlement(updated, orderId);

  emitOrderStatusUpdate(orderId, { workflowStatus: WORKFLOW_STATUS.DELIVERED }, updated.customer, updated.seller);
  emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_DELIVERED, {
    orderId: updated.orderId,
    customerId: updated.customer,
    userId: updated.customer,
    deliveryId: updated.deliveryBoy,
    sellerId: updated.seller,
  });
  return updated;
}
