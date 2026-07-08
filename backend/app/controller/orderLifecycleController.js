import handleResponse from "../utils/helper.js";
import Store from "../models/store.js";
import {
  resolveStoreSchedulingSettings,
  validateScheduleSelection,
} from "../services/orderSchedulingService.js";
import {
  customerRescheduleInstant,
  requestRescheduleApproval,
  approveRescheduleRequest,
  rejectRescheduleRequest,
  adminRescheduleOnBehalf,
} from "../services/orderRescheduleService.js";
import {
  applyOrderPriceAdjustment,
  payPriceDifference,
  partialCancelOrderItems,
} from "../services/orderPriceAdjustmentService.js";
import {
  raiseDispute,
  resolveDispute,
  listDisputes,
  getDisputeByOrder,
  addDisputeNote,
} from "../services/disputeService.js";
import {
  createPreOrderCampaign,
  updatePreOrderCampaign,
  listSellerCampaigns,
  listActiveCampaignsForCustomer,
  getCampaignProducts,
  cancelPreOrderCampaign,
} from "../services/preOrderCampaignService.js";
import {
  createReplacementRequest,
  reviewReplacementRequest,
  createSplitDeliveries,
  getOrderModificationTimeline,
} from "../services/orderModificationService.js";
import Order from "../models/order.js";
import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import { legacyStatusFromWorkflow } from "../constants/orderWorkflow.js";
import { emitOrderStatusUpdate } from "../services/orderSocketEmitter.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import { requireCanonicalOrderId } from "../utils/orderLookup.js";

