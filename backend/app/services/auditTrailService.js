import AuditLogEntry from "../models/auditLogEntry.js";

/**
 * Fire-and-forget: audit logging must never break the mutation it's
 * describing, so failures are swallowed rather than propagated.
 */
export async function recordAuditLog({
  actorId = null,
  actorRole = "admin",
  action,
  targetType,
  targetId,
  before = null,
  after = null,
  metadata = {},
}) {
  try {
    await AuditLogEntry.create({
      actorId,
      actorRole,
      action,
      targetType,
      targetId,
      before,
      after,
      metadata,
    });
  } catch {
    // swallow — see doc comment above
  }
}

export async function getAuditTrail(targetType, targetId, { limit = 50 } = {}) {
  return AuditLogEntry.find({ targetType, targetId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}
