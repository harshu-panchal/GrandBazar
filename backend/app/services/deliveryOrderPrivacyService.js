import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";

const ACTIVE_RETURN_STATUSES = new Set([
  "return_approved",
  "return_pickup_assigned",
  "return_picked_up",
]);

function refId(value) {
  if (!value) return "";
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

export function isDeliveredOrder(order) {
  return String(order?.status || "").toLowerCase() === "delivered"
    || String(order?.orderStatus || "").toLowerCase() === "delivered"
    || String(order?.workflowStatus || "").toUpperCase() === WORKFLOW_STATUS.DELIVERED;
}

function riderNeedsCustomerDetailsForReturn(order, viewerId) {
  if (!ACTIVE_RETURN_STATUSES.has(String(order?.returnStatus || "").toLowerCase())) return false;
  return refId(order?.returnDeliveryBoy) === String(viewerId || "");
}

/** Remove customer PII from completed orders returned to a delivery partner. */
export function redactDeliveredCustomerDetails(order, viewer = {}) {
  if (!order || String(viewer?.role || "").toLowerCase() !== "delivery") return order;
  const viewerId = viewer?.id ?? viewer?._id;
  if (!isDeliveredOrder(order) || riderNeedsCustomerDetailsForReturn(order, viewerId)) return order;

  const redacted = { ...order };
  delete redacted.customer;
  delete redacted.address;
  delete redacted.customerName;
  delete redacted.customerPhone;
  delete redacted.deliveryAddress;
  delete redacted.addressSnapshot;
  redacted.customerDetailsRemoved = true;
  return redacted;
}

export function redactDeliveredCustomerDetailsList(orders, viewer) {
  return Array.isArray(orders)
    ? orders.map((order) => redactDeliveredCustomerDetails(order, viewer))
    : orders;
}
