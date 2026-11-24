import jwt from "jsonwebtoken";
import { sendWhatsappTemplate, mapWhatsappFailure } from "../app/services/bhashWhatsappService.js";
import { getPublicTracking, signOrderTrackingToken } from "../app/services/orderTrackingLinkService.js";

describe("bhashWhatsappService", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";
    process.env.USE_MOCK_OTP = "true";
  });

  test("rejects an invalid number with an actionable message", async () => {
    const res = await sendWhatsappTemplate({ phone: "123", template: "tracking", params: ["a"] });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/valid 10-digit/);
  });

  test("mock mode succeeds without calling the provider", async () => {
    const res = await sendWhatsappTemplate({ phone: "9876543210", template: "tracking", params: ["a", "b", "c"] });
    expect(res).toEqual({ success: true, mocked: true });
  });

  test("maps provider failures to operator messages", () => {
    expect(mapWhatsappFailure("Number not registered on whatsapp")).toMatch(/try another number/);
    expect(mapWhatsappFailure("template not found")).toMatch(/template/);
  });

  test("tracking endpoint rejects tokens with another purpose", async () => {
    const payToken = jwt.sign({ orderId: "X", purpose: "phone_order_pay_link" }, "test-secret");
    await expect(getPublicTracking(payToken)).rejects.toMatchObject({ statusCode: 400 });
    await expect(getPublicTracking("garbage")).rejects.toMatchObject({ statusCode: 400 });
    expect(jwt.verify(signOrderTrackingToken("ORD1"), "test-secret").purpose).toBe("order_track");
  });
});
