import { WORKFLOW_STATUS, legacyStatusFromWorkflow } from "../constants/orderWorkflow.js";

/**
 * Single source of truth for "what status should every module show for this
 * order" — customer, seller, admin, and delivery previously each derived
 * their own answer from raw status/orderStatus/workflowStatus fields that
 * can (and do) diverge, plus independently decided whether to surface
 * returnStatus/disputeRef/cancellationRequest as overlays. This is a pure
 * read-side function — it never writes to the order, and every existing raw
 * field stays exactly as-is alongside its output (see resolveOrderStatus
 * call sites: always additive, never a replacement).
 *
 * legacyStatus here always matches a real Order.status enum value (unlike
 * the frontend's now-fixed copy, which had drifted to a "scheduled" value
 * that was never legal on the schema) — SCHEDULED_HOLD-derived orders get
 * legacyStatus:"confirmed" (matching backend legacyStatusFromWorkflow) with
 * the nuance surfaced separately via isScheduled/label instead.
 */

// Legacy `status` values with no WORKFLOW_STATUS counterpart — each is
// written by exactly one dedicated code path (reschedule, price-adjustment,
// replacement-review, etc.) and is always more current/specific than the
// workflow bucket it was layered on top of, so when present it wins.
const ORPHAN_STATUSES = new Set([
  "reschedule_requested",
  "rescheduled",
  "price_revised",
  "partial_cancelled",
  "partial_updated",
  "customer_confirmation",
  "preparing",
  "completed",
  "refunded",
]);

const DISPLAY_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  packed: "Packed",
  ready_for_pickup: "Ready for pickup",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  reschedule_requested: "Reschedule requested",
  rescheduled: "Rescheduled",
  price_revised: "Price revised",
  awaiting_extra_payment: "Awaiting extra payment",
  partial_cancelled: "Partially cancelled",
  partial_updated: "Partially updated",
  customer_confirmation: "Awaiting customer confirmation",
  preparing: "Preparing",
  completed: "Completed",
  refunded: "Refunded",
  disputed: "Dispute open",
  preorder_confirmed: "Pre-order confirmed",
};

// Reconciles the four independent return-status label sets found across the
// frontend (shared util, customer's ReturnProgressTracker, seller/admin's
// Returns.jsx) — this becomes the one backend-authoritative set; Phase 3/4
// point every frontend consumer at this same table via displayStatus.
const RETURN_STATUS_LABELS = {
  return_requested: "Return Requested",
  return_approved: "Return Approved",
  return_rejected: "Return Rejected",
  return_pickup_assigned: "Pickup Assigned",
  return_pickup_verified: "Pickup Verified",
  return_in_transit: "In Transit",
  return_drop_pending: "In Transit",
  returned: "Return Delivered to Seller",
  qc_passed: "Return QC Passed",
  qc_failed: "Return QC Failed",
  refund_initiated: "Refund Initiated",
  refund_completed: "Returned & Refunded",
};

// Mirrors frontend OrderProgressTracker.jsx's WORKFLOW_STAGE_INDEX — moved
// here so delivery (which has no tracker concept today) and every other
// module can share one 0-6 step position instead of each guessing.
const WORKFLOW_STAGE_INDEX = {
  [WORKFLOW_STATUS.CREATED]: 0,
  [WORKFLOW_STATUS.PREORDER_HOLD]: 0,
  [WORKFLOW_STATUS.SELLER_PENDING]: 1,
  [WORKFLOW_STATUS.SELLER_ACCEPTED]: 2,
  [WORKFLOW_STATUS.SCHEDULED_HOLD]: 2,
  [WORKFLOW_STATUS.AWAITING_EXTRA_PAYMENT]: 2,
  [WORKFLOW_STATUS.DELIVERY_SEARCH]: 2,
  [WORKFLOW_STATUS.EXTERNAL_LOGISTICS_PENDING]: 2,
  [WORKFLOW_STATUS.DELIVERY_ASSIGNED]: 3,
  [WORKFLOW_STATUS.PICKUP_READY]: 4,
  [WORKFLOW_STATUS.CUSTOMER_PICKUP_READY]: 4,
  [WORKFLOW_STATUS.OUT_FOR_DELIVERY]: 5,
  [WORKFLOW_STATUS.DELIVERED]: 6,
  [WORKFLOW_STATUS.DISPUTED]: 5,
};

