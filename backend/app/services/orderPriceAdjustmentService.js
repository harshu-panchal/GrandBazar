import mongoose from "mongoose";
import Order from "../models/order.js";
import CreditNote from "../models/creditNote.js";
import User from "../models/customer.js";
import Transaction from "../models/transaction.js";
import {
  WORKFLOW_STATUS,
  legacyStatusFromWorkflow,
  DEFAULT_EXTRA_PAYMENT_DEADLINE_MS,
} from "../constants/orderWorkflow.js";
import { requireCanonicalOrderId } from "../utils/orderLookup.js";
import { buildCheckoutPricingSnapshot } from "./checkoutPricingService.js";
import { freezeFinancialSnapshot } from "./finance/orderFinanceService.js";
import { compensateOrderCancellation } from "./orderCompensation.js";
import { releaseReservedStockForOrder } from "./stockService.js";
import { resolveWorkflowStatus } from "./orderWorkflowService.js";
import { extraPaymentDeadlineQueue, JOB_NAMES } from "../queues/orderQueues.js";
import { emitOrderStatusUpdate } from "./orderSocketEmitter.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";

function generateCreditNoteId() {
  return `CN-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function mapItemsForPricing(items = []) {
  return items.map((item) => ({
    product: item.product,
    variantSku: item.variantSlot || "",
    quantity: item.quantity,
  }));
}

async function scheduleExtraPaymentDeadline(orderId, deadlineAt) {
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

export async function processExtraPaymentDeadlineJob({ orderId }) {
  orderId = await requireCanonicalOrderId(orderId);
  const updated = await Order.findOneAndUpdate(
    {
      orderId,
      workflowStatus: WORKFLOW_STATUS.AWAITING_EXTRA_PAYMENT,
      "priceAdjustment.status": "awaiting_payment",
    },
    {
      $set: {
        workflowStatus: WORKFLOW_STATUS.CANCELLED,
        status: "cancelled",
        cancelledBy: "system",
        cancelReason: "Extra payment not received in time",
        "priceAdjustment.status": "cancelled",
      },
    },
    { new: true },
  );
  if (!updated) return;
  await compensateOrderCancellation(updated, orderId);
  emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CANCELLED, {
    orderId,
    customerId: updated.customer,
    userId: updated.customer,
    sellerId: updated.seller,
    customerMessage: "Order cancelled because extra payment was not completed.",
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

  if (order.paymentMode !== "ONLINE") {
    await User.findByIdAndUpdate(order.customer, { $inc: { walletBalance: deltaAmount } });
    await Transaction.create({
      user: order.customer,
      userModel: "User",
      order: order._id,
      type: "Wallet Refund",
      amount: deltaAmount,
      status: "Settled",
      reference: creditNoteId,
      meta: { orderId: order.orderId, creditNoteId },
    });
    await CreditNote.updateOne({ _id: creditNote._id }, { $set: { status: "applied" } });
    emitNotificationEvent(NOTIFICATION_EVENTS.REFUND_COMPLETED, {
      orderId: order.orderId,
      customerId: order.customer,
      userId: order.customer,
      amount: deltaAmount,
    });
  } else {
    emitNotificationEvent(NOTIFICATION_EVENTS.REFUND_INITIATED, {
      orderId: order.orderId,
      customerId: order.customer,
      userId: order.customer,
      amount: deltaAmount,
    });
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
}) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
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

  const previousGrandTotal = Number(order.paymentBreakdown?.grandTotal || order.pricing?.total || 0);
  const pricingSnapshot = await buildCheckoutPricingSnapshot({
    orderItems: mapItemsForPricing(items),
    address: order.address,
    tipAmount: Number(order.pricing?.tip || order.paymentBreakdown?.tipTotal || 0),
    discountTotal: Number(order.pricing?.discount || order.paymentBreakdown?.discountTotal || 0),
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
    "priceAdjustment.deltaAmount": Math.abs(delta),
    "priceAdjustment.reason": reason || "",
    "priceAdjustment.priorWorkflowStatus": order.workflowStatus,
    "priceAdjustment.priorLegacyStatus": order.status,
  };

  if (partialCancelIndexes.length > 0) {
    updateSet["partialCancellation.isPartial"] = true;
    updateSet["partialCancellation.cancelledItemIndexes"] = partialCancelIndexes;
    updateSet["partialCancellation.cancelledAt"] = new Date();
    updateSet["partialCancellation.reason"] = reason || "";
    updateSet.status = "partial_cancelled";
    updateSet.orderStatus = "partial_cancelled";
  }

  if (direction === "increase" && order.paymentMode === "ONLINE") {
    const deadline = new Date(Date.now() + DEFAULT_EXTRA_PAYMENT_DEADLINE_MS());
    const jobId = await scheduleExtraPaymentDeadline(orderId, deadline);
    updateSet.workflowStatus = WORKFLOW_STATUS.AWAITING_EXTRA_PAYMENT;
    updateSet.status = "awaiting_extra_payment";
    updateSet.orderStatus = "awaiting_extra_payment";
    updateSet["priceAdjustment.status"] = "awaiting_payment";
    updateSet["priceAdjustment.direction"] = "increase";
    updateSet["priceAdjustment.extraPaymentDeadlineAt"] = deadline;
    updateSet["priceAdjustment.extraPaymentJobId"] = jobId;
  } else if (direction === "increase" && order.paymentMode === "COD") {
    updateSet["priceAdjustment.status"] = "applied";
    updateSet["priceAdjustment.direction"] = "increase";
    updateSet.status = "price_revised";
    updateSet.orderStatus = "price_revised";
  } else if (direction === "decrease") {
    const creditNote = await issueCreditNoteAndRefund(order, Math.abs(delta), reason, actorLabel);
    updateSet["priceAdjustment.status"] = "applied";
    updateSet["priceAdjustment.direction"] = "decrease";
    updateSet["priceAdjustment.creditNoteId"] = creditNote._id;
    updateSet.status = "price_revised";
    updateSet.orderStatus = "price_revised";
  } else {
    updateSet["priceAdjustment.status"] = "applied";
    updateSet["priceAdjustment.direction"] = "none";
  }

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, deliveryBoy: null },
    {
      $set: updateSet,
      $push: {
        "priceAdjustment.history": {
          direction,
          deltaAmount: Math.abs(delta),
          reason: reason || "",
          changedBy: actorLabel,
          changedAt: new Date(),
        },
        revisedInvoices: buildRevisedInvoiceEntry(order, {
          source: partialCancelIndexes.length > 0 ? "partial_cancel" : "price_adjustment",
          direction,
          deltaAmount: Math.abs(delta),
          note: reason || "",
          grandTotal: newGrandTotal,
        }),
        modificationTimeline: {
          version: Number(order.modificationVersion || 0) + 1,
          type: partialCancelIndexes.length > 0 ? "partial_cancelled" : "price_adjusted",
          actorRole: actorLabel,
          actorId: "",
          note: reason || "",
          meta: {
            direction,
            deltaAmount: Math.abs(delta),
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
    const err = new Error("Unable to apply price adjustment");
    err.statusCode = 409;
    throw err;
  }

  freezeFinancialSnapshot(updated, sellerEntry.breakdown);
  await updated.save();

  if (partialCancelIndexes.length > 0) {
    await releaseReservedStockForOrder(updated, { reason: "Partial cancellation" });
  }

  emitOrderStatusUpdate(orderId, { priceAdjusted: true, direction }, updated.customer);
  if (direction === "increase" && order.paymentMode === "ONLINE") {
    emitNotificationEvent(NOTIFICATION_EVENTS.EXTRA_PAYMENT_REQUIRED, {
      orderId,
      customerId: updated.customer,
      userId: updated.customer,
      amount: Math.abs(delta),
    });
  } else if (direction === "decrease") {
    emitNotificationEvent(NOTIFICATION_EVENTS.PRICE_REVISED, {
      orderId,
      customerId: updated.customer,
      userId: updated.customer,
      amount: Math.abs(delta),
    });
  }

  return updated;
}

export async function payPriceDifference(customerId, orderId, { walletAmount = 0 } = {}) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({
    orderId,
    customer: customerId,
    workflowStatus: WORKFLOW_STATUS.AWAITING_EXTRA_PAYMENT,
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
      type: "Wallet Payment",
      amount: -walletUse,
      status: "Settled",
      reference: `EXTRA-${orderId}`,
    });
  }

  const priorWs = order.priceAdjustment?.priorWorkflowStatus || WORKFLOW_STATUS.SELLER_PENDING;
  const updated = await Order.findOneAndUpdate(
    { orderId, workflowStatus: WORKFLOW_STATUS.AWAITING_EXTRA_PAYMENT },
    {
      $set: {
        workflowStatus: priorWs,
        status: legacyStatusFromWorkflow(priorWs),
        orderStatus: legacyStatusFromWorkflow(priorWs),
        "priceAdjustment.status": "applied",
        "priceAdjustment.extraPaymentRef": `EXTRA-${orderId}`,
      },
      $push: {
        modificationTimeline: {
          version: Number(order.modificationVersion || 0) + 1,
          type: "extra_payment_recorded",
          actorRole: "customer",
          actorId: String(customerId || ""),
          note: "Extra payment received",
          meta: {
            deltaAmount: delta,
            walletUsed: walletUse,
          },
          createdAt: new Date(),
        },
      },
      $inc: { modificationVersion: 1 },
    },
    { new: true },
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
}) {
  const order = await Order.findOne({ orderId: await requireCanonicalOrderId(orderId) });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
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
  });
}
