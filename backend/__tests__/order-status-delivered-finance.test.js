import { jest } from "@jest/globals";

const mockOrderFindOne = jest.fn();
const mockOrderFindById = jest.fn();

const mockApplyDeliveredSettlement = jest.fn();
const mockOrderMatchQueryFromRouteParam = jest.fn();
const mockHandleResponse = jest.fn();
const mockEmitNotificationEvent = jest.fn();
const mockEmitOrderStatusUpdate = jest.fn();
const mockInvalidate = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findOne: mockOrderFindOne,
    findById: mockOrderFindById,
  },
}));

jest.unstable_mockModule("../app/models/cart.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/product.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/transaction.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/stockHistory.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/notification.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/seller.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/delivery.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/setting.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/customer.js", () => ({ default: {} }));

jest.unstable_mockModule("../app/services/orderSettlement.js", () => ({
  applyDeliveredSettlement: mockApplyDeliveredSettlement,
}));

jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({
  orderMatchQueryFromRouteParam: mockOrderMatchQueryFromRouteParam,
  orderMatchQueryFlexible: jest.fn(),
  requireCanonicalOrderId: jest.fn(async (value) => value),
}));

jest.unstable_mockModule("../app/utils/helper.js", () => ({
  default: mockHandleResponse,
  handleResponse: mockHandleResponse,
  calculateDistance: jest.fn(),
  isAdminScopedUser: jest.fn((user) => user?.role === "admin"),
}));

jest.unstable_mockModule("../app/utils/pagination.js", () => ({
  default: jest.fn(),
}));

jest.unstable_mockModule("../app/services/orderWorkflowService.js", () => ({
  afterPlaceOrderV2: jest.fn(),
  sellerUpdateStatusAtomic: jest.fn(),
  deliveryAcceptAtomic: jest.fn(),
  customerCancelV2: jest.fn(),
  requestCustomerCancellationApproval: jest.fn(),
  approveCustomerCancellationRequest: jest.fn(),
  rejectCustomerCancellationRequest: jest.fn(),
  resolveWorkflowStatus: jest.fn(),
  sellerMarkPackedSignalAtomic: jest.fn(),
  sellerResendDeliverySearchAtomic: jest.fn(),
}));

jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: mockEmitNotificationEvent,
}));

jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  registerOrderSocketGetter: jest.fn(),
  getIo: jest.fn(),
  emitDeliveryBroadcastForSeller: jest.fn(),
  emitDeliveryBroadcast: jest.fn(),
  emitReturnBroadcastForCustomer: jest.fn(),
  emitReturnBroadcastForSeller: jest.fn(),
  retractDeliveryBroadcastForOrder: jest.fn(),
  emitToSeller: jest.fn(),
  emitToDelivery: jest.fn(),
  emitToCustomer: jest.fn(),
  emitOrderChatMessage: jest.fn(),
  emitOrderStatusUpdate: mockEmitOrderStatusUpdate,
  emitReturnStatusUpdate: jest.fn(),
}));

jest.unstable_mockModule("../app/services/cacheService.js", () => ({
  buildKey: jest.fn((...parts) => parts.join(":")),
  getOrSet: jest.fn(),
  getTTL: jest.fn(),
  invalidate: mockInvalidate,
}));

jest.unstable_mockModule("../app/services/finance/orderFinanceService.js", () => ({
  freezeFinancialSnapshot: jest.fn((order) => order),
  reverseOrderFinanceOnCancellation: jest.fn(),
}));

jest.unstable_mockModule("../app/utils/geoUtils.js", () => ({
  distanceMeters: jest.fn(),
}));

const { updateOrderStatus } = await import("../app/controller/orderController.js");

describe("updateOrderStatus delivered finance ordering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOrderMatchQueryFromRouteParam.mockImplementation((id) => ({ orderId: id }));
    mockHandleResponse.mockImplementation((_res, status, message, data) => ({
      status,
      message,
      data,
    }));
  });

  it("persists delivered + deliveryBoy before settlement", async () => {
    const callOrder = [];
    const orderDoc = {
      _id: "mongo-1",
      orderId: "ORD1",
      status: "out_for_delivery",
      orderStatus: "out_for_delivery",
      workflowVersion: 1,
      deliveryBoy: "rider-old",
      seller: "seller-1",
      customer: "customer-1",
      save: jest.fn().mockImplementation(async () => {
        callOrder.push("save");
      }),
    };

    mockOrderFindOne.mockResolvedValue(orderDoc);
    mockOrderFindById.mockResolvedValue({ ...orderDoc, paymentMode: "COD" });

    mockApplyDeliveredSettlement.mockImplementation(async () => {
      callOrder.push("settlement");
    });

    const req = {
      params: { orderId: "ORD1" },
      body: { status: "delivered", deliveryBoyId: "rider-1" },
      user: { id: "admin-1", role: "admin" },
    };
    const res = {};

    const result = await updateOrderStatus(req, res);

    expect(result.status).toBe(200);
    expect(orderDoc.deliveryBoy).toBe("rider-1");
    expect(orderDoc.status).toBe("delivered");
    expect(orderDoc.orderStatus).toBe("delivered");
    expect(orderDoc.save).toHaveBeenCalledTimes(1);

    expect(mockApplyDeliveredSettlement).toHaveBeenCalledWith(orderDoc, "ORD1");
    expect(callOrder).toEqual(["save", "settlement"]);
  });

  it("keeps a V2 admin delivery override visible across every module", async () => {
    const orderDoc = {
      _id: "mongo-2",
      orderId: "ORD2",
      status: "out_for_delivery",
      orderStatus: "out_for_delivery",
      workflowVersion: 2,
      workflowStatus: "OUT_FOR_DELIVERY",
      deliveryRiderStep: 3,
      deliveryBoy: "rider-2",
      seller: "seller-2",
      customer: "customer-2",
      save: jest.fn().mockResolvedValue(undefined),
    };
    const refreshed = {
      ...orderDoc,
      status: "delivered",
      orderStatus: "delivered",
      workflowStatus: "DELIVERED",
      deliveryRiderStep: 4,
    };

    mockOrderFindOne.mockResolvedValue(orderDoc);
    mockOrderFindById.mockResolvedValue(refreshed);

    const result = await updateOrderStatus(
      {
        params: { orderId: "ORD2" },
        body: { status: "delivered" },
        user: { id: "admin-1", role: "admin" },
      },
      {},
    );

    expect(result.status).toBe(200);
    expect(orderDoc.workflowStatus).toBe("DELIVERED");
    expect(orderDoc.deliveryRiderStep).toBe(4);
    expect(mockApplyDeliveredSettlement).toHaveBeenCalledWith(orderDoc, "ORD2");
    expect(mockEmitOrderStatusUpdate).toHaveBeenCalledWith(
      "ORD2",
      expect.objectContaining({
        workflowStatus: "DELIVERED",
        status: "delivered",
        orderStatus: "delivered",
      }),
      "customer-2",
      "seller-2",
      ["rider-2"],
    );
    expect(mockInvalidate).toHaveBeenCalledWith("orders:customer:customer-2:*");
  });
});
