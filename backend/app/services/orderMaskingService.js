import { isAdminScopedUser } from "../utils/helper.js";

const ELEVATED_OPERATIONS_PERMISSIONS = [
  "operations.intervene",
  "operations.manage_shops",
  "operations.payments",
];

const MASK = "••••• •••••";

// Only the Operator L1 tier ("operations.monitor" granted, nothing higher)
// gets PII masked — matching the mock's can(2) rule ("full" from L2 up).
// Deliberately scoped to that one rung: other existing custom roles
// (Accountant, Assistant, ...) never opted into the operations.* namespace
// at all, so this leaves their behavior untouched rather than retroactively
// hiding data from roles that were never designed around this concept.
function shouldMask(user) {
  if (!isAdminScopedUser(user)) return false;
  if (user.role === "admin" || user.role === "superadmin") return false;
  const allowed = user.allowedPermissions || [];
  if (!allowed.includes("operations.monitor")) return false;
  return !ELEVATED_OPERATIONS_PERMISSIONS.some((key) => allowed.includes(key));
}

function maskOne(order) {
  const masked = { ...order };
  if (masked.customer && typeof masked.customer === "object") {
    masked.customer = { ...masked.customer, name: MASK, phone: MASK, email: MASK };
  }
  if (masked.address && typeof masked.address === "object") {
    masked.address = { ...masked.address, address: "Area hidden", phone: MASK, name: MASK };
  }
  return masked;
}

function applyOrderMediaVisibility(order, user) {
  if (!order) return order;
  const role = String(user?.role || "").toLowerCase();
  if (role !== "customer" && role !== "user") return order;

  const visible = { ...order };
  // Product handover proof is operational evidence shared only with the
  // seller, assigned rider, and admins. Customers still receive the status.
  delete visible.pickupProofImages;
  return visible;
}

export function maskOrderForViewer(order, user) {
  const mediaSafeOrder = applyOrderMediaVisibility(order, user);
  if (!mediaSafeOrder || !shouldMask(user)) return mediaSafeOrder;
  return maskOne(mediaSafeOrder);
}

export function maskOrdersForViewer(orders, user) {
  if (!Array.isArray(orders)) return orders;
  const mediaSafeOrders = orders.map((order) => applyOrderMediaVisibility(order, user));
  if (!shouldMask(user)) return mediaSafeOrders;
  return mediaSafeOrders.map(maskOne);
}
