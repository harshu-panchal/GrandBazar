import { describe, it, expect } from "@jest/globals";
import { resolveOrderStatus } from "../app/services/orderStatusResolver.js";
import { WORKFLOW_STATUS } from "../app/constants/orderWorkflow.js";

describe("resolveOrderStatus — v1/legacy orders (no workflowStatus)", () => {
  it("resolves a plain pending v1 order", () => {
    const result = resolveOrderStatus({ status: "pending", workflowVersion: 1 });
    expect(result.legacyStatus).toBe("pending");
    expect(result.workflowStatus).toBeNull();
    expect(result.step).toBe(1);
  });

  it("resolves a delivered v1 order", () => {
    const result = resolveOrderStatus({ status: "delivered", workflowVersion: 1 });
    expect(result.legacyStatus).toBe("delivered");
    expect(result.label).toBe("Delivered");
    expect(result.step).toBe(6);
  });

  it("falls back to a mid-flight step via deliveryBoy when status is only 'confirmed'", () => {
    const result = resolveOrderStatus({ status: "confirmed", workflowVersion: 1, deliveryBoy: "rider1" });
    expect(result.step).toBe(3);
  });

  it("defaults workflowVersion 0/undefined the same as v1", () => {
    const result = resolveOrderStatus({ status: "packed" });
    expect(result.legacyStatus).toBe("packed");
    expect(result.workflowStatus).toBeNull();
  });
});

describe("resolveOrderStatus — v2 orders at each workflow state", () => {
  const v2 = (workflowStatus, extra = {}) => ({ workflowVersion: 2, workflowStatus, status: "pending", ...extra });

  it("SELLER_PENDING -> pending", () => {
    expect(resolveOrderStatus(v2(WORKFLOW_STATUS.SELLER_PENDING)).legacyStatus).toBe("pending");
  });

  it("SELLER_ACCEPTED -> confirmed", () => {
    expect(resolveOrderStatus(v2(WORKFLOW_STATUS.SELLER_ACCEPTED)).legacyStatus).toBe("confirmed");
  });

  it("SCHEDULED_HOLD -> confirmed, but flagged isScheduled with a distinct label", () => {
    const result = resolveOrderStatus(v2(WORKFLOW_STATUS.SCHEDULED_HOLD));
    expect(result.legacyStatus).toBe("confirmed");
    expect(result.isScheduled).toBe(true);
    expect(result.label).toBe("Scheduled");
  });

  it("DELIVERY_SEARCH / DELIVERY_ASSIGNED / EXTERNAL_LOGISTICS_PENDING all collapse to confirmed", () => {
    expect(resolveOrderStatus(v2(WORKFLOW_STATUS.DELIVERY_SEARCH)).legacyStatus).toBe("confirmed");
    expect(resolveOrderStatus(v2(WORKFLOW_STATUS.DELIVERY_ASSIGNED)).legacyStatus).toBe("confirmed");
    expect(resolveOrderStatus(v2(WORKFLOW_STATUS.EXTERNAL_LOGISTICS_PENDING)).legacyStatus).toBe("confirmed");
  });

  it("PICKUP_READY -> packed, step 4", () => {
    const result = resolveOrderStatus(v2(WORKFLOW_STATUS.PICKUP_READY));
    expect(result.legacyStatus).toBe("packed");
    expect(result.step).toBe(4);
  });

  it("CUSTOMER_PICKUP_READY -> ready_for_pickup", () => {
    expect(resolveOrderStatus(v2(WORKFLOW_STATUS.CUSTOMER_PICKUP_READY)).legacyStatus).toBe("ready_for_pickup");
  });

  it("OUT_FOR_DELIVERY -> out_for_delivery, step 5", () => {
    const result = resolveOrderStatus(v2(WORKFLOW_STATUS.OUT_FOR_DELIVERY));
    expect(result.legacyStatus).toBe("out_for_delivery");
    expect(result.step).toBe(5);
  });

  it("DELIVERED -> delivered, step 6", () => {
    const result = resolveOrderStatus(v2(WORKFLOW_STATUS.DELIVERED));
    expect(result.legacyStatus).toBe("delivered");
    expect(result.step).toBe(6);
  });

  it("CANCELLED -> cancelled", () => {
    expect(resolveOrderStatus(v2(WORKFLOW_STATUS.CANCELLED)).legacyStatus).toBe("cancelled");
  });

  it("DISPUTED -> disputed, isDisputed true", () => {
    const result = resolveOrderStatus(v2(WORKFLOW_STATUS.DISPUTED));
    expect(result.legacyStatus).toBe("disputed");
    expect(result.isDisputed).toBe(true);
  });

  it("AWAITING_EXTRA_PAYMENT -> awaiting_extra_payment", () => {
    expect(resolveOrderStatus(v2(WORKFLOW_STATUS.AWAITING_EXTRA_PAYMENT)).legacyStatus).toBe("awaiting_extra_payment");
  });

  it("PREORDER_HOLD -> preorder_confirmed", () => {
    expect(resolveOrderStatus(v2(WORKFLOW_STATUS.PREORDER_HOLD)).legacyStatus).toBe("preorder_confirmed");
  });
});

