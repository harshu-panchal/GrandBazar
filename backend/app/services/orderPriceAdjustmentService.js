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

/**
 * Read-only counterpart to applyOrderPriceAdjustment: recomputes what the
 * customer's real grand total would become for a proposed set of item
 * price/quantity edits, without saving anything. The seller-side adjust
 * editor only shows a naive sum of price*quantity — it has no idea that a
 * per-line commission markup and GST both ride on top of a product's raw
 * price, so a seller cutting a product's own price by ₹100 can swing the
 * customer-facing total by much more than ₹100. This lets the UI show the
 * real number before the seller commits to it.
 */
export async function previewOrderPriceAdjustment({ orderId, items, sellerId = null }) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  if (sellerId && String(order.seller) !== String(sellerId)) {
    const err = new Error("Access denied. You are not authorized to view this order.");
    err.statusCode = 403;
    throw err;
  }

  const previousGrandTotal = Number(order.paymentBreakdown?.grandTotal || order.pricing?.total || 0);
  const pricingSnapshot = await buildCheckoutPricingSnapshot({
    orderItems: mapItemsForPricing(items),
    address: order.address,
    tipAmount: Number(order.pricing?.tip || order.paymentBreakdown?.tipTotal || 0),
    discountTotal: Number(order.pricing?.discount || order.paymentBreakdown?.discountTotal || 0),
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

  return {
    previousGrandTotal,
    newGrandTotal,
    deltaAmount: Math.abs(delta),
    direction,
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
 * Customer-initiated: request to add items to an order that hasn't been packed yet.
 * Stages the requested items into order.itemAdditionRequest for seller approval.
 * Settles wallet payment on hold (if available) with automatic refund on rejection.
 */
export async function addItemsToOrder({ customerId, orderId, items = [], reason = "" }) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  if (String(order.customer?._id || order.customer) !== String(customerId)) {
    const err = new Error("Access denied. This is not your order.");
    err.statusCode = 403;
    throw err;
  }

  if (order.itemAdditionRequest?.status === "requested") {
    const err = new Error("An item addition request is already pending seller approval for this order");
    err.statusCode = 409;
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
    .select("_id sellerId name mainImage image images variants price salePrice customerPrice customerSalePrice")
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

  // Merge requested items into the order's existing lines for the proposed preview
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

  // Build list of rich requested items with metadata for display in seller panel
  const requestedItemsDetailed = requested.map((item) => {
    const p = productMap.get(String(item.product));
    const variant = Array.isArray(p?.variants)
      ? p.variants.find((v) => String(v.sku || v.name || "").trim() === item.variantSku)
      : null;
    const itemPrice = variant
      ? Number(variant.customerSalePrice || variant.salePrice || variant.customerPrice || variant.price || 0)
      : Number(p?.customerSalePrice || p?.salePrice || p?.customerPrice || p?.price || 0);
    const itemImage =
      variant?.image ||
      (Array.isArray(variant?.images) ? variant.images[0] : null) ||
      p?.mainImage ||
      p?.image ||
      (Array.isArray(p?.images) ? p.images[0] : null) ||
      "";

    return {
      product: item.product,
      name: p?.name || "Product",
      variantSku: item.variantSku,
      variantLabel: variant?.name || item.variantSku || "",
      quantity: item.quantity,
      price: itemPrice,
      image: itemImage,
    };
  });

  // Reserve stock for the newly requested quantities
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

  // Wallet deduction on hold (if customer has balance)
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
      reference: `ADDITEMS-REQ-${orderId}-${Date.now()}`,
      paymentMethod: "WALLET",
      meta: { orderId, reason: "Item addition request hold" },
    });
  }

  const proposedItems = sellerEntry.items.map((item) => ({
    product: item.productId,
    name: item.productName,
    quantity: item.quantity,
    price: item.price,
    variantSlot: item.variantSku || undefined,
    image: item.image || "",
  }));

  const itemAdditionRequest = {
    status: "requested",
    requestedItems: requestedItemsDetailed,
    proposedItems,
    proposedBreakdown: sellerEntry.breakdown,
    deltaAmount: delta,
    walletUsed: walletUse,
    cashDueAtDelivery: remainder,
    previousGrandTotal,
    newGrandTotal,
    requestedAt: new Date(),
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: "",
    reason: reason || "Customer requested to add items",
  };

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, deliveryBoy: null },
    {
      $set: { itemAdditionRequest },
      $push: {
        modificationTimeline: {
          version: Number(order.modificationVersion || 0) + 1,
          type: "item_addition_requested",
          actorRole: "customer",
          actorId: String(customerId || ""),
          note: reason || "Customer submitted item addition request for seller approval",
          meta: {
            requestedItems: requestedItemsDetailed,
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
    const err = new Error("Unable to submit item addition request");
    err.statusCode = 409;
    throw err;
  }

  emitOrderStatusUpdate(
    orderId,
    { itemAdditionRequested: true, deltaAmount: delta, itemAdditionRequest: updated.itemAdditionRequest },
    updated.customer,
    updated.seller,
  );

  emitNotificationEvent(NOTIFICATION_EVENTS.ITEMS_ADDED_TO_ORDER, {
    orderId,
    customerId: updated.customer,
    userId: updated.customer,
    sellerId: updated.seller,
    amount: delta,
    walletShortfall: remainder,
    isApprovalRequest: true,
  });

  if (Array.isArray(lowStockAlerts) && lowStockAlerts.length > 0) {
    for (const alert of lowStockAlerts) {
      emitNotificationEvent(NOTIFICATION_EVENTS.LOW_STOCK_ALERT, alert);
    }
  }

  return updated;
}

/**
 * Seller/Admin approves the customer's item addition request.
 * Applies proposed items, updates financial snapshot and settles wallet/COD.
 */
export async function approveItemAddition({ orderId, sellerId = null, actorRole = "seller", note = "" }) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  const orderSellerId = String(order.seller?._id || order.seller || "");
  if (actorRole === "seller" && sellerId && orderSellerId !== String(sellerId)) {
    const err = new Error("Access denied. You are not authorized to approve requests for this order.");
    err.statusCode = 403;
    throw err;
  }

  if (order.itemAdditionRequest?.status !== "requested") {
    const err = new Error("No pending item addition request to approve for this order");
    err.statusCode = 400;
    throw err;
  }

  const req = order.itemAdditionRequest;
  const delta = Number(req.deltaAmount || 0);
  const walletUse = Number(req.walletUsed || 0);
  const remainder = Number(req.cashDueAtDelivery || 0);
  const newGrandTotal = Number(req.newGrandTotal || 0);
  const previousGrandTotal = Number(req.previousGrandTotal || 0);

  // If order was ONLINE payment captured, credit admin wallet for the wallet-funded portion
  if (walletUse > 0 && order.paymentMode === "ONLINE" && order.financeFlags?.onlinePaymentCaptured) {
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
      description: "Wallet-funded delta captured for approved item addition",
      reference: `ADDITEMS-APPROVED-${orderId}-${Date.now()}`,
    });
  }

  const isCodOrder = order.paymentMode !== "ONLINE";
  const hasExtraCashDue = isCodOrder ? walletUse > 0 : remainder > 0;
  const previousWalletAmount = Number(order.paymentBreakdown?.walletAmount || 0);

  const updateSet = {
    items: req.proposedItems,
    "itemAdditionRequest.status": "approved",
    "itemAdditionRequest.reviewedAt": new Date(),
    "itemAdditionRequest.reviewedBy": sellerId || null,
    "itemAdditionRequest.reviewNote": note || "Approved by store",
    "priceAdjustment.previousGrandTotal": previousGrandTotal,
    "priceAdjustment.newGrandTotal": newGrandTotal,
    "priceAdjustment.deltaAmount": delta,
    "priceAdjustment.direction": "increase",
    "priceAdjustment.status": "applied",
    "priceAdjustment.reason": req.reason || "Customer added items (approved by seller)",
    "financeFlags.hasExtraCashDue": hasExtraCashDue,
  };

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, "itemAdditionRequest.status": "requested" },
    {
      $set: updateSet,
      $push: {
        "priceAdjustment.history": {
          direction: "increase",
          deltaAmount: delta,
          reason: req.reason || "Customer added items (approved by seller)",
          changedBy: actorRole,
          changedAt: new Date(),
        },
        revisedInvoices: buildRevisedInvoiceEntry(order, {
          source: "items_added",
          direction: "increase",
          deltaAmount: delta,
          note: req.reason || "Customer added items (approved by seller)",
          grandTotal: newGrandTotal,
        }),
        modificationTimeline: {
          version: Number(order.modificationVersion || 0) + 1,
          type: "item_addition_approved",
          actorRole,
          actorId: String(sellerId || ""),
          note: note || "Store approved customer item addition",
          meta: {
            addedItems: req.requestedItems,
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
    const err = new Error("This request was already resolved or cannot be approved");
    err.statusCode = 409;
    throw err;
  }

  if (req.proposedBreakdown) {
    freezeFinancialSnapshot(updated, req.proposedBreakdown);
  }

  if (hasExtraCashDue) {
    if (!isCodOrder) {
      updated.paymentBreakdown.codPendingAmount = roundCurrency(
        (updated.paymentBreakdown.codPendingAmount || 0) + remainder,
      );
    } else {
      const cumulativeWalletAmount = roundCurrency(previousWalletAmount + walletUse);
      updated.paymentBreakdown.walletAmount = cumulativeWalletAmount;
      updated.paymentBreakdown.codPendingAmount = roundCurrency(
        Math.max(0, newGrandTotal - cumulativeWalletAmount),
      );
    }
  }
  await updated.save();

  emitOrderStatusUpdate(
    orderId,
    { itemAdditionApproved: true, deltaAmount: delta, itemAdditionRequest: updated.itemAdditionRequest },
    updated.customer,
    updated.seller,
  );

  emitNotificationEvent(NOTIFICATION_EVENTS.PRICE_REVISED, {
    orderId,
    customerId: updated.customer,
    userId: updated.customer,
    amount: delta,
  });

  return updated;
}

/**
 * Seller/Admin rejects the customer's item addition request.
 * Releases reserved stock and refunds any held wallet payment back to customer.
 */
export async function rejectItemAddition({ orderId, sellerId = null, actorRole = "seller", note = "" }) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  const orderSellerId = String(order.seller?._id || order.seller || "");
  if (actorRole === "seller" && sellerId && orderSellerId !== String(sellerId)) {
    const err = new Error("Access denied. You are not authorized to reject requests for this order.");
    err.statusCode = 403;
    throw err;
  }

  if (order.itemAdditionRequest?.status !== "requested") {
    const err = new Error("No pending item addition request to reject for this order");
    err.statusCode = 400;
    throw err;
  }

  const req = order.itemAdditionRequest;
  const walletRefund = Number(req.walletUsed || 0);

  // Release the temporarily reserved stock
  if (Array.isArray(req.requestedItems) && req.requestedItems.length > 0) {
    try {
      const stockItems = req.requestedItems.map((item) => ({
        productId: item.product,
        variantSku: item.variantSku,
        quantity: item.quantity,
      }));
      // Release reservation
      const { releaseReservedStockForOrder } = await import("./stockService.js");
      await releaseReservedStockForOrder({ ...order.toObject(), items: stockItems }, { reason: "Item addition rejected by seller" });
    } catch {
      /* ignore */
    }
  }

  // Refund held wallet amount back to customer
  if (walletRefund > 0) {
    await User.findByIdAndUpdate(order.customer, { $inc: { walletBalance: walletRefund } });
    await Transaction.create({
      user: order.customer,
      userModel: "User",
      order: order._id,
      type: "Refund",
      amount: walletRefund,
      status: "Settled",
      reference: `REFUND-ADDITEMS-${orderId}-${Date.now()}`,
      paymentMethod: "WALLET",
      refundStatus: "completed",
      meta: { orderId, reason: "Refund for rejected item addition request" },
    });
  }

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, "itemAdditionRequest.status": "requested" },
    {
      $set: {
        "itemAdditionRequest.status": "rejected",
        "itemAdditionRequest.reviewedAt": new Date(),
        "itemAdditionRequest.reviewedBy": sellerId || null,
        "itemAdditionRequest.reviewNote": note || "Declined by store",
      },
      $push: {
        modificationTimeline: {
          version: Number(order.modificationVersion || 0) + 1,
          type: "item_addition_rejected",
          actorRole,
          actorId: String(sellerId || ""),
          note: note || "Store declined customer item addition request",
          meta: {
            refundedWallet: walletRefund,
            rejectedItems: req.requestedItems,
          },
          createdAt: new Date(),
        },
      },
      $inc: { modificationVersion: 1 },
    },
    { new: true },
  );

  if (!updated) {
    const err = new Error("This request was already resolved or cannot be rejected");
    err.statusCode = 409;
    throw err;
  }

  emitOrderStatusUpdate(
    orderId,
    { itemAdditionRejected: true, note, itemAdditionRequest: updated.itemAdditionRequest },
    updated.customer,
    updated.seller,
  );

  emitNotificationEvent(NOTIFICATION_EVENTS.PRICE_ADJUSTMENT_REJECTED, {
    orderId,
    customerId: updated.customer,
    userId: updated.customer,
    sellerId: updated.seller,
  });

  return updated;
}
