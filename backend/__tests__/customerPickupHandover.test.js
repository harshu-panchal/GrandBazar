import crypto from "crypto";
import { jest } from "@jest/globals";

const mockOrderFindOne = jest.fn();
const mockEmitOrderStatusUpdate = jest.fn();
const mockEmitNotificationEvent = jest.fn();
const mockApplyDeliveredSettlement = jest.fn();
const mockResolveSiblingStoreIds = jest.fn();
const mockInvalidate = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { findOne: mockOrderFindOne },
}));

jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitOrderStatusUpdate: mockEmitOrderStatusUpdate,
}));

jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: mockEmitNotificationEvent,
}));

jest.unstable_mockModule("../app/services/orderSettlement.js", () => ({
  applyDeliveredSettlement: mockApplyDeliveredSettlement,
}));

jest.unstable_mockModule("../app/services/storeService.js", () => ({
  resolveSiblingStoreIds: mockResolveSiblingStoreIds,
}));

jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({
  requireCanonicalOrderId: jest.fn(async (value) => value),
}));

jest.unstable_mockModule("../app/services/cacheService.js", () => ({
  buildKey: jest.fn((...parts) => parts.join(":")),
  invalidate: mockInvalidate,
}));

const { verifyCustomerPickup } = await import("../app/services/customerPickupService.js");

const hash = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");

describe("customer pickup seller handover", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveSiblingStoreIds.mockResolvedValue(["store-1", "store-2"]);
  });

  it("requires the seller OTP and handover photo in the same completion", async () => {
    const order = {
      orderId: "ORD-PICKUP-1",
      seller: "store-2",
      customer: "customer-1",
      fulfillmentMethod: "customer_pickup",
      workflowStatus: "CUSTOMER_PICKUP_READY",
      status: "ready_for_pickup",
      orderStatus: "ready_for_pickup",
      customerPickup: {
        otpHash: hash("123456"),
        expiresAt: new Date(Date.now() + 60_000),
      },
      deliveryProofImages: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockOrderFindOne.mockResolvedValue(order);

    const result = await verifyCustomerPickup({
      orderId: "ORD-PICKUP-1",
      sellerId: "store-1",
      otp: "123456",
      verifiedBy: "seller",
      handoverPhotoUrl: "https://res.cloudinary.com/demo/customer-pickup.jpg",
    });

    expect(mockOrderFindOne).toHaveBeenCalledWith({
      orderId: "ORD-PICKUP-1",
      seller: { $in: ["store-1", "store-2"] },
    });
    expect(result.workflowStatus).toBe("DELIVERED");
    expect(result.status).toBe("delivered");
    expect(result.deliveryProofImages).toEqual([
      "https://res.cloudinary.com/demo/customer-pickup.jpg",
    ]);
    expect(result.customerPickup).toEqual(
      expect.objectContaining({
        verifiedBy: "seller",
        handoverPhotoUrl: "https://res.cloudinary.com/demo/customer-pickup.jpg",
        verifiedAt: expect.any(Date),
      }),
    );
    expect(order.save).toHaveBeenCalledTimes(1);
    expect(mockApplyDeliveredSettlement).toHaveBeenCalledWith(order, "ORD-PICKUP-1");
    expect(mockInvalidate).toHaveBeenCalledWith("orders:customer:customer-1:*");
    expect(mockEmitOrderStatusUpdate).toHaveBeenCalledWith(
      "ORD-PICKUP-1",
      expect.objectContaining({
        workflowStatus: "DELIVERED",
        status: "delivered",
        pickupVerified: true,
        handoverProofAvailable: true,
      }),
      "customer-1",
      "store-2",
    );
  });

  it("rejects seller completion when the handover photo is missing", async () => {
    await expect(
      verifyCustomerPickup({
        orderId: "ORD-PICKUP-2",
        sellerId: "store-1",
        otp: "123456",
        verifiedBy: "seller",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockOrderFindOne).not.toHaveBeenCalled();
  });

  it("does not allow the customer-side endpoint to complete pickup", async () => {
    await expect(
      verifyCustomerPickup({
        orderId: "ORD-PICKUP-3",
        otp: "123456",
        verifiedBy: "customer",
        handoverPhotoUrl: "https://res.cloudinary.com/demo/customer-pickup.jpg",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockOrderFindOne).not.toHaveBeenCalled();
  });
});

