import { jest } from "@jest/globals";

// Business model moved from the Seller (owner) account to the Store (see
// models/store.js). resolveStoreIdFromSellerOrStoreId replaces the old
// resolveOwnerIdFromSellerOrStoreId — admin links may still carry either a
// Store id (resolved as-is) or a legacy Seller/owner id (resolved to that
// owner's single store, when unambiguous).

const mockSellerFindById = jest.fn();
const mockStoreFindById = jest.fn();
const mockStoreFind = jest.fn();
const mockHandleResponse = jest.fn();

jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: { findById: mockSellerFindById },
}));
jest.unstable_mockModule("../app/models/store.js", () => ({
  default: { findById: mockStoreFindById, find: mockStoreFind },
}));
jest.unstable_mockModule("../app/models/category.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/services/finance/pricingService.js", () => ({
  calculateCategoryCommission: jest.fn(),
}));
jest.unstable_mockModule("../app/services/subscriptionService.js", () => ({
  getActiveSubscriptionForStore: jest.fn(),
}));
jest.unstable_mockModule("../app/utils/helper.js", () => ({
  default: mockHandleResponse,
  handleResponse: mockHandleResponse,
}));

const { resolveStoreIdFromSellerOrStoreId } = await import("../app/services/sellerBusinessModelService.js");
const { getAdminSellerBusinessModel } = await import("../app/controller/admin/sellerBusinessModelController.js");

const STORE_ID = "6aad0d99aaa6ab398066967b";
const STORE2_ID = "6aad0d99aaa6ab398066967c";
const OWNER_ID = "6aad0caaaaa6ab3980669593";
const MULTI_OWNER_ID = "6aad0caaaaa6ab3980669594";

// Store.findById(id).select().lean() ; Store.findById(id) as a plain hydrated
// doc (for getAdminSellerBusinessModel's own query, which has no .select()).
const storeByIdLookup = (map) => (id) => {
  const doc = map[String(id)] || null;
  const thenable = Promise.resolve(doc);
  thenable.select = () => ({ lean: async () => doc });
  return thenable;
};
const sellerLookup = (map) => (id) => ({
  select: () => ({ lean: async () => map[String(id)] || null }),
});
const storeFindLookup = (byOwner) => (query) => ({
  select: () => ({
    limit: () => ({ lean: async () => byOwner[String(query.ownerId)] || [] }),
  }),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreFindById.mockImplementation(
    storeByIdLookup({
      [STORE_ID]: { _id: STORE_ID, ownerId: OWNER_ID, shopName: "Trisha's Shop", businessModel: "commission" },
    }),
  );
  mockSellerFindById.mockImplementation(
    sellerLookup({
      [OWNER_ID]: { _id: OWNER_ID, accountType: "owner" },
      [MULTI_OWNER_ID]: { _id: MULTI_OWNER_ID, accountType: "owner" },
    }),
  );
  mockStoreFind.mockImplementation(
    storeFindLookup({
      [OWNER_ID]: [{ _id: STORE_ID }],
      [MULTI_OWNER_ID]: [{ _id: STORE_ID }, { _id: STORE2_ID }],
    }),
  );
});

describe("resolveStoreIdFromSellerOrStoreId", () => {
  test("a store id resolves to itself", async () => {
    expect(String(await resolveStoreIdFromSellerOrStoreId(STORE_ID))).toBe(STORE_ID);
  });

  test("a legacy owner id with exactly one store resolves to that store", async () => {
    expect(String(await resolveStoreIdFromSellerOrStoreId(OWNER_ID))).toBe(STORE_ID);
  });

  test("a legacy owner id with multiple stores is ambiguous -> null", async () => {
    expect(await resolveStoreIdFromSellerOrStoreId(MULTI_OWNER_ID)).toBeNull();
  });

  test("unknown or malformed ids resolve to null", async () => {
    expect(await resolveStoreIdFromSellerOrStoreId("6aad0000aaa6ab3980660000")).toBeNull();
    expect(await resolveStoreIdFromSellerOrStoreId("not-an-id")).toBeNull();
    expect(await resolveStoreIdFromSellerOrStoreId("")).toBeNull();
  });
});

describe("admin business-model endpoint addressed by store id or legacy owner id", () => {
  test("a store id returns that store's business model", async () => {
    await getAdminSellerBusinessModel({ params: { id: STORE_ID } }, {});
    const [, status, message] = mockHandleResponse.mock.calls.at(-1);
    expect(status).toBe(200);
    expect(message).not.toMatch(/not found/i);
  });

  test("a legacy owner id with one store resolves instead of 404ing", async () => {
    await getAdminSellerBusinessModel({ params: { id: OWNER_ID } }, {});
    const [, status] = mockHandleResponse.mock.calls.at(-1);
    expect(status).toBe(200);
  });

  test("still 404s for an id that matches neither a store nor an owner", async () => {
    await getAdminSellerBusinessModel({ params: { id: "6aad0000aaa6ab3980660000" } }, {});
    expect(mockHandleResponse.mock.calls.at(-1)[1]).toBe(404);
  });
});
