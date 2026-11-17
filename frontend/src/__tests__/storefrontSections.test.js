import { describe, expect, test } from "@jest/globals";
import { resolveStorefrontSections } from "../shared/utils/storefrontSections.js";

describe("resolveStorefrontSections", () => {
  test("keeps manual order and adds only unassigned products to All Products", () => {
    const products = [
      { _id: "a", name: "A" },
      { _id: "b", name: "B" },
      { _id: "c", name: "C" },
    ];
    const result = resolveStorefrontSections(
      [{ _id: "section", title: "Picks", layout: "grid", productIds: ["b", "a"] }],
      products,
    );

    expect(result[0].products.map((product) => product._id)).toEqual(["b", "a"]);
    expect(result[1].title).toBe("All Products");
    expect(result[1].products.map((product) => product._id)).toEqual(["c"]);
  });

  test("allows the same product in multiple custom sections without adding it to All Products", () => {
    const products = [{ _id: "a", name: "A" }];
    const result = resolveStorefrontSections(
      [
        { _id: "one", title: "One", layout: "grid", productIds: ["a"] },
        { _id: "two", title: "Two", layout: "carousel", productIds: ["a"] },
      ],
      products,
    );

    expect(result).toHaveLength(2);
    expect(result.every((section) => section.products[0]._id === "a")).toBe(true);
  });
});
