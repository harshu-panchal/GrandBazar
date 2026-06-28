import { jest } from "@jest/globals";

const mockSellerFindOne = jest.fn();
const mockSellerCreate = jest.fn();
const mockSellerFindByIdAndUpdate = jest.fn();
const mockStoreCreate = jest.fn();
const mockVerifySellerVerificationToken = jest.fn();
const mockUploadToCloudinary = jest.fn();

jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: {
    findOne: mockSellerFindOne,
    create: mockSellerCreate,
    findByIdAndUpdate: mockSellerFindByIdAndUpdate,
  },
}));

jest.unstable_mockModule("../app/models/store.js", () => ({
  default: {
    create: mockStoreCreate,
  },
}));

jest.unstable_mockModule("../app/services/sellerVerificationService.js", () => ({
  issueSellerVerificationOtp: jest.fn(),
  verifySellerOtpCode: jest.fn(),
  verifySellerVerificationToken: mockVerifySellerVerificationToken,
}));

jest.unstable_mockModule("../app/services/mediaService.js", () => ({
  uploadToCloudinary: mockUploadToCloudinary,
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
        shopName: "Noyo Mart",
        category: "Groceries",
        address: "MG Road",
        aadharNumber: "123456789012",
        panNumber: "ABCDE1234F",
        accountHolder: "Seller Owner",
        accountNumber: "1234567890",
        ifsc: "HDFC0001234",
        bankName: "HDFC Bank",
        documents: JSON.stringify({
          aadhar: "https://example.com/aadhar.pdf",
          pan: "https://example.com/pan.pdf",
          bankProof: "https://example.com/bankProof.pdf",
        }),
      },
      files: [],
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
      save: jest.fn().mockResolvedValue(true),
    }));
    mockStoreCreate.mockImplementation(async (payload) => ({
      _id: "store-1",
      ...payload,
    }));
    mockSellerFindByIdAndUpdate.mockResolvedValue({});
  });

  it("creates seller account and pending store on signup", async () => {
    await signupSeller(req, res);

    expect(mockVerifySellerVerificationToken).toHaveBeenCalledTimes(2);
    expect(mockSellerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        accountType: "owner",
        emailVerified: true,
        phoneVerified: true,
      }),
    );
    expect(mockStoreCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        shopName: "Noyo Mart",
        ownerId: "account-1",
        applicationStatus: "pending",
        isVerified: false,
        isActive: false,
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
