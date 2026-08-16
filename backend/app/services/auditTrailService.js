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

/**
 * General recent-activity feed — for browsing admin actions across all
 * targets (e.g. an "Audit Logs" panel), not just one record's history.
 * getAuditTrail() above stays scoped to a single target on purpose; this is
 * the general-purpose counterpart that was missing (nothing ever called
 * getAuditTrail with no filters, and no route exposed entries at all).
 */
export async function getRecentAuditLogs({
  page = 1,
  limit = 50,
  actorRole,
  action,
  targetType,
  targetId,
} = {}) {
  const query = {};
  if (actorRole) query.actorRole = actorRole;
  if (action) query.action = action;
  if (targetType) query.targetType = targetType;
  if (targetId) query.targetId = targetId;

  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    AuditLogEntry.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      // actorId has no schema-level `ref` (actorRole isn't a fixed model),
      // so the target model is supplied here explicitly. Every actor
      // recorded so far is an admin (actorRole defaults to "admin" and both
      // existing call sites are admin actions) — harmless no-op population
      // if that ever isn't true.
      .populate({ path: "actorId", model: "Admin", select: "name email" })
      .lean(),
    AuditLogEntry.countDocuments(query),
  ]);

  return {
    items,
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.ceil(total / safeLimit) || 1,
  };
}
