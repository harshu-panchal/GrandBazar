/**
 * Single source of truth for order status across customer, seller, delivery, and admin UIs.
 * Mirrors backend `legacyStatusFromWorkflow` (see backend/app/constants/orderWorkflow.js)
 * and backend/app/services/orderStatusResolver.js's resolveOrderStatus().
 *
 * Every function below prefers `order.displayStatus` (the backend-resolved,
 * authoritative object attached by resolveOrderStatus/attachDisplayStatus)
 * when present, and only falls back to local derivation for orders fetched
 * before that field existed (older cached responses, offline data). This is
 * the fix for the historical "customer sees X, seller sees Y" drift — once
 * displayStatus is present, every module reads the exact same answer.
 */

export const WORKFLOW_STATUS = {
  CREATED: "CREATED",
  PREORDER_HOLD: "PREORDER_HOLD",
  SELLER_PENDING: "SELLER_PENDING",
  SELLER_ACCEPTED: "SELLER_ACCEPTED",
  SCHEDULED_HOLD: "SCHEDULED_HOLD",
  AWAITING_EXTRA_PAYMENT: "AWAITING_EXTRA_PAYMENT",
  DELIVERY_SEARCH: "DELIVERY_SEARCH",
  EXTERNAL_LOGISTICS_PENDING: "EXTERNAL_LOGISTICS_PENDING",
  DELIVERY_ASSIGNED: "DELIVERY_ASSIGNED",
  PICKUP_READY: "PICKUP_READY",
  CUSTOMER_PICKUP_READY: "CUSTOMER_PICKUP_READY",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  DISPUTED: "DISPUTED",
  CANCELLED: "CANCELLED",
};

const LEGACY_ENUM = new Set([
  "pending",
  "confirmed",
  "packed",
  "ready_for_pickup",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "reschedule_requested",
  "rescheduled",
  "price_revised",
  "awaiting_extra_payment",
  "partial_cancelled",
  "partial_updated",
  "customer_confirmation",
  "preparing",
  "completed",
  "refunded",
  "disputed",
  "preorder_confirmed",
  "scheduled",
]);

function legacyFromWorkflow(workflowStatus) {
  switch (workflowStatus) {
    case WORKFLOW_STATUS.CREATED:
    case WORKFLOW_STATUS.SELLER_PENDING:
      return "pending";
    case WORKFLOW_STATUS.PREORDER_HOLD:
      return "preorder_confirmed";
    case WORKFLOW_STATUS.SCHEDULED_HOLD:
      // Matches backend legacyStatusFromWorkflow exactly — "scheduled" was
      // never a legal Order.status enum value, this bucket collapses into
      // "confirmed" like the backend does; use isScheduledHoldOrder(order)
      // below when the distinct "scheduled" nuance is needed.
      return "confirmed";
    case WORKFLOW_STATUS.SELLER_ACCEPTED:
    case WORKFLOW_STATUS.DELIVERY_SEARCH:
    case WORKFLOW_STATUS.EXTERNAL_LOGISTICS_PENDING:
      return "confirmed";
    case WORKFLOW_STATUS.AWAITING_EXTRA_PAYMENT:
      return "awaiting_extra_payment";
    case WORKFLOW_STATUS.DELIVERY_ASSIGNED:
      return "confirmed";
    case WORKFLOW_STATUS.PICKUP_READY:
      return "packed";
    case WORKFLOW_STATUS.CUSTOMER_PICKUP_READY:
      return "ready_for_pickup";
    case WORKFLOW_STATUS.OUT_FOR_DELIVERY:
      return "out_for_delivery";
    case WORKFLOW_STATUS.DELIVERED:
      return "delivered";
    case WORKFLOW_STATUS.DISPUTED:
      return "disputed";
    case WORKFLOW_STATUS.CANCELLED:
      return "cancelled";
    default:
      return "pending";
  }
}

/**
 * Normalized legacy bucket (matches Order.status enum + v2 workflow mapping).
 * Use for filters, tabs, and comparisons across panels.
 */
