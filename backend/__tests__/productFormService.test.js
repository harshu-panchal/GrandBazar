import {
  catalogFieldsForProduct,
  normalizeProductFormPayload,
  stripAdminOnlyProductFields,
  validateProductFormPayload,
} from "../app/services/productFormService.js";

describe("product form v2 contract", () => {
  it("normalizes multipart legal/search/variant fields and preserves tax-exclusive pricing", () => {
    const result = normalizeProductFormPayload({
      tags: '["rice","premium"]',
      searchSynonyms: "chawal, chaula",
      legal: JSON.stringify({ allergens: "milk,nuts", inheritStoreFssai: "false" }),
      variants: JSON.stringify([{ name: "5 kg", price: "500", stock: "7", barcode: "123" }]),
      isTaxInclusive: "true",
    });

    expect(result.tags).toEqual(["rice", "premium"]);
    expect(result.searchSynonyms).toEqual(["chawal", "chaula"]);
    expect(result.legal.allergens).toEqual(["milk", "nuts"]);
    expect(result.legal.inheritStoreFssai).toBe(false);
    expect(result.variants[0]).toEqual(expect.objectContaining({ price: 500, stock: 7, barcode: "123" }));
    expect(result.isTaxInclusive).toBe(false);
  });

  it("copies every legal/search/tax canonical field into a claimed seller snapshot", () => {
    const fields = catalogFieldsForProduct({
      name: "Rice",
      alternativeNames: ["Chawal"],
      hsnCode: "1006",
      gstStatus: "taxable",
      gstSlabOverride: 5,
      legal: { countryOfOrigin: "India", expiryDate: "2030-01-01" },
      deliveryOptions: { mode: "override", customerPickup: true },
    });

    expect(fields.searchSynonyms).toEqual(["Chawal"]);
    expect(fields).toEqual(expect.objectContaining({ hsnCode: "1006", gstStatus: "taxable", gstSlabOverride: 5 }));
    expect(fields.legal.countryOfOrigin).toBe("India");
    expect(fields.expiryDate).toBe("2030-01-01");
    expect(fields.deliveryOptions.mode).toBe("override");
  });

  it("allows incomplete drafts but blocks incomplete publish payloads", () => {
    expect(validateProductFormPayload({ name: "Draft" }, { draft: true })).toEqual({});
    const errors = validateProductFormPayload({ name: "Publish" }, { draft: false });
    expect(errors).toEqual(expect.objectContaining({ description: expect.any(String), headerId: expect.any(String), hsnCode: expect.any(String) }));
  });

  it("removes admin-controlled merchandising and commission fields from seller payloads", () => {
    const payload = stripAdminOnlyProductFields({ name: "Item", isFeatured: true, marketingFlag: "hot_deal", adminCommissionValue: 30 });
    expect(payload).toEqual({ name: "Item" });
  });
});
