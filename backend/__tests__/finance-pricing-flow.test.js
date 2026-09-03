import { jest } from "@jest/globals";

const mockProductFind = jest.fn();
const mockCategoryFind = jest.fn();
const mockStoreFindById = jest.fn();
const mockSellerFindById = jest.fn();
const mockGetOrCreateFinanceSettings = jest.fn();
const mockCityCommissionFindOne = jest.fn();

function createQueryChain(result) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

jest.unstable_mockModule("../app/models/product.js", () => ({
  default: {
    find: mockProductFind,
  },
}));

jest.unstable_mockModule("../app/models/category.js", () => ({
  default: {
    find: mockCategoryFind,
  },
}));

jest.unstable_mockModule("../app/models/store.js", () => ({
  default: {
    findById: mockStoreFindById,
  },
}));

jest.unstable_mockModule("../app/models/cityCommission.js", () => ({
  default: {
    findOne: mockCityCommissionFindOne,
  },
}));

jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: {
    findById: mockSellerFindById,
  },
}));

jest.unstable_mockModule("../app/services/finance/financeSettingsService.js", () => ({
  getOrCreateFinanceSettings: mockGetOrCreateFinanceSettings,
}));

const mockGetActiveSubscriptionForSeller = jest.fn();
const mockResolveFreeTierStatus = jest.fn().mockResolvedValue({
  applicable: false,
  isOverLimit: false,
  publishedCount: 0,
  limit: 0,
  surchargePercent: 0,
});
jest.unstable_mockModule("../app/services/subscriptionService.js", () => ({
  getActiveSubscriptionForSeller: mockGetActiveSubscriptionForSeller,
  resolveFreeTierStatus: mockResolveFreeTierStatus,
}));

const {
  calculateCategoryCommission,
  calculateCustomerDeliveryFee,
  calculateHandlingFee,
  calculateProductSubtotal,
  calculateRiderPayout,
  categoryAppliesCommission,
  generateOrderPaymentBreakdown,
  hydrateOrderItems,
  resolveEffectiveCommissionForLineItem,
  resolveCategoryHierarchyCommission,
  resolveCommissionInclusiveLineTotals,
} = await import("../app/services/finance/pricingService.js");