describe("resolveOrderStatus — return/dispute/cancellation overlays", () => {
  it("surfaces an active return over a 'delivered' base status instead of hiding it", () => {
    const result = resolveOrderStatus({
      status: "delivered",
      workflowVersion: 2,
      workflowStatus: WORKFLOW_STATUS.DELIVERED,
      returnStatus: "return_requested",
    });
    expect(result.legacyStatus).toBe("delivered");
    expect(result.returnStatus).toBe("return_requested");
    expect(result.returnLabel).toBe("Return Requested");
    expect(result.label).toBe("Return Requested");
  });

  it("returnStatus 'none' resolves to null, not a label", () => {
    const result = resolveOrderStatus({ status: "delivered", returnStatus: "none" });
    expect(result.returnStatus).toBeNull();
    expect(result.returnLabel).toBeNull();
    expect(result.label).toBe("Delivered");
  });

  it("flags isDisputed when disputeRef is set even if legacyStatus lags", () => {
    const result = resolveOrderStatus({ status: "delivered", disputeRef: "someId" });
    expect(result.isDisputed).toBe(true);
  });

  it("surfaces a pending cancellation request as the label", () => {
    const result = resolveOrderStatus({
      status: "confirmed",
      cancellationRequest: { status: "pending" },
    });
    expect(result.cancellationPending).toBe(true);
    expect(result.label).toBe("Cancellation Requested");
  });

  it("return overlay takes priority over a pending cancellation label", () => {
    const result = resolveOrderStatus({
      status: "delivered",
      returnStatus: "qc_passed",
      cancellationRequest: { status: "pending" },
    });
    expect(result.label).toBe("Return QC Passed");
  });
});

describe("resolveOrderStatus — orphan legacy statuses (no WORKFLOW_STATUS counterpart)", () => {
  const orphanCases = [
    ["reschedule_requested", "Reschedule requested"],
    ["rescheduled", "Rescheduled"],
    ["price_revised", "Price revised"],
    ["partial_cancelled", "Partially cancelled"],
    ["partial_updated", "Partially updated"],
    ["customer_confirmation", "Awaiting customer confirmation"],
    ["preparing", "Preparing"],
    ["completed", "Completed"],
    ["refunded", "Refunded"],
  ];

  it.each(orphanCases)("status '%s' wins over a stale/mismatched workflowStatus", (status, expectedLabel) => {
    const result = resolveOrderStatus({
      status,
      workflowVersion: 2,
      // Deliberately mismatched workflowStatus — orphan status must win.
      workflowStatus: WORKFLOW_STATUS.SELLER_ACCEPTED,
    });
    expect(result.legacyStatus).toBe(status);
    expect(result.label).toBe(expectedLabel);
  });
});

describe("resolveOrderStatus — null/undefined safety", () => {
  it("returns a safe pending default for a null order", () => {
    const result = resolveOrderStatus(null);
    expect(result.legacyStatus).toBe("pending");
    expect(result.step).toBe(0);
  });
});
