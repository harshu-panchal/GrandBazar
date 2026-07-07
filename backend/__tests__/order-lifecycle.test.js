import { describe, it, expect } from "@jest/globals";
import { canTransition } from "../app/services/orderStateMachine.js";
import { WORKFLOW_STATUS } from "../app/constants/orderWorkflow.js";
import {
  computeCutoffAt,
  computeActivationAt,
  isPastCutoff,
} from "../app/utils/scheduleDateUtils.js";
import { inferFulfillmentType, isInstantFulfillment, computeSellerPendingExpiry } from "../app/services/orderSchedulingService.js";
import { FULFILLMENT_TYPE, DEFAULT_SCHEDULED_SELLER_TIMEOUT_MS } from "../app/constants/orderWorkflow.js";

describe("order state machine extensions", () => {
  it("allows scheduled hold to delivery search", () => {
    expect(canTransition(WORKFLOW_STATUS.SCHEDULED_HOLD, WORKFLOW_STATUS.DELIVERY_SEARCH)).toBe(true);
  });

  it("allows preorder hold to seller pending", () => {
    expect(canTransition(WORKFLOW_STATUS.PREORDER_HOLD, WORKFLOW_STATUS.SELLER_PENDING)).toBe(true);
  });

  it("allows delivered to disputed and back", () => {
    expect(canTransition(WORKFLOW_STATUS.DELIVERED, WORKFLOW_STATUS.DISPUTED)).toBe(true);
    expect(canTransition(WORKFLOW_STATUS.DISPUTED, WORKFLOW_STATUS.DELIVERED)).toBe(true);
  });

  it("blocks instant delivery search to scheduled hold", () => {
    expect(canTransition(WORKFLOW_STATUS.DELIVERY_SEARCH, WORKFLOW_STATUS.SCHEDULED_HOLD)).toBe(false);
  });
});

describe("schedule date utils", () => {
  it("computes cutoff before delivery window", () => {
    const deliveryDate = new Date("2026-07-10T00:00:00.000Z");
    const cutoff = computeCutoffAt(deliveryDate, "09:00", 1);
    expect(cutoff.getTime()).toBeLessThan(deliveryDate.getTime());
  });

  it("computes activation before slot start", () => {
    const deliveryDate = new Date("2026-07-10T00:00:00.000Z");
    const activation = computeActivationAt(deliveryDate, "09:00", 2 * 60 * 60 * 1000);
    const slotStart = new Date("2026-07-10T09:00:00.000Z");
    expect(activation.getTime()).toBe(slotStart.getTime() - 2 * 60 * 60 * 1000);
  });

  it("detects past cutoff", () => {
    const past = new Date("2020-01-01T00:00:00.000Z");
    expect(isPastCutoff(new Date(), past)).toBe(true);
  });
});

describe("fulfillment inference", () => {
  it("infers scheduled from date and window", () => {
    expect(
      inferFulfillmentType({ deliveryDate: "2026-07-10", windowLabel: "9 AM - 12 PM" }),
    ).toBe("scheduled");
  });

  it("infers preorder from campaign id", () => {
    expect(inferFulfillmentType({ campaignId: "POC-1" })).toBe("preorder");
  });

  it("treats now as instant", () => {
    expect(isInstantFulfillment({ timeSlot: "now" })).toBe(true);
  });
});

describe("seller pending expiry", () => {
  it("uses relaxed seller window for scheduled orders, not customer cutoff", () => {
    const placedAt = new Date("2026-07-04T10:00:00.000Z");
    const cutoffAt = new Date("2026-07-07T06:00:00.000Z");
    const expiry = computeSellerPendingExpiry(
      { fulfillmentType: FULFILLMENT_TYPE.SCHEDULED, schedule: { cutoffAt } },
      placedAt,
    );
    expect(expiry.getTime()).toBe(placedAt.getTime() + DEFAULT_SCHEDULED_SELLER_TIMEOUT_MS());
    expect(expiry.getTime()).toBeLessThan(cutoffAt.getTime());
  });

  it("returns null for instant fulfillment", () => {
    expect(
      computeSellerPendingExpiry({ fulfillmentType: FULFILLMENT_TYPE.INSTANT }, new Date()),
    ).toBeNull();
  });
});
