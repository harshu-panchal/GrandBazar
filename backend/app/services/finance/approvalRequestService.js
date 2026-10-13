import ApprovalRequest from "../../models/approvalRequest.js";
import AdminRole from "../../models/adminRole.js";
import Order from "../../models/order.js";
import { creditWallet } from "./walletService.js";
import { createLedgerEntry } from "./ledgerService.js";
import { createOperatorAuditLog } from "../operatorAuditLogService.js";
import { OWNER_TYPE, LEDGER_DIRECTION, LEDGER_TRANSACTION_TYPE } from "../../constants/finance.js";
import { roundCurrency } from "../../utils/money.js";
import { orderMatchQueryFromRouteParam } from "../../utils/orderLookup.js";

// Operators type the order ID shown everywhere else in the admin UI (the
// human-readable "ORD-..." code), not the internal Mongo _id — but
// ApprovalRequest.orderId and OperatorAuditLog.orderId are both ObjectId-typed
// refs. Resolve flexibly (accepts either form) once, and use the resolved
// document's real _id for every downstream write.
async function resolveOrderOrThrow(orderIdOrCode) {
  const match = orderMatchQueryFromRouteParam(orderIdOrCode);
  const order = match ? await Order.findOne(match).select("customer shortOrderId").lean() : null;
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  return order;
}

// Root admin/superadmin bypass the limit entirely (matches checkAdminPermission's
// existing root-bypass convention). A role with no AdminRole doc (legacy/
// bootstrap staff) is treated as unlimited too, since there's nothing to cap it
// against — same "fail open for legacy accounts" behavior staffController.js
// already relies on elsewhere.
async function resolveMoneyLimit(actor) {
  if (actor.role === "admin" || actor.role === "superadmin") return Infinity;
  if (!actor.customRoleId) return Infinity;
  const role = await AdminRole.findById(actor.customRoleId).lean();
  if (!role || role.moneyLimit === null || role.moneyLimit === undefined) return Infinity;
  return Number(role.moneyLimit);
}

async function executeCredit({ orderId, amount, type, reason, actor, approvalRequestId = null }) {
  const order = await resolveOrderOrThrow(orderId);

  const normalizedAmount = roundCurrency(amount);
  const { wallet } = await creditWallet({
    ownerType: OWNER_TYPE.CUSTOMER,
    ownerId: order.customer,
    amount: normalizedAmount,
  });

  await createLedgerEntry({
    orderId: order._id,
    walletId: wallet._id,
    actorType: "ADMIN",
    actorId: actor.id,
    type: type === "refund" ? LEDGER_TRANSACTION_TYPE.REFUND : LEDGER_TRANSACTION_TYPE.ADJUSTMENT,
    direction: LEDGER_DIRECTION.CREDIT,
    amount: normalizedAmount,
    description: reason,
    reference: approvalRequestId ? `approval:${approvalRequestId}` : "",
  });

  await createOperatorAuditLog({
    action: approvalRequestId ? "credit_approved_and_issued" : "credit_issued",
    actorId: actor.id,
    actorRole: actor.role,
    orderId: order._id,
    oldValue: null,
    newValue: { amount: normalizedAmount, type },
    reason,
  });

  return { executed: true, amount: normalizedAmount, walletBalance: wallet.availableBalance };
}

// The core "Maker-Checker" decision: within the actor's role moneyLimit, the
// credit/refund happens immediately; above it, it's parked as a pending
// ApprovalRequest instead of executing, for a higher tier to approve.
export async function requestCreditOrEscalate({ orderId, amount, reason, type = "credit", actor }) {
  if (!orderId) {
    const err = new Error("orderId is required");
    err.statusCode = 400;
    throw err;
  }
  const normalizedAmount = roundCurrency(amount);
  if (!(normalizedAmount > 0)) {
    const err = new Error("Amount must be greater than 0");
    err.statusCode = 400;
    throw err;
  }
  if (!reason || !reason.trim()) {
    const err = new Error("A reason is required");
    err.statusCode = 400;
    throw err;
  }

  const moneyLimit = await resolveMoneyLimit(actor);
  if (normalizedAmount <= moneyLimit) {
    return executeCredit({ orderId, amount: normalizedAmount, type, reason, actor });
  }

  // Above the actor's limit: still resolve+validate the order up front (the
  // execute-now path above does this inside executeCredit) so an escalated
  // request can't be created against a typo'd/nonexistent order id, and so
  // the ObjectId-typed refs below get the real _id rather than the
  // human-readable "ORD-..." code the operator typed.
  const order = await resolveOrderOrThrow(orderId);

  const request = await ApprovalRequest.create({
    type,
    orderId: order._id,
    amount: normalizedAmount,
    reason,
    requestedBy: actor.id,
    requestedRole: actor.role,
    status: "pending",
  });

  await createOperatorAuditLog({
    action: "credit_escalated",
    actorId: actor.id,
    actorRole: actor.role,
    orderId: order._id,
    oldValue: null,
    newValue: { amount: normalizedAmount, type, approvalRequestId: request._id },
    reason,
  });

  return { executed: false, approvalRequest: request };
}

export async function listApprovalRequests({ status = "pending", page = 1, limit = 25 } = {}) {
  const match = {};
  if (status && status !== "all") match.status = status;

  const pageSize = Math.max(Number(limit) || 25, 1);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * pageSize;

  const [items, total] = await Promise.all([
    ApprovalRequest.find(match)
      .populate("requestedBy", "name email")
      .populate("orderId", "shortOrderId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    ApprovalRequest.countDocuments(match),
  ]);

  return { items, total, page: Math.max(Number(page) || 1, 1), totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

async function loadPendingRequest(id) {
  const request = await ApprovalRequest.findById(id);
  if (!request) {
    const err = new Error("Approval request not found");
    err.statusCode = 404;
    throw err;
  }
  if (request.status !== "pending") {
    const err = new Error("This request has already been reviewed");
    err.statusCode = 400;
    throw err;
  }
  return request;
}

export async function approveApprovalRequest(id, reviewer, note = "") {
  const request = await loadPendingRequest(id);

  const result = await executeCredit({
    orderId: request.orderId,
    amount: request.amount,
    type: request.type,
    reason: request.reason,
    actor: reviewer,
    approvalRequestId: request._id,
  });

  request.status = "approved";
  request.reviewedBy = reviewer.id;
  request.reviewedAt = new Date();
  request.reviewNote = note;
  await request.save();

  return { request, ...result };
}

export async function rejectApprovalRequest(id, reviewer, note = "") {
  const request = await loadPendingRequest(id);

  request.status = "rejected";
  request.reviewedBy = reviewer.id;
  request.reviewedAt = new Date();
  request.reviewNote = note;
  await request.save();

  await createOperatorAuditLog({
    action: "credit_rejected",
    actorId: reviewer.id,
    actorRole: reviewer.role,
    orderId: request.orderId,
    oldValue: { status: "pending" },
    newValue: { status: "rejected" },
    reason: note || request.reason,
  });

  return request;
}
