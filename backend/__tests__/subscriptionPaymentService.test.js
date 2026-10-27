import { jest } from "@jest/globals";

const mockPlanFindOne = jest.fn();
const mockSellerFindByIdAndUpdate = jest.fn();
const mockSubscriptionPaymentCountDocuments = jest.fn();
const mockSubscriptionPaymentCreate = jest.fn();
const mockActivateFromPayment = jest.fn();

const mockCreateRazorpayOrder = jest.fn();
const mockVerifyRazorpaySignature = jest.fn();

jest.unstable_mockModule("../app/services/razorpay/razorpayCheckoutClient.js", () => ({
  createRazorpayOrder: mockCreateRazorpayOrder,
  verifyRazorpaySignature: mockVerifyRazorpaySignature,
  mapRazorpayStatusToInternal: (status) => {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "captured" || normalized === "payment.captured") return "CAPTURED";
    if (normalized === "failed" || normalized === "payment.failed") return "FAILED";
    return "PENDING";
  },
  razorpayCheckoutConfig: () => ({ keyId: "rzp_test_key", keySecret: "test-secret", webhookSecret: "test-webhook-secret" }),
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
  activateSubscriptionFromPayment: mockActivateFromPayment,
  resolveSubscriptionRequestType: jest.fn().mockReturnValue("new"),
}));

describe("subscriptionPaymentService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAZORPAY_KEY_ID = "rzp_test_key";
    process.env.RAZORPAY_KEY_SECRET = "test-secret";
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
    mockCreateRazorpayOrder.mockResolvedValue({
      razorpayOrderId: "order_razorpay1",
      amount: 99900,
      currency: "INR",
      status: "created",
    });
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

  it("createSubscriptionRazorpayCheckout returns a Razorpay order", async () => {
    const { createSubscriptionRazorpayCheckout } = await import("../app/services/subscriptionPaymentService.js");

    const result = await createSubscriptionRazorpayCheckout({
      sellerId: "seller123",
      planId: "plan1",
    });

    expect(result.razorpayOrderId).toBe("order_razorpay1");
    expect(mockCreateRazorpayOrder).toHaveBeenCalled();
    expect(mockSubscriptionPaymentCreate).toHaveBeenCalled();
    expect(mockSellerFindByIdAndUpdate).toHaveBeenCalled();
  });

  it("verifySubscriptionRazorpayPayment activates on valid signature", async () => {
    const paymentDoc = {
      sellerId: "seller123",
      planId: "plan1",
      gatewayOrderId: "order_razorpay1",
      status: "PENDING",
      planSnapshot: { price: 999 },
      save: jest.fn().mockResolvedValue(true),
    };
    const SellerSubscriptionPayment = (await import("../app/models/sellerSubscriptionPayment.js")).default;
    SellerSubscriptionPayment.findOne.mockResolvedValue(paymentDoc);
    mockVerifyRazorpaySignature.mockReturnValue(true);
    mockActivateFromPayment.mockResolvedValue({
      request: { _id: "req1" },
      subscription: { _id: "sub1" },
    });

    const { verifySubscriptionRazorpayPayment } = await import("../app/services/subscriptionPaymentService.js");
    const result = await verifySubscriptionRazorpayPayment({
      razorpayOrderId: "order_razorpay1",
      razorpayPaymentId: "pay_razorpay1",
      razorpaySignature: "valid-signature",
      sellerId: "seller123",
    });

    expect(result.status).toBe("CAPTURED");
    expect(mockActivateFromPayment).toHaveBeenCalled();
  });

  it("verifySubscriptionRazorpayPayment fails on invalid signature", async () => {
    const paymentDoc = {
      sellerId: "seller123",
      planId: "plan1",
      gatewayOrderId: "order_razorpay1",
      status: "PENDING",
      planSnapshot: { price: 999 },
      save: jest.fn().mockResolvedValue(true),
    };
    const SellerSubscriptionPayment = (await import("../app/models/sellerSubscriptionPayment.js")).default;
    SellerSubscriptionPayment.findOne.mockResolvedValue(paymentDoc);
    mockVerifyRazorpaySignature.mockReturnValue(false);

    const { verifySubscriptionRazorpayPayment } = await import("../app/services/subscriptionPaymentService.js");
    const result = await verifySubscriptionRazorpayPayment({
      razorpayOrderId: "order_razorpay1",
      razorpayPaymentId: "pay_razorpay1",
      razorpaySignature: "bad-signature",
      sellerId: "seller123",
    });

    expect(result.status).toBe("FAILED");
    expect(mockActivateFromPayment).not.toHaveBeenCalled();
  });
});
