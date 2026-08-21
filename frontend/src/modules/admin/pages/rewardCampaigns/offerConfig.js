// Per-offer-type metadata driving the "Configure" step of the Reward Campaign
// wizard. Each rewardSubtype declares which config section it needs (`group`),
// which single scope field applies (`scopeField`), and whether the
// wallet-redemption / eligibility sections are relevant at all — so the form
// only ever shows fields that mean something for the selected offer.

export const REWARD_TYPE_FAMILIES = [
  {
    id: "cashback_rewards",
    label: "Cashback & Rewards",
    desc: "First purchase, shop/product cashback, festival, milestone, birthday & more",
    icon: "gift",
  },
  {
    id: "coupons",
    label: "Coupons",
    desc: "Flat, percentage, free delivery, welcome & festival coupons",
    icon: "ticket",
  },
  {
    id: "referral",
    label: "Referral Rewards",
    desc: "Customer & partner referral incentives",
    icon: "users",
  },
];

export const REWARD_SUBTYPES = [
  // Cashback & Rewards
  { value: "first_purchase", label: "First Purchase Cashback", family: "cashback_rewards", campaignType: "cashback" },
  { value: "repeat_purchase", label: "Repeat Purchase Cashback", family: "cashback_rewards", campaignType: "cashback" },
  { value: "product_cashback", label: "Product-wise Cashback", family: "cashback_rewards", campaignType: "cashback" },
  { value: "category_cashback", label: "Category-wise Cashback", family: "cashback_rewards", campaignType: "cashback" },
  { value: "brand_cashback", label: "Brand-wise Cashback", family: "cashback_rewards", campaignType: "cashback" },
  { value: "shop_cashback", label: "Shop-wise Cashback", family: "cashback_rewards", campaignType: "cashback" },
  { value: "festival", label: "Festival Cashback", family: "cashback_rewards", campaignType: "cashback" },
  { value: "new_shop_promotion", label: "New Shop Promotion Cashback", family: "cashback_rewards", campaignType: "cashback" },
  { value: "milestone", label: "Milestone Rewards (Orders / Spend)", family: "cashback_rewards", campaignType: "reward" },
  { value: "birthday", label: "Birthday Rewards", family: "cashback_rewards", campaignType: "reward" },
  { value: "digital_voucher", label: "Digital Reward Voucher", family: "cashback_rewards", campaignType: "coupon" },
  { value: "new_shop_reward", label: "New Shop Rewards", family: "cashback_rewards", campaignType: "reward" },
  { value: "instant_cashback", label: "Instant Cashback", family: "cashback_rewards", campaignType: "cashback" },
  { value: "future_cashback", label: "Future / Delayed Cashback", family: "cashback_rewards", campaignType: "cashback" },
  // Coupons
  { value: "flat_coupon", label: "Flat Discount Coupon", family: "coupons", campaignType: "coupon" },
  { value: "percent_coupon", label: "Percentage Discount Coupon", family: "coupons", campaignType: "coupon" },
  { value: "free_delivery", label: "Free Delivery Coupon", family: "coupons", campaignType: "coupon" },
  { value: "voucher", label: "Cashback Coupon / Voucher", family: "coupons", campaignType: "coupon" },
  // Referral
  { value: "referral_registration", label: "Referral on Registration", family: "referral", campaignType: "referral" },
  { value: "referral_first_purchase", label: "Referral on First Order", family: "referral", campaignType: "referral" },
];