function legacyStageIndex(legacyStatus, order) {
  if (legacyStatus === "delivered") return 6;
  if (legacyStatus === "out_for_delivery") return 5;
  if (legacyStatus === "packed" || legacyStatus === "ready_for_pickup") return 4;
  if (order?.deliveryBoy || order?.assignedAt) return 3;
  if (legacyStatus === "confirmed") return 2;
  if (legacyStatus === "pending") return 1;
  return 0;
}

/**
 * Resolves the workflow status for orders that may predate the v2 workflow
 * (workflowVersion < 2 or missing workflowStatus never got backfilled) —
 * same fallback orderWorkflowService.js's own resolveWorkflowStatus() uses,
 * duplicated here rather than imported to keep this module dependency-free
 * of the (much heavier) orderWorkflowService.js.
 */
function resolveWorkflowStatusFor(order) {
  if (Number(order?.workflowVersion) >= 2 && order?.workflowStatus) {
    return order.workflowStatus;
  }
  return null;
}

export function resolveOrderStatus(order) {
  if (!order) {
    return {
      legacyStatus: "pending",
      workflowStatus: null,
      workflowVersion: 0,
      label: DISPLAY_LABELS.pending,
      isScheduled: false,
      returnStatus: null,
      returnLabel: null,
      isDisputed: false,
      cancellationPending: false,
      step: 0,
    };
  }

  const rawStatus = String(order.status || "").toLowerCase();
  const workflowStatus = resolveWorkflowStatusFor(order);

  const legacyStatus = ORPHAN_STATUSES.has(rawStatus)
    ? rawStatus
    : workflowStatus
      ? legacyStatusFromWorkflow(workflowStatus)
      : (rawStatus || "pending");

  const returnStatusRaw = order.returnStatus && order.returnStatus !== "none" ? order.returnStatus : null;
  const isDisputed = legacyStatus === "disputed" || Boolean(order.disputeRef);
  const cancellationPending = order.cancellationRequest?.status === "pending";
  const isScheduled = workflowStatus === WORKFLOW_STATUS.SCHEDULED_HOLD;

  let label = DISPLAY_LABELS[legacyStatus] || legacyStatus.replace(/_/g, " ");
  if (isScheduled) label = "Scheduled";
  // Return/dispute/cancellation overlays take label priority over the base
  // lifecycle status — an order sitting at "delivered" with an active return
  // should read as the return state, not silently look finished.
  const returnLabel = returnStatusRaw
    ? RETURN_STATUS_LABELS[returnStatusRaw] || returnStatusRaw.replace(/_/g, " ")
    : null;
  if (returnLabel) label = returnLabel;
  else if (cancellationPending) label = "Cancellation Requested";

  const step = workflowStatus && workflowStatus in WORKFLOW_STAGE_INDEX
    ? WORKFLOW_STAGE_INDEX[workflowStatus]
    : legacyStageIndex(legacyStatus, order);

  return {
    legacyStatus,
    workflowStatus: workflowStatus || null,
    workflowVersion: Number(order.workflowVersion) || 0,
    label,
    isScheduled,
    returnStatus: returnStatusRaw,
    returnLabel,
    isDisputed,
    cancellationPending,
    step,
  };
}

/**
 * Maps resolveOrderStatus over an array of (lean or hydrated) order docs,
 * attaching the result as `displayStatus` without touching any other field.
 * Safe on both plain objects (.lean()) and Mongoose documents.
 */
export function attachDisplayStatus(order) {
  if (!order) return order;
  const plain = typeof order.toObject === "function" ? order.toObject() : order;
  return { ...plain, displayStatus: resolveOrderStatus(order) };
}

export function attachDisplayStatusToList(orders) {
  if (!Array.isArray(orders)) return orders;
  return orders.map(attachDisplayStatus);
}
