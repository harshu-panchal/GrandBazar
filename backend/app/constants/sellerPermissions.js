export const SELLER_PERMISSION_MODULES = Object.freeze([
  { id: "storefront", label: "Store Design" },
  { id: "products", label: "Products" },
  { id: "inventory", label: "Stock / Inventory" },
  { id: "orders", label: "Orders" },
  { id: "returns", label: "Returns" },
  { id: "tracking", label: "Track Orders" },
  { id: "coupons", label: "Offers & Coupons" },
  { id: "analytics", label: "Sales Reports" },
  { id: "withdrawals", label: "Money & Earnings" },
]);

export const SELLER_MODULE_IDS = SELLER_PERMISSION_MODULES.map((m) => m.id);

export const SELLER_PERMISSION_LEVELS = Object.freeze(["read", "write"]);

export function permissionKey(module, level) {
  return `${module}:${level}`;
}

export function isValidSellerModule(module) {
  return SELLER_MODULE_IDS.includes(module);
}
