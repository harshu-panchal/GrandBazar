import mongoose from "mongoose";
import Order from "../models/order.js";
import Store from "../models/store.js";
import User from "../models/customer.js";
import Transaction from "../models/transaction.js";
import Setting from "../models/setting.js";
import Admin from "../models/admin.js";
import {
  WORKFLOW_STATUS,
  legacyStatusFromWorkflow,
} from "../constants/orderWorkflow.js";
import { requireCanonicalOrderId } from "../utils/orderLookup.js";
import { buildCheckoutPricingSnapshot } from "./checkoutPricingService.js";
import { freezeFinancialSnapshot } from "./finance/orderFinanceService.js";
import { releaseReservedStockForOrder, reserveStockForItems, computeStockReservationWindow } from "./stockService.js";
import { emitToSeller, emitOrderStatusUpdate } from "./orderSocketEmitter.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import { rescueApprovalDeadlineQueue, JOB_NAMES } from "../queues/orderQueues.js";
import logger from "./logger.js";
import {
  getOrderReassignCandidates,
  mapItemsToTargetStore,
  clearDeliveryState,
  sellerTimeoutMsForOrder,
} from "./orderReassignService.js";

function httpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function toId(value) {
  if (!value) return "";
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

export async function getRescueSettings() {
  const settings = await Setting.findOne({}).select(
    "rescueEngineEnabled rescueMaxAttempts rescueMaxPriceIncreasePercent rescueApprovalDeadlineMinutes",
  ).lean();
  return {
    enabled: settings?.rescueEngineEnabled !== false,
    maxAttempts: Number(settings?.rescueMaxAttempts || 3),
    maxPriceIncreasePercent: Number(settings?.rescueMaxPriceIncreasePercent ?? 15),
    approvalDeadlineMinutes: Number(settings?.rescueApprovalDeadlineMinutes || 30),
  };
}

async function getAdminIds() {
  const admins = await Admin.find().select("_id").lean();
  return (admins || []).map((a) => a?._id).filter(Boolean);
}

// --- deadline scheduling (mirrors orderPriceAdjustmentService.js's pattern) ---

async function scheduleRescueDeadline(orderId, deadlineAt) {
  const delay = Math.max(0, new Date(deadlineAt).getTime() - Date.now());
  const jobId = `order:${orderId}:rescue-approval`;
  try {
    const existing = await rescueApprovalDeadlineQueue.getJob(jobId);
    if (existing) await existing.remove();
  } catch {
    /* ignore */
  }
  await rescueApprovalDeadlineQueue.add(
    JOB_NAMES.RESCUE_APPROVAL_DEADLINE,
    { orderId },
    { delay, jobId, removeOnComplete: true },
  );
  return jobId;
}

async function cancelRescueDeadline(order) {
  const jobId = order?.rescue?.deadlineJobId;
  if (!jobId) return;
  try {
    const existing = await rescueApprovalDeadlineQueue.getJob(jobId);
    if (existing) await existing.remove();
  } catch {
    /* ignore — job may already have run */
  }
}

// --- pricing ---

// Computes what this order would cost at a different store, independent of
// who initiated the reassignment (auto-rescue or admin-manual) — the single
// place "same/higher/lower price" gets decided, so both paths agree.
export async function computeReassignmentPricing(order, targetStoreId, remappedItems) {
  const previousGrandTotal = Number(order.paymentBreakdown?.grandTotal || order.pricing?.total || 0);
  const pricingSnapshot = await buildCheckoutPricingSnapshot({
    orderItems: remappedItems.map((item) => ({
      product: item.product,
      variantSku: item.variantSlot || "",
      quantity: item.quantity,
      price: item.price,
    })),
    address: order.address,
    tipAmount: Number(order.pricing?.tip || order.paymentBreakdown?.tipTotal || 0),
    discountTotal: Number(order.pricing?.discount || order.paymentBreakdown?.discountTotal || 0),
    // Prices were just freshly resolved from the target store's own live
    // product/variant records in mapItemsToTargetStore — pass them through
    // as-is rather than re-resolving (enforceServerPricing:false is the
    // same choice orderPriceAdjustmentService.js makes for the analogous
    // seller/admin price-adjustment path).
    enforceServerPricing: false,
  });

  const sellerEntry = pricingSnapshot.sellerBreakdownEntries.find(
    (e) => String(e.sellerId) === String(targetStoreId),
  );
  if (!sellerEntry) {
    throw httpError("Unable to compute pricing for target store", 400);
  }

  const newGrandTotal = Number(sellerEntry.breakdown?.grandTotal || 0);
  const delta = Math.round((newGrandTotal - previousGrandTotal) * 100) / 100;
  const direction = delta > 0 ? "increase" : delta < 0 ? "decrease" : "none";

  return {
    breakdown: sellerEntry.breakdown,
    direction,
    deltaAmount: Math.abs(delta),
    previousGrandTotal,
    newGrandTotal,
  };
}

// --- candidate search ---

// Ranks candidates the same way the admin-facing "reassign store" picker
// already does (distance/coverage/open-status), then layers price on top:
// prefer same-or-lower price first, otherwise the cheapest increase that's
// still within the admin-configured cap. Stores already tried for this
// order (see order.rescue.triedStoreIds) are never retried.
async function findBestRescueCandidate(order, { maxPriceIncreasePercent }) {
  let candidateList;
  try {
    const result = await getOrderReassignCandidates(order.orderId);
    candidateList = result.candidates || [];
  } catch (error) {
    // e.g. "Order cannot be reassigned in status X" or no delivery location
    return { candidate: null, reason: error.message };
  }

  const triedStoreIds = new Set((order.rescue?.triedStoreIds || []).map(String));
  const eligible = candidateList.filter(
    (c) => c.canReassign && !triedStoreIds.has(String(c.storeId)),
  );
  if (!eligible.length) {
    return { candidate: null, reason: "No alternative seller available" };
  }

  const priced = [];
  for (const c of eligible.slice(0, 8)) {
    try {
      const { remappedItems, reservePayload } = await mapItemsToTargetStore(order, c.storeId);
      const pricing = await computeReassignmentPricing(order, c.storeId, remappedItems);
      priced.push({ storeInfo: c, remappedItems, reservePayload, ...pricing });
    } catch {
      // Stock/catalog mismatch surfaced mid-check (race with another order) — skip this candidate.
      continue;
    }
  }
  if (!priced.length) {
    return { candidate: null, reason: "No alternative seller could fulfil the exact items in stock" };
  }

  const nonIncrease = priced.filter((p) => p.direction !== "increase");
  if (nonIncrease.length) {
    return { candidate: nonIncrease[0], reason: null };
  }

  const withinCap = priced.filter((p) => {
    const pct = p.previousGrandTotal > 0 ? (p.deltaAmount / p.previousGrandTotal) * 100 : 100;
    return pct <= maxPriceIncreasePercent;
  });
  if (withinCap.length) {
    withinCap.sort((a, b) => a.deltaAmount - b.deltaAmount);
    return { candidate: withinCap[0], reason: null };
  }

  return { candidate: null, reason: `All alternative sellers cost more than the allowed ${maxPriceIncreasePercent}% price increase` };
}

// --- execution ---

// Same-price or cheaper candidate: reassign immediately, no customer
// action needed. A price decrease is auto-refunded to the wallet.
export async function executeImmediateReassignment(order, {
  targetStoreId, targetStore, remappedItems, reservePayload, breakdown, direction, deltaAmount, actorLabel, trigger,
}) {
  const fromStoreId = toId(order.seller);
  const fromStore = fromStoreId ? await Store.findById(fromStoreId).select("_id shopName name").lean() : null;
  const fromShopName = fromStore?.shopName || fromStore?.name || "Previous store";
  const toShopName = targetStore.shopName || targetStore.name || "New store";

  const session = await mongoose.startSession();
  let updatedOrder;
  let refundAmount = 0;
  try {
    session.startTransaction();
    const locked = await Order.findOne({ orderId: order.orderId }).session(session);
    if (!locked) throw httpError("Order not found", 404);

    if (locked.stockReservation?.status !== "RELEASED") {
      await releaseReservedStockForOrder(locked, { session, reason: "Order rescue reassignment" });
    }
    const paymentMode = locked.paymentMode || locked.payment?.method || "COD";
    await reserveStockForItems({
      items: reservePayload,
      sellerId: targetStoreId,
      orderId: locked.orderId,
      session,
      paymentMode,
    });

    await clearDeliveryState(locked, { session });

    const timeoutMs = sellerTimeoutMsForOrder(locked);
    const sellerPendingExpiresAt = new Date(Date.now() + timeoutMs);
    const nextVersion = Number(locked.modificationVersion || 0) + 1;
    const reservation = computeStockReservationWindow(paymentMode);
    const reassignedAt = new Date();
    const previousWorkflowStatus = locked.workflowStatus;

    locked.seller = targetStoreId;
    locked.items = remappedItems;
    locked.workflowStatus = WORKFLOW_STATUS.SELLER_PENDING;
    locked.status = legacyStatusFromWorkflow(WORKFLOW_STATUS.SELLER_PENDING);
    locked.orderStatus = locked.status;
    locked.sellerPendingExpiresAt = sellerPendingExpiresAt;
    locked.sellerAcceptedAt = undefined;
    locked.deliveryBoy = undefined;
    locked.deliveryPartner = undefined;
    locked.assignedAt = undefined;
    locked.assignmentVersion = Number(locked.assignmentVersion || 0) + 1;
    locked.skippedBy = [];
    locked.deliverySearchMeta = { radiusMeters: 5000, attempt: 1, lastBroadcastAt: undefined };
    locked.stockReservation = reservation;
    locked.modificationVersion = nextVersion;
    locked.storeReassignment = {
      fromStoreId,
      toStoreId: String(targetStoreId),
      fromShopName,
      toShopName,
      reason: `order_rescue_${trigger}`,
      note: `Auto-rescued from ${fromShopName} to ${toShopName}`,
      reassignedAt,
      reassignedBy: actorLabel,
      previousWorkflowStatus,
    };

    freezeFinancialSnapshot(locked, breakdown);

    if (direction === "decrease" && deltaAmount > 0) {
      refundAmount = deltaAmount;
      await User.findByIdAndUpdate(
        locked.customer,
        { $inc: { walletBalance: refundAmount } },
        { session },
      );
      await Transaction.create(
        [
          {
            user: locked.customer,
            userModel: "User",
            order: locked._id,
            type: "Refund",
            amount: refundAmount,
            status: "Settled",
            reference: `REF-RESCUE-${locked.orderId}`,
            meta: { orderId: locked.orderId, kind: "rescue_price_decrease_refund" },
          },
        ],
        { session },
      );
    }

    const attemptNumber = Number(locked.rescue?.attempts || 0) + 1;
    const existingHistory = Array.isArray(locked.rescue?.history) ? locked.rescue.history : [];
    const existingTried = Array.isArray(locked.rescue?.triedStoreIds) ? locked.rescue.triedStoreIds : [];

    locked.rescue = {
      status: "resolved",
      attempts: attemptNumber,
      trigger,
      triedStoreIds: [...new Set([...existingTried, String(targetStoreId)])],
      candidateStoreId: targetStoreId,
      candidateShopName: toShopName,
      proposedItems: [],
      proposedBreakdown: null,
      direction,
      deltaAmount,
      previousGrandTotal: Number(order.paymentBreakdown?.grandTotal || order.pricing?.total || 0),
      newGrandTotal: breakdown.grandTotal,
      deadlineAt: null,
      deadlineJobId: null,
      history: [
        ...existingHistory,
        { attempt: attemptNumber, storeId: String(targetStoreId), shopName: toShopName, outcome: "auto_reassigned", direction, deltaAmount, at: reassignedAt },
      ],
    };

    locked.modificationTimeline = [
      ...(Array.isArray(locked.modificationTimeline) ? locked.modificationTimeline : []),
      {
        version: nextVersion,
        type: "order_rescued",
        actorRole: actorLabel,
        actorId: "",
        note: `Rescued from ${fromShopName} to ${toShopName} (${trigger})`,
        meta: { fromStoreId, toStoreId: String(targetStoreId), direction, deltaAmount },
        createdAt: reassignedAt,
      },
    ];

    await locked.save({ session });
    await session.commitTransaction();
    updatedOrder = locked;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  const { removeSellerTimeoutJob, removeDeliveryTimeoutJob, scheduleSellerTimeoutJob } = await import("./orderWorkflowService.js");
  await removeSellerTimeoutJob(updatedOrder.orderId);
  const attempt = Number(updatedOrder.deliverySearchMeta?.attempt || 1);
  await removeDeliveryTimeoutJob(updatedOrder.orderId, attempt);
  await scheduleSellerTimeoutJob(updatedOrder.orderId);

  emitToSeller(fromStoreId, {
    event: "order:reassigned_away",
    payload: { orderId: updatedOrder.orderId, toStoreId: String(targetStoreId), reason: "order_rescue" },
  });
  emitToSeller(String(targetStoreId), {
    event: "order:new",
    payload: {
      orderId: updatedOrder.orderId,
      workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
      sellerPendingExpiresAt: updatedOrder.sellerPendingExpiresAt,
      reassigned: true,
      fromStoreId,
    },
  });
  if (targetStore.ownerId) {
    emitToSeller(String(targetStore.ownerId), {
      event: "order:new",
      payload: {
        orderId: updatedOrder.orderId,
        workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
        sellerPendingExpiresAt: updatedOrder.sellerPendingExpiresAt,
        reassigned: true,
        fromStoreId,
        storeId: String(targetStoreId),
      },
    });
  }

  emitOrderStatusUpdate(
    updatedOrder.orderId,
    { workflowStatus: WORKFLOW_STATUS.SELLER_PENDING, rescued: true, direction, deltaAmount },
    updatedOrder.customer,
  );
  emitNotificationEvent(NOTIFICATION_EVENTS.NEW_ORDER, {
    orderId: updatedOrder.orderId,
    sellerId: String(targetStoreId),
    customerId: updatedOrder.customer,
    reassigned: true,
  });
  emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_RESCUE_AUTO_REASSIGNED, {
    orderId: updatedOrder.orderId,
    customerId: updatedOrder.customer,
    userId: updatedOrder.customer,
    shopName: toShopName,
    refundAmount: refundAmount || undefined,
  });

  return updatedOrder;
}

// Higher-priced candidate: proposes the reassignment and waits for the
// customer — order.items/seller are left untouched until they approve,
// exactly mirroring how orderPriceAdjustmentService.js's price-increase
// proposals never touch order.items while "pending".
export async function proposeReassignmentForApproval(order, {
  targetStoreId, targetStore, remappedItems, breakdown, direction, deltaAmount, trigger, settings,
}) {
  const toShopName = targetStore.shopName || targetStore.name || "New store";
  const deadline = new Date(Date.now() + settings.approvalDeadlineMinutes * 60000);
  const jobId = await scheduleRescueDeadline(order.orderId, deadline);
  const attemptNumber = Number(order.rescue?.attempts || 0) + 1;
  const previousGrandTotal = Number(order.paymentBreakdown?.grandTotal || order.pricing?.total || 0);

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, workflowStatus: order.workflowStatus },
    {
      $set: {
        workflowStatus: WORKFLOW_STATUS.RESCUE_PENDING,
        status: legacyStatusFromWorkflow(WORKFLOW_STATUS.RESCUE_PENDING),
        orderStatus: legacyStatusFromWorkflow(WORKFLOW_STATUS.RESCUE_PENDING),
        "rescue.status": "proposed_price_increase",
        "rescue.attempts": attemptNumber,
        "rescue.trigger": trigger,
        "rescue.candidateStoreId": targetStoreId,
        "rescue.candidateShopName": toShopName,
        "rescue.proposedItems": remappedItems,
        "rescue.proposedBreakdown": breakdown,
        "rescue.direction": direction,
        "rescue.deltaAmount": deltaAmount,
        "rescue.previousGrandTotal": previousGrandTotal,
        "rescue.newGrandTotal": breakdown.grandTotal,
        "rescue.deadlineAt": deadline,
        "rescue.deadlineJobId": jobId,
      },
      $push: {
        "rescue.history": {
          attempt: attemptNumber,
          storeId: String(targetStoreId),
          shopName: toShopName,
          outcome: "proposed_increase",
          direction,
          deltaAmount,
          at: new Date(),
        },
        "rescue.triedStoreIds": String(targetStoreId),
      },
    },
    { new: true },
  );
  if (!updated) {
    throw httpError("Order state changed concurrently — please retry", 409);
  }

  emitOrderStatusUpdate(
    order.orderId,
    { workflowStatus: WORKFLOW_STATUS.RESCUE_PENDING, rescuePending: true, deltaAmount },
    order.customer,
  );
  emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_RESCUE_PRICE_APPROVAL_NEEDED, {
    orderId: order.orderId,
    customerId: order.customer,
    userId: order.customer,
    shopName: toShopName,
    deltaAmount,
  });

  return updated;
}

