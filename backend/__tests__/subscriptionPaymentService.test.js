import { jest } from "@jest/globals";

const mockPlanFindOne = jest.fn();
const mockSellerFindByIdAndUpdate = jest.fn();
const mockSubscriptionPaymentCountDocuments = jest.fn();
const mockSubscriptionPaymentCreate = jest.fn();
const mockActivateFromPhonePe = jest.fn();

const mockPhonePePay = jest.fn();
const mockPhonePeGetOrderStatus = jest.fn();

jest.unstable_mockModule("@phonepe-pg/pg-sdk-node", () => ({
  StandardCheckoutClient: {
    getInstance: jest.fn(() => ({
      pay: mockPhonePePay,
      getOrderStatus: mockPhonePeGetOrderStatus,
    })),
  },
  Env: { PRODUCTION: "PRODUCTION", SANDBOX: "SANDBOX" },
  StandardCheckoutPayRequest: {
    builder: () => {
      const state = {};
      const builder = {
        merchantOrderId: (id) => { state.merchantOrderId = id; return builder; },
        amount: (amt) => { state.amount = amt; return builder; },
        redirectUrl: (url) => { state.redirectUrl = url; return builder; },
        build: () => state,
      };
      return builder;
    },
  },
}));

jest.unstable_mockModule("../app/models/subscriptionPlan.js", () => ({
  default: {
    findOne: jest.fn().mockReturnValue({
      lean: mockPlanFindOne,
    }),
  },
}));

jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: { findByIdAndUpdate: mockSellerFindByIdAndUpdate },
}));

jest.unstable_mockModule("../app/models/sellerSubscriptionPayment.js", () => ({
  default: {
    findOne: jest.fn().mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    }),
    countDocuments: mockSubscriptionPaymentCountDocuments,
    create: mockSubscriptionPaymentCreate,
  },
}));

jest.unstable_mockModule("../app/services/subscriptionService.js", () => ({
  getActiveSubscriptionForSeller: jest.fn().mockResolvedValue(null),
  activateSubscriptionFromPhonePePayment: mockActivateFromPhonePe,
  resolveSubscriptionRequestType: jest.fn().mockReturnValue("new"),
}));

describe("subscriptionPaymentService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PHONEPE_CLIENT_ID = "test-client";
    process.env.PHONEPE_CLIENT_SECRET = "test-secret";
    process.env.PHONEPE_ENV = "SANDBOX";
    process.env.FRONTEND_URL = "http://localhost:5173";

    mockPlanFindOne.mockResolvedValue({
      _id: "plan1",
      name: "Starter",
      price: 999,
      shopCount: 1,
      productCountPerShop: 50,
      durationDays: 30,
      isActive: true,
    });
    mockSubscriptionPaymentCountDocuments.mockResolvedValue(0);
    mockPhonePePay.mockResolvedValue({ redirectUrl: "https://phonepe.test/pay" });
    mockSubscriptionPaymentCreate.mockImplementation((doc) => ({
      ...doc,
      save: jest.fn(),
      gatewayOrderId: doc.gatewayOrderId,
    }));
  });

  it("isSubscriptionMerchantOrderId detects SUB- prefix", async () => {
    const { isSubscriptionMerchantOrderId } = await import("../app/services/subscriptionPaymentService.js");
    expect(isSubscriptionMerchantOrderId("SUB-ABC-123-A1")).toBe(true);
    expect(isSubscriptionMerchantOrderId("ORD-123")).toBe(false);
  });

  it("createSubscriptionPhonePeCheckout returns redirect URL", async () => {
    const { createSubscriptionPhonePeCheckout } = await import("../app/services/subscriptionPaymentService.js");

    const result = await createSubscriptionPhonePeCheckout({
      sellerId: "seller123",
      planId: "plan1",
    });

    expect(result.redirectUrl).toBe("https://phonepe.test/pay");
    expect(mockPhonePePay).toHaveBeenCalled();
    expect(mockSubscriptionPaymentCreate).toHaveBeenCalled();
    expect(mockSellerFindByIdAndUpdate).toHaveBeenCalled();
  });

  it("verifySubscriptionPhonePePayment activates on CAPTURED", async () => {
    const paymentDoc = {
      sellerId: "seller123",
      planId: "plan1",
      gatewayOrderId: "SUB-SELLER123-PLAN1-A1",
      status: "PENDING",
      planSnapshot: { price: 999 },
      save: jest.fn().mockResolvedValue(true),
    };
    const SellerSubscriptionPayment = (await import("../app/models/sellerSubscriptionPayment.js")).default;
    SellerSubscriptionPayment.findOne.mockResolvedValue(paymentDoc);
    mockPhonePeGetOrderStatus.mockResolvedValue({
      state: "COMPLETED",
      transactionId: "txn-1",
    });
    mockActivateFromPhonePe.mockResolvedValue({
      request: { _id: "req1" },
      subscription: { _id: "sub1" },
    });

    const { verifySubscriptionPhonePePayment } = await import("../app/services/subscriptionPaymentService.js");
    const result = await verifySubscriptionPhonePePayment({
      merchantOrderId: "SUB-SELLER123-PLAN1-A1",
      sellerId: "seller123",
    });

    expect(result.status).toBe("CAPTURED");
    expect(mockActivateFromPhonePe).toHaveBeenCalled();
  });
});
