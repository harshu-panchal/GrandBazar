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
    // Supports both call shapes used across the services under test:
    // Store.findById(id).lean() (sellerAcceptAtomic's own store fetch) and
    // Store.findById(id).select(...).lean() (resolveSiblingStoreIds).
    findById: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: "store2", shopName: "Shop" }),
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "store2", ownerId: "owner1" }),
      }),
    }),
    // resolveSiblingStoreIds' second lookup (via loadOwnerStores, which
    // chains .sort().lean()) — no siblings by default so existing
    // single-store test expectations (seller: sellerId matching exactly
    // "store2") keep holding.
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
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

const { sellerAcceptAtomic, sellerMarkPackedSignalAtomic, sellerUpdateStatusAtomic } = await import("../app/services/orderWorkflowService.js");
const { WORKFLOW_STATUS } = await import("../app/constants/orderWorkflow.js");
const Store = (await import("../app/models/store.js")).default;

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

  // Regression test for the "Order not found" bug on accept/decline: a
  // seller's active store (req.user.id) isn't necessarily the store an
  // incoming order actually belongs to — the seller's order list/new-order
  // alerts are aggregated across every store they own (see
  // fetchSellerOrdersPage), so acting on one must look across all of them
  // too, not just whichever store happens to be active right now.
  it("finds and declines an order sitting on a sibling store, not just the caller's active store", async () => {
    // Caller's active store is "store1"; the order actually belongs to
    // "store2" — a sibling store under the same owner account.
    Store.findById.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "store1", ownerId: "owner1" }),
      }),
    });
    Store.find.mockReturnValueOnce({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: "store1" }, { _id: "store2" }]),
      }),
    });

    const pendingOrder = {
      orderId: "ORD-400",
      seller: "store2",
      workflowVersion: 2,
      workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
    };
    mockOrderFindOne.mockResolvedValue(pendingOrder);

    const cancelledOrder = {
      orderId: "ORD-400",
      seller: "store2",
      customer: "cust4",
      workflowStatus: WORKFLOW_STATUS.CANCELLED,
    };
    mockOrderFindOneAndUpdate.mockReturnValue({ then: (resolve) => resolve(cancelledOrder) });

    const result = await sellerUpdateStatusAtomic("store1", "ORD-400", "cancelled", {
      cancelReason: "Out of stock for this item",
    });

    expect(result.workflowStatus).toBe(WORKFLOW_STATUS.CANCELLED);
    // The order lookup itself must have searched across both stores, not
    // just the caller's single active one.
    expect(mockOrderFindOne).toHaveBeenCalledWith({
      orderId: "ORD-400",
      seller: { $in: ["store1", "store2"] },
    });
    // The mutation that actually cancels it must target the order's REAL
    // owning store ("store2"), not the caller's active store ("store1") —
    // matching seller: "store1" here is exactly what used to 404.
    expect(mockOrderFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "ORD-400", seller: "store2" }),
      expect.anything(),
      expect.anything(),
    );
  });
});