// scopeField: "none" | "product" | "category" | "brand" | "shop"
// group: "cashback" | "milestone" | "birthday" | "coupon" | "referral"
export const OFFER_CONFIG = {
  first_purchase: { group: "cashback", scopeField: "none", showRedemption: true, showEligibility: true, helpText: "Applies to a customer's very first delivered order." },
  repeat_purchase: { group: "cashback", scopeField: "none", showRedemption: true, showEligibility: true, helpText: "Applies once a customer has at least one prior delivered order." },
  product_cashback: { group: "cashback", scopeField: "product", showRedemption: true, showEligibility: true, helpText: "Cashback is computed only on the value of the selected products in the order." },
  category_cashback: { group: "cashback", scopeField: "category", showRedemption: true, showEligibility: true, helpText: "Cashback is computed only on the value of items from the selected categories." },
  brand_cashback: { group: "cashback", scopeField: "brand", showRedemption: true, showEligibility: true, helpText: "Cashback is computed only on the value of items from the selected brands." },
  shop_cashback: { group: "cashback", scopeField: "shop", showRedemption: true, showEligibility: true, helpText: "Applies only to orders placed with the selected shop(s)." },
  festival: { group: "cashback", scopeField: "none", showRedemption: true, showEligibility: true, requiresFestivalName: true, helpText: "Runs for the scheduled window; give it a festival name for reporting and customer messaging." },
  new_shop_promotion: { group: "cashback", scopeField: "shop", showRedemption: true, showEligibility: true, requiresShopAge: true, helpText: "Only applies while the shop is newer than the max age below." },
  new_shop_reward: { group: "cashback", scopeField: "shop", showRedemption: true, showEligibility: true, requiresShopAge: true, helpText: "Only applies while the shop is newer than the max age below." },
  milestone: { group: "milestone", scopeField: "none", showRedemption: true, showEligibility: true, helpText: "Fires once a customer crosses the order-count or lifetime-spend threshold." },
  birthday: { group: "birthday", scopeField: "none", showRedemption: false, showEligibility: false, helpText: "Runs on a daily birthday check, not at order delivery — order-based eligibility rules don't apply." },
  instant_cashback: { group: "cashback", scopeField: "none", showRedemption: true, showEligibility: true, helpText: "Credits immediately on the configured timing (usually on payment)." },
  future_cashback: { group: "cashback", scopeField: "none", showRedemption: true, showEligibility: true, helpText: "Use \"Delayed (days)\" credit timing below to hold the credit for a period after delivery." },
  flat_coupon: { group: "coupon", scopeField: "none", showRedemption: false, showEligibility: true, helpText: "Issues a flat-amount discount coupon to the customer." },
  percent_coupon: { group: "coupon", scopeField: "none", showRedemption: false, showEligibility: true, helpText: "Issues a percentage-off discount coupon to the customer." },
  free_delivery: { group: "coupon", scopeField: "none", showRedemption: false, showEligibility: true, hideValue: true, helpText: "Issues a free-delivery coupon; no discount value needed." },
  voucher: { group: "coupon", scopeField: "none", showRedemption: false, showEligibility: true, helpText: "Issues a cashback voucher coupon, optionally linked to an existing coupon." },
  digital_voucher: { group: "coupon", scopeField: "none", showRedemption: false, showEligibility: true, helpText: "Issues a personal digital voucher after purchase, optionally linked to an existing coupon." },
  referral_registration: { group: "referral", scopeField: "none", showRedemption: false, showEligibility: false, helpText: "Pays the referrer when a referee registers using their code." },
  referral_first_purchase: { group: "referral", scopeField: "none", showRedemption: false, showEligibility: false, showRefereeValue: true, helpText: "Pays the referrer and (optionally, a different amount to) the referee when the referee's first order is delivered." },
};

export const CREDIT_TIMINGS = [
  { value: "on_delivery", label: "On delivery" },
  { value: "on_payment", label: "On payment success" },
  { value: "delayed_days", label: "Delayed (days)" },
];

export const CAMPAIGN_TYPES = [
  { value: "cashback", label: "Cashback" },
  { value: "reward", label: "Reward" },
  { value: "coupon", label: "Coupon" },
  { value: "referral", label: "Referral" },
];

export const STATUSES = ["draft", "active", "paused", "expired"];
export const FUNDING_SOURCES = ["platform", "seller", "brand", "shared"];
export const CUSTOMER_TYPES = [
  { value: "all", label: "All customers" },
  { value: "new", label: "New customers only" },
  { value: "existing", label: "Existing customers only" },
];

export const resolveFamilyFromSubtype = (subtype) =>
  REWARD_SUBTYPES.find((s) => s.value === subtype)?.family || "cashback_rewards";

export const getOfferConfig = (subtype) => OFFER_CONFIG[subtype] || OFFER_CONFIG.first_purchase;

export const SCOPE_FIELD_META = {
  product: { key: "productIdsText", label: "Product IDs (comma-separated)", placeholder: "Product IDs" },
  category: { key: "categoryIdsText", label: "Category IDs (comma-separated)", placeholder: "Category IDs" },
  brand: { key: "brandIdsText", label: "Brand names (comma-separated)", placeholder: "Brand names" },
  shop: { key: "shopIdsText", label: "Shop / Store IDs (comma-separated)", placeholder: "Store IDs" },
};

