export const SUBSCRIPTION_STATUS = {
  PENDING_PAYMENT: "pending_payment",
  ACTIVE: "active",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
};

export const PAYMENT_REQUEST_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

export const PAYMENT_REQUEST_TYPE = {
  NEW: "new",
  RENEWAL: "renewal",
  UPGRADE: "upgrade",
};

export const BILLING_CYCLE = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  YEARLY: "yearly",
};

export const BILLING_CYCLE_DURATION_DAYS = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  quarterly: 90,
  yearly: 365,
};
