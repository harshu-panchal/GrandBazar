import { jest } from "@jest/globals";

// Phase 6 — Bulk Settlement guards (BRD): one seller only (scenario 12),
// ready-only (BLK-03). Heavy deps mocked.

const mockOrderFind = jest.fn();
const mockComputeChecks = jest.fn();

function chain(result) {
  const obj = {};
  obj.populate = () => obj;
  obj.select = () => obj;
  obj.sort = () => obj;
  obj.lean = async () => result;
  return obj;
}

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { find: (...a) => mockOrderFind(...a) },
}));
jest.unstable_mockModule("../app/models/store.js", () => ({
  default: { findById: () => chain({ shopName: "Fresh Basket" }) },
}));
jest.unstable_mockModule("../app/models/complaint.js", () => ({
  default: { find: () => chain([]) },
}));
jest.unstable_mockModule("../app/models/setting.js", () => ({
  default: { findOne: () => chain({ complaint: { windowHours: 24 } }) },
}));
jest.unstable_mockModule("../app/models/sellerBulkSettlement.js", () => ({
  default: { create: jest.fn(), updateOne: jest.fn(), findById: jest.fn(), findOne: jest.fn() },
}));
jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({
  requireCanonicalOrderId: async (id) => id,
}));
jest.unstable_mockModule("../app/utils/sequenceIds.js", () => ({
  nextBulkSettlementRef: async () => "BS-2610-001",
}));
jest.unstable_mockModule("../app/utils/money.js", () => ({
  roundCurrency: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
}));
jest.unstable_mockModule("../app/services/finance/sellerSettlementService.js", () => ({
  computeChecks: (...a) => mockComputeChecks(...a),
  computeSettled: (o) => o._amt ?? 100,
  getQuoted: (o) => o._q ?? 100,
  markReviewed: jest.fn(),
  paySettlement: jest.fn(),
}));

const { previewBulk, payBulk } = await import("../app/services/finance/bulkSettlementService.js");

beforeEach(() => {
  jest.clearAllMocks();
  mockComputeChecks.mockImplementation((o) => ({ dots: [], ready: o._ready !== false }));
});

describe("Bulk Settlement guards", () => {
  test("scenario 12: orders from two sellers are blocked", async () => {
    mockOrderFind.mockReturnValue(
      chain([
        { _id: "o1", orderId: "ORD1", seller: { _id: "S1" }, complaintRef: null },
        { _id: "o2", orderId: "ORD2", seller: { _id: "S2" }, complaintRef: null },
      ]),
    );
    await expect(
      payBulk({ sellerId: "S1", orderIds: ["ORD1", "ORD2"], mode: "MANUAL", txnNo: "T1" }, { id: "a1" }),
    ).rejects.toThrow(/same seller/i);
  });

  test("BLK-03: a not-ready order in the selection is rejected", async () => {
    mockOrderFind.mockReturnValue(
      chain([
        { _id: "o1", orderId: "ORD1", seller: { _id: "S1" }, complaintRef: null, _ready: true },
        { _id: "o2", orderId: "ORD2", seller: { _id: "S1" }, complaintRef: null, _ready: false },
      ]),
    );
    await expect(
      payBulk({ sellerId: "S1", orderIds: ["ORD1", "ORD2"], mode: "MANUAL", txnNo: "T1" }, { id: "a1" }),
    ).rejects.toThrow(/not ready/i);
  });

  test("preview totals only the ready, unsettled orders", async () => {
    mockOrderFind.mockReturnValue(
      chain([
        { _id: "o1", orderId: "ORD1", seller: { _id: "S1" }, complaintRef: null, _ready: true, _amt: 100 },
        { _id: "o2", orderId: "ORD2", seller: { _id: "S1" }, complaintRef: null, _ready: false, _amt: 80 },
      ]),
    );
    const res = await previewBulk({ sellerId: "S1", orderIds: ["ORD1", "ORD2"] });
    expect(res.readyCount).toBe(1);
    expect(res.notReadyCount).toBe(1);
    expect(res.total).toBe(100);
  });

  test("empty selection is rejected", async () => {
    await expect(payBulk({ sellerId: "S1", orderIds: [] }, { id: "a1" })).rejects.toThrow(/at least one/i);
  });
});
