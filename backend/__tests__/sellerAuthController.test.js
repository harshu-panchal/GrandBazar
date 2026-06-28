import { jest } from "@jest/globals";

const mockSellerFindOne = jest.fn();
const mockSellerCreate = jest.fn();
const mockGenerateSellerToken = jest.fn(() => "signup-token");
const mockVerifySellerVerificationToken = jest.fn();

jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: {
    findOne: mockSellerFindOne,
    create: mockSellerCreate,
  },
}));

jest.unstable_mockModule("../app/models/store.js", () => ({
  default: {
    create: jest.fn(),
  },
}));

jest.unstable_mockModule("../app/services/sellerVerificationService.js", () => ({
  issueSellerVerificationOtp: jest.fn(),
  verifySellerOtpCode: jest.fn(),
  verifySellerVerificationToken: mockVerifySellerVerificationToken,
}));

jest.unstable_mockModule("../app/services/storeService.js", () => ({
  generateSellerToken: mockGenerateSellerToken,
  isStoreApproved: jest.fn(),
  loadOwnerStores: jest.fn(),
  pickDefaultActiveStoreId: jest.fn(),
}));

const { signupSeller } = await import("../app/controller/sellerAuthController.js");

describe("sellerAuthController signupSeller", () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      body: {
        name: "Seller Owner",
        email: "seller@example.com",
        phone: "9876543210",
        password: "secret123",
        emailVerificationToken: "email-token",
        phoneVerificationToken: "phone-token",
      },
      ip: "127.0.0.1",
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    mockSellerFindOne.mockResolvedValue(null);
    mockSellerCreate.mockImplementation(async (payload) => ({
      _id: "account-1",
      ...payload,
    }));
  });

  it("creates seller admin account without creating a store", async () => {
    await signupSeller(req, res);

    expect(mockVerifySellerVerificationToken).toHaveBeenCalledTimes(2);
    expect(mockSellerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        accountType: "owner",
        emailVerified: true,
        phoneVerified: true,
        isVerified: false,
        applicationStatus: "pending",
      }),
    );
    expect(mockGenerateSellerToken).toHaveBeenCalledWith({
      accountId: "account-1",
      activeStoreId: null,
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        result: expect.objectContaining({
          token: "signup-token",
          stores: [],
          hasApprovedStore: false,
          isAccountApproved: false,
          accountApplicationStatus: "pending",
        }),
      }),
    );
  });
});
