import { jest } from "@jest/globals";

const mockStoreFind = jest.fn();
const mockStoreFindOne = jest.fn();
const mockStoreCreate = jest.fn();
const mockSellerFindByIdAndUpdate = jest.fn();

jest.unstable_mockModule("../app/models/store.js", () => ({
  default: {
    find: mockStoreFind,
    findOne: mockStoreFindOne,
    create: mockStoreCreate,
  },
}));

jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: {
    findByIdAndUpdate: mockSellerFindByIdAndUpdate,
  },
}));

const mockLoadOwnerStores = jest.fn();

jest.unstable_mockModule("../app/services/storeService.js", () => ({
  buildStorePayloadFromBody: jest.fn(() => ({
    shopName: "Branch 2",
    applicationStatus: "pending",
    documents: { aadhar: "https://x.com/a.pdf", pan: "https://x.com/p.pdf", bankProof: "https://x.com/b.pdf" },
  })),
  getMissingRequiredSellerDocuments: jest.fn(() => []),
  generateSellerToken: jest.fn(() => "token"),
  isStoreApproved: jest.fn((store) => store?.applicationStatus === "approved"),
  isStoreApplicationApproved: jest.fn((store) => store?.applicationStatus === "approved"),
  loadOwnerStores: mockLoadOwnerStores,
  REQUIRED_SELLER_DOCUMENT_FIELDS: ["aadhar", "pan", "bankProof"],
  SELLER_DOCUMENT_FIELDS: {},
}));

jest.unstable_mockModule("../app/services/mediaService.js", () => ({
  uploadToCloudinary: jest.fn(),
}));

jest.unstable_mockModule("../app/services/entityNameCache.js", () => ({
  invalidateSellerName: jest.fn(),
}));

const { listOwnerStores, switchActiveStore } = await import("../app/controller/seller/storeController.js");

describe("storeController", () => {
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it("lists stores for owner account", async () => {
    mockLoadOwnerStores.mockResolvedValue([{ _id: "store-1", shopName: "Main" }]);

    const req = { user: { accountId: "account-1" } };
    await listOwnerStores(req, res);

    expect(mockLoadOwnerStores).toHaveBeenCalledWith("account-1");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects store switch for non-owner", async () => {
    const req = { user: { id: "store-1" }, body: { storeId: "store-2" } };
    await switchActiveStore(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("switches active store for owner", async () => {
    mockStoreFindOne.mockResolvedValue({ _id: "store-2", shopName: "Branch" });

    const req = {
      user: { accountId: "account-1", id: "store-1" },
      body: { storeId: "store-2" },
    };

    await switchActiveStore(req, res);

    expect(mockStoreFindOne).toHaveBeenCalledWith({ _id: "store-2", ownerId: "account-1" });
    expect(mockSellerFindByIdAndUpdate).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