export function getLegacyStatusFromOrder(order) {
  if (!order) return "pending";

  if (order.displayStatus?.legacyStatus) {
    return order.displayStatus.legacyStatus;
  }

  const explicit = String(order.status ?? "").toLowerCase();
  if (
    [
      "reschedule_requested",
      "rescheduled",
      "price_revised",
      "awaiting_extra_payment",
      "partial_cancelled",
      "partial_updated",
      "customer_confirmation",
      "preparing",
      "completed",
      "refunded",
      "disputed",
      "preorder_confirmed",
    ].includes(explicit)
  ) {
    return explicit;
  }

  const v = Number(order.workflowVersion) || 0;
  if (v >= 2 && order.workflowStatus) {
    const workflowStatus = String(order.workflowStatus).toUpperCase();
    if (workflowStatus === WORKFLOW_STATUS.OUT_FOR_DELIVERY) return "out_for_delivery";
    if (workflowStatus === WORKFLOW_STATUS.DELIVERED) return "delivered";
    if (workflowStatus === WORKFLOW_STATUS.PICKUP_READY) return "packed";
    if (
      workflowStatus === WORKFLOW_STATUS.DELIVERY_ASSIGNED ||
      workflowStatus === WORKFLOW_STATUS.DELIVERY_SEARCH ||
      workflowStatus === WORKFLOW_STATUS.SELLER_ACCEPTED
    ) {
      return "confirmed";
    }
    return legacyFromWorkflow(workflowStatus);
  }

  const riderStep = Number(order.deliveryRiderStep) || 0;
  if (riderStep >= 3 || order.outForDeliveryAt || order.pickupConfirmedAt) {
    return "out_for_delivery";
  }
  if (riderStep >= 1 || order.assignedAt || order.pickupReadyAt || order.deliveryBoy) {
    return "confirmed";
  }

  if (LEGACY_ENUM.has(explicit)) return explicit;
  return "pending";
}

export const CUSTOMER_CANCELLATION_STATE = {
  NONE: "none",
  INSTANT: "instant",
  APPROVAL_REQUIRED: "approval_required",
  PENDING_APPROVAL: "pending_approval",
};

export function getCustomerCancellationState(order) {
  if (!order) return CUSTOMER_CANCELLATION_STATE.NONE;

  const workflowStatus = String(order.workflowStatus || "").toUpperCase();
  const rawStatus = String(order.status || "").toLowerCase();
  const requestStatus = String(order.cancellationRequest?.status || "none").toLowerCase();

  if (
    workflowStatus === WORKFLOW_STATUS.CANCELLED ||
    workflowStatus === WORKFLOW_STATUS.DELIVERED ||
    workflowStatus === WORKFLOW_STATUS.DISPUTED ||
    rawStatus === "cancelled" ||
    rawStatus === "delivered" ||
    rawStatus === "disputed"
  ) {
    return CUSTOMER_CANCELLATION_STATE.NONE;
  }

  if (requestStatus === "pending") {
    return CUSTOMER_CANCELLATION_STATE.PENDING_APPROVAL;
  }

  if (
    workflowStatus === WORKFLOW_STATUS.SELLER_PENDING ||
    workflowStatus === WORKFLOW_STATUS.PREORDER_HOLD ||
    rawStatus === "pending" ||
    rawStatus === "preorder_confirmed"
  ) {
    return CUSTOMER_CANCELLATION_STATE.INSTANT;
  }

  if (!order.deliveryBoy && ["confirmed", "packed", "rescheduled"].includes(rawStatus)) {
    return CUSTOMER_CANCELLATION_STATE.APPROVAL_REQUIRED;
  }

  if (
    !order.deliveryBoy &&
    [
      WORKFLOW_STATUS.SELLER_ACCEPTED,
      WORKFLOW_STATUS.SCHEDULED_HOLD,
      WORKFLOW_STATUS.DELIVERY_SEARCH,
      WORKFLOW_STATUS.EXTERNAL_LOGISTICS_PENDING,
      WORKFLOW_STATUS.AWAITING_EXTRA_PAYMENT,
    ].includes(workflowStatus)
  ) {
    return CUSTOMER_CANCELLATION_STATE.APPROVAL_REQUIRED;
  }

  return CUSTOMER_CANCELLATION_STATE.NONE;
}

export function canCustomerCancelOrder(order) {
  const state = getCustomerCancellationState(order);
  return (
    state === CUSTOMER_CANCELLATION_STATE.INSTANT ||
    state === CUSTOMER_CANCELLATION_STATE.APPROVAL_REQUIRED
  );
}

const DISPLAY_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  packed: "Packed",
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
  scheduled: "Scheduled",
};

export function isScheduledHoldOrder(order) {
  const ws = String(order?.workflowStatus || "").toUpperCase();
  return ws === WORKFLOW_STATUS.SCHEDULED_HOLD;
}

export function canSellerManuallyUpdateStatus(order) {
  if (!order) return false;
  if (isScheduledHoldOrder(order)) return false;
  const ws = String(order?.workflowStatus || "").toUpperCase();
  if (ws === WORKFLOW_STATUS.PREORDER_HOLD) return false;
  return true;
}

