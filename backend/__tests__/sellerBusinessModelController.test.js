import { jest } from "@jest/globals";

const mockSellerFindById = jest.fn();
const mockSellerFindByIdAndUpdate = jest.fn();

jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: {
    findById: mockSellerFindById,
    findByIdAndUpdate: mockSellerFindByIdAndUpdate,
  },
}));

jest.unstable_mockModule("../app/services/sellerAccountService.js", () => ({
  isOwnerAccountApproved: jest.fn(() => true),
}));

jest.unstable_mockModule("../app/services/sellerBusinessModelService.js", () => ({
  BUSINESS_MODEL: { COMMISSION: "commission", SUBSCRIPTION: "subscription" },
  COMMISSION_SCOPE: { CATEGORY: "category", SELLER: "seller" },
  formatBusinessModelPayload: (seller) => ({
    businessModel: seller.businessModel,
    businessModelChosenAt: seller.businessModelChosenAt,
  }),
  previewCommissionForSeller: jest.fn().mockResolvedValue(null),
  buildSellerCommissionSummary: jest.fn().mockResolvedValue(null),
}));

describe("chooseSellerBusinessModel subscription branch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads seller before saving subscription model", async () => {
    const save = jest.fn();
    mockSellerFindById.mockResolvedValue({
      _id: "seller1",
      businessModel: null,
      businessModelChosenAt: null,
      save,
    });

    const { chooseSellerBusinessModel } = await import("../app/controller/seller/businessModelController.js");
    const req = {
      user: { accountId: "seller1" },
      body: { businessModel: "subscription" },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await chooseSellerBusinessModel(req, res);

    expect(mockSellerFindById).toHaveBeenCalledWith("seller1");
    expect(save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