// No viable candidate at all (or attempts exhausted): fall back to the
// original cancel+compensate path, but flag it for admin follow-up instead
// of it looking like any other cancelled order.
export async function escalateOrderRescueFailure(order, { reasonMessage, trigger }) {
  const { compensateOrderCancellation } = await import("./orderCompensation.js");
  const { removeSellerTimeoutJob, removeDeliveryTimeoutJob } = await import("./orderWorkflowService.js");

  const attemptNumber = Number(order.rescue?.attempts || 0);
  const existingHistory = Array.isArray(order.rescue?.history) ? order.rescue.history : [];

  // A seller-rejected order that exhausts rescue is still, at root, a
  // seller rejection — preserved so downstream features keyed on
  // cancelledBy==="seller" (e.g. adminCreateReplacementOrderForRejectedOrder)
  // keep working once rescue gives up on it.
  const cancelledBy = trigger === "seller_rejected" ? "seller" : "system";

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, workflowStatus: { $in: [order.workflowStatus, WORKFLOW_STATUS.RESCUE_PENDING] } },
    {
      $set: {
        workflowStatus: WORKFLOW_STATUS.CANCELLED,
        status: "cancelled",
        orderStatus: "cancelled",
        cancelledBy,
        cancelReason: `Order rescue failed: ${reasonMessage}`,
        needsManualReassignment: true,
        "rescue.status": "failed",
      },
      $push: {
        "rescue.history": {
          attempt: attemptNumber,
          storeId: null,
          shopName: null,
          outcome: "escalated_no_candidate",
          direction: "none",
          deltaAmount: 0,
          at: new Date(),
        },
      },
    },
    { new: true },
  );
  if (!updated) return null;

  await removeSellerTimeoutJob(order.orderId);
  await removeDeliveryTimeoutJob(order.orderId, 1);
  await cancelRescueDeadline(order);
  await compensateOrderCancellation(updated, order.orderId);

  emitOrderStatusUpdate(order.orderId, { workflowStatus: WORKFLOW_STATUS.CANCELLED }, updated.customer);
  emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_RESCUE_FAILED, {
    orderId: updated.orderId,
    customerId: updated.customer,
    userId: updated.customer,
  });

  try {
    const adminIds = await getAdminIds();
    emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_NEEDS_MANUAL_REASSIGNMENT, {
      orderId: updated.orderId,
      adminIds,
    });
  } catch {
    /* best-effort */
  }

  return updated;
}

