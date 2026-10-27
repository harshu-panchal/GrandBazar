import { jest } from "@jest/globals";

const mockOrderFindOne = jest.fn();
const mockOrderFindById = jest.fn();
const mockOrderFindOneAndUpdate = jest.fn();
const mockOrderUpdateOne = jest.fn();

const mockPaymentFindOne = jest.fn();
const mockPaymentCreate = jest.fn();
const mockPaymentCountDocuments = jest.fn();

const mockWebhookEventCreate = jest.fn();
const mockWebhookEventUpdateOne = jest.fn();

const mockHandleOnlineOrderFinance = jest.fn();
const mockAfterPlaceOrderV2 = jest.fn();
const mockReleaseReservedStockForOrder = jest.fn();

const mockCreateRazorpayOrder = jest.fn();
const mockVerifyRazorpaySignature = jest.fn();
const mockVerifyRazorpayWebhookSignature = jest.fn();

jest.unstable_mockModule("../app/services/razorpay/razorpayCheckoutClient.js", () => ({
  createRazorpayOrder: mockCreateRazorpayOrder,
  verifyRazorpaySignature: mockVerifyRazorpaySignature,
  verifyRazorpayWebhookSignature: mockVerifyRazorpayWebhookSignature,
  mapRazorpayStatusToInternal: (status) => {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "captured" || normalized === "payment.captured") return "CAPTURED";
    if (normalized === "failed" || normalized === "payment.failed") return "FAILED";
    return "PENDING";
  },
  razorpayCheckoutConfig: () => ({ keyId: "rzp_test_key", keySecret: "rzp_test_secret", webhookSecret: "rzp_wh_secret" }),
}));

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findOne: mockOrderFindOne,
    findById: mockOrderFindById,
    findOneAndUpdate: mockOrderFindOneAndUpdate,
    updateOne: mockOrderUpdateOne,
  },
}));

jest.unstable_mockModule("../app/models/payment.js", () => ({
  default: {
    findOne: mockPaymentFindOne,
    create: mockPaymentCreate,
    countDocuments: mockPaymentCountDocuments,
  },
}));

jest.unstable_mockModule("../app/models/paymentWebhookEvent.js", () => ({
  default: {
    create: mockWebhookEventCreate,
    updateOne: mockWebhookEventUpdateOne,
  },
}));

jest.unstable_mockModule("../app/services/finance/orderFinanceService.js", () => ({
  handleOnlineOrderFinance: mockHandleOnlineOrderFinance,
  reconcileCodCash: jest.fn(),
}));

jest.unstable_mockModule("../app/services/orderWorkflowService.js", () => ({
  afterPlaceOrderV2: mockAfterPlaceOrderV2,
}));

jest.unstable_mockModule("../app/services/stockService.js", () => ({
  releaseReservedStockForOrder: mockReleaseReservedStockForOrder,
}));

const {
  createPaymentOrderForOrderRef,
  processRazorpayWebhook,
} = await import("../app/services/paymentService.js");

describe("Phase 0 payment hardening", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAZORPAY_KEY_ID = "rzp_test_key";
    process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";
    process.env.RAZORPAY_CHECKOUT_WEBHOOK_SECRET = "rzp_wh_secret";
    process.env.FRONTEND_URL = "https://frontend.test";

    mockPaymentFindOne.mockImplementation((query) => {
      if (query?.idempotencyKey) {
        return Promise.resolve(null);
      }
      return {
        sort: jest.fn().mockResolvedValue(null),
      };
    });
  });

  it("derives payment amount only from server-side order snapshot", async () => {
    mockOrderFindOne.mockResolvedValue({
      _id: "order-mongo-id",
      orderId: "ORD-20260325-ABC123",
      customer: "user-1",
      paymentMode: "ONLINE",
      paymentStatus: "CREATED",
      status: "pending",
      workflowStatus: "CREATED",
      paymentBreakdown: { grandTotal: 499 },
    });
    mockPaymentCountDocuments.mockResolvedValue(0);
    mockCreateRazorpayOrder.mockResolvedValue({
      razorpayOrderId: "order_gateway_1",
      amount: 49900,
      currency: "INR",
      status: "created",
    });
    mockPaymentCreate.mockResolvedValue({
      _id: "payment-1",
      publicOrderId: "ORD-20260325-ABC123",
      gatewayName: "RAZORPAY",
      gatewayOrderId: "order_gateway_1",
      amount: 49900,
      currency: "INR",
      status: "PENDING",
      attemptCount: 1,
      rawGatewayResponse: {
        razorpayOrderId: "order_gateway_1",
      },
    });

    const result = await createPaymentOrderForOrderRef({
      orderRef: "ORD-20260325-ABC123",
      userId: "user-1",
      idempotencyKey: "idem-1",
      correlationId: "corr-1",
    });

    expect(mockCreateRazorpayOrder).toHaveBeenCalled();
    expect(result.payment.amount).toBe(49900);
  });

  it("blocks payment initiation for wrong user or invalid order state", async () => {
    mockOrderFindOne.mockResolvedValueOnce({
      _id: "order-1",
      orderId: "ORD-1",
      customer: "owner-user",
      paymentMode: "ONLINE",
      paymentStatus: "CREATED",
      status: "pending",
      workflowStatus: "CREATED",
      paymentBreakdown: { grandTotal: 100 },
    });

    await expect(
      createPaymentOrderForOrderRef({
        orderRef: "ORD-1",
        userId: "attacker-user",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    mockOrderFindOne.mockResolvedValueOnce({
      _id: "order-2",
      orderId: "ORD-2",
      customer: "owner-user",
      paymentMode: "ONLINE",
      paymentStatus: "CREATED",
      status: "cancelled",
      workflowStatus: "CANCELLED",
      paymentBreakdown: { grandTotal: 100 },
    });

    await expect(
      createPaymentOrderForOrderRef({
        orderRef: "ORD-2",
        userId: "owner-user",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects a webhook with an invalid signature", async () => {
    mockVerifyRazorpayWebhookSignature.mockReturnValue(false);

    const rawBody = Buffer.from(JSON.stringify({ event: "payment.captured", payload: {} }));

    await expect(
      processRazorpayWebhook({
        rawBody,
        signatureHeader: "bad-signature",
        correlationId: "corr-webhook",
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("treats duplicate webhook event id as idempotent", async () => {
    mockVerifyRazorpayWebhookSignature.mockReturnValue(true);
    mockWebhookEventCreate.mockRejectedValueOnce({ code: 11000 });

    const rawBody = Buffer.from(
      JSON.stringify({
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_1",
              order_id: "order_gateway_1",
              status: "captured",
              notes: { merchantOrderId: "gateway-order-1" },
            },
          },
        },
      }),
    );

    const result = await processRazorpayWebhook({
      rawBody,
      signatureHeader: "mock-valid-signature",
      correlationId: "corr-webhook",
    });

    expect(result).toEqual(
      expect.objectContaining({
        duplicate: true,
        accepted: true,
      }),
    );
    expect(mockOrderUpdateOne).not.toHaveBeenCalled();
  });
});
