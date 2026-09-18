import Order from "../models/order.js";
import { requireCanonicalOrderId } from "../utils/orderLookup.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import Admin from "../models/admin.js";

function httpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function getAdminAndOperatorIds() {
  const rows = await Admin.find({ role: { $in: ["admin", "superadmin", "operator"] } })
    .select("_id")
    .lean();
  return (rows || []).map((a) => a?._id).filter(Boolean);
}

// The Operator/Admin "stuck orders" queue — previously there was no single
// place any role could see orders that need manual attention (a failed
// rescue, a stalled fulfillment, or anything explicitly flagged).
export async function getOperationsQueue({ page = 1, limit = 25 } = {}) {
  const skip = (page - 1) * limit;
  const filter = {
    $or: [
      { needsManualReassignment: true },
      { "operationalEscalation.flagged": true },
    ],
  };

  const [items, total] = await Promise.all([
    Order.find(filter)
      .select(
        "orderId customer seller workflowStatus status cancelReason needsManualReassignment operationalEscalation rescue createdAt",
      )
      .populate("customer", "name phone")
      .populate("seller", "shopName name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

// Any role that can already touch this order (seller, admin) can raise a
// flag for Operator/Admin attention — generic on purpose, not tied to any
// one failure mode the way needsManualReassignment (rescue-specific) is.
export async function escalateOrder(orderId, { reason, actorId, actorRole }) {
  const trimmedReason = String(reason || "").trim();
  if (!trimmedReason) {
    throw httpError("A reason is required to escalate an order", 400);
  }
  const canonicalId = await requireCanonicalOrderId(orderId);
  const updated = await Order.findOneAndUpdate(
    { orderId: canonicalId },
    {
      $set: {
        "operationalEscalation.flagged": true,
        "operationalEscalation.reason": trimmedReason,
        "operationalEscalation.flaggedBy": String(actorId || ""),
        "operationalEscalation.flaggedByRole": actorRole || "",
        "operationalEscalation.flaggedAt": new Date(),
        "operationalEscalation.resolvedAt": null,
      },
    },
    { new: true },
  );
  if (!updated) throw httpError("Order not found", 404);

  const adminIds = await getAdminAndOperatorIds();
  emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_ESCALATED, {
    orderId: updated.orderId,
    adminIds,
    reason: trimmedReason,
    flaggedByRole: actorRole,
  });

  return updated;
}

export async function resolveEscalation(orderId, { note, actorId }) {
  const canonicalId = await requireCanonicalOrderId(orderId);
  const updated = await Order.findOneAndUpdate(
    { orderId: canonicalId },
    {
      $set: {
        "operationalEscalation.flagged": false,
        "operationalEscalation.resolvedAt": new Date(),
        "operationalEscalation.resolvedBy": String(actorId || ""),
        "operationalEscalation.resolutionNote": String(note || "").trim(),
      },
    },
    { new: true },
  );
  if (!updated) throw httpError("Order not found", 404);
  return updated;
}
