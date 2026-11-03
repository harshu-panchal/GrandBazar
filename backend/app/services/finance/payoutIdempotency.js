import crypto from "crypto";

const RAZORPAY_PAYOUT_IDEMPOTENCY_MAX_LENGTH = 36;

// RazorpayX accepts only letters, digits, spaces, underscores and hyphens in
// this header, with a maximum length of 36. Preserve readable short keys; hash
// long keys so their order-specific tail is not lost through truncation.
export function normalizePayoutIdempotencyKey(value) {
  const raw = String(value || "");
  const safe = raw.replace(/[^A-Za-z0-9_ -]/g, "-");
  if (safe.length <= RAZORPAY_PAYOUT_IDEMPOTENCY_MAX_LENGTH) return safe;

  const digest = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
  const readablePrefix = safe.slice(0, 11);
  return `${readablePrefix}-${digest}`;
}

export default normalizePayoutIdempotencyKey;
