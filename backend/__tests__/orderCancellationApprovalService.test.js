import { jest } from "@jest/globals";

const mockOrderFindOne = jest.fn();
const mockOrderFindOneAndUpdate = jest.fn();
const mockRequireCanonicalOrderId = jest.fn();
const mockCompensateOrderCancellation = jest.fn();
const mockEmitOrderStatusUpdate = jest.fn();
const mockEmitNotificationEvent = jest.fn();
const mockEmitToCustomer = jest.fn();

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findOne: mockOrderFindOne,
    findOneAndUpdate: mockOrderFindOneAndUpdate,
  },
}));

jest.unstable_mockModule("../app/models/deliveryAssignment.js", () => ({
  default: { create: jest.fn() },
}));

jest.unstable_mockModule("../app/models/orderOtp.js", () => ({
  default: {},
}));

jest.unstable_mockModule("../app/models/store.js", () => ({
  default: {},
}));

jest.unstable_mockModule("../app/services/orderCompensation.js", () => ({
  compensateOrderCancellation: mockCompensateOrderCancellation,
}));

jest.unstable_mockModule("../app/queues/orderQueues.js", () => ({
  sellerTimeoutQueue: { getJob: jest.fn().mockResolvedValue(null) },
  deliveryTimeoutQueue: {
    getJob: jest.fn().mockResolvedValue(null),
    add: jest.fn().mockResolvedValue({}),
  },
  JOB_NAMES: { SELLER_TIMEOUT: "seller-timeout", DELIVERY_TIMEOUT: "delivery-timeout" },
}));

jest.unstable_mockModule("../app/config/redis.js", () => ({
  getRedisClient: jest.fn(() => null),
}));

jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitOrderStatusUpdate: mockEmitOrderStatusUpdate,
  emitToSeller: jest.fn(),
  emitDeliveryBroadcastForSeller: jest.fn(),
  emitToCustomer: mockEmitToCustomer,
  retractDeliveryBroadcastForOrder: jest.fn(),
}));

jest.unstable_mockModule("../app/services/orderSettlement.js", () => ({
  applyDeliveredSettlement: jest.fn(),
}));

jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: mockEmitNotificationEvent,
}));

jest.unstable_mockModule("../app/services/finance/financeSettingsService.js", () => ({
  getPlatformDeliveryProvider: jest.fn().mockResolvedValue("zinto"),
}));

jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({
  requireCanonicalOrderId: mockRequireCanonicalOrderId,
}));

const {
  requestCustomerCancellationApproval,
  approveCustomerCancellationRequest,
  rejectCustomerCancellationRequest,
} = await import("../app/services/orderWorkflowService.js");

describe("order cancellation approval flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCanonicalOrderId.mockImplementation(async (id) => id);
    mockEmitOrderStatusUpdate.mockResolvedValue(undefined);
    mockEmitNotificationEvent.mockResolvedValue(undefined);
  });

  it("creates a pending admin approval request before delivery assignment", async () => {
    mockOrderFindOne.mockResolvedValue({
      _id: "mongo-order-1",
      orderId: "ORD-REQ-1",
      customer: "cust-1",
      status: "confirmed",
      workflowVersion: 2,
      workflowStatus: "DELIVERY_SEARCH",
      deliveryBoy: null,
      cancellationRequest: { status: "none" },
    });

    mockOrderFindOneAndUpdate.mockResolvedValue({
      orderId: "ORD-REQ-1",
      cancellationRequest: {
        status: "pending",
        reason: "Need to cancel",
      },
    });

    const result = await requestCustomerCancellationApproval(
      "cust-1",
      "ORD-REQ-1",
      "Need to cancel",
    );

    expect(result.cancellationRequest.status).toBe("pending");
    expect(mockOrderFindOneAndUpdate).toHaveBeenCalled();
  });

  it("blocks cancellation approval requests after delivery partner assignment", async () => {
    mockOrderFindOne.mockResolvedValue({
      _id: "mongo-order-2",
      orderId: "ORD-REQ-2",
      customer: "cust-2",
      status: "confirmed",
      workflowVersion: 2,
      workflowStatus: "DELIVERY_ASSIGNED",
      deliveryBoy: "delivery-1",
      cancellationRequest: { status: "none" },
    });

    await expect(
      requestCustomerCancellationApproval("cust-2", "ORD-REQ-2", "Need to cancel"),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Order cannot be cancelled after delivery partner assignment",
    });
  });

  it("approves a pending cancellation request and cancels the order", async () => {
    mockOrderFindOne.mockResolvedValue({
      _id: "mongo-order-3",
      orderId: "ORD-REQ-3",
      customer: "cust-3",
      seller: "seller-3",
      status: "confirmed",
      workflowVersion: 2,
      workflowStatus: "DELIVERY_SEARCH",
      deliveryBoy: null,
      deliverySearchMeta: { attempt: 1 },
      cancellationRequest: {
        status: "pending",
        reason: "Need to cancel",
      },
    });

    mockOrderFindOneAndUpdate.mockResolvedValue({
      _id: "mongo-order-3",
      orderId: "ORD-REQ-3",
      customer: "cust-3",
      seller: "seller-3",
      status: "cancelled",
      workflowStatus: "CANCELLED",
      cancellationRequest: {
        status: "approved",
        reason: "Need to cancel",
      },
    });

    const result = await approveCustomerCancellationRequest(
      "admin-1",
      "ORD-REQ-3",
      "Approved by admin",
    );

    expect(result.status).toBe("cancelled");
    expect(mockCompensateOrderCancellation).toHaveBeenCalledWith(result, "ORD-REQ-3");
    expect(mockEmitNotificationEvent).toHaveBeenCalled();
  });

  it("rejects a pending cancellation request without cancelling the order", async () => {
    mockOrderFindOne.mockResolvedValue({
      _id: "mongo-order-4",
      orderId: "ORD-REQ-4",
      customer: "cust-4",
      status: "confirmed",
      workflowVersion: 2,
      workflowStatus: "DELIVERY_SEARCH",
      deliveryBoy: null,
      cancellationRequest: {
        status: "pending",
        reason: "Need to cancel",
      },
    });

    mockOrderFindOneAndUpdate.mockResolvedValue({
      _id: "mongo-order-4",
      orderId: "ORD-REQ-4",
      customer: "cust-4",
      status: "confirmed",
      cancellationRequest: {
        status: "rejected",
        reason: "Need to cancel",
        adminNote: "Cannot cancel now",
      },
    });

    const result = await rejectCustomerCancellationRequest(
      "admin-1",
      "ORD-REQ-4",
      "Cannot cancel now",
    );

    expect(result.cancellationRequest.status).toBe("rejected");
    expect(mockEmitToCustomer).toHaveBeenCalled();
  });
});
