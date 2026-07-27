import { buildSlugAndId, parseSlugAndId } from "../app/utils/seoUrl.js";
import { slugify } from "../app/utils/slugify.js";

describe("SEO URL utilities", () => {
  test("buildSlugAndId joins slug and object id", () => {
    const value = buildSlugAndId("fresh-mango", "507f1f77bcf86cd799439011");
    expect(value).toBe("fresh-mango-507f1f77bcf86cd799439011");
  });

  test("parseSlugAndId parses canonical segment", () => {
    const parsed = parseSlugAndId("fresh-mango-507f1f77bcf86cd799439011");
    expect(parsed.valid).toBe(true);
    expect(parsed.slug).toBe("fresh-mango");
    expect(parsed.id).toBe("507f1f77bcf86cd799439011");
  });

  test("parseSlugAndId rejects invalid values", () => {
    expect(parseSlugAndId("invalid-format").valid).toBe(false);
    expect(parseSlugAndId("").valid).toBe(false);
  });

  test("slugify normalizes symbols and spacing", () => {
    expect(slugify("  Fresh & Fruits  ")).toBe("fresh-and-fruits");
    expect(slugify("Cafe' Test")).toBe("cafe-test");
  });
});
