import { jest } from "@jest/globals";

const mockOrderFindOne = jest.fn();
const mockOrderFindOneAndUpdate = jest.fn();
const mockGetPlatformDeliveryProvider = jest.fn();
const mockRequireCanonicalOrderId = jest.fn();
const mockEmitOrderStatusUpdate = jest.fn();
const mockEmitNotificationEvent = jest.fn();
const mockDeliveryAssignmentCreate = jest.fn();
const mockRemoveSellerTimeoutJob = jest.fn();

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findOne: mockOrderFindOne,
    findOneAndUpdate: mockOrderFindOneAndUpdate,
  },
}));

jest.unstable_mockModule("../app/models/deliveryAssignment.js", () => ({
  default: { create: mockDeliveryAssignmentCreate },
}));

jest.unstable_mockModule("../app/models/delivery.js", () => ({
  default: {},
}));

jest.unstable_mockModule("../app/models/orderOtp.js", () => ({
  default: {},
}));

jest.unstable_mockModule("../app/models/store.js", () => ({
  default: {
    findById: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: "store2", shopName: "Shop" }),
    }),
  },
}));

jest.unstable_mockModule("../app/services/orderCompensation.js", () => ({
  compensateOrderCancellation: jest.fn(),
}));

jest.unstable_mockModule("../app/utils/geoUtils.js", () => ({
  distanceMeters: jest.fn(() => 100),
}));

jest.unstable_mockModule("../app/services/orderSettlement.js", () => ({
  applyDeliveredSettlement: jest.fn(),
}));

jest.unstable_mockModule("../app/services/deliveryOptionResolver.js", () => ({
  resolveFulfillmentAtSellerAccept: jest.fn().mockImplementation((order, store) =>
    Promise.resolve({
      fulfillmentMethod: order?.fulfillmentMethod || "delivery",
      logisticsMode: order?.logisticsMode || "zinto",
    })
  ),
  resolveStoreDeliveryPolicy: jest.fn(),
}));

jest.unstable_mockModule("../app/services/orderStateMachine.js", () => ({
  assertTransition: jest.fn(),
}));

jest.unstable_mockModule("../app/services/orderSchedulingService.js", () => ({
  scheduleOrderActivationJob: jest.fn(),
}));

jest.unstable_mockModule("../app/services/customerPickupService.js", () => ({
  markOrderReadyForCustomerPickup: jest.fn(),
}));

jest.unstable_mockModule("../app/services/finance/financeSettingsService.js", () => ({
  getPlatformDeliveryProvider: mockGetPlatformDeliveryProvider,
}));

jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({
  requireCanonicalOrderId: mockRequireCanonicalOrderId,
}));

jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitOrderStatusUpdate: mockEmitOrderStatusUpdate,
  emitToSeller: jest.fn(),
  emitDeliveryBroadcastForSeller: jest.fn(),
  emitToCustomer: jest.fn(),
  retractDeliveryBroadcastForOrder: jest.fn(),
  emitToDelivery: jest.fn(),
}));

jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: mockEmitNotificationEvent,
}));

jest.unstable_mockModule("../app/queues/orderQueues.js", () => ({
  sellerTimeoutQueue: { getJob: jest.fn() },
  deliveryTimeoutQueue: {
    getJob: jest.fn(),
    add: jest.fn().mockResolvedValue({}),
  },
  JOB_NAMES: { SELLER_TIMEOUT: "seller-timeout", DELIVERY_TIMEOUT: "delivery-timeout" },
}));

jest.unstable_mockModule("../app/config/redis.js", () => ({
  getRedisClient: jest.fn(() => null),
}));

const mockAttemptOrderRescue = jest.fn();
jest.unstable_mockModule("../app/services/orderRescueService.js", () => ({
  attemptOrderRescue: mockAttemptOrderRescue,
}));

const { sellerAcceptAtomic, sellerRejectAtomic, sellerMarkPackedSignalAtomic } = await import("../app/services/orderWorkflowService.js");
const { WORKFLOW_STATUS } = await import("../app/constants/orderWorkflow.js");

