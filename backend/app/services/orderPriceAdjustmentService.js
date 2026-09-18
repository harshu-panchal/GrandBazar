import mongoose from "mongoose";
import Order from "../models/order.js";
import CreditNote from "../models/creditNote.js";
import User from "../models/customer.js";
import Transaction from "../models/transaction.js";
import Product from "../models/product.js";
import {
  WORKFLOW_STATUS,
  legacyStatusFromWorkflow,
  DEFAULT_EXTRA_PAYMENT_DEADLINE_MS,
  DEFAULT_ACTIVATION_LEAD_MS,
} from "../constants/orderWorkflow.js";
import { requireCanonicalOrderId } from "../utils/orderLookup.js";
import { buildCheckoutPricingSnapshot } from "./checkoutPricingService.js";
import { freezeFinancialSnapshot } from "./finance/orderFinanceService.js";
import { debitWallet, creditWallet } from "./finance/walletService.js";
import { createLedgerEntry } from "./finance/ledgerService.js";
import { OWNER_TYPE, LEDGER_TRANSACTION_TYPE } from "../constants/finance.js";
import { roundCurrency } from "../utils/money.js";
import { releaseReservedStockForOrder, reserveStockForItems } from "./stockService.js";
import { resolveWorkflowStatus } from "./orderWorkflowService.js";
import { extraPaymentDeadlineQueue, JOB_NAMES } from "../queues/orderQueues.js";
import { emitOrderStatusUpdate } from "./orderSocketEmitter.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import { computeActivationAt } from "../utils/scheduleDateUtils.js";
import { scheduleOrderActivationJob } from "./orderSchedulingService.js";

// Order states from which a customer can no longer add items — packing has
// started (or the order is otherwise past the point of editing).
const ADD_ITEMS_BLOCKED_WORKFLOW_STATUSES = [
  WORKFLOW_STATUS.PICKUP_READY,
  WORKFLOW_STATUS.CUSTOMER_PICKUP_READY,
  WORKFLOW_STATUS.OUT_FOR_DELIVERY,
  WORKFLOW_STATUS.DELIVERED,
  WORKFLOW_STATUS.CANCELLED,
  WORKFLOW_STATUS.DISPUTED,
];