export const getSellerSchedulingSettings = async (req, res) => {
  try {
    const storeId = req.user?.id || req.params.storeId;
    const store = await Store.findById(storeId).lean();
    if (!store) return handleResponse(res, 404, "Store not found");
    return handleResponse(res, 200, "Scheduling settings", resolveStoreSchedulingSettings(store));
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const updateSellerSchedulingSettings = async (req, res) => {
  try {
    const storeId = req.user?.id;
    const { enabled, maxDaysAhead, rescheduleCutoffDays, selfLogistics, deliveryWindows } =
      req.body || {};
    const updated = await Store.findByIdAndUpdate(
      storeId,
      {
        $set: {
          schedulingSettings: {
            enabled: Boolean(enabled),
            maxDaysAhead: Number(maxDaysAhead || 7),
            rescheduleCutoffDays: Number(rescheduleCutoffDays ?? 1),
            selfLogistics: Boolean(selfLogistics),
            deliveryWindows: Array.isArray(deliveryWindows) ? deliveryWindows : [],
          },
        },
      },
      { new: true },
    ).lean();
    return handleResponse(res, 200, "Scheduling settings updated", resolveStoreSchedulingSettings(updated));
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const getAvailableDeliverySlots = async (req, res) => {
  try {
    const { sellerId, deliveryDate } = req.query;
    const store = await Store.findById(sellerId).lean();
    if (!store) return handleResponse(res, 404, "Store not found");
    const settings = resolveStoreSchedulingSettings(store);
    const windows = [];
    for (const window of settings.deliveryWindows) {
      try {
        await validateScheduleSelection({
          sellerId,
          deliveryDate,
          windowLabel: window.label,
        });
        windows.push({ ...window, available: true });
      } catch {
        windows.push({ ...window, available: false });
      }
    }
    return handleResponse(res, 200, "Delivery slots", { deliveryDate, windows });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const rescheduleOrder = async (req, res) => {
  try {
    const order = await customerRescheduleInstant(req.user.id, req.params.orderId, req.body);
    return handleResponse(res, 200, "Order rescheduled", order);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const requestReschedule = async (req, res) => {
  try {
    const order = await requestRescheduleApproval(req.user.id, req.params.orderId, req.body);
    return handleResponse(res, 200, "Reschedule request submitted", order);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const approveReschedule = async (req, res) => {
  try {
    const reviewerModel = req.user.role === "seller" ? "Seller" : "Admin";
    const order = await approveRescheduleRequest(
      req.user.id,
      reviewerModel,
      req.params.orderId,
      req.body?.note,
    );
    return handleResponse(res, 200, "Reschedule approved", order);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const rejectReschedule = async (req, res) => {
  try {
    const reviewerModel = req.user.role === "seller" ? "Seller" : "Admin";
    const order = await rejectRescheduleRequest(
      req.user.id,
      reviewerModel,
      req.params.orderId,
      req.body?.note,
    );
    return handleResponse(res, 200, "Reschedule rejected", order);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const adminRescheduleOrder = async (req, res) => {
  try {
    const order = await adminRescheduleOnBehalf(req.user.id, req.params.orderId, req.body);
    return handleResponse(res, 200, "Order rescheduled on behalf", order);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const adjustOrder = async (req, res) => {
  try {
    const { items, reason } = req.body || {};
    const order = await applyOrderPriceAdjustment({
      orderId: req.params.orderId,
      items,
      reason,
      actorLabel: req.user.role === "seller" ? "seller" : "admin",
    });
    return handleResponse(res, 200, "Order adjusted", order);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const partialCancelOrder = async (req, res) => {
  try {
    const { itemIndexes, reason } = req.body || {};
    const order = await partialCancelOrderItems({
      orderId: req.params.orderId,
      itemIndexes,
      reason,
      actorLabel: req.user.role === "seller" ? "seller" : "admin",
    });
    return handleResponse(res, 200, "Partial cancellation applied", order);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const payOrderDifference = async (req, res) => {
  try {
    const order = await payPriceDifference(req.user.id, req.params.orderId, req.body);
    return handleResponse(res, 200, "Extra payment recorded", order);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const requestProductReplacement = async (req, res) => {
  try {
    const { itemIndex, alternatives, reason } = req.body || {};
    const order = await createReplacementRequest({
      orderId: req.params.orderId,
      itemIndex,
      alternatives,
      reason,
      actorRole: req.user?.role === "admin" ? "admin" : req.user?.subSellerId ? "assistant" : "seller",
      actorId: req.user?.id,
    });
    return handleResponse(res, 200, "Replacement request submitted to customer", order);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const reviewProductReplacement = async (req, res) => {
  try {
    const { decision, selectedAlternativeIndex, note } = req.body || {};
    const order = await reviewReplacementRequest({
      orderId: req.params.orderId,
      requestId: req.params.requestId,
      decision,
      selectedAlternativeIndex,
      customerId: req.user?.id,
      note,
    });
    return handleResponse(res, 200, "Replacement decision recorded", order);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const splitOrderDelivery = async (req, res) => {
  try {
    const { splits } = req.body || {};
    const order = await createSplitDeliveries({
      orderId: req.params.orderId,
      splits,
      actorRole: req.user?.role === "admin" ? "admin" : req.user?.subSellerId ? "assistant" : "seller",
      actorId: req.user?.id,
    });
    return handleResponse(res, 200, "Split delivery plan saved", order);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const getOrderModificationHistory = async (req, res) => {
  try {
    const data = await getOrderModificationTimeline({
      orderId: req.params.orderId,
      actorId: req.user?.id,
      role: req.user?.role,
    });
    return handleResponse(res, 200, "Order modification history", data);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const createDispute = async (req, res) => {
  try {
    const raisedBy = ["seller", "admin"].includes(req.user.role) ? "seller" : "customer";
    const result = await raiseDispute({
      orderId: req.params.orderId,
      raisedBy,
      raisedById: req.user.id,
      reason: req.body?.reason,
      reasonCategory: req.body?.reasonCategory,
    });
    return handleResponse(res, 201, "Dispute raised", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const resolveDisputeHandler = async (req, res) => {
  try {
    const result = await resolveDispute({
      disputeId: req.params.disputeId,
      adminId: req.user.id,
      resolution: req.body?.resolution,
      refundAmount: req.body?.refundAmount,
      resolutionNote: req.body?.resolutionNote,
      adjustItems: req.body?.adjustItems,
    });
    return handleResponse(res, 200, "Dispute resolved", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const listDisputesHandler = async (req, res) => {
  try {
    const result = await listDisputes(req.query);
    return handleResponse(res, 200, "Disputes", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const getOrderDispute = async (req, res) => {
  try {
    const dispute = await getDisputeByOrder(req.params.orderId);
    return handleResponse(res, 200, "Dispute", dispute);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const createCampaign = async (req, res) => {
  try {
    const campaign = await createPreOrderCampaign(req.user.id, req.body, req.user.accountId);
    return handleResponse(res, 201, "Campaign created", campaign);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const updateCampaign = async (req, res) => {
  try {
    const campaign = await updatePreOrderCampaign(req.user.id, req.params.campaignId, req.body);
    return handleResponse(res, 200, "Campaign updated", campaign);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const listCampaigns = async (req, res) => {
  try {
    const campaigns = await listSellerCampaigns(req.user.id, req.query);
    return handleResponse(res, 200, "Campaigns", campaigns);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const listCustomerCampaigns = async (req, res) => {
  try {
    const campaigns = await listActiveCampaignsForCustomer(req.query);
    return handleResponse(res, 200, "Active campaigns", campaigns);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const getCampaignDetail = async (req, res) => {
  try {
    const data = await getCampaignProducts(req.params.campaignId);
    return handleResponse(res, 200, "Campaign detail", data);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const cancelCampaign = async (req, res) => {
  try {
    const campaign = await cancelPreOrderCampaign(
      req.user.id,
      req.params.campaignId,
      req.body?.reason,
    );
    return handleResponse(res, 200, "Campaign cancelled", campaign);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

const SELF_LOGISTICS_TRANSITIONS = {
  assigned: WORKFLOW_STATUS.DELIVERY_ASSIGNED,
  picked: WORKFLOW_STATUS.PICKUP_READY,
  on_the_way: WORKFLOW_STATUS.OUT_FOR_DELIVERY,
  delivered: WORKFLOW_STATUS.DELIVERED,
};

export const updateSelfLogisticsStatus = async (req, res) => {
  try {
    const orderId = await requireCanonicalOrderId(req.params.orderId);
    const stage = String(req.body?.stage || "").toLowerCase();
    const nextWs = SELF_LOGISTICS_TRANSITIONS[stage];
    if (!nextWs) return handleResponse(res, 400, "Invalid logistics stage");

    const order = await Order.findOne({ orderId, seller: req.user.id });
    if (!order) return handleResponse(res, 404, "Order not found");
    if (
      order.fulfillmentMethod !== "seller_delivery" &&
      order.logisticsMode !== "external"
    ) {
      return handleResponse(res, 400, "Self logistics updates only for seller delivery orders");
    }

    const updated = await Order.findOneAndUpdate(
      { orderId, seller: req.user.id },
      {
        $set: {
          workflowStatus: nextWs,
          status: legacyStatusFromWorkflow(nextWs),
          orderStatus: legacyStatusFromWorkflow(nextWs),
        },
      },
      { new: true },
    );

    const eventMap = {
      assigned: NOTIFICATION_EVENTS.DELIVERY_ASSIGNED,
      picked: NOTIFICATION_EVENTS.ORDER_PACKED,
      on_the_way: NOTIFICATION_EVENTS.OUT_FOR_DELIVERY,
      delivered: NOTIFICATION_EVENTS.ORDER_DELIVERED,
    };
    emitOrderStatusUpdate(orderId, { workflowStatus: nextWs, selfLogistics: true }, updated.customer);
    emitNotificationEvent(eventMap[stage], {
      orderId,
      customerId: updated.customer,
      userId: updated.customer,
      sellerId: updated.seller,
    });
    return handleResponse(res, 200, "Logistics status updated", updated);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const adminLogisticsOverride = async (req, res) => {
  try {
    const orderId = await requireCanonicalOrderId(req.params.orderId);
    const { workflowStatus, externalTrackingLink, externalLogisticsProvider } = req.body || {};
    const updated = await Order.findOneAndUpdate(
      { orderId },
      {
        $set: {
          workflowStatus,
          status: legacyStatusFromWorkflow(workflowStatus),
          orderStatus: legacyStatusFromWorkflow(workflowStatus),
          externalTrackingLink: externalTrackingLink || undefined,
          externalLogisticsProvider: externalLogisticsProvider || undefined,
        },
      },
      { new: true },
    );
    if (!updated) return handleResponse(res, 404, "Order not found");
    emitOrderStatusUpdate(orderId, { workflowStatus, override: true }, updated.customer);
    return handleResponse(res, 200, "Logistics override applied", updated);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
