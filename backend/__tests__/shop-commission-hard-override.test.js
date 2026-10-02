// Shop-level commission is a hard override: when the admin has activated
// applyCommission on a store with a non-zero rate, that rate wins over
// every other level (product / addon / subcategory / city / category /
// header).
import { resolveEffectiveCommissionForLineItem } from "../app/services/finance/pricingService.js";

const shop = (value, extras = {}) => ({
  _id: "store1",
  shopName: "Test store",
  applyCommission: true,
  enabled: true,
  adminCommissionType: "percentage",
  adminCommissionValue: value,
  adminCommission: value,
  adminCommissionFixedRule: "per_qty",
  ...extras,
});

const category = (level, value, extras = {}) => ({
  _id: `${level}-1`,
  name: `${level} cat`,
  applyCommission: true,
  enabled: true,
  adminCommissionType: "percentage",
  adminCommissionValue: value,
  adminCommission: value,
  adminCommissionFixedRule: "per_qty",
  ...extras,
});

describe("Shop-level commission hard override", () => {
  test("wins over product commission", () => {
    const result = resolveEffectiveCommissionForLineItem({
      productCategory: category("product", 15),
      shopCommission: shop(7),
    });
    expect(result.level).toBe("shop");
    expect(result.category.adminCommissionValue).toBe(7);
  });

  test("wins over subcategory commission", () => {
    const result = resolveEffectiveCommissionForLineItem({
      subcategory: category("subcategory", 12),
      shopCommission: shop(4),
    });
    expect(result.level).toBe("shop");
    expect(result.category.adminCommissionValue).toBe(4);
  });

  test("wins over city commission", () => {
    const result = resolveEffectiveCommissionForLineItem({
      cityCommission: { ...category("city", 20), cityKey: "indore" },
      shopCommission: shop(5),
    });
    expect(result.level).toBe("shop");
  });

  test("wins over header/category defaults", () => {
    const result = resolveEffectiveCommissionForLineItem({
      headerCategory: category("header", 25),
      level2Category: category("category", 20),
      shopCommission: shop(3),
    });
    expect(result.level).toBe("shop");
    expect(result.category.adminCommissionValue).toBe(3);
  });

  test("wins over addon-level commission", () => {
    const result = resolveEffectiveCommissionForLineItem({
      addonProduct: category("addon", 30),
      shopCommission: shop(6),
    });
    expect(result.level).toBe("shop");
    expect(result.category.adminCommissionValue).toBe(6);
  });

  test("does NOT override when shop applyCommission is false", () => {
    const result = resolveEffectiveCommissionForLineItem({
      productCategory: category("product", 15),
      shopCommission: shop(7, { applyCommission: false }),
    });
    expect(result.level).toBe("product");
    expect(result.category.adminCommissionValue).toBe(15);
  });

  test("does NOT override when shop rate is zero", () => {
    const result = resolveEffectiveCommissionForLineItem({
      productCategory: category("product", 15),
      shopCommission: shop(0),
    });
    expect(result.level).toBe("product");
  });

  test("does NOT override when shop is disabled", () => {
    const result = resolveEffectiveCommissionForLineItem({
      productCategory: category("product", 15),
      shopCommission: shop(7, { enabled: false }),
    });
    expect(result.level).toBe("product");
  });

  test("falls back to product when no shop commission provided", () => {
    const result = resolveEffectiveCommissionForLineItem({
      productCategory: category("product", 10),
    });
    expect(result.level).toBe("product");
  });

  test("shop override reports a hard_override reason in fallbackTrail", () => {
    const result = resolveEffectiveCommissionForLineItem({
      productCategory: category("product", 15),
      shopCommission: shop(7),
    });
    expect(result.fallbackTrail).toEqual([{ level: "shop", reason: "hard_override" }]);
  });
});
