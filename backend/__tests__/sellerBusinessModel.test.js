import { jest } from "@jest/globals";
import {
  resolveSellerCommissionConfig,
  BUSINESS_MODEL,
  COMMISSION_SCOPE,
  buildSellerCommissionSummary,
} from "../app/services/sellerBusinessModelService.js";
import { calculateCategoryCommission } from "../app/services/finance/pricingService.js";

describe("sellerBusinessModelService", () => {
  const category = {
    adminCommissionType: "percentage",
    adminCommissionValue: 10,
  };

  it("returns zero commission for subscription sellers", () => {
    const seller = { businessModel: BUSINESS_MODEL.SUBSCRIPTION };
    const { config, source } = resolveSellerCommissionConfig(seller, "cat1", category);
    const result = calculateCategoryCommission({ price: 100, quantity: 1 }, config);
    expect(source).toBe("subscription");
    expect(result.adminCommission).toBe(0);
    expect(result.sellerPayout).toBe(100);
  });

  it("uses category commission when scope is category", () => {
    const seller = {
      businessModel: BUSINESS_MODEL.COMMISSION,
      commissionConfig: { scope: COMMISSION_SCOPE.CATEGORY },
    };
    const { config, source } = resolveSellerCommissionConfig(seller, "cat1", category);
    const result = calculateCategoryCommission({ price: 100, quantity: 1 }, config);
    expect(source).toBe("category");
    expect(result.adminCommission).toBe(10);
    expect(result.sellerPayout).toBe(90);
  });

  it("uses seller-wise commission when scope is seller", () => {
    const seller = {
      businessModel: BUSINESS_MODEL.COMMISSION,
      commissionConfig: {
        scope: COMMISSION_SCOPE.SELLER,
        type: "percentage",
        value: 15,
        fixedRule: "per_qty",
      },
    };
    const { config, source } = resolveSellerCommissionConfig(seller, "cat1", category);
    const result = calculateCategoryCommission({ price: 100, quantity: 1 }, config);
    expect(source).toBe("seller");
    expect(result.adminCommission).toBe(15);
    expect(result.sellerPayout).toBe(85);
  });

  it("returns null config when business model not chosen", () => {
    const { config, source } = resolveSellerCommissionConfig({ businessModel: null }, "cat1", category);
    expect(config).toBeNull();
    expect(source).toBe("none");
  });
});

describe("buildSellerCommissionSummary", () => {
  it("returns seller-wise summary for commission sellers", async () => {
    const summary = await buildSellerCommissionSummary({
      businessModel: BUSINESS_MODEL.COMMISSION,
      commissionConfig: {
        scope: COMMISSION_SCOPE.SELLER,
        type: "percentage",
        value: 12,
      },
    });
    expect(summary.scope).toBe(COMMISSION_SCOPE.SELLER);
    expect(summary.label).toBe("12%");
  });

  it("returns null for subscription sellers", async () => {
    const summary = await buildSellerCommissionSummary({
      businessModel: BUSINESS_MODEL.SUBSCRIPTION,
    });
    expect(summary).toBeNull();
  });
});

describe("subscriptionService request type resolution", () => {
  it("resolves upgrade when selected plan is higher tier", async () => {
    const { resolveSubscriptionRequestType } = await import("../app/services/subscriptionService.js");
    const { PAYMENT_REQUEST_TYPE } = await import("../app/constants/subscription.js");

    const type = resolveSubscriptionRequestType({
      activeSubscription: {
        planSnapshot: { price: 999, sortOrder: 1 },
      },
      selectedPlan: { price: 2499, sortOrder: 2 },
      explicitType: PAYMENT_REQUEST_TYPE.NEW,
    });
    expect(type).toBe(PAYMENT_REQUEST_TYPE.UPGRADE);
  });
});
