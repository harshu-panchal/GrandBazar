import OperatorAuditLog from "../models/operatorAuditLog.js";

export async function createOperatorAuditLog(
  { action, actorId, actorRole = "", orderId = null, storeId = null, oldValue = null, newValue = null, reason = "" },
  { session } = {},
) {
  const options = session ? { session } : {};
  const log = await OperatorAuditLog.create(
    [{ action, actorId, actorRole, orderId, storeId, oldValue, newValue, reason }],
    options,
  );
  return log[0];
}

export async function listOperatorAuditLogs({ actorId, orderId, page = 1, limit = 25 } = {}) {
  const match = {};
  if (actorId) match.actorId = actorId;
  if (orderId) match.orderId = orderId;

  const pageSize = Math.max(Number(limit) || 25, 1);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * pageSize;

  const [items, total] = await Promise.all([
    OperatorAuditLog.find(match)
      .populate("actorId", "name email")
      .populate("orderId", "shortOrderId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    OperatorAuditLog.countDocuments(match),
  ]);

  return {
    items,
    total,
    page: Math.max(Number(page) || 1, 1),
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
  };
}