describe("orderWorkflowService sellerAcceptAtomic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCanonicalOrderId.mockImplementation(async (id) => id);
    mockRemoveSellerTimeoutJob.mockResolvedValue(undefined);
    mockDeliveryAssignmentCreate.mockResolvedValue({});
    mockEmitOrderStatusUpdate.mockResolvedValue(undefined);
    mockEmitNotificationEvent.mockResolvedValue(undefined);
  });

  it("routes external logistics to EXTERNAL_LOGISTICS_PENDING without rider search", async () => {
    mockOrderFindOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ logisticsMode: "external" }),
    });

    const updatedOrder = {
      _id: "mongo1",
      orderId: "ORD-100",
      logisticsMode: "external",
      workflowStatus: WORKFLOW_STATUS.EXTERNAL_LOGISTICS_PENDING,
      customer: { _id: "cust1" },
      seller: { _id: "store1" },
    };

    const externalChain = { populate: jest.fn(function externalPopulate() { return this; }) };
    externalChain.then = (resolve) => resolve(updatedOrder);
    mockOrderFindOneAndUpdate.mockReturnValue(externalChain);

    const result = await sellerAcceptAtomic("store1", "ORD-100");

    expect(result.workflowStatus).toBe(WORKFLOW_STATUS.EXTERNAL_LOGISTICS_PENDING);
    expect(mockDeliveryAssignmentCreate).not.toHaveBeenCalled();
    expect(mockEmitOrderStatusUpdate).toHaveBeenCalledWith(
      "ORD-100",
      expect.objectContaining({ workflowStatus: WORKFLOW_STATUS.EXTERNAL_LOGISTICS_PENDING }),
      "cust1",
    );
  });

  it("routes platform logistics to DELIVERY_SEARCH with rider broadcast", async () => {
    mockGetPlatformDeliveryProvider.mockResolvedValue("zinto");
    mockOrderFindOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ logisticsMode: "zinto" }),
    });

    const updatedOrder = {
      _id: "mongo2",
      orderId: "ORD-200",
      workflowStatus: WORKFLOW_STATUS.DELIVERY_SEARCH,
      deliverySearchExpiresAt: new Date(),
      customer: { _id: "cust2" },
      seller: { _id: "store2", shopName: "Shop" },
      address: { address: "123 Main St" },
    };

    const populateChain = { populate: jest.fn(function zintoPopulate() { return this; }) };
    populateChain.then = (resolve) => resolve(updatedOrder);
    mockOrderFindOneAndUpdate.mockReturnValue(populateChain);

    const result = await sellerAcceptAtomic("store2", "ORD-200");

    expect(result.workflowStatus).toBe(WORKFLOW_STATUS.DELIVERY_SEARCH);
    expect(mockDeliveryAssignmentCreate).toHaveBeenCalled();
  });

  it("sellerMarkPackedSignalAtomic updates sellerPackedAt and status to packed", async () => {
    mockRequireCanonicalOrderId.mockImplementation((id) => Promise.resolve(id));
    const existingOrder = {
      orderId: "ORD-300",
      seller: "store3",
      workflowStatus: WORKFLOW_STATUS.DELIVERY_SEARCH,
    };
    mockOrderFindOne.mockResolvedValue(existingOrder);

    const now = new Date();
    const updatedOrder = {
      orderId: "ORD-300",
      sellerPackedAt: now,
      status: "packed",
      orderStatus: "packed",
      customer: "cust3",
      seller: "store3",
    };
    mockOrderFindOneAndUpdate.mockResolvedValue(updatedOrder);

    const result = await sellerMarkPackedSignalAtomic("store3", "ORD-300");

    expect(result.status).toBe("packed");
    expect(mockOrderFindOneAndUpdate).toHaveBeenCalledWith(
      { orderId: "ORD-300", seller: "store3", workflowStatus: WORKFLOW_STATUS.DELIVERY_SEARCH },
      { $set: { sellerPackedAt: expect.any(Date), status: "packed", orderStatus: "packed" } },
      { new: true },
    );
    expect(mockEmitOrderStatusUpdate).toHaveBeenCalledWith(
      "ORD-300",
      { sellerPackedAt: now, status: "packed" },
      "cust3",
      "store3",
    );
  });

  // TC-DASH-012 regression: the seller dashboard's per-assistant Orders /
  // Acceptance % columns had no data source (always null) because nothing
  // recorded which staff member actually accepted/rejected an order.
  // sellerAcceptAtomic now stamps sellerActionBy.acceptedByStaffId whenever
  // the caller passes the acting sub-seller's own id.
  it("stamps sellerActionBy.acceptedByStaffId when a sub-seller (assistant) accepts the order", async () => {
    mockOrderFindOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ logisticsMode: "zinto" }),
    });
    mockGetPlatformDeliveryProvider.mockResolvedValue("zinto");

    const updatedOrder = {
      _id: "mongo4",
      orderId: "ORD-400",
      workflowStatus: WORKFLOW_STATUS.DELIVERY_SEARCH,
      deliverySearchExpiresAt: new Date(),
      customer: { _id: "cust4" },
      seller: { _id: "store4", shopName: "Shop" },
      address: { address: "123 Main St" },
    };
    const populateChain = { populate: jest.fn(function acceptPopulate() { return this; }) };
    populateChain.then = (resolve) => resolve(updatedOrder);
    mockOrderFindOneAndUpdate.mockReturnValue(populateChain);

    await sellerAcceptAtomic("store4", "ORD-400", "staff-123");

    const [, updatePayload] = mockOrderFindOneAndUpdate.mock.calls[0];
    expect(updatePayload.$set["sellerActionBy.acceptedByStaffId"]).toBe("staff-123");
  });

  it("does not set sellerActionBy when the owner (not a sub-seller) accepts the order", async () => {
    mockOrderFindOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ logisticsMode: "zinto" }),
    });
    mockGetPlatformDeliveryProvider.mockResolvedValue("zinto");

    const updatedOrder = {
      _id: "mongo5",
      orderId: "ORD-500",
      workflowStatus: WORKFLOW_STATUS.DELIVERY_SEARCH,
      deliverySearchExpiresAt: new Date(),
      customer: { _id: "cust5" },
      seller: { _id: "store5" },
    };
    const populateChain = { populate: jest.fn(function ownerAcceptPopulate() { return this; }) };
    populateChain.then = (resolve) => resolve(updatedOrder);
    mockOrderFindOneAndUpdate.mockReturnValue(populateChain);

    await sellerAcceptAtomic("store5", "ORD-500");

    const [, updatePayload] = mockOrderFindOneAndUpdate.mock.calls[0];
    expect(updatePayload.$set).not.toHaveProperty("sellerActionBy.acceptedByStaffId");
  });
});