export const parseCsvIds = (value) =>
  String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const joinCsvIds = (arr) => (Array.isArray(arr) ? arr.map(String).join(", ") : "");

export const emptyForm = () => ({
  name: "",
  description: "",
  campaignType: "cashback",
  priority: 100,
  status: "draft",
  startAt: "",
  endAt: "",
  timezone: "Asia/Kolkata",
  fundingSource: "platform",
  budgetLimit: "",
  dailyLimit: "",
  monthlyLimit: "",
  sharedFunding: { platformPercent: 50, sellerPercent: 50 },
  rules: {
    minPurchase: 0,
    customerType: "all",
    maxRewardPerCustomer: "",
    maxRewardsPerDay: "",
    milestoneOrderCount: "",
    milestoneSpendAmount: "",
    newShopMaxAgeDays: 30,
    productIdsText: "",
    categoryIdsText: "",
    brandIdsText: "",
    shopIdsText: "",
    cityIdsText: "",
  },
  rewardConfig: {
    rewardSubtype: "",
    valueType: "percent",
    value: 5,
    maxRewardAmount: 100,
    validityDays: 30,
    creditTiming: "on_delivery",
    delayedDays: 0,
    linkedCouponId: "",
    festivalName: "",
    refereeValue: "",
    usageLimit: 1,
    perUserLimit: 1,
    couponCodePrefix: "",
  },
  redemptionRules: {
    minOrderAmount: 0,
    maxWalletPercent: 100,
    maxWalletAmount: "",
    allowWithCoupon: true,
  },
});

const subtypeLabel = (subtype) => REWARD_SUBTYPES.find((s) => s.value === subtype)?.label || subtype;

/** Mirrors backend/app/modules/rewards/reward.validation.js so mistakes surface before submit. */
export function validateFormForSubtype(form) {
  const subtype = form.rewardConfig?.rewardSubtype;
  const config = getOfferConfig(subtype);
  const rules = form.rules || {};
  const rewardConfig = form.rewardConfig || {};

  if (!subtype) return "Please select a reward offer type first";
  if (form.startAt && form.endAt && new Date(form.startAt) >= new Date(form.endAt)) {
    return "Start date must be before end date";
  }
  if (rewardConfig.valueType === "percent") {
    const value = Number(rewardConfig.value);
    if (!(value > 0) || value > 100) return "Percentage value must be between 0 and 100";
  }

  if (config.scopeField === "product" && !parseCsvIds(rules.productIdsText).length) {
    return `${subtypeLabel(subtype)} requires at least one product ID`;
  }
  if (config.scopeField === "category" && !parseCsvIds(rules.categoryIdsText).length) {
    return `${subtypeLabel(subtype)} requires at least one category ID`;
  }
  if (config.scopeField === "brand" && !parseCsvIds(rules.brandIdsText).length) {
    return `${subtypeLabel(subtype)} requires at least one brand`;
  }
  if (config.scopeField === "shop" && !parseCsvIds(rules.shopIdsText).length) {
    return `${subtypeLabel(subtype)} requires at least one shop ID`;
  }
  if (config.requiresShopAge && !(Number(rules.newShopMaxAgeDays) > 0)) {
    return `${subtypeLabel(subtype)} requires a max shop age (days) greater than 0`;
  }
  if (config.requiresFestivalName && !String(rewardConfig.festivalName || "").trim()) {
    return `${subtypeLabel(subtype)} requires a festival name`;
  }
  if (config.group === "milestone") {
    const hasCount = rules.milestoneOrderCount != null && rules.milestoneOrderCount !== "";
    const hasSpend = rules.milestoneSpendAmount != null && rules.milestoneSpendAmount !== "";
    if (!hasCount && !hasSpend) {
      return "Milestone Rewards require either an order count or a spend threshold";
    }
  }
  if (config.group === "coupon" && !config.hideValue && !(Number(rewardConfig.value) > 0)) {
    return `${subtypeLabel(subtype)} requires a discount value greater than 0`;
  }
  if (config.group === "referral" && !(Number(rewardConfig.value) > 0)) {
    return "Referral campaigns require a reward value greater than 0";
  }

  return null;
}
