import { jest } from "@jest/globals";

const mockSendEachForMulticast = jest.fn();
const mockGetMessaging = jest.fn(() => ({
  sendEachForMulticast: mockSendEachForMulticast,
}));
const mockFirebaseApp = { name: "test-firebase-app" };

jest.unstable_mockModule("firebase-admin/messaging", () => ({
  getMessaging: mockGetMessaging,
}));

jest.unstable_mockModule("../app/config/firebaseAdmin.js", () => ({
  getFirebaseAdminApp: jest.fn(() => mockFirebaseApp),
}));

const { sendFCM } = await import(
  "../app/modules/notifications/firebase.service.js"
);

describe("Firebase notification payload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    });
  });

  test("places collapseKey inside AndroidConfig instead of at the message root", async () => {
    await sendFCM(["registration-token"], {
      title: "Order confirmed",
      body: "Your order is confirmed.",
      data: {
        orderId: "ORDER-123",
        eventType: "ORDER_CONFIRMED",
        link: "/orders/ORDER-123",
      },
    });

    expect(mockGetMessaging).toHaveBeenCalledWith(mockFirebaseApp);
    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);

    const message = mockSendEachForMulticast.mock.calls[0][0];
    expect(message).not.toHaveProperty("collapseKey");
    expect(message.android).toEqual({
      collapseKey: "ORDER-123:ORDER_CONFIRMED",
    });
    expect(message.webpush.notification.tag).toBe(
      "ORDER-123:ORDER_CONFIRMED",
    );
  });
});