describe("orderWorkflowService sellerRejectAtomic (TC-DASH-012 staff attribution)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCanonicalOrderId.mockImplementation(async (id) => id);
    mockAttemptOrderRescue.mockResolvedValue({ orderId: "ORD-600", rescued: true });
  });

  it("stamps sellerActionBy.rejectedByStaffId when a sub-seller rejects the order", async () => {
    mockOrderFindOneAndUpdate.mockResolvedValue({ orderId: "ORD-600" });

    await sellerRejectAtomic("store6", "ORD-600", "Out of stock for this item", "staff-456");

    const [, updatePayload] = mockOrderFindOneAndUpdate.mock.calls[0];
    expect(updatePayload.$set["sellerActionBy.rejectedByStaffId"]).toBe("staff-456");
    expect(mockAttemptOrderRescue).toHaveBeenCalledWith("ORD-600", {
      trigger: "seller_rejected",
      actorLabel: "system",
    });
  });

  it("does not set sellerActionBy when the owner rejects the order", async () => {
    mockOrderFindOneAndUpdate.mockResolvedValue({ orderId: "ORD-700" });

    await sellerRejectAtomic("store7", "ORD-700", "Out of stock for this item");

    const [, updatePayload] = mockOrderFindOneAndUpdate.mock.calls[0];
    expect(updatePayload.$set).not.toHaveProperty("sellerActionBy.rejectedByStaffId");
  });
});
