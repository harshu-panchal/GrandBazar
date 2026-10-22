import { jest } from "@jest/globals";

// Follow-up fixes after Phase 8:
//  - BRD SET-11: the Admin/Finance "Order money" box must show the gateway
//    fee (informational only — never deducted from the seller).
//  - BRD SEC-05 (open question): reviewer and payer may be required to be
//    different people, opt-in via Setting.settlement.requireDifferentReviewerAndPayer.

const mockOrderFindOne = jest.fn();
const mockSettingFindOne = jest.fn();

function chain(result) {
  const obj = {};
  obj.populate = () => obj;
  obj.select = () => obj;
  obj.lean = async () => result;
  return obj;
}

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findOne: (...a) => mockOrderFindOne(...a),
    // Simulates a successful atomic PAYING claim (the test's focus is the
    // maker-checker gate earlier in paySettlement, not the payout itself).
    findOneAndUpdate: async () => ({ _id: "o1" }),
    updateOne: async () => ({ acknowledged: true }),
    // syncBulkOrder's lookup — no bulkRef, so it's a no-op.
    findById: () => chain({ sellerSettlement: {} }),
  },
}));
jest.unstable_mockModule("../app/models/store.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/complaint.js", () => ({
  default: { findById: () => ({ select: () => ({ lean: async () => null }) }) },
}));
jest.unstable_mockModule("../app/models/setting.js", () => ({
  default: { findOne: (...a) => mockSettingFindOne(...a) },
}));
jest.unstable_mockModule("../app/models/payout.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/sellerBulkSettlement.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/utils/money.js", () => ({
  roundCurrency: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
}));
jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({ requireCanonicalOrderId: async (id) => id }));
jest.unstable_mockModule("../app/utils/sequenceIds.js", () => ({ nextSettlementInvoiceNo: async () => "INV-0001" }));
jest.unstable_mockModule("../app/services/finance/payoutService.js", () => ({
  createPendingPayoutForOrder: jest.fn(), processPayout: jest.fn(), cancelPendingPayoutForOrder: jest.fn(),
}));
jest.unstable_mockModule("../app/services/finance/razorpayPayoutService.js", () => ({
  createSellerPayout: jest.fn(), isTerminalSuccess: () => false, isTerminalFailure: () => false,
}));
jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({ emitNotificationEvent: jest.fn() }));

const { paySettlement, getSettlementDetail } = await import("../app/services/finance/sellerSettlementService.js");

beforeEach(() => {
  jest.clearAllMocks();
});

const readySettlement = (over = {}) => ({
  _id: "o1",
  orderId: "ORD1",
  seller: { _id: "S1", shopName: "Fresh Basket" },
  deliveredAt: new Date(Date.now() - 25 * 3600 * 1000),
  complaintWindowClosesAt: new Date(Date.now() - 1 * 3600 * 1000),
  paymentStatus: "PAID",
  paymentBreakdown: { sellerPayoutTotal: 100, grandTotal: 235 },
  financeFlags: {},
  sellerSettlement: { reviewed: true, reviewedBy: "admin-1", deductions: {} },
  settlementStatus: {},
  ...over,
});

// paySettlement's own Order.findOne({ orderId }).populate("seller") has NO
// .lean() — .populate() must resolve directly to the order document.
function populateChain(order) {
  return { populate: () => order };
}

describe("Maker-checker (SEC-05, opt-in)", () => {
  test("off by default: same reviewer+payer is allowed", async () => {
    mockSettingFindOne.mockReturnValue(chain({ complaint: { windowHours: 24 }, settlement: {} }));
    mockOrderFindOne.mockReturnValue(populateChain(readySettlement()));
    // paySettlement will go on to call cancelPendingPayoutForOrder/createPendingPayoutForOrder
    // which are mocked no-ops, then hit createPendingPayoutForOrder returning undefined ->
    // "Could not create payout" — that's fine, we only assert it got PAST the maker-checker gate.
    await expect(
      paySettlement("ORD1", { mode: "MANUAL", txnNo: "T1" }, { id: "admin-1" }),
    ).rejects.toThrow(/could not create payout/i);
  });

  test("on: same reviewer and payer is blocked", async () => {
    mockSettingFindOne.mockReturnValue(
      chain({ complaint: { windowHours: 24 }, settlement: { requireDifferentReviewerAndPayer: true } }),
    );
    mockOrderFindOne.mockReturnValue(populateChain(readySettlement()));
    await expect(
      paySettlement("ORD1", { mode: "MANUAL", txnNo: "T1" }, { id: "admin-1" }),
    ).rejects.toThrow(/maker-checker is enabled/i);
  });

  test("on: a different payer than the reviewer is allowed through the gate", async () => {
    mockSettingFindOne.mockReturnValue(
      chain({ complaint: { windowHours: 24 }, settlement: { requireDifferentReviewerAndPayer: true } }),
    );
    mockOrderFindOne.mockReturnValue(populateChain(readySettlement()));
    await expect(
      paySettlement("ORD1", { mode: "MANUAL", txnNo: "T1" }, { id: "admin-2" }),
    ).rejects.toThrow(/could not create payout/i); // past the gate, fails later for an unrelated mocked reason
  });
});

describe("Order money box shows the gateway fee (BRD SET-11)", () => {
  test("gatewayFee is computed from grandTotal * configured percent, never deducted from settled", async () => {
    mockSettingFindOne.mockReturnValue(
      chain({ complaint: { windowHours: 24 }, razorpay: { payoutFeePercent: 2.35 }, settlement: {} }),
    );
    mockOrderFindOne.mockReturnValue(chain(readySettlement({ sellerSettlement: { deductions: {} } })));
    const detail = await getSettlementDetail("ORD1", { includeMoney: true });
    expect(detail.orderMoney.gatewayFeePercent).toBe(2.35);
    expect(detail.orderMoney.gatewayFee).toBeCloseTo(235 * 0.0235, 2);
    // settled amount formula never includes the gateway fee
    expect(detail.settledAmount).toBe(100);
  });
});
