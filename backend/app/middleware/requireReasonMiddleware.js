import handleResponse from "../utils/helper.js";

// Enforces the mock's "a reason is mandatory on every manual action" rule
// for Operator-tier staff specifically. Root admin/superadmin are exempt —
// these routes (rider assignment, logistics override) are also used today
// by the existing admin panel, which has no reason field in its UI; forcing
// one on every caller would break that unrelated, already-working flow.
// Accepts either `reason` or `note` in the body (this codebase uses both
// names interchangeably across similar endpoints).
export const requireReason = (req, res, next) => {
  if (req.user?.role === "admin" || req.user?.role === "superadmin") {
    return next();
  }
  const reason = req.body?.reason ?? req.body?.note;
  if (!reason || !String(reason).trim()) {
    return handleResponse(res, 400, "A reason is required for this action.");
  }
  next();
};
