import { jest } from "@jest/globals";

const mockSellerFindById = jest.fn();
const mockStoreFindById = jest.fn();
const mockHandleResponse = jest.fn();

jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: { findById: mockSellerFindById },
}));
jest.unstable_mockModule("../app/models/store.js", () => ({
  default: { findById: mockStoreFindById },
}));
jest.unstable_mockModule("../app/models/category.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/services/finance/pricingService.js", () => ({
  calculateCategoryCommission: jest.fn(),
}));
jest.unstable_mockModule("../app/services/subscriptionService.js", () => ({
  getActiveSubscriptionForSeller: jest.fn(),
}));
jest.unstable_mockModule("../app/utils/helper.js", () => ({
  default: mockHandleResponse,
  handleResponse: mockHandleResponse,
}));

const { resolveOwnerIdFromSellerOrStoreId } = await import("../app/services/sellerBusinessModelService.js");
const { getAdminSellerBusinessModel } = await import("../app/controller/admin/sellerBusinessModelController.js");

const STORE_ID = "6aad0d99aaa6ab398066967b";
const OWNER_ID = "6aad0caaaaa6ab3980669593";

// Seller.findById(...).select(...).lean()  and  Seller.findById(...) (a plain awaited doc)
const sellerLookup = (map) => (id) => {
  const doc = map[String(id)] || null;
  const thenable = Promise.resolve(doc);
  thenable.select = () => ({ lean: async () => doc });
  return thenable;
};
const storeLookup = (map) => (id) => ({
  select: () => ({ lean: async () => map[String(id)] || null }),
});

beforeEach(() => {
  jest.clearAllMocks();
  // Owners are Seller docs; the shop is a Store whose _id is NOT the owner's id.
  mockSellerFindById.mockImplementation(
    sellerLookup({ [OWNER_ID]: { _id: OWNER_ID, accountType: "owner", name: "Trisha", email: "t@x.com" } }),
  );
  mockStoreFindById.mockImplementation(storeLookup({ [STORE_ID]: { ownerId: OWNER_ID } }));
});

describe("resolveOwnerIdFromSellerOrStoreId", () => {
  test("a store id resolves to its owner (the bug: this used to return null)", async () => {
    expect(String(await resolveOwnerIdFromSellerOrStoreId(STORE_ID))).toBe(OWNER_ID);
  });

  test("an owner's own id resolves to itself", async () => {
    expect(String(await resolveOwnerIdFromSellerOrStoreId(OWNER_ID))).toBe(OWNER_ID);
  });

  test("unknown or malformed ids resolve to null", async () => {
    expect(await resolveOwnerIdFromSellerOrStoreId("6aad0000aaa6ab3980660000")).toBeNull();
    expect(await resolveOwnerIdFromSellerOrStoreId("not-an-id")).toBeNull();
    expect(await resolveOwnerIdFromSellerOrStoreId("")).toBeNull();
  });
});

describe("admin business-model endpoint addressed by store id", () => {
  test("returns the owner's business model instead of 404 'Seller owner not found'", async () => {
    await getAdminSellerBusinessModel({ params: { id: STORE_ID } }, {});
    const [, status, message] = mockHandleResponse.mock.calls.at(-1);
    expect(status).toBe(200);
    expect(message).not.toMatch(/not found/i);
  });

  test("still 404s for an id that matches neither a seller nor a store", async () => {
    await getAdminSellerBusinessModel({ params: { id: "6aad0000aaa6ab3980660000" } }, {});
    expect(mockHandleResponse.mock.calls.at(-1)[1]).toBe(404);
  });
});
