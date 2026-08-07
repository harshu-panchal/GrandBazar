import { sendVendorWelcomeEmail } from "../app/services/emailService.js";

describe("Phase 2: Vendor Email Onboarding Tests", () => {
  it("should send/mock vendor welcome email successfully", async () => {
    const result = await sendVendorWelcomeEmail({
      email: "testvendor@example.com",
      name: "Ramesh Kumar",
      password: "TestPassword123!",
      storeName: "Ramesh Supermart",
    });

    expect(result.success).toBe(true);
    expect(result.mocked || result.messageId).toBeTruthy();
  });

  it("should generate email template content without crashing", async () => {
    const result = await sendVendorWelcomeEmail({
      email: "newvendor@example.com",
      name: "Priya Sharma",
    });

    expect(result.success).toBe(true);
  });
});
