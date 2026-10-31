import { describe, expect, it } from "@jest/globals";
import {
  getLegacyStatusFromOrder,
  getOrderStatusLabel,
  getOrderTrackerStep,
} from "../shared/utils/orderStatus.js";

describe("platform logistics handover status", () => {
  const order = {
    workflowVersion: 2,
    workflowStatus: "HANDED_OVER_TO_LOGISTICS",
    status: "handed_over_to_logistics",
    sellerPackedAt: "2026-10-30T10:00:00.000Z",
  };

  it("is displayed consistently without collapsing back to packed", () => {
    expect(getLegacyStatusFromOrder(order)).toBe("handed_over_to_logistics");
    expect(getOrderStatusLabel(order)).toBe("Handed over to logistics");
    expect(getOrderTrackerStep(order)).toBe(5);
  });
});
