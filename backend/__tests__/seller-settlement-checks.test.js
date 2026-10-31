import { jest } from "@jest/globals";

// Phase 4 — Seller Settlement engine: the settled-amount formula and the 4
// check-dots (BRD scenarios 1, 2, 5). Heavy deps are mocked so we test the
// pure server-side decision logic without a DB.

jest.unstable_mockModule("../app/models/order.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/store.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/complaint.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/setting.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/payout.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/utils/money.js", () => ({
  roundCurrency: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
}));
jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({
  requireCanonicalOrderId: async (id) => id,
}));
jest.unstable_mockModule("../app/utils/sequenceIds.js", () => ({
  nextSettlementInvoiceNo: async () => "INV-0001",
}));
jest.unstable_mockModule("../app/services/finance/payoutService.js", () => ({
  createPendingPayoutForOrder: jest.fn(),
  processPayout: jest.fn(),
  cancelPendingPayoutForOrder: jest.fn(),
}));
jest.unstable_mockModule("../app/services/finance/razorpayPayoutService.js", () => ({
  createSellerPayout: jest.fn(),
  isTerminalSuccess: (s) => s === "processed",
  isTerminalFailure: (s) => ["reversed", "failed"].includes(s),
}));
jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: jest.fn(),
}));

const { getQuoted, computeSettled, deductionsTotal, computeChecks, maskPhone, resolveSettlementState } =
  await import("../app/services/finance/sellerSettlementService.js");

const HOURS = 24;

describe("Seller Settlement engine", () => {
  test("settled = quoted − all deductions (scenario 5)", () => {
    const order = {
      paymentBreakdown: { sellerPayoutTotal: 100 },
      sellerSettlement: { deductions: { complaint: 50, packing: 0, extra: 0, quality: 0, priceMismatch: 0, misc: 0 } },
    };
    expect(getQuoted(order)).toBe(100);
    expect(deductionsTotal(order)).toBe(50);
    expect(computeSettled(order)).toBe(50);
  });

  test("settled never goes below zero", () => {
    const order = {
      paymentBreakdown: { sellerPayoutTotal: 100 },
      sellerSettlement: { deductions: { misc: 500 } },
    };
    expect(computeSettled(order)).toBe(0);
  });

  test("scenario 1: delivered 2h ago, no complaint → complaint dot amber, not ready", () => {
    const order = {
      deliveredAt: new Date(Date.now() - 2 * 3600 * 1000),
      complaintWindowClosesAt: new Date(Date.now() + 22 * 3600 * 1000),
      paymentStatus: "PAID",
      paymentBreakdown: { sellerPayoutTotal: 100 },
    };
    const { dots, ready } = computeChecks(order, null, HOURS);
    expect(dots.find((d) => d.key === "complaint").dot).toBe("a");
    expect(ready).toBe(false);
  });

  test("scenario 2: 24h passed, all checks green → ready", () => {
    const order = {
      deliveredAt: new Date(Date.now() - 25 * 3600 * 1000),
      complaintWindowClosesAt: new Date(Date.now() - 1 * 3600 * 1000),
      paymentStatus: "PAID",
      paymentBreakdown: { sellerPayoutTotal: 100 },
      financeFlags: {},
    };
    const { dots, ready } = computeChecks(order, null, HOURS);
    expect(dots.every((d) => d.dot === "g")).toBe(true);
    expect(ready).toBe(true);
  });

  test("an open complaint makes the complaint dot red and holds settlement", () => {
    const order = {
      deliveredAt: new Date(Date.now() - 30 * 3600 * 1000),
      complaintWindowClosesAt: new Date(Date.now() - 6 * 3600 * 1000),
      paymentStatus: "PAID",
      paymentBreakdown: { sellerPayoutTotal: 100 },
    };
    const complaint = { status: "ASSIGNED" };
    const checks = computeChecks(order, complaint, HOURS);
    expect(checks.dots.find((d) => d.key === "complaint").dot).toBe("r");
    expect(checks.ready).toBe(false);
    expect(resolveSettlementState(order, checks)).toBe("HELD");
  });

  test("seller-approved complaint clears all checks while preserving its deduction", () => {
    const order = {
      deliveredAt: new Date(Date.now() - 30 * 3600 * 1000),
      complaintWindowClosesAt: new Date(Date.now() - 6 * 3600 * 1000),
      paymentStatus: "PAID",
      paymentBreakdown: { sellerPayoutTotal: 81 },
      sellerSettlement: { deductions: { complaint: 40 } },
      financeFlags: {},
    };
    const checks = computeChecks(order, { status: "SELLER_APPROVED" }, HOURS);

    expect(checks.dots.every((dot) => dot.dot === "g")).toBe(true);
    expect(checks.ready).toBe(true);
    expect(computeSettled(order)).toBe(41);
    expect(checks.dots.find((dot) => dot.key === "complaint").tooltip).toMatch(/accepted/i);
  });

  test("seller-rejected complaint remains blocked for admin review", () => {
    const order = {
      deliveredAt: new Date(Date.now() - 30 * 3600 * 1000),
      complaintWindowClosesAt: new Date(Date.now() - 6 * 3600 * 1000),
      paymentStatus: "PAID",
      financeFlags: {},
    };
    const checks = computeChecks(order, { status: "SELLER_REJECTED" }, HOURS);

    expect(checks.dots.find((dot) => dot.key === "complaint").dot).toBe("r");
    expect(checks.ready).toBe(false);
  });

  test("unpaid order → payment dot red, not ready", () => {
    const order = {
      deliveredAt: new Date(Date.now() - 25 * 3600 * 1000),
      complaintWindowClosesAt: new Date(Date.now() - 1 * 3600 * 1000),
      paymentStatus: "CREATED",
      paymentBreakdown: { sellerPayoutTotal: 100 },
    };
    const { dots, ready } = computeChecks(order, null, HOURS);
    expect(dots.find((d) => d.key === "payment").dot).toBe("r");
    expect(ready).toBe(false);
  });

  test("ready + reviewed resolves to REVIEWED state", () => {
    const order = {
      deliveredAt: new Date(Date.now() - 25 * 3600 * 1000),
      complaintWindowClosesAt: new Date(Date.now() - 1 * 3600 * 1000),
      paymentStatus: "PAID",
      paymentBreakdown: { sellerPayoutTotal: 100 },
      sellerSettlement: { reviewed: true },
      financeFlags: {},
    };
    const checks = computeChecks(order, null, HOURS);
    expect(resolveSettlementState(order, checks)).toBe("REVIEWED");
  });

  test("phone is masked to the last 5 digits", () => {
    expect(maskPhone("9845011201")).toBe("●●●●●11201");
    expect(maskPhone("")).toBe("");
  });
});
