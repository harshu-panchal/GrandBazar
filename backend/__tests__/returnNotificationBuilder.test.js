import { buildNotification } from "../app/modules/notifications/notification.builder.js";
import { NOTIFICATION_EVENTS } from "../app/modules/notifications/notification.constants.js";

describe("return request notifications", () => {
  it("builds a seller push notification addressed to the order's store", () => {
    const notifications = buildNotification(NOTIFICATION_EVENTS.RETURN_REQUESTED, {
      orderId: "ORD-RETURN-1",
      sellerId: "store-1",
      customerId: "customer-1",
      adminIds: ["admin-1"],
      data: { reason: "Damaged item" },
    });

    const sellerNotification = notifications.find((item) => item.role === "seller");
    expect(sellerNotification).toMatchObject({
      userId: "store-1",
      recipient: "store-1",
      recipientModel: "Seller",
      type: NOTIFICATION_EVENTS.RETURN_REQUESTED,
      title: "Return Request Received",
    });
    expect(sellerNotification.body).toContain("ORD-RETURN-1");
    expect(sellerNotification.data.link).toContain("/seller/returns?orderId=ORD-RETURN-1");
  });
});
