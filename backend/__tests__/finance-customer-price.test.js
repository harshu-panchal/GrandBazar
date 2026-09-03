import { computeCustomerPriceForProduct } from "../app/services/finance/customerPriceService.js";

describe("computeCustomerPriceForProduct", () => {
  it("adds subcategory commission on top of price and salePrice", async () => {
    const categoryById = new Map([
      [
        "sub-1",
        {
          _id: "sub-1",
          applyCommission: true,
          adminCommissionType: "percentage",
          adminCommissionValue: 20,
        },
      ],
    ]);

    const result = await computeCustomerPriceForProduct(
      {
        _id: "prod-1",
        name: "Apple",
        price: 100,
        salePrice: 90,
        subcategoryId: "sub-1",
        applyCommission: false,
        variants: [],
      },
      { categoryById },
    );

    expect(result.customerPrice).toBe(120);
    expect(result.customerSalePrice).toBe(108);
  });

  it("treats an unset (zero) salePrice as null, not a computed 0", async () => {
    const categoryById = new Map();
    const result = await computeCustomerPriceForProduct(
      { _id: "prod-2", name: "Bread", price: 50, salePrice: 0, variants: [] },
      { categoryById },
    );
    expect(result.customerPrice).toBe(50);
    expect(result.customerSalePrice).toBeNull();
  });

  it("uses a variant's own commission override instead of the product's", async () => {
    const categoryById = new Map();
    const result = await computeCustomerPriceForProduct(
      {
        _id: "prod-3",
        name: "Shirt",
        price: 200,
        salePrice: 0,
        applyCommission: true,
        adminCommissionType: "percentage",
        adminCommissionValue: 10,
        variants: [
          {
            sku: "SHIRT-L",
            name: "Large",
            price: 220,
            salePrice: 0,
            applyCommission: true,
            adminCommissionType: "percentage",
            adminCommissionValue: 25,
          },
          {
            sku: "SHIRT-M",
            name: "Medium",
            price: 200,
            salePrice: 0,
            applyCommission: false,
          },
        ],
      },
      { categoryById },
    );

    // Product-level: 200 + 10% = 220.
    expect(result.customerPrice).toBe(220);
    // Variant with its own override: 220 + 25% = 275.
    expect(result.variantCustomerPrices.get("SHIRT-L").customerPrice).toBe(275);
    // Variant without an override falls back to the product's 10% config: 200 + 10% = 220.
    expect(result.variantCustomerPrices.get("SHIRT-M").customerPrice).toBe(220);
  });

  it("returns the raw price unchanged when no commission config applies anywhere", async () => {
    const result = await computeCustomerPriceForProduct(
      { _id: "prod-4", name: "Milk", price: 60, salePrice: 0, variants: [] },
      { categoryById: new Map() },
    );
    expect(result.customerPrice).toBe(60);
  });
});
