import { jest } from "@jest/globals";

jest.unstable_mockModule("../app/services/orderWorkflowService.js", () => ({
  removeDeliveryTimeoutJob: jest.fn(),
  scheduleDeliveryTimeoutJob: jest.fn(),
  sellerResendDeliverySearchAtomic: jest.fn(),
}));
jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  retractDeliveryBroadcastForOrder: jest.fn(),
  emitOrderStatusUpdate: jest.fn(),
  emitReturnStatusUpdate: jest.fn(),
}));

const { assertGuestCourierSellerScope } = await import("../app/services/guestCourierAssignmentService.js");

describe("seller temporary courier authorization", () => {
  test("allows the seller's store and rejects another store", () => {
    expect(() => assertGuestCourierSellerScope({ seller: "store-a" }, ["store-a"])).not.toThrow();
    expect(() => assertGuestCourierSellerScope({ seller: "store-b" }, ["store-a"])).toThrow("Order not found for this store");
  });

  test("does not let a return endpoint mutate a forward assignment", () => {
    expect(() => assertGuestCourierSellerScope(
      { seller: "store-a" },
      ["store-a"],
      "return_pickup",
      { taskType: "forward_delivery" },
    )).toThrow("Guest assignment does not belong to this task type");
  });
});
