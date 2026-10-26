import { jest } from "@jest/globals";
import {
  resolveStoreCommissionConfig,
  BUSINESS_MODEL,
  COMMISSION_SCOPE,
  buildStoreCommissionSummary,
} from "../app/services/sellerBusinessModelService.js";
import { calculateCategoryCommission } from "../app/services/finance/pricingService.js";

// Business model lives on the STORE now (not the seller account) — see
// models/store.js. These functions take a store-shaped object.
describe("sellerBusinessModelService", () => {
  const category = {
    adminCommissionType: "percentage",
    adminCommissionValue: 10,
  };

  it("returns zero commission for subscription stores", () => {
    const store = { businessModel: BUSINESS_MODEL.SUBSCRIPTION };
    const { config, source } = resolveStoreCommissionConfig(store, "cat1", category);
    const result = calculateCategoryCommission({ price: 100, quantity: 1 }, config);
    expect(source).toBe("subscription");
    expect(result.adminCommission).toBe(0);
    expect(result.sellerPayout).toBe(100);
  });

  it("uses category commission when scope is category", () => {
    const store = {
      businessModel: BUSINESS_MODEL.COMMISSION,
      commissionConfig: { scope: COMMISSION_SCOPE.CATEGORY },
    };
    const { config, source } = resolveStoreCommissionConfig(store, "cat1", category);
    const result = calculateCategoryCommission({ price: 100, quantity: 1 }, config);
    expect(source).toBe("category");
    expect(result.adminCommission).toBe(10);
    expect(result.sellerPayout).toBe(90);
  });

  it("uses seller-wise commission when scope is seller", () => {
    const store = {
      businessModel: BUSINESS_MODEL.COMMISSION,
      commissionConfig: {
        scope: COMMISSION_SCOPE.SELLER,
        type: "percentage",
        value: 15,
        fixedRule: "per_qty",
      },
    };
    const { config, source } = resolveStoreCommissionConfig(store, "cat1", category);
    const result = calculateCategoryCommission({ price: 100, quantity: 1 }, config);
    expect(source).toBe("seller");
    expect(result.adminCommission).toBe(15);
    expect(result.sellerPayout).toBe(85);
  });

  it("returns null config when business model not chosen", () => {
    const { config, source } = resolveStoreCommissionConfig({ businessModel: null }, "cat1", category);
    expect(config).toBeNull();
    expect(source).toBe("none");
  });

  it("two stores under the same seller can resolve independently", () => {
    const commissionStore = { businessModel: BUSINESS_MODEL.COMMISSION, commissionConfig: { scope: COMMISSION_SCOPE.CATEGORY } };
    const subscriptionStore = { businessModel: BUSINESS_MODEL.SUBSCRIPTION };
    expect(resolveStoreCommissionConfig(commissionStore, "cat1", category).source).toBe("category");
    expect(resolveStoreCommissionConfig(subscriptionStore, "cat1", category).source).toBe("subscription");
  });
});

describe("buildStoreCommissionSummary", () => {
  it("returns seller-wise summary for commission stores", async () => {
    const summary = await buildStoreCommissionSummary({
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

  it("returns null for subscription stores", async () => {
    const summary = await buildStoreCommissionSummary({
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
