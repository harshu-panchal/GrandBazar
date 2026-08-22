import { jest } from "@jest/globals";

const mockOrderAggregate = jest.fn();
const mockWalletAggregate = jest.fn();

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { aggregate: mockOrderAggregate },
}));
jest.unstable_mockModule("../app/models/wallet.js", () => ({
  default: { aggregate: mockWalletAggregate },
}));

const {
  getEarningsBreakdown,
  getDeliveryEarningsSummary,
  getSellerEarningsSummary,
} = await import("../app/services/finance/earningsBreakdownService.js");

describe("earningsBreakdownService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects an unknown dimension", async () => {
    await expect(getEarningsBreakdown({ dimension: "planet" })).rejects.toThrow(
      /dimension must be one of/i,
    );
  });

  it("shapes a product breakdown from the $facet result", async () => {
    mockOrderAggregate.mockResolvedValue([
      {
        items: [
          { _id: "prod-1", name: "Widget", commission: 120.005, sellerPayout: 380, itemSubtotal: 500, orderCount: 3 },
        ],
        totals: [{ commission: 120.005, sellerPayout: 380, itemSubtotal: 500, lineCount: 3 }],
      },
    ]);

    const result = await getEarningsBreakdown({ dimension: "product", limit: 10 });

    expect(result.dimension).toBe("product");
    expect(result.items[0]).toEqual(
      expect.objectContaining({ id: "prod-1", name: "Widget", commission: 120.01, orderCount: 3 }),
    );
    expect(result.totals.commission).toBe(120.01);
  });

  it("labels a category line with no resolved category commission instead of dropping it", async () => {
    mockOrderAggregate.mockResolvedValue([
      {
        items: [{ _id: null, name: null, commission: 40, sellerPayout: 60, itemSubtotal: 100, orderCount: 1 }],
        totals: [{ commission: 40, sellerPayout: 60, itemSubtotal: 100, lineCount: 1 }],
      },
    ]);

    const result = await getEarningsBreakdown({ dimension: "category" });

    expect(result.items[0].id).toBeNull();
    expect(result.items[0].name).toMatch(/shop\/city default/i);
  });

  it("merges city groups that differ only by casing/whitespace via normalizeCityKey", async () => {
    mockOrderAggregate.mockResolvedValue([
      { _id: "Mumbai", commission: 100, sellerPayout: 200, platformEarning: 150, orderCount: 2 },
      { _id: "  mumbai ", commission: 50, sellerPayout: 100, platformEarning: 75, orderCount: 1 },
      { _id: "Pune", commission: 30, sellerPayout: 60, platformEarning: 40, orderCount: 1 },
    ]);

    const result = await getEarningsBreakdown({ dimension: "city" });

    expect(result.items).toHaveLength(2);
    const mumbai = result.items.find((row) => row.name === "Mumbai");
    expect(mumbai.commission).toBe(150); // 100 + 50, merged despite casing/whitespace
    expect(mumbai.orderCount).toBe(3);
    expect(result.totals.commission).toBe(180); // 150 + 30
  });

  it("respects the limit for the shop dimension while totals reflect the full match", async () => {
    mockOrderAggregate.mockResolvedValue([
      {
        items: [
          { _id: "store-1", commission: 500, sellerPayout: 1000, platformEarning: 600, orderCount: 5, store: { shopName: "Store One" } },
        ],
        totals: [{ commission: 900, sellerPayout: 1800, platformEarning: 1100, orderCount: 9 }],
      },
    ]);

    const result = await getEarningsBreakdown({ dimension: "shop", limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("Store One");
    expect(result.totals.commission).toBe(900);
  });

  it("computes delivery earnings summary split by payment mode and adds rider wallet totals", async () => {
    mockOrderAggregate.mockResolvedValue([
      { _id: "ONLINE", riderEarnings: 200, platformLogisticsMargin: 50, deliveryFeeCollected: 300, orderCount: 4 },
      { _id: "COD", riderEarnings: 100, platformLogisticsMargin: 20, deliveryFeeCollected: 150, orderCount: 2 },
    ]);
    mockWalletAggregate.mockResolvedValue([
      { totalAvailable: 400, totalPending: 150, totalCashInHand: 900, riderCount: 12 },
    ]);

    const result = await getDeliveryEarningsSummary({});

    expect(result.riderEarnings).toBe(300);
    expect(result.platformLogisticsMargin).toBe(70);
    expect(result.orderCount).toBe(6);
    expect(result.byPaymentMode.ONLINE.riderEarnings).toBe(200);
    expect(result.byPaymentMode.COD.riderEarnings).toBe(100);
    expect(result.riderWallets).toEqual({
      totalAvailable: 400,
      totalPending: 150,
      totalCashInHand: 900,
      riderCount: 12,
    });
  });

  it("composes seller earnings summary from the shop breakdown plus wallet totals", async () => {
    mockOrderAggregate.mockResolvedValue([
      {
        items: [{ _id: "store-1", commission: 500, sellerPayout: 1000, platformEarning: 600, orderCount: 5, store: { shopName: "Store One" } }],
        totals: [{ commission: 500, sellerPayout: 1000, platformEarning: 600, orderCount: 5 }],
      },
    ]);
    mockWalletAggregate.mockResolvedValue([{ totalAvailable: 700, totalPending: 300, sellerCount: 8 }]);

    const result = await getSellerEarningsSummary({});

    expect(result.topSellers[0].name).toBe("Store One");
    expect(result.sellerWallets).toEqual({ totalAvailable: 700, totalPending: 300, sellerCount: 8 });
  });
});