// --- entry points ---

// Called from sellerRejectAtomic / processSellerTimeoutJob INSTEAD OF an
// immediate cancel+compensate — this is the choke point that used to go
// straight to cancellation with zero rescue attempt.
export async function attemptOrderRescue(orderId, { trigger, actorLabel = "system" } = {}) {
  const canonicalId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId: canonicalId });
  if (!order) return null;

  const settings = await getRescueSettings();
  if (!settings.enabled) {
    return escalateOrderRescueFailure(order, { reasonMessage: "Rescue engine disabled", trigger });
  }

  const attemptsSoFar = Number(order.rescue?.attempts || 0);
  if (attemptsSoFar >= settings.maxAttempts) {
    return escalateOrderRescueFailure(order, { reasonMessage: `Max rescue attempts (${settings.maxAttempts}) reached`, trigger });
  }

  emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_RESCUE_SEARCHING, {
    orderId: order.orderId,
    customerId: order.customer,
    userId: order.customer,
  });

  const { candidate, reason } = await findBestRescueCandidate(order, {
    maxPriceIncreasePercent: settings.maxPriceIncreasePercent,
  });

  if (!candidate) {
    return escalateOrderRescueFailure(order, { reasonMessage: reason || "No alternative seller available", trigger });
  }

  const targetStore = await Store.findById(candidate.storeInfo.storeId)
    .select("_id shopName name ownerId isActive isVerified applicationStatus")
    .lean();
  if (!targetStore) {
    return escalateOrderRescueFailure(order, { reasonMessage: "Candidate store no longer exists", trigger });
  }

  if (candidate.direction === "increase") {
    return proposeReassignmentForApproval(order, {
      targetStoreId: candidate.storeInfo.storeId,
      targetStore,
      remappedItems: candidate.remappedItems,
      breakdown: candidate.breakdown,
      direction: candidate.direction,
      deltaAmount: candidate.deltaAmount,
      trigger,
      settings,
    });
  }

  return executeImmediateReassignment(order, {
    targetStoreId: candidate.storeInfo.storeId,
    targetStore,
    remappedItems: candidate.remappedItems,
    reservePayload: candidate.reservePayload,
    breakdown: candidate.breakdown,
    direction: candidate.direction,
    deltaAmount: candidate.deltaAmount,
    actorLabel,
    trigger,
  });
}

