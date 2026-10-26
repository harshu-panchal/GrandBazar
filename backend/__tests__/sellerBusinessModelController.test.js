import { jest } from "@jest/globals";

// Business model is chosen per STORE now — chooseSellerBusinessModel resolves
// req.params.storeId (verified to belong to req.user.accountId) instead of
// an implicit account-level seller doc.

const mockStoreFindOne = jest.fn();
const mockSellerFindById = jest.fn();

jest.unstable_mockModule("../app/models/store.js", () => ({
  default: { findOne: mockStoreFindOne },
}));
jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: { findById: mockSellerFindById },
}));

jest.unstable_mockModule("../app/services/sellerAccountService.js", () => ({
  isOwnerAccountApproved: jest.fn(() => true),
}));

jest.unstable_mockModule("../app/services/sellerBusinessModelService.js", () => ({
  BUSINESS_MODEL: { COMMISSION: "commission", SUBSCRIPTION: "subscription" },
  COMMISSION_SCOPE: { CATEGORY: "category", SELLER: "seller" },
  formatBusinessModelPayload: (store) => ({
    storeId: store._id,
    businessModel: store.businessModel,
    businessModelChosenAt: store.businessModelChosenAt,
  }),
  previewCommissionForStore: jest.fn().mockResolvedValue(null),
  buildStoreCommissionSummary: jest.fn().mockResolvedValue(null),
}));

describe("chooseSellerBusinessModel subscription branch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads the owned store before saving subscription model", async () => {
    const save = jest.fn();
    mockStoreFindOne.mockResolvedValue({
      _id: "store1",
      ownerId: "seller1",
      businessModel: null,
      businessModelChosenAt: null,
      save,
    });
    mockSellerFindById.mockReturnValue({
      select: () => ({ lean: async () => ({ applicationStatus: "approved", isVerified: true }) }),
    });

    const { chooseSellerBusinessModel } = await import("../app/controller/seller/businessModelController.js");
    const req = {
      user: { accountId: "seller1" },
      params: { storeId: "store1" },
      body: { businessModel: "subscription" },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await chooseSellerBusinessModel(req, res);

    expect(mockStoreFindOne).toHaveBeenCalledWith({ _id: "store1", ownerId: "seller1" });
    expect(save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects when the store does not belong to the caller", async () => {
    mockStoreFindOne.mockResolvedValue(null);

    const { chooseSellerBusinessModel } = await import("../app/controller/seller/businessModelController.js");
    const req = {
      user: { accountId: "someone-else" },
      params: { storeId: "store1" },
      body: { businessModel: "commission" },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await chooseSellerBusinessModel(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
