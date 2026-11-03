import { jest } from "@jest/globals";

// Phase 6 — Bulk Settlement guards (BRD): one seller only (scenario 12),
// ready-only (BLK-03). Heavy deps mocked.

const mockOrderFind = jest.fn();
const mockComputeChecks = jest.fn();
const mockStoreFind = jest.fn();

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
  default: {
    find: (...args) => mockStoreFind(...args),
    findById: () => chain({ shopName: "Fresh Basket" }),
  },
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

const {
  previewBulk,
  payBulk,
  listSellerUnsettledOrders,
  listBulkSettlementSellers,
} = await import("../app/services/finance/bulkSettlementService.js");

beforeEach(() => {
  jest.clearAllMocks();
  mockComputeChecks.mockImplementation((o) => ({ dots: [], ready: o._ready !== false }));
});

describe("Bulk Settlement guards", () => {
  test("bulk settlement seller options include only active verified stores", async () => {
    mockStoreFind.mockReturnValue(chain([
      { _id: "S1", shopName: "Fresh Basket" },
    ]));

    await expect(listBulkSettlementSellers()).resolves.toEqual([
      { id: "S1", shopName: "Fresh Basket" },
    ]);
    expect(mockStoreFind).toHaveBeenCalledWith({
      isVerified: true,
      isActive: true,
      applicationStatus: "approved",
    });
  });

  test("bulk order list only returns orders with all four checks green", async () => {
    mockOrderFind.mockReturnValue(chain([
      {
        orderId: "READY",
        seller: "S1",
        deliveredAt: new Date(),
        customer: { name: "Customer 1" },
        sellerSettlement: { deductions: { complaint: 40 } },
        paymentBreakdown: {
          grandTotal: 323.64,
          taxTotal: 35.64,
          adminProductCommissionTotal: 18,
          deliveryFeeCharged: 30,
          riderPayoutTotal: 30,
          sellerPayoutTotal: 181,
        },
        items: [{ name: "Product", quantity: 1, price: 181 }],
        _ready: true,
        _q: 181,
        _amt: 141,
      },
      { orderId: "WAITING", seller: "S1", deliveredAt: new Date(), customer: { name: "Customer 2" }, _ready: false },
    ]));
    mockComputeChecks.mockImplementation((o) => ({
      ready: o._ready,
      dots: [
        { key: "delivered", dot: "g" },
        { key: "payment", dot: "g" },
        { key: "complaint", dot: o._ready ? "g" : "a" },
        { key: "penalty", dot: "g" },
      ],
    }));

    const orders = await listSellerUnsettledOrders("S1");

    expect(orders.map((order) => order.orderId)).toEqual(["READY"]);
    expect(orders[0].dots).toHaveLength(4);
    expect(orders[0].dots.every((dot) => dot.dot === "g")).toBe(true);
    expect(orders[0]).toMatchObject({
      quotedAmount: 181,
      settledAmount: 141,
      deductions: { complaint: 40 },
      orderMoney: {
        customerPaid: 323.64,
        itemPrice: 181,
        gst: 35.64,
        commission: 18,
        deliveryCharge: 30,
        riderCost: 30,
        gatewayFee: 7.61,
        gatewayFeePercent: 2.35,
      },
      items: [{ name: "Product", quantity: 1, lineTotal: 181 }],
    });
  });

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
