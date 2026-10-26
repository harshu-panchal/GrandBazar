import { effectiveUnitPrice } from "../app/utils/money.js";

describe("effectiveUnitPrice", () => {
  it("uses the sale price when it is a genuine discount", () => {
    expect(effectiveUnitPrice({ price: 100, salePrice: 80 })).toBe(80);
  });

  it("ignores a sale price above the base price", () => {
    // The Chomchom case: base 80 with a mis-entered sale price of 100 used to
    // bill the customer 100 while the cart showed 80.
    expect(effectiveUnitPrice({ price: 80, salePrice: 100 })).toBe(80);
  });

  it("ignores a sale price equal to the base price", () => {
    expect(effectiveUnitPrice({ price: 100, salePrice: 100 })).toBe(100);
  });

  it("falls back to the base price when there is no sale price", () => {
    expect(effectiveUnitPrice({ price: 100, salePrice: 0 })).toBe(100);
    expect(effectiveUnitPrice({ price: 100 })).toBe(100);
  });

  it("treats missing or invalid input as zero", () => {
    expect(effectiveUnitPrice({})).toBe(0);
    expect(effectiveUnitPrice()).toBe(0);
  });
});