export async function customerApproveRescue(customerId, orderId) {
  const canonicalId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({
    orderId: canonicalId,
    customer: customerId,
    workflowStatus: WORKFLOW_STATUS.RESCUE_PENDING,
    "rescue.status": "proposed_price_increase",
  });
  if (!order) {
    throw httpError("No pending rescue approval for this order", 404);
  }

  const targetStore = await Store.findById(order.rescue.candidateStoreId)
    .select("_id shopName name ownerId isActive isVerified applicationStatus")
    .lean();
  if (!targetStore) {
    throw httpError("The candidate store is no longer available — we'll search again", 409);
  }

  await cancelRescueDeadline(order);

  return executeImmediateReassignment(order, {
    targetStoreId: order.rescue.candidateStoreId,
    targetStore,
    remappedItems: order.rescue.proposedItems,
    reservePayload: order.rescue.proposedItems.map((item) => ({
      productId: item.product,
      productName: item.name,
      quantity: item.quantity,
      variantSku: item.variantSlot,
    })),
    breakdown: order.rescue.proposedBreakdown,
    direction: order.rescue.direction,
    deltaAmount: order.rescue.deltaAmount,
    actorLabel: "customer",
    trigger: order.rescue.trigger,
  });
}

export async function customerRejectRescue(customerId, orderId) {
  const canonicalId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({
    orderId: canonicalId,
    customer: customerId,
    workflowStatus: WORKFLOW_STATUS.RESCUE_PENDING,
    "rescue.status": "proposed_price_increase",
  });
  if (!order) {
    throw httpError("No pending rescue approval for this order", 404);
  }

  await cancelRescueDeadline(order);

  const settings = await getRescueSettings();
  const attemptsSoFar = Number(order.rescue?.attempts || 0);
  if (attemptsSoFar >= settings.maxAttempts) {
    return escalateOrderRescueFailure(order, { reasonMessage: "Customer declined and max attempts reached", trigger: order.rescue.trigger });
  }

  // Reset back to SELLER_PENDING (no seller actually assigned yet) and try
  // the next candidate, excluding the one just rejected.
  const reverted = await Order.findOneAndUpdate(
    { _id: order._id, workflowStatus: WORKFLOW_STATUS.RESCUE_PENDING },
    {
      $set: {
        workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
        status: legacyStatusFromWorkflow(WORKFLOW_STATUS.SELLER_PENDING),
        orderStatus: legacyStatusFromWorkflow(WORKFLOW_STATUS.SELLER_PENDING),
        "rescue.status": "none",
        "rescue.proposedItems": [],
        "rescue.proposedBreakdown": null,
      },
      $push: {
        "rescue.history": {
          attempt: attemptsSoFar,
          storeId: String(order.rescue.candidateStoreId || ""),
          shopName: order.rescue.candidateShopName,
          outcome: "customer_rejected",
          direction: order.rescue.direction,
          deltaAmount: order.rescue.deltaAmount,
          at: new Date(),
        },
      },
    },
    { new: true },
  );
  if (!reverted) {
    throw httpError("Order was updated concurrently — please retry", 409);
  }

  return attemptOrderRescue(reverted.orderId, { trigger: reverted.rescue.trigger, actorLabel: "system" });
}

export async function processRescueApprovalDeadlineJob({ orderId }) {
  const canonicalId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({
    orderId: canonicalId,
    workflowStatus: WORKFLOW_STATUS.RESCUE_PENDING,
    "rescue.status": "proposed_price_increase",
  });
  if (!order) return;

  logger.info("Rescue approval deadline reached — treating as rejection", { orderId: canonicalId });
  try {
    await customerRejectRescue(order.customer, canonicalId);
  } catch (error) {
    logger.error("Rescue approval deadline handling failed", { orderId: canonicalId, message: error.message });
  }
}
