import { normalizePayoutIdempotencyKey } from "../app/services/finance/payoutIdempotency.js";

describe("Razorpay payout idempotency keys", () => {
  test("keeps valid short keys readable", () => {
    expect(normalizePayoutIdempotencyKey("settle-order_123")).toBe("settle-order_123");
  });

  test("converts invalid characters and never exceeds Razorpay's 36 character limit", () => {
    const key = normalizePayoutIdempotencyKey("bulk:seller:with:a:very:long:key:order:123456789");
    expect(key).toMatch(/^[A-Za-z0-9_ -]+$/);
    expect(key.length).toBeLessThanOrEqual(36);
  });

  test("long bulk keys remain unique when their order suffix differs", () => {
    const prefix = "bulk-507f1f77bcf86cd799439011-550e8400-e29b-41d4-a716-446655440000";
    const first = normalizePayoutIdempotencyKey(`${prefix}:ORDER-1`);
    const second = normalizePayoutIdempotencyKey(`${prefix}:ORDER-2`);
    expect(first).not.toBe(second);
  });
});
