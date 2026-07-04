export const SELLER_PERMISSION_MODULES = Object.freeze([
  { id: "storefront", label: "Store Design" },
  { id: "products", label: "Products" },
  { id: "inventory", label: "Stock / Inventory" },
  { id: "orders", label: "Orders" },
  { id: "returns", label: "Returns" },
  { id: "tracking", label: "Track Orders" },
  { id: "scheduling", label: "Scheduling & Delivery Windows" },
  { id: "campaigns", label: "Pre-Order Campaigns" },
  { id: "adjustments", label: "Price Adjustments" },
  { id: "disputes", label: "Disputes" },
  { id: "coupons", label: "Offers & Coupons" },
  { id: "analytics", label: "Sales Reports" },
  { id: "withdrawals", label: "Money & Earnings" },
]);

export const SELLER_MODULE_IDS = SELLER_PERMISSION_MODULES.map((m) => m.id);

export const SELLER_PERMISSION_LEVELS = Object.freeze(["read", "write"]);

export const PLATFORM_ADMIN_PERMISSIONS = Object.freeze([
  "scheduling:read",
  "scheduling:write",
  "campaigns:read",
  "campaigns:write",
  "adjustments:read",
  "adjustments:write",
  "disputes:read",
  "disputes:write",
  "logistics:override",
  "orders:override",
]);

export function permissionKey(module, level) {
  return `${module}:${level}`;
}

export function isValidSellerModule(module) {
  return SELLER_MODULE_IDS.includes(module);
}
