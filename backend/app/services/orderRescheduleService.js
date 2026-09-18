import Order from "../models/order.js";
import {
  WORKFLOW_STATUS,
  FULFILLMENT_TYPE,
  legacyStatusFromWorkflow,
} from "../constants/orderWorkflow.js";
import { requireCanonicalOrderId } from "../utils/orderLookup.js";
import {
  validateScheduleSelection,
  buildSchedulePayload,
  scheduleOrderActivationJob,
  removeOrderActivationJob,
} from "./orderSchedulingService.js";
import { emitOrderStatusUpdate, emitToCustomer } from "./orderSocketEmitter.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import { resolveWorkflowStatus } from "./orderWorkflowService.js";
import { isPastCutoff } from "../utils/scheduleDateUtils.js";

function canReschedule(order) {
  if (!order) return { allowed: false, reason: "Order not found" };
  if (order.deliveryBoy) {
    return { allowed: false, reason: "Cannot reschedule after delivery partner assignment" };
  }
  const ws = resolveWorkflowStatus(order);
  if ([WORKFLOW_STATUS.CANCELLED, WORKFLOW_STATUS.DELIVERED, WORKFLOW_STATUS.DISPUTED].includes(ws)) {
    return { allowed: false, reason: "Order cannot be rescheduled in current state" };
  }
  if (
    ![
      WORKFLOW_STATUS.SELLER_PENDING,
      WORKFLOW_STATUS.SELLER_ACCEPTED,
      WORKFLOW_STATUS.SCHEDULED_HOLD,
      WORKFLOW_STATUS.PREORDER_HOLD,
    ].includes(ws) &&
    order.fulfillmentType === FULFILLMENT_TYPE.INSTANT
  ) {
    return { allowed: false, reason: "Only scheduled/pre-order orders can be rescheduled after acceptance" };
  }
  if (order.schedule?.cutoffAt && isPastCutoff(new Date(), order.schedule.cutoffAt)) {
    return { allowed: false, reason: "Reschedule cutoff has passed" };
  }
  return { allowed: true };
}

function requiresApproval(order) {
  const ws = resolveWorkflowStatus(order);
  return [WORKFLOW_STATUS.SELLER_ACCEPTED, WORKFLOW_STATUS.SCHEDULED_HOLD].includes(ws);
}

async function applyReschedule(order, scheduleMeta, actor, note = "") {
  const historyEntry = {
    fromDate: order.schedule?.deliveryDate || null,
    fromWindowLabel: order.schedule?.windowLabel || "",
    toDate: scheduleMeta.deliveryDate,
    toWindowLabel: scheduleMeta.windowLabel,
    changedBy: actor,
    changedAt: new Date(),
    note,
  };

  const updateSet = {
    timeSlot: `${scheduleMeta.deliveryDate.toISOString().slice(0, 10)}|${scheduleMeta.windowLabel}`,
    schedule: {
      ...scheduleMeta,
      activationJobId: order.schedule?.activationJobId || null,
      activatedAt: order.schedule?.activatedAt || null,
    },
    status: "rescheduled",
    orderStatus: "rescheduled",
    "reschedule.status": "approved",
    "reschedule.reviewedAt": new Date(),
    "reschedule.reviewNote": note,
  };

  const ws = resolveWorkflowStatus(order);
  if (ws === WORKFLOW_STATUS.SELLER_ACCEPTED || ws === WORKFLOW_STATUS.SCHEDULED_HOLD) {
    updateSet.workflowStatus = WORKFLOW_STATUS.SCHEDULED_HOLD;
    updateSet.status = legacyStatusFromWorkflow(WORKFLOW_STATUS.SCHEDULED_HOLD);
    updateSet.orderStatus = "rescheduled";
  }

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, deliveryBoy: null },
    {
      $set: updateSet,
      $push: { "reschedule.history": historyEntry },
    },
    { new: true },
  );

  if (!updated) {
    const err = new Error("Unable to apply reschedule");
    err.statusCode = 409;
    throw err;
  }

  if (
    updated.workflowStatus === WORKFLOW_STATUS.SCHEDULED_HOLD &&
    scheduleMeta.activationAt
  ) {
    const jobId = await scheduleOrderActivationJob(updated.orderId, scheduleMeta.activationAt);
    await Order.updateOne(
      { _id: updated._id },
      { $set: { "schedule.activationJobId": jobId, "schedule.activationAt": scheduleMeta.activationAt } },
    );
  }

  emitOrderStatusUpdate(
    updated.orderId,
    { rescheduled: true, schedule: updated.schedule },
    updated.customer,
  );
  emitNotificationEvent(NOTIFICATION_EVENTS.RESCHEDULE_APPROVED, {
    orderId: updated.orderId,
    customerId: updated.customer,
    userId: updated.customer,
    sellerId: updated.seller,
  });
  return updated;
}

export async function customerRescheduleInstant(customerId, orderId, { deliveryDate, windowLabel, reason }) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId, customer: customerId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  const gate = canReschedule(order);
  if (!gate.allowed) {
    const err = new Error(gate.reason);
    err.statusCode = 400;
    throw err;
  }

  if (requiresApproval(order)) {
    const err = new Error("Seller approval required. Please submit a reschedule request.");
    err.statusCode = 409;
    throw err;
  }

  const scheduleMeta = await validateScheduleSelection({
    sellerId: order.seller,
    deliveryDate,
    windowLabel,
    fulfillmentType: order.fulfillmentType,
    checkRescheduleCutoff: true,
  });

  return applyReschedule(order, buildSchedulePayload(scheduleMeta), "customer", reason || "");
}

