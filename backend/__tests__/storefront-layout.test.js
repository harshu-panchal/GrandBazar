import { jest } from "@jest/globals";
import mongoose from "mongoose";

jest.unstable_mockModule("../app/services/auditTrailService.js", () => ({
  recordAuditLog: jest.fn(),
}));

const { normalizeStorefrontSections } = await import(
  "../app/controller/storefrontLayoutController.js"
);
const { getApprovedOrLegacyFilter, getCustomerVisibleProductFilter } = await import(
  "../app/services/productModerationService.js"
);

describe("storefront layout section validation", () => {
  const first = new mongoose.Types.ObjectId().toString();
  const second = new mongoose.Types.ObjectId().toString();
  const foreign = new mongoose.Types.ObjectId().toString();

  test("uses the customer catalog eligibility filter for storefront product choices", () => {
    expect(getCustomerVisibleProductFilter()).toEqual({
      $and: [
        {
          status: "active",
          isPublished: { $ne: false },
          isCurrentlyAvailable: { $ne: false },
          isHidden: { $ne: true },
        },
        {
          $or: [
            { stock: { $gt: 0 } },
            { "variants.stock": { $gt: 0 } },
          ],
        },
        getApprovedOrLegacyFilter(),
      ],
    });
  });

  test("preserves section and product order while allowing a product in multiple sections", () => {
    const sections = normalizeStorefrontSections(
      [
        { title: "Top picks", layout: "carousel", productIds: [second, first] },
        { title: "Quick list", layout: "compact_list", productIds: [first] },
      ],
      [first, second],
    );

    expect(sections.map((section) => section.title)).toEqual(["Top picks", "Quick list"]);
    expect(sections[0].productIds).toEqual([second, first]);
    expect(sections[1].productIds).toEqual([first]);
  });

  test("deduplicates a product only within the same section", () => {
    const [section] = normalizeStorefrontSections(
      [{ title: "Grid", layout: "grid", productIds: [first, first, second] }],
      [first, second],
    );
    expect(section.productIds).toEqual([first, second]);
  });

  test("rejects products that do not belong to the store", () => {
    expect(() =>
      normalizeStorefrontSections(
        [{ title: "Grid", layout: "grid", productIds: [foreign] }],
        [first, second],
      ),
    ).toThrow("outside this store");
  });

  test("preserves multiple products in the large featured layout", () => {
    const [section] = normalizeStorefrontSections(
      [{ title: "Featured", layout: "featured", productIds: [second, first] }],
      [first, second],
    );

    expect(section.productIds).toEqual([second, first]);
  });
});