function generateCreditNoteId() {
  return `CN-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function mapItemsForPricing(items = []) {
  return items.map((item) => ({
    product: item.product,
    variantSku: item.variantSlot || "",
    quantity: item.quantity,
    // Only set when the caller (seller/admin adjustment) actually supplies an
    // override — hydrateOrderItems falls back to the real product price for
    // any line where this is absent, so quantity-only adjustments are unaffected.
    ...(item.price != null && item.price !== "" ? { price: Number(item.price) } : {}),
  }));
}

// Same deadline queue/job name serves both "waiting on payment" and "waiting
// on approval" — both are just "customer hasn't responded to a pending
// adjustment yet," and reusing the queue avoids a second job type to wire up.
async function scheduleAdjustmentDeadline(orderId, deadlineAt) {
  const delay = Math.max(0, new Date(deadlineAt).getTime() - Date.now());
  const jobId = `order:${orderId}:extra-payment`;
  try {
    const existing = await extraPaymentDeadlineQueue.getJob(jobId);
    if (existing) await existing.remove();
  } catch {
    /* ignore */
  }
  await extraPaymentDeadlineQueue.add(
    JOB_NAMES.EXTRA_PAYMENT_DEADLINE,
    { orderId },
    { delay, jobId, removeOnComplete: true },
  );
  return jobId;
}

async function cancelAdjustmentDeadline(order) {
  const jobId = order?.priceAdjustment?.extraPaymentJobId;
  if (!jobId) return;
  try {
    const existing = await extraPaymentDeadlineQueue.getJob(jobId);
    if (existing) await existing.remove();
  } catch {
    /* ignore — job may already have run/expired */
  }
}

// A non-responding customer is treated exactly like an explicit rejection —
// the order resumes at its original items/price, nothing to undo since
// order.items was never touched while the adjustment was only proposed.
export async function processExtraPaymentDeadlineJob({ orderId }) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({
    orderId,
    workflowStatus: WORKFLOW_STATUS.AWAITING_EXTRA_PAYMENT,
    "priceAdjustment.status": "pending",
  });
  if (!order) return;
  await revertPendingAdjustment(order, {
    actorLabel: "system",
    reason: "Customer did not respond in time",
  });
}

async function issueCreditNoteAndRefund(order, deltaAmount, reason, actorLabel) {
  const creditNoteId = generateCreditNoteId();
  const creditNote = await CreditNote.create({
    creditNoteId,
    order: order._id,
    orderPublicId: order.orderId,
    customer: order.customer,
    seller: order.seller,
    amount: deltaAmount,
    reason,
    status: "issued",
    refundMode: order.paymentMode === "ONLINE" ? "original_payment" : "wallet",
    issuedByModel: actorLabel === "seller" ? "Seller" : "Admin",
  });

  const Refund = (await import("../models/refund.js")).default;

  // How much of this decrease is money the platform actually holds right
  // now, as opposed to COD cash that simply hasn't been collected yet:
  // - if online payment was captured, the whole delta was taken via gateway
  // - otherwise (COD, or ONLINE not yet captured), only the portion the
  //   customer already funded from their own wallet at checkout was
  //   genuinely collected. Crediting wallet for the rest would mint money
  //   nobody paid — the remainder is simply billed for less at the door,
  //   since freezeFinancialSnapshot already lowers the COD-collectable
  //   grandTotal for this order right after this function returns.
  const onlineCaptured = order.paymentMode === "ONLINE" && order.financeFlags?.onlinePaymentCaptured;
  const walletFundedAmount = roundCurrency(order.pricing?.walletAmount || order.paymentBreakdown?.walletAmount || 0);
  const refundableNow = onlineCaptured ? deltaAmount : Math.min(deltaAmount, walletFundedAmount);

  if (refundableNow > 0) {
    // Refund is synchronous and confirmed within this call — the record
    // can go straight to completed.
    const refundRecord = await Refund.create({
      order: order._id,
      orderId: order.orderId,
      type: "price_adjustment",
      amount: refundableNow,
      mode: "wallet",
      status: "initiated",
      creditNoteId: creditNote._id,
    });

    if (onlineCaptured) {
      // Reverse the gateway-captured amount out of the admin wallet it was
      // credited into at checkout — mirrors reverseOrderFinanceOnCancellation,
      // since this codebase refunds online payments to wallet rather than
      // back through the gateway (no reconciliation integration exists).
      await debitWallet({
        ownerType: OWNER_TYPE.ADMIN,
        ownerId: null,
        amount: refundableNow,
        bucket: "available",
      });
    }

    await User.findByIdAndUpdate(order.customer, { $inc: { walletBalance: refundableNow } });
    await Transaction.create({
      user: order.customer,
      userModel: "User",
      order: order._id,
      type: "Refund",
      amount: refundableNow,
      status: "Settled",
      reference: creditNoteId,
      paymentMethod: order.paymentMode || null,
      refundStatus: "completed",
      meta: { orderId: order.orderId, creditNoteId },
    });
    await CreditNote.updateOne({ _id: creditNote._id }, { $set: { status: "applied" } });
    refundRecord.status = "completed";
    refundRecord.completedAt = new Date();
    await refundRecord.save();
    emitNotificationEvent(NOTIFICATION_EVENTS.REFUND_COMPLETED, {
      orderId: order.orderId,
      customerId: order.customer,
      userId: order.customer,
      amount: refundableNow,
    });
  } else {
    // Nothing was actually collected for this delta yet (plain COD, no
    // wallet funding) — the lower grandTotal collected at delivery IS the
    // refund. Record it for the audit trail without moving any money.
    await Refund.create({
      order: order._id,
      orderId: order.orderId,
      type: "price_adjustment",
      amount: deltaAmount,
      mode: "cod_adjustment",
      status: "completed",
      completedAt: new Date(),
      creditNoteId: creditNote._id,
    });
    await CreditNote.updateOne({ _id: creditNote._id }, { $set: { status: "applied" } });
  }

  return creditNote;
}

function buildRevisedInvoiceEntry(order, { source, direction, deltaAmount, note, grandTotal }) {
  return {
    version: Number(order.modificationVersion || 0) + 1,
    source: String(source || "adjustment"),
    grandTotal: Number(grandTotal || 0),
    deltaAmount: Number(deltaAmount || 0),
    direction: String(direction || "none"),
    note: String(note || "").trim(),
    createdAt: new Date(),
  };
}

export async function applyOrderPriceAdjustment({
  orderId,
  items,
  reason,
  actorLabel = "seller",
  partialCancelIndexes = [],
  sellerId = null,
}) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  if (actorLabel === "seller" && sellerId && String(order.seller) !== String(sellerId)) {
    const err = new Error("Access denied. You are not authorized to adjust this order.");
    err.statusCode = 403;
    throw err;
  }

  const ws = resolveWorkflowStatus(order);
  if ([WORKFLOW_STATUS.CANCELLED, WORKFLOW_STATUS.DELIVERED, WORKFLOW_STATUS.OUT_FOR_DELIVERY].includes(ws)) {
    const err = new Error("Order cannot be adjusted in current state");
    err.statusCode = 409;
    throw err;
  }
  if (order.deliveryBoy) {
    const err = new Error("Cannot adjust order after delivery partner assignment");
    err.statusCode = 409;
    throw err;
  }
  if (order.priceAdjustment?.status === "pending") {
    const err = new Error("An earlier adjustment on this order is still awaiting the customer's response");
    err.statusCode = 409;
    throw err;
  }

  const previousGrandTotal = Number(order.paymentBreakdown?.grandTotal || order.pricing?.total || 0);
  const pricingSnapshot = await buildCheckoutPricingSnapshot({
    orderItems: mapItemsForPricing(items),
    address: order.address,
    tipAmount: Number(order.pricing?.tip || order.paymentBreakdown?.tipTotal || 0),
    discountTotal: Number(order.pricing?.discount || order.paymentBreakdown?.discountTotal || 0),
    // This is the seller/admin adjusting their own order, not a customer
    // checkout — lets mapItemsForPricing's per-line price override through
    // instead of silently re-pricing off the live product record.
    enforceServerPricing: false,
  });

  const sellerEntry = pricingSnapshot.sellerBreakdownEntries.find(
    (e) => String(e.sellerId) === String(order.seller),
  );
  if (!sellerEntry) {
    const err = new Error("Unable to recompute pricing for seller");
    err.statusCode = 400;
    throw err;
  }

  const newGrandTotal = Number(sellerEntry.breakdown?.grandTotal || 0);
  const delta = Math.round((newGrandTotal - previousGrandTotal) * 100) / 100;
  const direction = delta > 0 ? "increase" : delta < 0 ? "decrease" : "none";
  const proposedItems = sellerEntry.items.map((item) => ({
    product: item.productId,
    name: item.productName,
    quantity: item.quantity,
    price: item.price,
    variantSlot: item.variantSku || undefined,
    image: item.image || "",
  }));

  // No real change (e.g. same total after swapping quantities/price) — apply
  // the item-list edit immediately, there's nothing for the customer to approve.
  if (direction === "none") {
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, deliveryBoy: null },
      {
        $set: {
          items: proposedItems,
          "priceAdjustment.previousGrandTotal": previousGrandTotal,
          "priceAdjustment.newGrandTotal": newGrandTotal,
          "priceAdjustment.deltaAmount": 0,
          "priceAdjustment.reason": reason || "",
          "priceAdjustment.status": "applied",
          "priceAdjustment.direction": "none",
        },
        $push: {
          modificationTimeline: {
            version: Number(order.modificationVersion || 0) + 1,
            type: "price_adjusted",
            actorRole: actorLabel,
            actorId: "",
            note: reason || "",
            meta: { direction: "none", deltaAmount: 0, previousGrandTotal, newGrandTotal },
            createdAt: new Date(),
          },
        },
        $inc: { modificationVersion: 1 },
      },
      { new: true },
    );
    if (!updated) {
      const err = new Error("Unable to apply adjustment");
      err.statusCode = 409;
      throw err;
    }
    freezeFinancialSnapshot(updated, sellerEntry.breakdown);
    await updated.save();
    return updated;
  }

  // Real change — propose it and wait for the customer. order.items/pricing
  // stay exactly as they are until approved (or paid, for an online
  // increase); a rejection or timeout later needs no revert because of that.
  const requiresPayment = direction === "increase" && order.paymentMode === "ONLINE";
  const deadline = new Date(Date.now() + DEFAULT_EXTRA_PAYMENT_DEADLINE_MS());
  const jobId = await scheduleAdjustmentDeadline(orderId, deadline);

  const updateSet = {
    workflowStatus: WORKFLOW_STATUS.AWAITING_EXTRA_PAYMENT,
    status: "awaiting_extra_payment",
    orderStatus: "awaiting_extra_payment",
    "priceAdjustment.status": "pending",
    "priceAdjustment.direction": direction,
    "priceAdjustment.previousGrandTotal": previousGrandTotal,
    "priceAdjustment.newGrandTotal": newGrandTotal,
    "priceAdjustment.deltaAmount": Math.abs(delta),
    "priceAdjustment.reason": reason || "",
    "priceAdjustment.priorWorkflowStatus": order.workflowStatus,
    "priceAdjustment.priorLegacyStatus": order.status,
    "priceAdjustment.requiresPayment": requiresPayment,
    "priceAdjustment.proposedItems": proposedItems,
    "priceAdjustment.proposedBreakdown": sellerEntry.breakdown,
    "priceAdjustment.proposedPartialCancelIndexes": partialCancelIndexes,
    "priceAdjustment.extraPaymentDeadlineAt": deadline,
    "priceAdjustment.extraPaymentJobId": jobId,
  };

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, deliveryBoy: null },
    {
      $set: updateSet,
      $push: {
        modificationTimeline: {
          version: Number(order.modificationVersion || 0) + 1,
          type: partialCancelIndexes.length > 0 ? "partial_cancel_proposed" : "price_adjustment_proposed",
          actorRole: actorLabel,
          actorId: "",
          note: reason || "",
          meta: { direction, deltaAmount: Math.abs(delta), previousGrandTotal, newGrandTotal },
          createdAt: new Date(),
        },
      },
      $inc: { modificationVersion: 1 },
    },
    { new: true },
  );

  if (!updated) {
    const err = new Error("Unable to propose price adjustment");
    err.statusCode = 409;
    throw err;
  }

  emitOrderStatusUpdate(orderId, { priceAdjustmentPending: true, direction }, updated.customer);
  if (requiresPayment) {
    emitNotificationEvent(NOTIFICATION_EVENTS.EXTRA_PAYMENT_REQUIRED, {
      orderId,
      customerId: updated.customer,
      userId: updated.customer,
      amount: Math.abs(delta),
    });
  } else {
    emitNotificationEvent(NOTIFICATION_EVENTS.PRICE_ADJUSTMENT_PENDING_APPROVAL, {
      orderId,
      customerId: updated.customer,
      userId: updated.customer,
      amount: Math.abs(delta),
      direction,
    });
  }

  return updated;
}

// Shared by payPriceDifference (online-increase, after payment) and
// approveOrderAdjustment (COD increase / decrease, no payment needed) — both
// are "the customer signed off, now actually apply what was proposed."
async function finalizePendingAdjustment(order, { actorRole, extraSet = {}, skipNotification = false }) {
  const pa = order.priceAdjustment || {};
  const direction = pa.direction || "none";
  const deltaAmount = Math.abs(Number(pa.deltaAmount || 0));
  const reason = pa.reason || "";
  const proposedItems = Array.isArray(pa.proposedItems) ? pa.proposedItems : [];
  const proposedPartialCancelIndexes = Array.isArray(pa.proposedPartialCancelIndexes)
    ? pa.proposedPartialCancelIndexes
    : [];
  const proposedBreakdown = pa.proposedBreakdown || null;
  const priorWs = pa.priorWorkflowStatus || WORKFLOW_STATUS.SELLER_PENDING;

  // Refund BEFORE the $set below overwrites paymentBreakdown — this reads the
  // order's still-original wallet/payment figures, same ordering the old
  // immediate-apply code relied on.
  let creditNote = null;
  if (direction === "decrease") {
    creditNote = await issueCreditNoteAndRefund(order, deltaAmount, reason, actorRole);
  }

  const updateSet = {
    items: proposedItems,
    workflowStatus: priorWs,
    status: legacyStatusFromWorkflow(priorWs),
    orderStatus: legacyStatusFromWorkflow(priorWs),
    "priceAdjustment.status": "applied",
    "priceAdjustment.proposedItems": [],
    "priceAdjustment.proposedBreakdown": null,
    "priceAdjustment.proposedPartialCancelIndexes": [],
  };
  if (creditNote) updateSet["priceAdjustment.creditNoteId"] = creditNote._id;
  Object.assign(updateSet, extraSet);

  if (proposedPartialCancelIndexes.length > 0) {
    updateSet["partialCancellation.isPartial"] = true;
    updateSet["partialCancellation.cancelledItemIndexes"] = proposedPartialCancelIndexes;
    updateSet["partialCancellation.cancelledAt"] = new Date();
    updateSet["partialCancellation.reason"] = reason;
    updateSet["partialCancellation.updatedEtaAt"] = new Date();
    updateSet.status = "partial_cancelled";
    updateSet.orderStatus = "partial_cancelled";

    if (order.schedule?.deliveryDate && order.schedule?.windowStart) {
      const recomputedActivationAt = computeActivationAt(
        order.schedule.deliveryDate,
        order.schedule.windowStart,
        DEFAULT_ACTIVATION_LEAD_MS(),
      );
      updateSet["schedule.activationAt"] = recomputedActivationAt;
      if (order.schedule.activationJobId) {
        updateSet["schedule.activationJobId"] = await scheduleOrderActivationJob(
          order.orderId,
          recomputedActivationAt,
        );
      }
    }
  } else if (direction !== "none") {
    updateSet.status = "price_revised";
    updateSet.orderStatus = "price_revised";
  }

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, "priceAdjustment.status": "pending" },
    {
      $set: updateSet,
      $push: {
        "priceAdjustment.history": {
          direction,
          deltaAmount,
          reason,
          changedBy: actorRole,
          changedAt: new Date(),
        },
        revisedInvoices: buildRevisedInvoiceEntry(order, {
          source: proposedPartialCancelIndexes.length > 0 ? "partial_cancel" : "price_adjustment",
          direction,
          deltaAmount,
          note: reason,
          grandTotal: pa.newGrandTotal,
        }),
        modificationTimeline: {
          version: Number(order.modificationVersion || 0) + 1,
          type: proposedPartialCancelIndexes.length > 0 ? "partial_cancelled" : "price_adjusted",
          actorRole,
          actorId: "",
          note: reason,
          meta: {
            direction,
            deltaAmount,
            previousGrandTotal: pa.previousGrandTotal,
            newGrandTotal: pa.newGrandTotal,
          },
          createdAt: new Date(),
        },
      },
      $inc: { modificationVersion: 1 },
    },
    { new: true },
  );

  if (!updated) {
    const err = new Error("This adjustment was already resolved");
    err.statusCode = 409;
    throw err;
  }

  if (proposedBreakdown) {
    freezeFinancialSnapshot(updated, proposedBreakdown);
    await updated.save();
  }

  if (proposedPartialCancelIndexes.length > 0) {
    await releaseReservedStockForOrder(updated, { reason: "Partial cancellation" });
  }

  await cancelAdjustmentDeadline(order);
  emitOrderStatusUpdate(order.orderId, { priceAdjusted: true, direction }, updated.customer);
  if (direction !== "none" && !skipNotification) {
    emitNotificationEvent(NOTIFICATION_EVENTS.PRICE_REVISED, {
      orderId: order.orderId,
      customerId: updated.customer,
      userId: updated.customer,
      amount: deltaAmount,
    });
  }

  return updated;
}

// Discards a proposed adjustment — used for both an explicit customer
// rejection and a deadline expiry. order.items was never touched while
// "pending", so this only needs to move the workflow status back, never a
// data revert.
async function revertPendingAdjustment(order, { actorLabel, reason }) {
  const pa = order.priceAdjustment || {};
  const priorWs = pa.priorWorkflowStatus || WORKFLOW_STATUS.SELLER_PENDING;

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, "priceAdjustment.status": "pending" },
    {
      $set: {
        workflowStatus: priorWs,
        status: legacyStatusFromWorkflow(priorWs),
        orderStatus: legacyStatusFromWorkflow(priorWs),
        "priceAdjustment.status": "cancelled",
        "priceAdjustment.proposedItems": [],
        "priceAdjustment.proposedBreakdown": null,
        "priceAdjustment.proposedPartialCancelIndexes": [],
      },
      $push: {
        "priceAdjustment.history": {
          direction: pa.direction || "none",
          deltaAmount: Math.abs(Number(pa.deltaAmount || 0)),
          reason: reason || "",
          changedBy: actorLabel,
          changedAt: new Date(),
        },
        modificationTimeline: {
          version: Number(order.modificationVersion || 0) + 1,
          type: "price_adjustment_rejected",
          actorRole: actorLabel,
          actorId: "",
          note: reason || "",
          meta: { direction: pa.direction || "none" },
          createdAt: new Date(),
        },
      },
      $inc: { modificationVersion: 1 },
    },
    { new: true },
  );
  if (!updated) return null;

  await cancelAdjustmentDeadline(order);
  emitOrderStatusUpdate(order.orderId, { priceAdjustmentRejected: true }, updated.customer);
  emitNotificationEvent(NOTIFICATION_EVENTS.PRICE_ADJUSTMENT_REJECTED, {
    orderId: order.orderId,
    customerId: updated.customer,
    userId: updated.customer,
    sellerId: updated.seller,
  });
  return updated;
}

export async function approveOrderAdjustment(customerId, orderId) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({
    orderId,
    customer: customerId,
    workflowStatus: WORKFLOW_STATUS.AWAITING_EXTRA_PAYMENT,
    "priceAdjustment.status": "pending",
  });
  if (!order) {
    const err = new Error("No pending adjustment for this order");
    err.statusCode = 404;
    throw err;
  }
  if (order.priceAdjustment?.requiresPayment) {
    const err = new Error("This adjustment requires payment — use pay difference instead");
    err.statusCode = 400;
    throw err;
  }
  return finalizePendingAdjustment(order, { actorRole: "customer" });
}

export async function rejectOrderAdjustment(customerId, orderId, { reason = "" } = {}) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({
    orderId,
    customer: customerId,
    workflowStatus: WORKFLOW_STATUS.AWAITING_EXTRA_PAYMENT,
    "priceAdjustment.status": "pending",
  });
  if (!order) {
    const err = new Error("No pending adjustment for this order");
    err.statusCode = 404;
    throw err;
  }
  const updated = await revertPendingAdjustment(order, {
    actorLabel: "customer",
    reason: reason || "Declined by customer",
  });
  if (!updated) {
    const err = new Error("This adjustment was already resolved");
    err.statusCode = 409;
    throw err;
  }
  return updated;
}

export async function payPriceDifference(customerId, orderId, { walletAmount = 0 } = {}) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({
    orderId,
    customer: customerId,
    workflowStatus: WORKFLOW_STATUS.AWAITING_EXTRA_PAYMENT,
    "priceAdjustment.status": "pending",
    "priceAdjustment.requiresPayment": true,
  });
  if (!order) {
    const err = new Error("No pending extra payment for this order");
    err.statusCode = 404;
    throw err;
  }

  const delta = Number(order.priceAdjustment?.deltaAmount || 0);
  const walletUse = Math.min(Number(walletAmount || 0), delta);
  if (walletUse > 0) {
    const user = await User.findById(customerId);
    if (!user || user.walletBalance < walletUse) {
      const err = new Error("Insufficient wallet balance");
      err.statusCode = 400;
      throw err;
    }
    user.walletBalance -= walletUse;
    await user.save();
    await Transaction.create({
      user: customerId,
      userModel: "User",
      order: order._id,
      type: "Order Payment",
      amount: -walletUse,
      status: "Settled",
      reference: `EXTRA-${orderId}`,
      paymentMethod: "WALLET",
    });
  }

  // Paying the difference IS the customer's approval for an online increase
  // — applies the proposed items/pricing exactly like approveOrderAdjustment
  // does for the no-payment-needed cases.
  const updated = await finalizePendingAdjustment(order, {
    actorRole: "customer",
    extraSet: { "priceAdjustment.extraPaymentRef": `EXTRA-${orderId}` },
    skipNotification: true,
  });

  await Order.updateOne(
    { _id: updated._id },
    {
      $push: {
        modificationTimeline: {
          version: Number(updated.modificationVersion || 0) + 1,
          type: "extra_payment_recorded",
          actorRole: "customer",
          actorId: String(customerId || ""),
          note: "Extra payment received",
          meta: { deltaAmount: delta, walletUsed: walletUse },
          createdAt: new Date(),
        },
      },
      $inc: { modificationVersion: 1 },
    },
  );

  emitNotificationEvent(NOTIFICATION_EVENTS.PAYMENT_SUCCESS, {
    orderId,
    customerId,
    userId: customerId,
    amount: delta,
  });
  return updated;
}

export async function partialCancelOrderItems({
  orderId,
  itemIndexes = [],
  reason,
  actorLabel = "seller",
  sellerId = null,
}) {
  const order = await Order.findOne({ orderId: await requireCanonicalOrderId(orderId) });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  if (actorLabel === "seller" && sellerId && String(order.seller) !== String(sellerId)) {
    const err = new Error("Access denied. You are not authorized to adjust this order.");
    err.statusCode = 403;
    throw err;
  }
  const remaining = order.items.filter((_, idx) => !itemIndexes.includes(idx));
  if (remaining.length === 0) {
    const err = new Error("Cannot cancel all items via partial cancel. Use full cancellation.");
    err.statusCode = 400;
    throw err;
  }
  return applyOrderPriceAdjustment({
    orderId,
    items: remaining.map((item) => ({
      product: item.product,
      variantSlot: item.variantSlot,
      quantity: item.quantity,
    })),
    reason,
    actorLabel,
    partialCancelIndexes: itemIndexes,
    sellerId,
  });
}

/**
 * Customer-initiated: add items to an order that hasn't been packed yet.
 * Merges the requested items into the order's existing line items, recomputes
 * pricing for the combined list, and settles the price increase wallet-first
 * — any amount the wallet can't cover is billed as cash at delivery (same as
 * COD), even on an ONLINE order, rather than blocking on a new payment.
 */
export async function addItemsToOrder({ customerId, orderId, items = [], reason = "" }) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  if (String(order.customer) !== String(customerId)) {
    const err = new Error("Access denied. This is not your order.");
    err.statusCode = 403;
    throw err;
  }

  const requested = (Array.isArray(items) ? items : [])
    .map((item) => ({
      product: item.product || item.productId,
      variantSku: String(item.variantSku || item.variantSlot || "").trim(),
      quantity: Math.max(1, Math.trunc(Number(item.quantity) || 0)),
    }))
    .filter((item) => item.product && item.quantity > 0);

  if (requested.length === 0) {
    const err = new Error("Select at least one item to add");
    err.statusCode = 400;
    throw err;
  }

  const ws = resolveWorkflowStatus(order);
  if (ADD_ITEMS_BLOCKED_WORKFLOW_STATUSES.includes(ws)) {
    const err = new Error("This order has already been packed and can no longer be edited");
    err.statusCode = 409;
    throw err;
  }
  if (order.deliveryBoy) {
    const err = new Error("Cannot edit order after delivery partner assignment");
    err.statusCode = 409;
    throw err;
  }

  const products = await Product.find({ _id: { $in: requested.map((i) => i.product) } })
    .select("_id sellerId name")
    .lean();
  const productMap = new Map(products.map((p) => [String(p._id), p]));
  for (const item of requested) {
    const product = productMap.get(String(item.product));
    if (!product) {
      const err = new Error("One or more selected products no longer exist");
      err.statusCode = 404;
      throw err;
    }
    if (String(product.sellerId) !== String(order.seller)) {
      const err = new Error(`${product.name} is from a different store and can't be added to this order`);
      err.statusCode = 400;
      throw err;
    }
  }

  // Merge requested items into the order's existing lines — bump quantity for
  // a product+variant already on the order rather than creating a duplicate line.
  const mergedItems = order.items.map((item) => ({
    product: item.product,
    variantSku: item.variantSlot || "",
    quantity: item.quantity,
  }));
  for (const item of requested) {
    const existing = mergedItems.find(
      (m) => String(m.product) === String(item.product) && m.variantSku === item.variantSku,
    );
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      mergedItems.push({ ...item });
    }
  }

  const previousGrandTotal = Number(order.paymentBreakdown?.grandTotal || order.pricing?.total || 0);
  const pricingSnapshot = await buildCheckoutPricingSnapshot({
    orderItems: mergedItems,
    address: order.address,
    tipAmount: Number(order.pricing?.tip || order.paymentBreakdown?.tipTotal || 0),
    discountTotal: Number(order.pricing?.discount || order.paymentBreakdown?.discountTotal || 0),
  });

  const sellerEntry = pricingSnapshot.sellerBreakdownEntries.find(
    (e) => String(e.sellerId) === String(order.seller),
  );
  if (!sellerEntry) {
    const err = new Error("Unable to recompute pricing for this order");
    err.statusCode = 400;
    throw err;
  }

  const newGrandTotal = Number(sellerEntry.breakdown?.grandTotal || 0);
  const delta = roundCurrency(Math.max(newGrandTotal - previousGrandTotal, 0));
  if (delta <= 0) {
    const err = new Error("Unable to compute a price increase for the added items");
    err.statusCode = 400;
    throw err;
  }

  // Reserve stock for only the newly requested quantities (existing lines
  // were already reserved/committed when the order was first placed).
  const lowStockAlerts = await reserveStockForItems({
    items: requested.map((item) => ({
      productId: item.product,
      productName: productMap.get(String(item.product))?.name || "",
      variantSku: item.variantSku,
      quantity: item.quantity,
    })),
    sellerId: order.seller,
    orderId,
    paymentMode: order.paymentMode,
  });

  // Wallet-first settlement: use whatever the customer's wallet can cover,
  // and bill the remainder as cash at delivery — regardless of whether the
  // order was originally COD or ONLINE.
  const customer = await User.findById(customerId).select("walletBalance");
  const walletBalance = Number(customer?.walletBalance || 0);
  const walletUse = roundCurrency(Math.min(delta, Math.max(walletBalance, 0)));
  const remainder = roundCurrency(delta - walletUse);

  if (walletUse > 0) {
    await User.findByIdAndUpdate(customerId, { $inc: { walletBalance: -walletUse } });
    await Transaction.create({
      user: customerId,
      userModel: "User",
      order: order._id,
      type: "Order Payment",
      amount: -walletUse,
      status: "Settled",
      reference: `ADDITEMS-${orderId}-${Date.now()}`,
      paymentMethod: "WALLET",
      meta: { orderId, reason: "Items added to order" },
    });

    // If this order's online payment was already captured, the admin wallet
    // is holding the original grandTotal in escrow (handleOnlineOrderFinance)
    // but has nothing for this new wallet-funded delta — without this, the
    // customer's real money debited above is never reflected in admin's
    // wallet, even though settleDeliveredOrder will later recognize the
    // larger, merged-order platformTotalEarning as earned on top of it.
    if (order.paymentMode === "ONLINE" && order.financeFlags?.onlinePaymentCaptured) {
      await creditWallet({
        ownerType: OWNER_TYPE.ADMIN,
        ownerId: null,
        amount: walletUse,
        bucket: "available",
      });
      await createLedgerEntry({
        orderId: order._id,
        actorType: OWNER_TYPE.ADMIN,
        actorId: null,
        type: LEDGER_TRANSACTION_TYPE.ORDER_ONLINE_PAYMENT_CAPTURED,
        amount: walletUse,
        description: "Wallet-funded delta captured for items added to order",
        reference: `ADDITEMS-${orderId}-${Date.now()}`,
      });
    }
  }

  // ONLINE: the original amount was already captured via gateway, so only a
  // genuinely-uncovered remainder from THIS delta needs collecting at the
  // door. COD: nothing has been captured electronically at all — ANY wallet
  // usage here (even if it fully covers this delta, remainder === 0) must
  // still be netted out of what's collected as cash for the whole order at
  // delivery, or the customer gets re-billed in cash for money they already
  // paid via wallet. Previously this flag (and the codPendingAmount
  // adjustment below) was gated on `order.paymentMode === "ONLINE"`
  // regardless of remainder, so COD orders were never corrected at all.
  const isCodOrder = order.paymentMode !== "ONLINE";
  const hasExtraCashDue = isCodOrder ? walletUse > 0 : remainder > 0;
  // Captured before freezeFinancialSnapshot below overwrites paymentBreakdown
  // wholesale — the pricing engine has no notion of wallet usage, so without
  // preserving this, any wallet amount already recorded on the order
  // (original checkout or a prior add-items event) would simply vanish.
  const previousWalletAmount = Number(order.paymentBreakdown?.walletAmount || 0);

  const updateSet = {
    items: sellerEntry.items.map((item) => ({
      product: item.productId,
      name: item.productName,
      quantity: item.quantity,
      price: item.price,
      variantSlot: item.variantSku || undefined,
      image: item.image || "",
    })),
    "priceAdjustment.previousGrandTotal": previousGrandTotal,
    "priceAdjustment.newGrandTotal": newGrandTotal,
    "priceAdjustment.deltaAmount": delta,
    "priceAdjustment.direction": "increase",
    "priceAdjustment.status": "applied",
    "priceAdjustment.reason": reason || "Customer added items to order",
    "financeFlags.hasExtraCashDue": hasExtraCashDue,
  };

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, deliveryBoy: null },
    {
      $set: updateSet,
      $push: {
        "priceAdjustment.history": {
          direction: "increase",
          deltaAmount: delta,
          reason: reason || "Customer added items to order",
          changedBy: "customer",
          changedAt: new Date(),
        },
        revisedInvoices: buildRevisedInvoiceEntry(order, {
          source: "items_added",
          direction: "increase",
          deltaAmount: delta,
          note: reason || "Customer added items to order",
          grandTotal: newGrandTotal,
        }),
        modificationTimeline: {
          version: Number(order.modificationVersion || 0) + 1,
          type: "items_added",
          actorRole: "customer",
          actorId: String(customerId || ""),
          note: reason || "",
          meta: {
            addedItems: requested,
            deltaAmount: delta,
            walletUsed: walletUse,
            cashDueAtDelivery: remainder,
            previousGrandTotal,
            newGrandTotal,
          },
          createdAt: new Date(),
        },
      },
      $inc: { modificationVersion: 1 },
    },
    { new: true },
  );

  if (!updated) {
    const err = new Error("Unable to add items to this order");
    err.statusCode = 409;
    throw err;
  }

  freezeFinancialSnapshot(updated, sellerEntry.breakdown);
  if (hasExtraCashDue) {
    if (!isCodOrder) {
      // The pricing engine always returns codPendingAmount: 0 (it has no
      // notion of "already captured online, only the delta is cash-due") —
      // freezeFinancialSnapshot just copied that 0 in. Layer the actual
      // uncollected remainder back on top so the delivery side can see it.
      updated.paymentBreakdown.codPendingAmount = roundCurrency(
        (updated.paymentBreakdown.codPendingAmount || 0) + remainder,
      );
    } else {
      // COD: codPendingAmount must represent the TOTAL cash still owed for
      // the whole order (not just this delta's remainder) net of cumulative
      // wallet usage, since handleCodOrderFinance's extra-cash-only branch
      // (triggered by financeFlags.hasExtraCashDue) uses it as the full
      // collection amount, not an add-on to a separate normal collection.
      const cumulativeWalletAmount = roundCurrency(previousWalletAmount + walletUse);
      updated.paymentBreakdown.walletAmount = cumulativeWalletAmount;
      updated.paymentBreakdown.codPendingAmount = roundCurrency(
        Math.max(0, newGrandTotal - cumulativeWalletAmount),
      );
    }
  }
  await updated.save();

  emitOrderStatusUpdate(orderId, { itemsAdded: true, deltaAmount: delta }, updated.customer);
  emitNotificationEvent(NOTIFICATION_EVENTS.ITEMS_ADDED_TO_ORDER, {
    orderId,
    customerId: updated.customer,
    userId: updated.customer,
    sellerId: updated.seller,
    amount: delta,
    walletShortfall: remainder,
  });

  if (Array.isArray(lowStockAlerts) && lowStockAlerts.length > 0) {
    for (const alert of lowStockAlerts) {
      emitNotificationEvent(NOTIFICATION_EVENTS.LOW_STOCK_ALERT, alert);
    }
  }

  return updated;
}
