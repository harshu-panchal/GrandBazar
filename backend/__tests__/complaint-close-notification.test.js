import { buildNotification } from "../app/modules/notifications/notification.builder.js";
import { NOTIFICATION_EVENTS } from "../app/modules/notifications/notification.constants.js";

describe("complaint close notification", () => {
  test("shares the admin resolution summary with the customer", () => {
    const [notification] = buildNotification(NOTIFICATION_EVENTS.COMPLAINT_CLOSED, {
      complaintId: "C-0002",
      orderId: "ORD-1",
      customerId: "customer-1",
      status: "CLOSED",
      summary: "We verified the damaged item and completed your refund.",
    });

    expect(notification).toMatchObject({
      role: "customer",
      recipient: "customer-1",
      title: "Complaint resolved",
    });
    expect(notification.body).toContain("We verified the damaged item and completed your refund.");
    expect(notification.data.complaintStatus).toBe("CLOSED");
  });
});
