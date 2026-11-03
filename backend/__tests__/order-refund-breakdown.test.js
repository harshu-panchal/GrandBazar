import { jest } from "@jest/globals";

const mockOrderFindOne = jest.fn();
const mockRefundFind = jest.fn();
const mockTransactionFind = jest.fn();

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { findOne: mockOrderFindOne },
}));
jest.unstable_mockModule("../app/models/refund.js", () => ({
  default: { find: mockRefundFind },
}));
jest.unstable_mockModule("../app/models/transaction.js", () => ({
  default: { find: mockTransactionFind },
}));
jest.unstable_mockModule("../app/models/creditNote.js", () => ({
  default: { find: jest.fn(() => ({ select: () => ({ lean: async () => [] }) })) },
}));
jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({
  orderMatchQueryFlexible: jest.fn((orderId) => ({ orderId })),
}));

const { getOrderRefundBreakdown } = await import("../app/services/finance/orderRefundBreakdownService.js");

const queryResult = (value) => ({
  sort: () => ({ lean: async () => value }),
});

describe("order refund breakdown", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOrderFindOne.mockReturnValue({
      select: () => ({
        lean: async () => ({
          _id: "order-db-id",
          orderId: "ORD-1",
          paymentBreakdown: { sellerPayoutTotal: 181 },
          returnSellerClawback: 20,
          returnAdminCommissionClawback: 4,
        }),
      }),
    });
  });

  it("lists each refund and legacy wallet-credit refund exactly once", async () => {
    mockRefundFind.mockReturnValue(queryResult([
      {
        _id: "return-refund",
        type: "return",
        amount: 25.25,
        mode: "wallet",
        status: "completed",
        createdAt: new Date("2026-01-01T10:00:00Z"),
      },
      {
        _id: "complaint-refund",
        type: "complaint",
        sourceReference: "C-1",
        payer: "seller",
        payerNote: "Seller-funded complaint refund",
        amount: 10.1,
        mode: "wallet",
        status: "completed",
        createdAt: new Date("2026-01-02T10:00:00Z"),
      },
      {
        _id: "pending-refund",
        type: "price_adjustment",
        amount: 4.5,
        mode: "wallet",
        status: "initiated",
        createdAt: new Date("2026-01-03T10:00:00Z"),
      },
      {
        _id: "cod-adjustment",
        type: "price_adjustment",
        amount: 3.25,
        mode: "cod_adjustment",
        status: "completed",
        createdAt: new Date("2026-01-03T11:00:00Z"),
      },
    ]));
    mockTransactionFind.mockReturnValue(queryResult([
      {
        _id: "return-transaction",
        amount: 25.25,
        reference: "REF-WALLET-ORD-1",
        status: "Settled",
        meta: { type: "return_wallet" },
      },
      {
        _id: "complaint-transaction",
        amount: 10.1,
        reference: "RFND-C-1",
        status: "Settled",
        meta: { complaintId: "C-1", refundId: "complaint-refund" },
      },
      {
        _id: "dispute-transaction",
        amount: 2.75,
        reference: "DSP-D-1",
        status: "Settled",
        meta: { disputeId: "D-1" },
        createdAt: new Date("2026-01-04T10:00:00Z"),
      },
    ]));

    const result = await getOrderRefundBreakdown("ORD-1");

    expect(result.items).toHaveLength(5);
    expect(result.items.map((item) => item.source)).toEqual([
      "Return refund",
      "Complaint refund",
      "Price adjustment",
      "Price adjustment",
      "Dispute refund",
    ]);
    expect(result.items[4]).toMatchObject({
      type: "dispute",
      sourceReference: "D-1",
      amount: 2.75,
      mode: "wallet",
    });
    expect(result.items[0].recipientImpacts).toMatchObject({ seller: 20, platform: 4 });
    expect(result.items[1]).toMatchObject({ payer: "seller", payerLabel: "Seller" });
    expect(result.totalRefunded).toBe(38.1);
    expect(result.totalPending).toBe(4.5);
    expect(result.totalCodAdjustments).toBe(3.25);
    expect(result.recipientImpacts.seller).toBe(30.1);
    expect(result.sellerNet).toBe(150.9);
  });

  it("nets completed seller-funded refunds from gross seller payout only", async () => {
    mockRefundFind.mockReturnValue(queryResult([
      {
        _id: "legacy-complaint-refund",
        type: "complaint",
        sourceReference: "C-40",
        amount: 40,
        mode: "wallet",
        status: "completed",
      },
      {
        _id: "pending-seller-refund",
        type: "complaint",
        sourceReference: "C-PENDING",
        payer: "seller",
        amount: 12,
        mode: "wallet",
        status: "processing",
      },
    ]));
    mockTransactionFind.mockReturnValue(queryResult([
      {
        _id: "legacy-complaint-transaction",
        amount: 40,
        reference: "RFND-C-40",
        status: "Settled",
        meta: { complaintId: "C-40", culprit: "SELLER" },
      },
    ]));

    const result = await getOrderRefundBreakdown("ORD-1");

    expect(result.items[0]).toMatchObject({
      payer: "seller",
      recipientImpacts: { seller: 40 },
    });
    expect(result.totalRefunded).toBe(40);
    expect(result.totalPending).toBe(12);
    expect(result.recipientImpacts.seller).toBe(40);
    expect(result.sellerGross).toBe(181);
    expect(result.sellerNet).toBe(141);
  });

  it("returns not-found for an order without a matching identifier", async () => {
    mockOrderFindOne.mockReturnValue({
      select: () => ({ lean: async () => null }),
    });

    await expect(getOrderRefundBreakdown("missing")).rejects.toMatchObject({ statusCode: 404 });
    expect(mockRefundFind).not.toHaveBeenCalled();
  });
});
