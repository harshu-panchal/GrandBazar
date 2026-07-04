import mongoose from "mongoose";
import Order from "../models/order.js";
import Dispute from "../models/dispute.js";
import User from "../models/customer.js";
import Transaction from "../models/transaction.js";
import { WORKFLOW_STATUS, legacyStatusFromWorkflow } from "../constants/orderWorkflow.js";
import { requireCanonicalOrderId } from "../utils/orderLookup.js";
import { emitOrderStatusUpdate } from "./orderSocketEmitter.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import { applyOrderPriceAdjustment } from "./orderPriceAdjustmentService.js";

function generateDisputeId() {
  return `DSP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function raiseDispute({ orderId, raisedBy, raisedById, reason, reasonCategory = "other" }) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  if (order.workflowStatus !== WORKFLOW_STATUS.DELIVERED && order.status !== "delivered") {
    const err = new Error("Disputes can only be raised on delivered orders");
    err.statusCode = 400;
    throw err;
  }
  if (order.disputeRef) {
    const err = new Error("A dispute already exists for this order");
    err.statusCode = 409;
    throw err;
  }
  if (order.returnStatus && order.returnStatus !== "none") {
    const err = new Error("Cannot raise dispute while return is in progress");
    err.statusCode = 409;
    throw err;
  }

  const disputeId = generateDisputeId();
  const dispute = await Dispute.create({
    disputeId,
    order: order._id,
    orderPublicId: order.orderId,
    customer: order.customer,
    seller: order.seller,
    status: "open",
    reason,
    reasonCategory,
    raisedBy,
    raisedById,
    notes: [
      {
        authorId: raisedById,
        authorModel: raisedBy === "customer" ? "User" : "Seller",
        authorRole: raisedBy,
        message: reason,
      },
    ],
    auditLog: [
      {
        action: "DISPUTE_RAISED",
        actorId: raisedById,
        actorRole: raisedBy,
        meta: { reasonCategory },
      },
    ],
  });

  const updated = await Order.findOneAndUpdate(
    { _id: order._id },
    {
      $set: {
        workflowStatus: WORKFLOW_STATUS.DISPUTED,
        status: "disputed",
        orderStatus: "disputed",
        disputeRef: dispute._id,
      },
    },
    { new: true },
  );

  emitOrderStatusUpdate(orderId, { disputed: true }, updated.customer);
  emitNotificationEvent(NOTIFICATION_EVENTS.DISPUTE_RAISED, {
    orderId,
    disputeId,
    customerId: updated.customer,
    sellerId: updated.seller,
    raisedBy,
  });
  return { dispute, order: updated };
}

export async function resolveDispute({
  disputeId,
  adminId,
  resolution,
  refundAmount = 0,
  resolutionNote = "",
  adjustItems = null,
}) {
  const dispute = await Dispute.findOne({ disputeId });
  if (!dispute || !["open", "under_review"].includes(dispute.status)) {
    const err = new Error("Dispute not available for resolution");
    err.statusCode = 409;
    throw err;
  }

  const order = await Order.findById(dispute.order);
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  if (resolution === "refund" || resolution === "wallet_credit") {
    const amount = Math.max(0, Number(refundAmount || 0));
    if (amount > 0) {
      await User.findByIdAndUpdate(dispute.customer, { $inc: { walletBalance: amount } });
      await Transaction.create({
        user: dispute.customer,
        userModel: "User",
        order: order._id,
        type: resolution === "refund" ? "Refund" : "Wallet Credit",
        amount,
        status: "Settled",
        reference: `DSP-${disputeId}`,
        meta: { disputeId, resolution },
      });
      emitNotificationEvent(NOTIFICATION_EVENTS.REFUND_COMPLETED, {
        orderId: order.orderId,
        customerId: dispute.customer,
        userId: dispute.customer,
        amount,
      });
    }
  } else if (resolution === "price_adjust" && adjustItems) {
    await applyOrderPriceAdjustment({
      orderId: order.orderId,
      items: adjustItems,
      reason: `Dispute resolution: ${resolutionNote}`,
      actorLabel: "admin",
    });
  }

  const now = new Date();
  await Dispute.updateOne(
    { _id: dispute._id },
    {
      $set: {
        status: resolution === "reject" ? "rejected" : "resolved",
        resolution,
        refundAmount: Math.max(0, Number(refundAmount || 0)),
        resolvedBy: adminId,
        resolvedAt: now,
        resolutionNote,
      },
      $push: {
        auditLog: {
          action: "DISPUTE_RESOLVED",
          actorId: adminId,
          actorRole: "admin",
          meta: { resolution, refundAmount },
        },
      },
    },
  );

  const updatedOrder = await Order.findOneAndUpdate(
    { _id: order._id },
    {
      $set: {
        workflowStatus: WORKFLOW_STATUS.DELIVERED,
        status: "delivered",
        orderStatus: "delivered",
      },
    },
    { new: true },
  );

  emitNotificationEvent(NOTIFICATION_EVENTS.DISPUTE_RESOLVED, {
    orderId: order.orderId,
    disputeId,
    customerId: dispute.customer,
    sellerId: dispute.seller,
    resolution,
  });
  return { dispute: await Dispute.findById(dispute._id), order: updatedOrder };
}

export async function listDisputes({ status, page = 1, limit = 20 } = {}) {
  const query = {};
  if (status) query.status = status;
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Dispute.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Dispute.countDocuments(query),
  ]);
  return { items, total, page, limit };
}

export async function getDisputeByOrder(orderId) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId }).select("disputeRef").lean();
  if (!order?.disputeRef) return null;
  return Dispute.findById(order.disputeRef).lean();
}

export async function addDisputeNote(disputeId, { authorId, authorModel, authorRole, message }) {
  return Dispute.findOneAndUpdate(
    { disputeId },
    {
      $push: {
        notes: { authorId, authorModel, authorRole, message, createdAt: new Date() },
      },
      $set: { status: "under_review" },
    },
    { new: true },
  );
}
