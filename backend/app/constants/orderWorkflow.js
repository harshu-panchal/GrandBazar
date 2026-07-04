/**
 * Canonical workflow statuses for Quick Commerce orders (v2).
 * Legacy `status` on Order is kept in sync for admin / older UIs.
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
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  DISPUTED: "DISPUTED",
  CANCELLED: "CANCELLED",
};

export const FULFILLMENT_TYPE = {
  INSTANT: "instant",
  SCHEDULED: "scheduled",
  PREORDER: "preorder",
};

/** Milliseconds — override via env in services */
export const DEFAULT_SELLER_TIMEOUT_MS = () =>
  parseInt(process.env.SELLER_TIMEOUT_MS || "60000", 10);

export const DEFAULT_SCHEDULED_SELLER_TIMEOUT_MS = () =>
  parseInt(process.env.SCHEDULED_SELLER_TIMEOUT_MS || String(24 * 60 * 60 * 1000), 10);

export const DEFAULT_DELIVERY_TIMEOUT_MS = () =>
  parseInt(process.env.DELIVERY_TIMEOUT_MS || "60000", 10);

export const DEFAULT_ACTIVATION_LEAD_MS = () =>
  parseInt(process.env.ORDER_ACTIVATION_LEAD_MS || String(2 * 60 * 60 * 1000), 10);

export const DEFAULT_EXTRA_PAYMENT_DEADLINE_MS = () =>
  parseInt(process.env.EXTRA_PAYMENT_DEADLINE_MS || String(24 * 60 * 60 * 1000), 10);

export const DEFAULT_STORE_TIMEZONE = () =>
  process.env.DEFAULT_STORE_TIMEZONE || "Asia/Kolkata";

/**
 * Map workflow -> legacy `status` string (existing enum on Order schema).
 */
export function legacyStatusFromWorkflow(workflowStatus) {
  switch (workflowStatus) {
    case WORKFLOW_STATUS.CREATED:
      return "pending";
    case WORKFLOW_STATUS.PREORDER_HOLD:
      return "preorder_confirmed";
    case WORKFLOW_STATUS.SELLER_PENDING:
      return "pending";
    case WORKFLOW_STATUS.SELLER_ACCEPTED:
      return "confirmed";
    case WORKFLOW_STATUS.SCHEDULED_HOLD:
      return "confirmed";
    case WORKFLOW_STATUS.AWAITING_EXTRA_PAYMENT:
      return "awaiting_extra_payment";
    case WORKFLOW_STATUS.DELIVERY_SEARCH:
      return "confirmed";
    case WORKFLOW_STATUS.EXTERNAL_LOGISTICS_PENDING:
      return "confirmed";
    case WORKFLOW_STATUS.DELIVERY_ASSIGNED:
      return "confirmed";
    case WORKFLOW_STATUS.PICKUP_READY:
      return "packed";
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
 * Infer workflow from legacy `status` when workflowVersion < 2 or missing workflowStatus.
 */
export function workflowFromLegacyStatus(legacy) {
  const s = (legacy || "").toLowerCase();
  if (s === "pending") return WORKFLOW_STATUS.SELLER_PENDING;
  if (s === "preorder_confirmed") return WORKFLOW_STATUS.PREORDER_HOLD;
  if (s === "confirmed") return WORKFLOW_STATUS.DELIVERY_SEARCH;
  if (s === "packed") return WORKFLOW_STATUS.PICKUP_READY;
  if (s === "out_for_delivery") return WORKFLOW_STATUS.OUT_FOR_DELIVERY;
  if (s === "delivered") return WORKFLOW_STATUS.DELIVERED;
  if (s === "disputed") return WORKFLOW_STATUS.DISPUTED;
  if (s === "awaiting_extra_payment") return WORKFLOW_STATUS.AWAITING_EXTRA_PAYMENT;
  if (s === "reschedule_requested") return WORKFLOW_STATUS.SCHEDULED_HOLD;
  if (s === "rescheduled") return WORKFLOW_STATUS.SCHEDULED_HOLD;
  if (s === "price_revised") return WORKFLOW_STATUS.SCHEDULED_HOLD;
  if (s === "partial_cancelled") return WORKFLOW_STATUS.SCHEDULED_HOLD;
  if (s === "cancelled") return WORKFLOW_STATUS.CANCELLED;
  return WORKFLOW_STATUS.SELLER_PENDING;
}

export function isScheduledFulfillment(fulfillmentType) {
  return fulfillmentType === FULFILLMENT_TYPE.SCHEDULED;
}

export function isPreorderFulfillment(fulfillmentType) {
  return fulfillmentType === FULFILLMENT_TYPE.PREORDER;
}

export function usesRelaxedSellerTimeout(fulfillmentType) {
  return (
    fulfillmentType === FULFILLMENT_TYPE.SCHEDULED ||
    fulfillmentType === FULFILLMENT_TYPE.PREORDER
  );
}
