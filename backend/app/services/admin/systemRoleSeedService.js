import AdminRole from "../../models/adminRole.js";

// Immutable system roles seeded on boot so pre-existing/expected staff
// always have a role to appear under. Admins can clone or edit these like
// any other role afterward (isSystem only blocks renaming/deleting them).
export const SYSTEM_ADMIN_ROLES = [
  {
    name: "accountant",
    label: "Accountant",
    description: "Finance, payouts & settlements",
    permissions: [
      "dashboard",
      "accountant",
      "accountant.expenses",
      "accountant.expenses_write",
      "accountant.gst_tcs",
      "accountant.gst_tcs_write",
      "accountant.audit_pack",
      "wallet",
      "wallet.write",
      "bulk_settlements",
      "seller_payments",
      "billing",
      "sellers.subscriptions",
      "sellers",
    ],
  },
  { name: "assistant", label: "Assistant", description: "General admin support", permissions: ["dashboard", "support", "customers", "orders", "faqs"] },
  // Operator tiers — escalating order-ops access, each with a ₹ ceiling
  // on credits/refunds above which the action is sent for approval to
  // the next tier (see approvalRequestService.js). Admins can clone or
  // edit these like any other role.
  {
    name: "operator_l1",
    label: "Operations Executive",
    description: "Monitor orders, coordinate, escalate. Mostly read-only.",
    permissions: ["dashboard", "orders", "operations.monitor"],
    moneyLimit: 0,
    requiresTwoFactor: false,
  },
  {
    name: "operator_l2",
    label: "Senior Operations Executive",
    description: "Controlled intervention: reroute, reschedule, partial cancel, refunds within limit.",
    permissions: [
      "dashboard", "orders", "operations.monitor", "operations.intervene",
      "orders.reschedule", "orders.adjust_price", "orders.replacement", "orders.split_delivery",
    ],
    moneyLimit: 500,
    requiresTwoFactor: false,
  },
  {
    name: "operator_l3",
    label: "Operations Manager",
    description: "Shop, seller and logistics control. Approves L2 requests within limit.",
    permissions: [
      "dashboard", "orders", "sellers", "operations.monitor", "operations.intervene", "operations.manage_shops",
      "orders.reschedule", "orders.adjust_price", "orders.replacement", "orders.split_delivery",
    ],
    moneyLimit: 2000,
    requiresTwoFactor: false,
  },
  {
    name: "operator_l4",
    label: "Operations Controller",
    description: "Payment, refund and settlement status with Maker-Checker approval.",
    permissions: [
      "dashboard", "orders", "sellers", "wallet", "withdrawals",
      "operations.monitor", "operations.intervene", "operations.manage_shops", "operations.payments",
      "orders.reschedule", "orders.adjust_price", "orders.replacement", "orders.split_delivery",
    ],
    moneyLimit: 15000,
    requiresTwoFactor: true,
  },
];

/**
 * Upserts every role in SYSTEM_ADMIN_ROLES that doesn't already exist yet.
 * Safe to call repeatedly (idempotent — $setOnInsert never touches a role
 * an admin has since edited) and safe to call outside server boot, since
 * callers may need these to exist without waiting for a restart.
 */
export async function seedSystemAdminRoles() {
  for (const role of SYSTEM_ADMIN_ROLES) {
    await AdminRole.updateOne(
      { name: role.name },
      { $setOnInsert: { ...role, isSystem: true } },
      { upsert: true },
    );
  }
}