/**
 * Replacement + split delivery are allowed while the order is still with the seller,
 * including scheduled holds (before logistics starts).
 */
export function canSellerSplitOrReplace(order) {
  if (!order) return false;

  const ws = String(order?.workflowStatus || "").toUpperCase();
  if (
    [
      WORKFLOW_STATUS.CANCELLED,
      WORKFLOW_STATUS.DELIVERED,
      WORKFLOW_STATUS.OUT_FOR_DELIVERY,
      WORKFLOW_STATUS.DISPUTED,
      WORKFLOW_STATUS.PREORDER_HOLD,
    ].includes(ws)
  ) {
    return false;
  }

  const legacy = String(getLegacyStatusFromOrder(order) || "").toLowerCase();
  if (
    ["delivered", "cancelled", "out_for_delivery", "returned", "refunded"].includes(
      legacy,
    )
  ) {
    return false;
  }

  return true;
}

/**
 * Customers can add items to an order up until the seller packs it — mirrors
 * the backend's ADD_ITEMS_BLOCKED_WORKFLOW_STATUSES guard in
 * orderPriceAdjustmentService.js (server is always the final authority).
 */
export function canCustomerAddItems(order) {
  if (!order) return false;

  const ws = String(order?.workflowStatus || "").toUpperCase();
  if (
    [
      WORKFLOW_STATUS.PICKUP_READY,
      WORKFLOW_STATUS.CUSTOMER_PICKUP_READY,
      WORKFLOW_STATUS.OUT_FOR_DELIVERY,
      WORKFLOW_STATUS.DELIVERED,
      WORKFLOW_STATUS.CANCELLED,
      WORKFLOW_STATUS.DISPUTED,
    ].includes(ws)
  ) {
    return false;
  }
  if (order.deliveryBoy) return false;

  const legacy = String(getLegacyStatusFromOrder(order) || "").toLowerCase();
  if (
    [
      "packed",
      "ready_for_pickup",
      "out_for_delivery",
      "delivered",
      "cancelled",
      "completed",
      "refunded",
      "disputed",
      "awaiting_extra_payment",
    ].includes(legacy)
  ) {
    return false;
  }

  return true;
}

/**
 * Latest admin store reassignment, if any.
 * Prefers denormalized `storeReassignment`, falls back to modificationTimeline.
 */
export function getOrderStoreReassignment(order) {
  if (!order) return null;

  const snapshot = order.storeReassignment;
  if (snapshot?.toStoreId || snapshot?.reassignedAt) {
    return {
      fromStoreId: snapshot.fromStoreId || "",
      toStoreId: snapshot.toStoreId || "",
      fromShopName: snapshot.fromShopName || "Previous store",
      toShopName: snapshot.toShopName || "New store",
      reason: snapshot.reason || "",
      note: snapshot.note || "",
      reassignedAt: snapshot.reassignedAt || null,
      reassignedBy: snapshot.reassignedBy || "",
      previousWorkflowStatus: snapshot.previousWorkflowStatus || "",
    };
  }

  const timeline = Array.isArray(order.modificationTimeline)
    ? order.modificationTimeline
    : [];
  for (let i = timeline.length - 1; i >= 0; i -= 1) {
    const entry = timeline[i];
    if (String(entry?.type || "") !== "seller_reassigned") continue;
    const meta = entry.meta || {};
    return {
      fromStoreId: meta.fromStoreId || "",
      toStoreId: meta.toStoreId || "",
      fromShopName: meta.fromShopName || "Previous store",
      toShopName: meta.toShopName || "New store",
      reason: meta.reason || "",
      note: entry.note || "",
      reassignedAt: entry.createdAt || null,
      reassignedBy: entry.actorId || "",
      previousWorkflowStatus: meta.previousWorkflowStatus || "",
    };
  }

  return null;
}

export function isOrderStoreReassigned(order) {
  return Boolean(getOrderStoreReassignment(order));
}

// Reconciles the return-status label sets previously duplicated (with
// drift) across the shared util, customer's ReturnProgressTracker.jsx, and
// seller/admin's Returns.jsx — matches
// backend/app/services/orderStatusResolver.js's RETURN_STATUS_LABELS
// exactly, so backend-attached displayStatus.returnLabel and this
// client-side fallback always agree.
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

export function getReturnStatusLabel(returnStatus) {
  if (!returnStatus || returnStatus === "none") return null;
  return (
    RETURN_STATUS_LABELS[returnStatus] ||
    returnStatus.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
  );
}

