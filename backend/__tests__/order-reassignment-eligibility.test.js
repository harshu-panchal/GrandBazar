import {
  canReassignOrderBeforeDelivery,
  workflowStatusForReassignment,
} from "../app/services/orderReassignmentEligibility.js";

describe("admin order reassignment eligibility", () => {
  test.each([
    "CREATED",
    "PREORDER_HOLD",
    "SELLER_PENDING",
    "SELLER_ACCEPTED",
    "SCHEDULED_HOLD",
    "AWAITING_EXTRA_PAYMENT",
    "DELIVERY_SEARCH",
    "EXTERNAL_LOGISTICS_PENDING",
    "DELIVERY_ASSIGNED",
    "PICKUP_READY",
    "HANDED_OVER_TO_LOGISTICS",
    "CUSTOMER_PICKUP_READY",
    "OUT_FOR_DELIVERY",
    "DISPUTED",
  ])("allows ongoing workflow status %s", (workflowStatus) => {
    expect(canReassignOrderBeforeDelivery({ workflowStatus })).toBe(true);
  });

  test.each(["DELIVERED", "CANCELLED"])(
    "blocks terminal workflow status %s",
    (workflowStatus) => {
      expect(canReassignOrderBeforeDelivery({ workflowStatus })).toBe(false);
    },
  );

  test("uses legacy status when workflowStatus is absent", () => {
    expect(workflowStatusForReassignment({ status: "out_for_delivery" })).toBe("OUT_FOR_DELIVERY");
    expect(canReassignOrderBeforeDelivery({ status: "out_for_delivery" })).toBe(true);
    expect(canReassignOrderBeforeDelivery({ status: "delivered" })).toBe(false);
    expect(canReassignOrderBeforeDelivery({ orderStatus: "cancelled" })).toBe(false);
  });
});