export async function requestRescheduleApproval(customerId, orderId, { deliveryDate, windowLabel, reason }) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId, customer: customerId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  if (order.reschedule?.status === "requested") {
    const err = new Error("Reschedule request already pending");
    err.statusCode = 409;
    throw err;
  }

  const gate = canReschedule(order);
  if (!gate.allowed) {
    const err = new Error(gate.reason);
    err.statusCode = 400;
    throw err;
  }
  if (!requiresApproval(order)) {
    return customerRescheduleInstant(customerId, orderId, { deliveryDate, windowLabel, reason });
  }

  await validateScheduleSelection({
    sellerId: order.seller,
    deliveryDate,
    windowLabel,
    fulfillmentType: order.fulfillmentType,
    checkRescheduleCutoff: true,
  });

  const updated = await Order.findOneAndUpdate(
    {
      orderId,
      customer: customerId,
      deliveryBoy: null,
      "reschedule.status": { $ne: "requested" },
    },
    {
      $set: {
        status: "reschedule_requested",
        orderStatus: "reschedule_requested",
        reschedule: {
          status: "requested",
          requestedDeliveryDate: new Date(deliveryDate),
          requestedWindowLabel: windowLabel,
          reason: String(reason || "").trim(),
          requestedAt: new Date(),
          requestedBy: "customer",
          reviewedAt: null,
          reviewedBy: null,
          reviewNote: "",
          history: order.reschedule?.history || [],
        },
      },
    },
    { new: true },
  );

  if (!updated) {
    const err = new Error("Unable to submit reschedule request");
    err.statusCode = 400;
    throw err;
  }

  emitNotificationEvent(NOTIFICATION_EVENTS.RESCHEDULE_REQUESTED, {
    orderId,
    customerId,
    userId: customerId,
    sellerId: updated.seller,
  });
  return updated;
}

export async function approveRescheduleRequest(reviewerId, reviewerModel, orderId, note = "") {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId });
  if (!order || order.reschedule?.status !== "requested") {
    const err = new Error("No pending reschedule request");
    err.statusCode = 409;
    throw err;
  }

  const scheduleMeta = await validateScheduleSelection({
    sellerId: order.seller,
    deliveryDate: order.reschedule.requestedDeliveryDate,
    windowLabel: order.reschedule.requestedWindowLabel,
    fulfillmentType: order.fulfillmentType,
    checkRescheduleCutoff: true,
  });

  const updated = await applyReschedule(
    order,
    buildSchedulePayload(scheduleMeta),
    reviewerModel === "Admin" ? "admin" : "seller",
    note || order.reschedule.reason,
  );
  await Order.updateOne(
    { _id: updated._id },
    {
      $set: {
        "reschedule.reviewedBy": reviewerId,
        "reschedule.reviewedByModel": reviewerModel,
      },
    },
  );
  return updated;
}

export async function rejectRescheduleRequest(reviewerId, reviewerModel, orderId, note = "") {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId });
  if (!order || order.reschedule?.status !== "requested") {
    const err = new Error("No pending reschedule request");
    err.statusCode = 409;
    throw err;
  }

  const ws = resolveWorkflowStatus(order);
  const updated = await Order.findOneAndUpdate(
    { orderId, "reschedule.status": "requested" },
    {
      $set: {
        status: legacyStatusFromWorkflow(ws),
        orderStatus: legacyStatusFromWorkflow(ws),
        reschedule: {
          ...(order.reschedule?.toObject?.() || order.reschedule || {}),
          status: "rejected",
          reviewedAt: new Date(),
          reviewedBy: reviewerId,
          reviewedByModel: reviewerModel,
          reviewNote: String(note || "Reschedule request rejected").trim(),
        },
      },
    },
    { new: true },
  );

  emitToCustomer(updated.customer?.toString?.() || String(updated.customer), {
    event: "order:reschedule:rejected",
    payload: { orderId, note: updated.reschedule?.reviewNote },
  });
  emitNotificationEvent(NOTIFICATION_EVENTS.RESCHEDULE_REJECTED, {
    orderId,
    customerId: updated.customer,
    userId: updated.customer,
    sellerId: updated.seller,
  });
  return updated;
}

export async function adminRescheduleOnBehalf(adminId, orderId, { deliveryDate, windowLabel, note }) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  const scheduleMeta = await validateScheduleSelection({
    sellerId: order.seller,
    deliveryDate,
    windowLabel,
    fulfillmentType: order.fulfillmentType,
    checkRescheduleCutoff: true,
  });
  if (order.schedule?.activationJobId) {
    await removeOrderActivationJob(orderId);
  }
  return applyReschedule(order, buildSchedulePayload(scheduleMeta), "admin", note || "");
}

export async function sellerRescheduleOnBehalf(sellerId, orderId, { deliveryDate, windowLabel, note }) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId, seller: sellerId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  const gate = canReschedule(order);
  if (!gate.allowed) {
    const err = new Error(gate.reason);
    err.statusCode = 400;
    throw err;
  }
  const scheduleMeta = await validateScheduleSelection({
    sellerId: order.seller,
    deliveryDate,
    windowLabel,
    fulfillmentType: order.fulfillmentType,
    checkRescheduleCutoff: true,
  });
  if (order.schedule?.activationJobId) {
    await removeOrderActivationJob(orderId);
  }
  return applyReschedule(order, buildSchedulePayload(scheduleMeta), "seller", note || "");
}

export { canReschedule, requiresApproval };
