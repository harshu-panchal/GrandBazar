import { jest } from "@jest/globals";
import {
  emitReturnStatusUpdate,
  registerOrderSocketGetter,
} from "../app/services/orderSocketEmitter.js";

describe("return status socket broadcast", () => {
  it("targets customer, seller, admin, order and delivery rooms in one emission", () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    registerOrderSocketGetter(() => ({ to }));

    emitReturnStatusUpdate({
      orderId: "ORD-1",
      returnStatus: "return_in_transit",
      customer: "customer-1",
      seller: "store-1",
      deliveryBoy: "delivery-1",
      returnDeliveryBoy: "return-rider-1",
    });

    expect(to).toHaveBeenCalledTimes(1);
    expect(new Set(to.mock.calls[0][0])).toEqual(new Set([
      "order:ORD-1",
      "admin:orders",
      "customer:customer-1",
      "seller:store-1",
      "delivery:delivery-1",
      "delivery:return-rider-1",
    ]));
    expect(emit).toHaveBeenCalledWith(
      "order:status:update",
      expect.objectContaining({
        orderId: "ORD-1",
        returnStatus: "return_in_transit",
      }),
    );
  });
});
