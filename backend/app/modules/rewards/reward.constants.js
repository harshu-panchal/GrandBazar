export const CAMPAIGN_TYPE = Object.freeze({
  CASHBACK: "cashback",
  REWARD: "reward",
  COUPON: "coupon",
  REFERRAL: "referral",
});

export const CAMPAIGN_STATUS = Object.freeze({
  DRAFT: "draft",
  ACTIVE: "active",
  PAUSED: "paused",
  EXPIRED: "expired",
});

export const FUNDING_SOURCE = Object.freeze({
  PLATFORM: "platform",
  SELLER: "seller",
  BRAND: "brand",
  SHARED: "shared",
});

export const REWARD_SUBTYPE = Object.freeze({
  INSTANT_CASHBACK: "instant_cashback",
  FUTURE_CASHBACK: "future_cashback",
  FIRST_PURCHASE: "first_purchase",
  REPEAT_PURCHASE: "repeat_purchase",
  PRODUCT_CASHBACK: "product_cashback",
  CATEGORY_CASHBACK: "category_cashback",
  BRAND_CASHBACK: "brand_cashback",
  SHOP_CASHBACK: "shop_cashback",
  FESTIVAL: "festival",
  NEW_SHOP_PROMOTION: "new_shop_promotion",
  NEW_SHOP_REWARD: "new_shop_reward",
  MILESTONE: "milestone",
  BIRTHDAY: "birthday",
  VOUCHER: "voucher",
  DIGITAL_VOUCHER: "digital_voucher",
  FLAT_COUPON: "flat_coupon",
  PERCENT_COUPON: "percent_coupon",
  FREE_DELIVERY: "free_delivery",
  REFERRAL_REGISTRATION: "referral_registration",
  REFERRAL_FIRST_PURCHASE: "referral_first_purchase",
});

export const CREDIT_TIMING = Object.freeze({
  ON_DELIVERY: "on_delivery",
  ON_PAYMENT: "on_payment",
  DELAYED_DAYS: "delayed_days",
});

export const GRANT_STATUS = Object.freeze({
  CREATED: "created",
  PENDING: "pending",
  ACTIVE: "active",
  LOCKED: "locked",
  REDEEMED: "redeemed",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
  REVERSED: "reversed",
});

export const REWARD_TXN_TYPE = Object.freeze({
  CREDIT: "credit",
  DEBIT: "debit",
  REVERSAL: "reversal",
});

export const CUSTOMER_ELIGIBILITY = Object.freeze({
  ALL: "all",
  NEW: "new",
  EXISTING: "existing",
  SUBSCRIPTION: "subscription",
});

export const REFERRAL_CHANNEL = Object.freeze({
  LINK: "link",
  QR: "qr",
  MOBILE: "mobile",
  CODE: "code",
});

export const REFERRAL_STATUS = Object.freeze({
  PENDING: "pending",
  REGISTERED: "registered",
  FIRST_ORDER: "first_order",
  REWARDED: "rewarded",
  REJECTED: "rejected",
});

export const REFERRAL_TYPE = Object.freeze({
  CUSTOMER: "customer",
  SELLER: "seller",
  DELIVERY: "delivery",
});

export const REWARD_JOB_NAMES = Object.freeze({
  ACTIVATE_PENDING: "activate-pending-grant",
  EXPIRE_CAMPAIGN: "expire-campaign",
  EXPIRY_REMINDER: "expiry-reminder",
  BIRTHDAY_REWARDS: "birthday-rewards",
});

export const REWARD_NOTIFICATION_EVENTS = Object.freeze({
  CASHBACK_CREDITED: "CASHBACK_CREDITED",
  REWARD_EARNED: "REWARD_EARNED",
  REWARD_EXPIRING: "REWARD_EXPIRING",
  REWARD_EXPIRED: "REWARD_EXPIRED",
  COUPON_ISSUED: "COUPON_ISSUED",
  BIRTHDAY_REWARD: "BIRTHDAY_REWARD",
  REFERRAL_SUCCESS: "REFERRAL_SUCCESS",
});

/** Platform defaults for spending reward wallet at checkout */
export const DEFAULT_WALLET_REDEMPTION = Object.freeze({
  minOrderAmount: Number(process.env.REWARD_WALLET_MIN_ORDER || 0),
  maxWalletPercent: Number(process.env.REWARD_WALLET_MAX_PERCENT || 100),
  maxWalletAmount: process.env.REWARD_WALLET_MAX_AMOUNT
    ? Number(process.env.REWARD_WALLET_MAX_AMOUNT)
    : null,
  allowWithCoupon: String(process.env.REWARD_WALLET_ALLOW_WITH_COUPON || "true") !== "false",
});