describe("finance pricing flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProductFind.mockReturnValue(createQueryChain([]));
    mockStoreFindById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ _id: "seller-1", ownerId: "owner-1", city: "Indore" }),
    });
    mockSellerFindById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        _id: "owner-1",
        businessModel: "commission",
        commissionConfig: { scope: "category" },
      }),
    });
    mockGetActiveSubscriptionForSeller.mockResolvedValue({ _id: "sub1" });
    mockCityCommissionFindOne.mockReturnValue(createQueryChain(null));
  });

  it("calculates product subtotal accurately", () => {
    const subtotal = calculateProductSubtotal([
      { price: 99.99, quantity: 2 },
      { price: 50, quantity: 1 },
    ]);
    expect(subtotal).toBe(249.98);
  });

  it("calculates percentage and fixed commissions correctly (commission added on top of seller price)", () => {
    const percentage = calculateCategoryCommission(
      { price: 100, quantity: 2 },
      { adminCommissionType: "percentage", adminCommissionValue: 10 },
    );
    // Seller keeps the full price they entered (100 * 2 = 200); commission
    // is added on top for the customer to pay, not deducted from the seller.
    expect(percentage.sellerPayout).toBe(200);
    expect(percentage.adminCommission).toBe(20);
    expect(percentage.itemSubtotal).toBe(220);

    const fixedPerItem = calculateCategoryCommission(
      { price: 50, quantity: 3 },
      {
        adminCommissionType: "fixed",
        adminCommissionValue: 12,
        adminCommissionFixedRule: "per_item",
      },
    );
    expect(fixedPerItem.sellerPayout).toBe(150);
    expect(fixedPerItem.adminCommission).toBe(12);
    expect(fixedPerItem.itemSubtotal).toBe(162);
  });

  it("applies fixed per-quantity commission on top of seller price for quantity > 1", () => {
    const fixedPerQty = calculateCategoryCommission(
      { price: 20, quantity: 4 },
      {
        adminCommissionType: "fixed",
        adminCommissionValue: 3,
        adminCommissionFixedRule: "per_qty",
      },
    );
    // base = 20*4 = 80; commission = 3 * 4 qty = 12; customer pays 80+12=92.
    expect(fixedPerQty.sellerPayout).toBe(80);
    expect(fixedPerQty.adminCommission).toBe(12);
    expect(fixedPerQty.itemSubtotal).toBe(92);
  });

  it("leaves itemSubtotal equal to sellerPayout when no commission config applies", () => {
    const noCommission = calculateCategoryCommission(
      { price: 75, quantity: 2 },
      { adminCommissionType: "percentage", adminCommissionValue: 0 },
    );
    expect(noCommission.sellerPayout).toBe(150);
    expect(noCommission.adminCommission).toBe(0);
    expect(noCommission.itemSubtotal).toBe(150);
  });

  it("resolves category commission hierarchy bottom-up (deepest wins)", () => {
    const header = {
      _id: "h1",
      name: "Header",
      applyCommission: true,
      adminCommissionValue: 15,
    };
    const level2 = {
      _id: "c1",
      name: "Level2",
      applyCommission: true,
      adminCommissionValue: 10,
    };
    const sub = {
      _id: "s1",
      name: "Sub",
      applyCommission: true,
      adminCommissionValue: 5,
    };

    expect(
      resolveCategoryHierarchyCommission({
        headerCategory: header,
        level2Category: level2,
        subcategory: sub,
      }).level,
    ).toBe("subcategory");

    expect(
      resolveCategoryHierarchyCommission({
        headerCategory: header,
        level2Category: level2,
        subcategory: { ...sub, applyCommission: false },
      }).level,
    ).toBe("category");

    expect(
      resolveCategoryHierarchyCommission({
        headerCategory: header,
        level2Category: { ...level2, applyCommission: false },
        subcategory: { ...sub, applyCommission: false },
      }).category.adminCommissionValue,
    ).toBe(15);

    expect(
      resolveCategoryHierarchyCommission({
        productCategory: {
          _id: "p1",
          applyCommission: true,
          adminCommissionValue: 8,
        },
        headerCategory: header,
        level2Category: level2,
        subcategory: sub,
      }).level,
    ).toBe("product");

    expect(categoryAppliesCommission({ adminCommissionValue: 8 })).toBe(true);
    expect(
      categoryAppliesCommission({ applyCommission: false, adminCommissionValue: 8 }),
    ).toBe(false);
  });

  it("falls back to subcategory commission when product/addon commissions are missing", async () => {
    mockCategoryFind.mockReturnValue(
      createQueryChain([
        {
          _id: "h1",
          name: "Header",
          type: "header",
          applyCommission: false,
          adminCommissionValue: 0,
          handlingFeeType: "fixed",
          handlingFeeValue: 0,
        },
        {
          _id: "s1",
          name: "Subcategory",
          type: "subcategory",
          applyCommission: true,
          adminCommissionType: "percentage",
          adminCommissionValue: 20,
        },
      ]),
    );

    mockGetOrCreateFinanceSettings.mockResolvedValue({
      deliveryPricingMode: "fixed",
      fixedDeliveryFee: 0,
      customerBaseDeliveryFee: 0,
      riderBasePayout: 0,
      baseDistanceCapacityKm: 0.5,
      incrementalKmSurcharge: 0,
      deliveryPartnerRatePerKm: 0,
      handlingFeeStrategy: "highest_category_fee",
      codEnabled: true,
      onlineEnabled: true,
    });

    const breakdown = await generateOrderPaymentBreakdown({
      preHydratedItems: [
        {
          productId: "prod-1",
          productName: "Item",
          quantity: 1,
          price: 100,
          headerCategoryId: "h1",
          categoryId: null,
          subcategoryId: "s1",
          sellerId: "seller-1",
        },
      ],
      distanceKm: 0,
      skipDeliveryFee: true,
    });

    expect(breakdown.adminProductCommissionTotal).toBe(20);
    expect(breakdown.lineItems[0].appliedCommissionCategoryLevel).toBe("subcategory");
    expect(breakdown.lineItems[0].appliedCommissionValue).toBe(20);
  });

  it("resolves effective commission with bottom-up fallback order", () => {
    const result = resolveEffectiveCommissionForLineItem({
      addonProduct: {
        _id: "addon-1",
        applyCommission: true,
        adminCommissionType: "percentage",
        adminCommissionValue: 12,
      },
      productCategory: {
        _id: "prod-1",
        applyCommission: true,
        adminCommissionType: "percentage",
        adminCommissionValue: 10,
      },
      subcategory: {
        _id: "sub-1",
        applyCommission: true,
        adminCommissionType: "percentage",
        adminCommissionValue: 8,
      },
      shopCommission: {
        _id: "shop-1",
        applyCommission: true,
        adminCommissionType: "percentage",
        adminCommissionValue: 6,
      },
      cityCommission: {
        cityKey: "indore",
        applyCommission: true,
        adminCommissionType: "percentage",
        adminCommissionValue: 4,
      },
    });
    expect(result.level).toBe("addon");
    expect(result.categoryId).toBe("addon-1");
  });

  it("falls back to city when deeper levels are disabled or zero", () => {
    const result = resolveEffectiveCommissionForLineItem({
      addonProduct: {
        _id: "addon-1",
        applyCommission: true,
        enabled: false,
        adminCommissionValue: 15,
      },
      productCategory: {
        _id: "prod-1",
        applyCommission: true,
        adminCommissionValue: 0,
      },
      subcategory: {
        _id: "sub-1",
        applyCommission: false,
        adminCommissionValue: 7,
      },
      shopCommission: {
        _id: "shop-1",
        applyCommission: true,
        adminCommissionValue: 0,
      },
      cityCommission: {
        cityKey: "indore",
        cityName: "Indore",
        applyCommission: true,
        adminCommissionType: "percentage",
        adminCommissionValue: 3,
      },
    });
    expect(result.level).toBe("city");
    expect(result.cityKey).toBe("indore");
    expect(result.fallbackTrail.length).toBeGreaterThan(0);
  });

  it("supports handling fee strategies with category snapshots", () => {
    const categoryById = new Map([
      [
        "cat-1",
        {
          _id: "cat-1",
          name: "Fruits",
          handlingFeeType: "fixed",
          handlingFeeValue: 20,
        },
      ],
      [
        "cat-2",
        {
          _id: "cat-2",
          name: "Dairy",
          handlingFeeType: "fixed",
          handlingFeeValue: 10,
        },
      ],
    ]);

    const items = [
      { headerCategoryId: "cat-1", price: 120, quantity: 1 },
      { headerCategoryId: "cat-2", price: 50, quantity: 2 },
    ];

    const highest = calculateHandlingFee(items, {
      handlingFeeStrategy: "highest_category_fee",
      categoryById,
    });
    expect(highest.handlingFeeCharged).toBe(20);
    expect(highest.handlingCategoryUsed.categoryName).toBe("Fruits");

    const sum = calculateHandlingFee(items, {
      handlingFeeStrategy: "sum_of_category_fees",
      categoryById,
    });
    expect(sum.handlingFeeCharged).toBe(30);
  });

  it("falls back to legacy header-category finance fields", () => {
    const legacyCommission = calculateCategoryCommission(
      { price: 100, quantity: 1 },
      {
        adminCommissionType: "percentage",
        adminCommission: 20,
        adminCommissionValue: 0,
      },
    );
    expect(legacyCommission.adminCommission).toBe(20);

    const categoryById = new Map([
      [
        "cat-1",
        {
          _id: "cat-1",
          name: "Fruits",
          handlingFeeType: "fixed",
          handlingFees: 30,
          handlingFeeValue: 0,
        },
      ],
    ]);

    const items = [{ headerCategoryId: "cat-1", price: 50, quantity: 2 }];
    const breakdown = calculateHandlingFee(items, {
      handlingFeeStrategy: "highest_category_fee",
      categoryById,
    });

    expect(breakdown.handlingFeeCharged).toBe(30);
    expect(breakdown.handlingCategoryUsed.categoryName).toBe("Fruits");
  });

  it("calculates customer delivery fee for both distance and fixed modes", () => {
    const distanceBased = calculateCustomerDeliveryFee(2.2, {
      deliveryPricingMode: "distance_based",
      customerBaseDeliveryFee: 30,
      baseDistanceCapacityKm: 0.5,
      incrementalKmSurcharge: 10,
    });
    expect(distanceBased.roundedExtraKm).toBe(2);
    expect(distanceBased.deliveryFeeCharged).toBe(50);
    expect(distanceBased.distanceKmRounded).toBe(2.5);

    const fixed = calculateCustomerDeliveryFee(8, {
      deliveryPricingMode: "fixed_price",
      fixedDeliveryFee: 45,
    });
    expect(fixed.deliveryFeeCharged).toBe(45);
    expect(fixed.roundedExtraKm).toBe(0);
  });

  it("calculates rider payout independently from customer fee", () => {
    const payout = calculateRiderPayout(3.1, {
      deliveryPricingMode: "distance_based",
      riderBasePayout: 30,
      baseDistanceCapacityKm: 0.5,
      deliveryPartnerRatePerKm: 5,
    });

    expect(payout.riderPayoutBase).toBe(30);
    expect(payout.roundedExtraKm).toBe(3);
    expect(payout.riderPayoutDistance).toBe(15);
    expect(payout.riderPayoutTotal).toBe(45);
  });

  it("hydrates cart items from product catalog", async () => {
    mockProductFind.mockReturnValue(
      createQueryChain([
        {
          _id: "prod-1",
          name: "Apple",
          salePrice: 120,
          price: 125,
          status: "active",
          mainImage: "apple.jpg",
          headerId: "cat-1",
          sellerId: "seller-1",
        },
      ]),
    );

    const hydrated = await hydrateOrderItems([
      { product: "prod-1", quantity: 2, price: 0 },
    ]);

    expect(hydrated).toHaveLength(1);
    expect(hydrated[0].price).toBe(120);
    expect(hydrated[0].headerCategoryId).toBe("cat-1");
    expect(hydrated[0].sellerId).toBe("seller-1");
  });

  it("throws when multi-seller checkout is attempted", async () => {
    mockCategoryFind.mockReturnValue(createQueryChain([]));

    await expect(
      generateOrderPaymentBreakdown({
        preHydratedItems: [
          {
            productId: "p1",
            productName: "A",
            quantity: 1,
            price: 100,
            headerCategoryId: "c1",
            sellerId: "s1",
          },
          {
            productId: "p2",
            productName: "B",
            quantity: 1,
            price: 100,
            headerCategoryId: "c2",
            sellerId: "s2",
          },
        ],
        distanceKm: 1,
      }),
    ).rejects.toThrow("Multi-seller checkout is not supported");
  });

  it("generates full payment breakdown with snapshots", async () => {
    mockCategoryFind.mockReturnValue(
      createQueryChain([
        {
          _id: "sub-1",
          name: "Sub Fruits",
          type: "subcategory",
          applyCommission: true,
          adminCommissionType: "percentage",
          adminCommissionValue: 10,
          handlingFeeType: "fixed",
          handlingFeeValue: 20,
        },
      ]),
    );

    mockGetOrCreateFinanceSettings.mockResolvedValue({
      deliveryPricingMode: "distance_based",
      customerBaseDeliveryFee: 30,
      riderBasePayout: 30,
      baseDistanceCapacityKm: 0.5,
      incrementalKmSurcharge: 10,
      deliveryPartnerRatePerKm: 5,
      fixedDeliveryFee: 30,
      handlingFeeStrategy: "highest_category_fee",
      codEnabled: true,
      onlineEnabled: true,
    });

    const breakdown = await generateOrderPaymentBreakdown({
      preHydratedItems: [
        {
          productId: "prod-1",
          productName: "Apple",
          quantity: 2,
          price: 100,
          headerCategoryId: "cat-1",
          subcategoryId: "sub-1",
          sellerId: "seller-1",
        },
      ],
      distanceKm: 2.2,
      discountTotal: 15,
      taxTotal: 5,
    });

    // Product split — seller keeps the full 200 they priced the line at;
    // the 10% commission (20) is added on top, so the customer-facing
    // productSubtotal is 220, not 200.
    expect(breakdown.productSubtotal).toBe(220);
    expect(breakdown.adminProductCommissionTotal).toBe(20);
    expect(breakdown.sellerPayoutTotal).toBe(200);

    // Logistics split
    expect(breakdown.deliveryFeeCharged).toBe(50);
    expect(breakdown.handlingFeeCharged).toBe(20);
    expect(breakdown.riderPayoutTotal).toBe(40);
    expect(breakdown.platformLogisticsMargin).toBe(30);

    // Final totals
    expect(breakdown.grandTotal).toBe(280); // 220 + 50 + 20 - 15 + 5
    expect(breakdown.platformTotalEarning).toBe(50); // 20 + 30
    expect(breakdown.snapshots.deliverySettings.deliveryPricingMode).toBe(
      "distance_based",
    );
    expect(breakdown.snapshots.handlingFeeStrategy).toBe("highest_category_fee");
  });

  it("computes GST on the commission-inclusive customer-facing amount, not the seller's base price", async () => {
    mockCategoryFind.mockReturnValue(
      createQueryChain([
        {
          _id: "sub-2",
          name: "Sub Snacks",
          type: "subcategory",
          applyCommission: true,
          adminCommissionType: "percentage",
          adminCommissionValue: 20,
          gstSlab: 10,
        },
      ]),
    );

    mockGetOrCreateFinanceSettings.mockResolvedValue({
      deliveryPricingMode: "fixed_price",
      fixedDeliveryFee: 0,
      riderBasePayout: 0,
      handlingFeeStrategy: "highest_category_fee",
      codEnabled: true,
      onlineEnabled: true,
    });

    const breakdown = await generateOrderPaymentBreakdown({
      preHydratedItems: [
        {
          productId: "prod-2",
          productName: "Chips",
          quantity: 1,
          price: 100,
          headerCategoryId: "cat-1",
          subcategoryId: "sub-2",
          sellerId: "seller-1",
        },
      ],
      skipDeliveryFee: true,
    });

    // Seller price 100, 20% commission -> customer pays 120.
    expect(breakdown.sellerPayoutTotal).toBe(100);
    expect(breakdown.adminProductCommissionTotal).toBe(20);
    expect(breakdown.productSubtotal).toBe(120);
    // GST (10%) is charged on the 120 the customer pays, not the seller's 100.
    expect(breakdown.cgstTotal).toBe(6);
    expect(breakdown.sgstTotal).toBe(6);
  });

  it("applies the bulk order commission rate override on top of seller price", async () => {
    mockCategoryFind.mockReturnValue(
      createQueryChain([
        {
          _id: "sub-3",
          name: "Sub Bulk",
          type: "subcategory",
          applyCommission: true,
          adminCommissionType: "percentage",
          adminCommissionValue: 20,
        },
      ]),
    );

    mockGetOrCreateFinanceSettings.mockResolvedValue({
      deliveryPricingMode: "fixed_price",
      fixedDeliveryFee: 0,
      riderBasePayout: 0,
      handlingFeeStrategy: "highest_category_fee",
      codEnabled: true,
      onlineEnabled: true,
      bulkOrderValueThreshold: 0,
      bulkOrderQtyThreshold: 5,
      bulkOrderCommissionRate: 5,
    });

    const breakdown = await generateOrderPaymentBreakdown({
      preHydratedItems: [
        {
          productId: "prod-3",
          productName: "Rice Bag",
          quantity: 10,
          price: 100,
          headerCategoryId: "cat-1",
          subcategoryId: "sub-3",
          sellerId: "seller-1",
        },
      ],
      skipDeliveryFee: true,
    });

    // base = 100*10 = 1000; qty (10) >= bulkOrderQtyThreshold (5), so the
    // bulk override rate (5%) replaces the standard 20% rate. Seller still
    // keeps the full base amount; commission is still added on top.
    expect(breakdown.sellerPayoutTotal).toBe(1000);
    expect(breakdown.adminProductCommissionTotal).toBe(50);
    expect(breakdown.productSubtotal).toBe(1050);
  });

  it("resolveCommissionInclusiveLineTotals matches calculateCategoryCommission for an equivalent line", async () => {
    mockCategoryFind.mockReturnValue(
      createQueryChain([
        {
          _id: "sub-4",
          name: "Sub Coupon",
          type: "subcategory",
          applyCommission: true,
          adminCommissionType: "percentage",
          adminCommissionValue: 15,
        },
      ]),
    );

    const [resolvedItem] = await resolveCommissionInclusiveLineTotals([
      {
        productId: "prod-4",
        productName: "Bread",
        quantity: 2,
        price: 40,
        headerCategoryId: "cat-1",
        subcategoryId: "sub-4",
        sellerId: "seller-1",
        applyCommission: false,
        isAddonLine: false,
      },
    ]);

    // base = 40*2 = 80; 15% commission = 12; customer-facing total = 92 —
    // must match what generateOrderPaymentBreakdown would charge for the
    // same line under standard (non-bulk) commission.
    expect(resolvedItem.commissionInclusiveLineTotal).toBe(92);
  });

  it("blocks checkout when subscription seller has no active subscription", async () => {
    const storeId = "507f1f77bcf86cd799439011";
    mockStoreFindById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ _id: storeId, ownerId: "507f1f77bcf86cd799439012" }),
    });
    mockSellerFindById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439012",
        businessModel: "subscription",
        commissionConfig: { scope: "category" },
      }),
    });
    mockGetActiveSubscriptionForSeller.mockResolvedValue(null);

    await expect(
      generateOrderPaymentBreakdown({
        preHydratedItems: [
          {
            productId: "prod-1",
            productName: "Apple",
            quantity: 1,
            price: 100,
            headerCategoryId: "cat-1",
            sellerId: storeId,
          },
        ],
        distanceKm: 1,
      }),
    ).rejects.toThrow("Active subscription required for checkout");
  });
});
