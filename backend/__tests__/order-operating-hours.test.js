import { checkOperatingHours, checkRefundEligibility } from "../app/utils/operatingHours.js";

describe("Phase 1: Operating Hours & Refund Eligibility Tests", () => {
  describe("checkOperatingHours()", () => {
    it("should allow orders if operatingHours is disabled or undefined", () => {
      expect(checkOperatingHours(null).isAllowed).toBe(true);
      expect(checkOperatingHours({ enabled: false }).isAllowed).toBe(true);
    });

    it("should allow orders within normal operating hours (e.g., 06:00 to 22:00 at 14:00)", () => {
      const config = {
        enabled: true,
        startHour: "06:00",
        endHour: "22:00",
        cutoffMessage: "Closed for the day",
      };
      const testDate = new Date();
      testDate.setHours(14, 0, 0, 0); // 2:00 PM

      const result = checkOperatingHours(config, testDate);
      expect(result.isAllowed).toBe(true);
      expect(result.message).toBeNull();
    });

    it("should reject orders after 10 PM (22:00 cutoff e.g., at 23:00)", () => {
      const config = {
        enabled: true,
        startHour: "06:00",
        endHour: "22:00",
        cutoffMessage: "Orders closed after 10 PM.",
      };
      const testDate = new Date();
      testDate.setHours(23, 0, 0, 0); // 11:00 PM

      const result = checkOperatingHours(config, testDate);
      expect(result.isAllowed).toBe(false);
      expect(result.message).toBe("Orders closed after 10 PM.");
    });

    it("should reject orders before 6 AM (e.g., at 04:00 AM)", () => {
      const config = {
        enabled: true,
        startHour: "06:00",
        endHour: "22:00",
      };
      const testDate = new Date();
      testDate.setHours(4, 0, 0, 0); // 4:00 AM

      const result = checkOperatingHours(config, testDate);
      expect(result.isAllowed).toBe(false);
    });

    it("should handle overnight operating hours correctly (e.g., 20:00 to 04:00)", () => {
      const config = {
        enabled: true,
        startHour: "20:00",
        endHour: "04:00",
      };

      const nightDate = new Date();
      nightDate.setHours(22, 0, 0, 0); // 10:00 PM -> allowed
      expect(checkOperatingHours(config, nightDate).isAllowed).toBe(true);

      const earlyDate = new Date();
      earlyDate.setHours(2, 0, 0, 0); // 2:00 AM -> allowed
      expect(checkOperatingHours(config, earlyDate).isAllowed).toBe(true);

      const noonDate = new Date();
      noonDate.setHours(12, 0, 0, 0); // 12:00 PM -> closed
      expect(checkOperatingHours(config, noonDate).isAllowed).toBe(false);
    });
  });

  describe("checkRefundEligibility()", () => {
    it("should mark ineligible if not delivered", () => {
      const result = checkRefundEligibility(null, 24);
      expect(result.isEligible).toBe(false);
    });

    it("should mark eligible if within 24 hours of delivery", () => {
      const deliveredAt = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5 hours ago
      const result = checkRefundEligibility(deliveredAt, 24);
      expect(result.isEligible).toBe(true);
      expect(result.remainingMs).toBeGreaterThan(0);
    });

    it("should mark ineligible if past 24 hours of delivery", () => {
      const deliveredAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      const result = checkRefundEligibility(deliveredAt, 24);
      expect(result.isEligible).toBe(false);
      expect(result.remainingMs).toBe(0);
    });

    it("should respect custom refund window hours (e.g., 48 hours)", () => {
      const deliveredAt = new Date(Date.now() - 30 * 60 * 60 * 1000); // 30 hours ago
      const result = checkRefundEligibility(deliveredAt, 48);
      expect(result.isEligible).toBe(true);
    });
  });
});