export function getOrderStatusLabel(order) {
  if (order?.displayStatus?.label) {
    return order.displayStatus.label;
  }

  const returnLabel = getReturnStatusLabel(order?.returnStatus);
  if (returnLabel) return returnLabel;

  const bucket = getLegacyStatusFromOrder(order);
  return DISPLAY_LABELS[bucket] || bucket.replace(/_/g, " ");
}

// Centralized color/badge variant mapping — replaces the four independent
// copies previously found in seller Orders.jsx, admin OrdersList.jsx,
// admin OrderDetail.jsx, and admin SellerDetail.jsx. Variant names match
// what this codebase's Badge components already expect
// (success/warning/error/info/primary/secondary).
export function getStatusVariant(legacyStatus) {
  const s = String(legacyStatus || "").toLowerCase();
  switch (s) {
    case "pending": return "warning";
    case "confirmed": return "info";
    case "packed": return "primary";
    case "ready_for_pickup": return "primary";
    case "out_for_delivery": return "secondary";
    case "delivered": return "success";
    case "cancelled": return "error";
    case "disputed": return "error";
    case "preorder_confirmed": return "info";
    default: return "secondary";
  }
}

// Mirrors the 0-6 tracker position previously locked inside customer's
// OrderProgressTracker.jsx (WORKFLOW_STAGE_INDEX/legacyStageIndex) and
// backend/app/services/orderStatusResolver.js's identical table — moved
// here so every module (including delivery, which had no tracker concept
// at all) can share one step index instead of guessing independently.
const WORKFLOW_STAGE_INDEX = {
  CREATED: 0,
  PREORDER_HOLD: 0,
  SELLER_PENDING: 1,
  SELLER_ACCEPTED: 2,
  SCHEDULED_HOLD: 2,
  AWAITING_EXTRA_PAYMENT: 2,
  DELIVERY_SEARCH: 2,
  EXTERNAL_LOGISTICS_PENDING: 2,
  DELIVERY_ASSIGNED: 3,
  PICKUP_READY: 4,
  CUSTOMER_PICKUP_READY: 4,
  OUT_FOR_DELIVERY: 5,
  DELIVERED: 6,
  DISPUTED: 5,
};

function legacyStageIndex(order, legacyStatus) {
  if (legacyStatus === "delivered") return 6;
  if (legacyStatus === "out_for_delivery") return 5;
  if (legacyStatus === "packed" || legacyStatus === "ready_for_pickup") return 4;
  if (order?.deliveryBoy || order?.assignedAt) return 3;
  if (legacyStatus === "confirmed") return 2;
  if (legacyStatus === "pending") return 1;
  return 0;
}

export function getOrderTrackerStep(order) {
  if (typeof order?.displayStatus?.step === "number") {
    return order.displayStatus.step;
  }

  const legacyStatus = getLegacyStatusFromOrder(order);
  const workflowVersion = Number(order?.workflowVersion) || 0;
  const workflowStatus = String(order?.workflowStatus || "").toUpperCase();
  if (workflowVersion >= 2 && workflowStatus in WORKFLOW_STAGE_INDEX) {
    return WORKFLOW_STAGE_INDEX[workflowStatus];
  }
  return legacyStageIndex(order, legacyStatus);
}

export function adminRouteMatchesOrder(routeStatus, order) {
  const legacy = getLegacyStatusFromOrder(order);
  if (routeStatus === "all") return true;
  if (routeStatus === "pending") return legacy === "pending" || legacy === "preorder_confirmed";
  if (routeStatus === "processed") {
    return ["confirmed", "packed", "rescheduled", "reschedule_requested", "awaiting_extra_payment", "price_revised", "partial_cancelled", "partial_updated", "customer_confirmation", "preparing", "completed", "refunded"].includes(legacy);
  }
  // "scheduled" was never a legal legacy-status value (see legacyFromWorkflow
  // above) — isScheduledHoldOrder reads workflowStatus directly instead of
  // relying on a bucket string that could never actually equal "scheduled".
  if (routeStatus === "scheduled") return isScheduledHoldOrder(order);
  if (routeStatus === "out-for-delivery") return legacy === "out_for_delivery";
  if (routeStatus === "delivered") return legacy === "delivered";
  if (routeStatus === "cancelled") return legacy === "cancelled";
  if (routeStatus === "disputed") return legacy === "disputed";
  if (routeStatus === "returned") {
    const rs = order?.returnStatus;
    return rs && rs !== "none";
  }
  return legacy === routeStatus;
}
