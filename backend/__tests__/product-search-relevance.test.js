import { jest } from "@jest/globals";

// TC-CAT-001 regression test: keyword search used to sort purely by recency
// (or price), so a description-only match ranked identically to an exact
// name match. getProducts now ranks by relevance (name exact/prefix/contains
// > brand > tags > description) whenever no explicit non-relevance sort is
// requested, and escapes the search term before building regexes (closing a
// latent regex-injection crash).
//
// Uses an admin-role request context deliberately, to exercise the shared
// relevance-ranking logic in `fetchFn` without pulling in the unrelated
// customer-visibility/location/caching machinery that only applies to
// customer-role requests.

const mockProductFind = jest.fn();
const mockProductCountDocuments = jest.fn();
const mockCategoryFind = jest.fn();

jest.unstable_mockModule("../app/models/product.js", () => ({
  default: { find: mockProductFind, countDocuments: mockProductCountDocuments },
}));
jest.unstable_mockModule("../app/models/category.js", () => ({
  default: { find: mockCategoryFind },
}));
jest.unstable_mockModule("../app/services/customerVisibilityService.js", () => ({
  parseCustomerCoordinates: jest.fn(() => ({ valid: false })),
  getNearbySellerIdsForCustomer: jest.fn(),
  getNearbySellersWithDistanceForCustomer: jest.fn(),
}));
jest.unstable_mockModule("../app/services/searchSyncService.js", () => ({
  enqueueProductIndex: jest.fn(),
  enqueueProductRemoval: jest.fn(),
}));
jest.unstable_mockModule("../app/services/cacheService.js", () => ({
  buildKey: jest.fn(() => "key"),
  getOrSet: jest.fn((key, fn) => fn()),
  getTTL: jest.fn(() => 60),
  invalidate: jest.fn(),
}));
jest.unstable_mockModule("../app/services/mediaService.js", () => ({
  uploadToCloudinary: jest.fn(),
}));
jest.unstable_mockModule("../app/services/entityNameCache.js", () => ({
  resolveCategoryName: jest.fn(async () => null),
  resolveSellerName: jest.fn(async () => null),
}));
jest.unstable_mockModule("../app/services/finance/customerPriceService.js", () => ({
  computeCustomerPriceFieldsForWrite: jest.fn(),
  PRICE_AFFECTING_FIELDS: [],
}));
jest.unstable_mockModule("../app/services/productModerationService.js", () => ({
  PRODUCT_APPROVAL_STATUS: { APPROVED: "approved" },
  getProductApprovalConfig: jest.fn(),
  getApprovedOrLegacyFilter: jest.fn(() => ({})),
  buildApprovalStatusFilter: jest.fn(() => ({})),
  normalizeProductModerationFields: jest.fn((x) => x),
  sanitizeApprovalNote: jest.fn((x) => x),
  resolveProductApprovalStatus: jest.fn(),
}));
jest.unstable_mockModule("../app/services/preOrderCampaignService.js", () => ({
  attachAdvanceBookingMetaToProducts: jest.fn(async (items) => items),
}));
jest.unstable_mockModule("../app/services/searchTrendingService.js", () => ({
  logSearchQuery: jest.fn(),
  getTrendingSearches: jest.fn(),
}));
jest.unstable_mockModule("../app/services/trendingProductsService.js", () => ({
  getTrendingProducts: jest.fn(),
}));
jest.unstable_mockModule("../app/services/productAddonService.js", () => ({
  resolveProductAddons: jest.fn(),
  getProductAddonMappings: jest.fn(),
  syncProductAddonMappings: jest.fn(),
  getSuggestedAddons: jest.fn(),
}));
jest.unstable_mockModule("../app/services/auditTrailService.js", () => ({
  recordAuditLog: jest.fn(),
}));
jest.unstable_mockModule("../app/services/deliveryEtaService.js", () => ({
  getDeliveryEtaSettings: jest.fn(),
  computeEtaFromDistance: jest.fn(),
}));
jest.unstable_mockModule("../app/services/subscriptionService.js", () => ({
  assertCanCreateFreeTierProduct: jest.fn(),
}));

const { getProducts } = await import("../app/controller/productController.js");

function makeReqRes({ query, user = { role: "admin" } }) {
  const req = { query, user };
  const res = {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  return { req, res };
}

function selectSortSkipLimitLean(result) {
  return {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

describe("getProducts relevance ranking (TC-CAT-001)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCategoryFind.mockReturnValue({ select: jest.fn().mockResolvedValue([]) });
  });

  it("ranks an exact/prefix name match above a description-only match for the same keyword", async () => {
    const nameMatch = {
      _id: "p-name",
      name: "Apple",
      brand: "",
      tags: [],
      description: "Fresh red fruit",
      createdAt: new Date("2026-01-01"),
    };
    const descMatch = {
      _id: "p-desc",
      name: "Fruit Juice",
      brand: "",
      tags: [],
      description: "Made with real apple extract",
      createdAt: new Date("2026-01-05"), // newer, so a recency sort would rank this first
    };

    // First Product.find call = the lightweight scoring pass (all matches, no pagination).
    // Second Product.find call = the full-field fetch for just the current page's ids.
    mockProductFind
      .mockReturnValueOnce(selectSortSkipLimitLean([descMatch, nameMatch]))
      .mockReturnValueOnce(selectSortSkipLimitLean([nameMatch, descMatch]));

    const { req, res } = makeReqRes({ query: { search: "apple" } });
    await getProducts(req, res);

    expect(res.statusCode).toBe(200);
    const ids = res.payload.result.items.map((i) => i._id);
    expect(ids).toEqual(["p-name", "p-desc"]);
    expect(res.payload.result.total).toBe(2);
  });

  it("does not apply relevance ranking when an explicit non-relevance sort is requested", async () => {
    mockProductFind.mockReturnValue(selectSortSkipLimitLean([]));
    mockProductCountDocuments.mockResolvedValue(0);

    const { req, res } = makeReqRes({ query: { search: "apple", sort: "price-asc" } });
    await getProducts(req, res);

    expect(res.statusCode).toBe(200);
    // Falls back to the plain find/sort/skip/limit path (countDocuments is
    // only used on that path, never in the relevance branch).
    expect(mockProductCountDocuments).toHaveBeenCalled();
  });

  it("does not crash on a search term containing regex-special characters", async () => {
    mockProductFind
      .mockReturnValueOnce(selectSortSkipLimitLean([]))
      .mockReturnValueOnce(selectSortSkipLimitLean([]));

    const { req, res } = makeReqRes({ query: { search: "a+b(c[d" } });
    await getProducts(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.result.items).toEqual([]);
  });
});
