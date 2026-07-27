import Order from "../../../models/order.js";
import Store from "../../../models/store.js";
import RewardCampaign from "../models/rewardCampaign.model.js";
import RewardGrant from "../models/rewardGrant.model.js";
import {
  CAMPAIGN_STATUS,
  CAMPAIGN_TYPE,
  CUSTOMER_ELIGIBILITY,
  GRANT_STATUS,
  REWARD_SUBTYPE,
} from "../reward.constants.js";

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date = new Date()) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function resolveItemProduct(item) {
  if (!item) return null;
  if (item.product && typeof item.product === "object") return item.product;
  return null;
}

function resolveItemProductId(item) {
  const product = resolveItemProduct(item);
  return String(product?._id || item.product || item.productId || "");
}

function resolveItemCategoryId(item) {
  const product = resolveItemProduct(item);
  return String(
    item.categoryId ||
      item.category ||
      product?.categoryId ||
      product?.category?._id ||
      product?.category ||
      product?.subcategoryId ||
      "",
  );
}

function resolveItemBrand(item) {
  const product = resolveItemProduct(item);
  return String(item.brand || item.brandName || product?.brand || "").trim().toLowerCase();
}

function resolveItemLineTotal(item) {
  const qty = Number(item.quantity || 1);
  const price = Number(item.price || item.salePrice || 0);
  return qty * price;
}

function computeRewardAmount(campaign, orderAmount) {
  const config = campaign.rewardConfig || {};
  const maxCap = config.maxRewardAmount ?? null;
  let amount = 0;

  if (config.valueType === "percent") {
    amount = Math.round((orderAmount * Number(config.value || 0)) / 100);
  } else {
    amount = Math.round(Number(config.value || 0));
  }

  if (maxCap != null && amount > maxCap) {
    amount = maxCap;
  }
  return Math.max(0, amount);
}

async function countDeliveredOrders(customerId, beforeDate = new Date()) {
  return Order.countDocuments({
    customer: customerId,
    workflowStatus: "DELIVERED",
    deliveredAt: { $lte: beforeDate },
  });
}

async function getCustomerGrantCounts(customerId, campaignId) {
  const dayStart = startOfDay();
  const [totalForCampaign, todayForCampaign] = await Promise.all([
    RewardGrant.countDocuments({
      customerId,
      campaignId,
      status: { $nin: [GRANT_STATUS.CANCELLED, GRANT_STATUS.REVERSED] },
    }),
    RewardGrant.countDocuments({
      customerId,
      campaignId,
      createdAt: { $gte: dayStart },
      status: { $nin: [GRANT_STATUS.CANCELLED, GRANT_STATUS.REVERSED] },
    }),
  ]);
  return { totalForCampaign, todayForCampaign };
}

function getScopedEligibleAmount(rules, order, subtype) {
  const items = Array.isArray(order.items) ? order.items : [];
  const productIds = (rules.productIds || []).map(String);
  const categoryIds = (rules.categoryIds || []).map(String);
  const brandIds = (rules.brandIds || []).map((b) => String(b).trim().toLowerCase());
  const fullOrderAmount = Number(
    order.paymentBreakdown?.grandTotal || order.pricing?.total || 0,
  );

  const needsLineScope =
    subtype === REWARD_SUBTYPE.PRODUCT_CASHBACK ||
    subtype === REWARD_SUBTYPE.CATEGORY_CASHBACK ||
    subtype === REWARD_SUBTYPE.BRAND_CASHBACK ||
    productIds.length > 0 ||
    categoryIds.length > 0 ||
    brandIds.length > 0;

  if (!needsLineScope) return fullOrderAmount;

  let scoped = 0;
  for (const item of items) {
    const pid = resolveItemProductId(item);
    const cid = resolveItemCategoryId(item);
    const brand = resolveItemBrand(item);
    const matched =
      (productIds.length && productIds.includes(pid)) ||
      (categoryIds.length && categoryIds.includes(cid)) ||
      (brandIds.length && brandIds.includes(brand));
    if (matched) scoped += resolveItemLineTotal(item);
  }
  return scoped;
}

function matchesScope(rules, order, subtype) {
  const items = Array.isArray(order.items) ? order.items : [];
  const productIds = (rules.productIds || []).map(String);
  const categoryIds = (rules.categoryIds || []).map(String);
  const brandIds = (rules.brandIds || []).map((b) => String(b).trim().toLowerCase());
  const shopIds = (rules.shopIds || []).map(String);
  const cityIds = (rules.cityIds || []).map((c) => String(c).toLowerCase());

  if (
    shopIds.length ||
    subtype === REWARD_SUBTYPE.SHOP_CASHBACK ||
    subtype === REWARD_SUBTYPE.NEW_SHOP_PROMOTION ||
    subtype === REWARD_SUBTYPE.NEW_SHOP_REWARD
  ) {
    const orderSellerId = String(order.seller?._id || order.seller || "");
    if (shopIds.length && !shopIds.includes(orderSellerId)) {
      return false;
    }
  }

  if (cityIds.length) {
    const city = String(order.address?.city || "").toLowerCase();
    if (!city || !cityIds.includes(city)) return false;
  }

  if (subtype === REWARD_SUBTYPE.PRODUCT_CASHBACK && !productIds.length) return false;
  if (subtype === REWARD_SUBTYPE.CATEGORY_CASHBACK && !categoryIds.length) return false;
  if (subtype === REWARD_SUBTYPE.BRAND_CASHBACK && !brandIds.length) return false;

  if (productIds.length || categoryIds.length || brandIds.length) {
    const hasMatch = items.some((item) => {
      const pid = resolveItemProductId(item);
      const cid = resolveItemCategoryId(item);
      const brand = resolveItemBrand(item);
      return (
        (productIds.length && productIds.includes(pid)) ||
        (categoryIds.length && categoryIds.includes(cid)) ||
        (brandIds.length && brandIds.includes(brand))
      );
    });
    if (!hasMatch) return false;
  }

  return true;
}

async function passesCustomerType(rules, customerId, order, { atDelivery = false } = {}) {
  const type = rules.customerType || CUSTOMER_ELIGIBILITY.ALL;
  if (type === CUSTOMER_ELIGIBILITY.ALL) return true;

  const deliveredCount = await Order.countDocuments({
    customer: customerId,
    workflowStatus: "DELIVERED",
  });

  if (atDelivery) {
    if (type === CUSTOMER_ELIGIBILITY.NEW) return deliveredCount <= 1;
    if (type === CUSTOMER_ELIGIBILITY.EXISTING) return deliveredCount > 1;
    return true;
  }

  const deliveredBefore = await countDeliveredOrders(customerId, order.createdAt || new Date());
  const isFirstOrder = deliveredBefore === 0;

  if (type === CUSTOMER_ELIGIBILITY.NEW) return isFirstOrder;
  if (type === CUSTOMER_ELIGIBILITY.EXISTING) return !isFirstOrder;
  return true;
}

async function passesSubtypeRules(campaign, customerId, order, { atDelivery = false } = {}) {
  const subtype = campaign.rewardConfig?.rewardSubtype;
  const rules = campaign.rules || {};

  if (subtype === REWARD_SUBTYPE.FIRST_PURCHASE) {
    const deliveredCount = await Order.countDocuments({
      customer: customerId,
      workflowStatus: "DELIVERED",
    });
    // At delivery of first order, count is typically 1
    return atDelivery ? deliveredCount <= 1 : deliveredCount === 0;
  }

  if (subtype === REWARD_SUBTYPE.REPEAT_PURCHASE) {
    const deliveredCount = await Order.countDocuments({
      customer: customerId,
      workflowStatus: "DELIVERED",
    });
    return atDelivery ? deliveredCount > 1 : deliveredCount >= 1;
  }

  if (
    subtype === REWARD_SUBTYPE.NEW_SHOP_PROMOTION ||
    subtype === REWARD_SUBTYPE.NEW_SHOP_REWARD
  ) {
    const sellerId = order.seller?._id || order.seller;
    if (!sellerId) return false;
    const store = await Store.findById(sellerId).select("createdAt").lean();
    if (!store?.createdAt) return false;
    const maxAgeDays = Number(rules.newShopMaxAgeDays || 30);
    const ageMs = Date.now() - new Date(store.createdAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return ageDays <= maxAgeDays;
  }

  // Birthday is handled by scheduled job, not order delivery
  if (subtype === REWARD_SUBTYPE.BIRTHDAY) {
    return false;
  }

  return true;
}

async function passesBudget(campaign) {
  if (campaign.budgetLimit != null && campaign.budgetUsed >= campaign.budgetLimit) {
    return false;
  }
  if (campaign.dailyLimit != null && campaign.dailyUsed >= campaign.dailyLimit) {
    return false;
  }
  if (campaign.monthlyLimit != null && campaign.monthlyUsed >= campaign.monthlyLimit) {
    return false;
  }
  return true;
}

async function passesMilestone(rules, customerId) {
  const hasOrderMilestone = rules.milestoneOrderCount != null && rules.milestoneOrderCount !== "";
  const hasSpendMilestone =
    rules.milestoneSpendAmount != null && rules.milestoneSpendAmount !== "";

  if (!hasOrderMilestone && !hasSpendMilestone) return true;

  if (hasOrderMilestone) {
    const count = await Order.countDocuments({
      customer: customerId,
      workflowStatus: "DELIVERED",
    });
    if (count !== Number(rules.milestoneOrderCount)) return false;
  }
  if (hasSpendMilestone) {
    const orders = await Order.find({
      customer: customerId,
      workflowStatus: "DELIVERED",
    })
      .select("paymentBreakdown pricing")
      .lean();
    const totalSpend = orders.reduce(
      (sum, o) => sum + Number(o.paymentBreakdown?.grandTotal || o.pricing?.total || 0),
      0,
    );
    if (totalSpend < Number(rules.milestoneSpendAmount)) return false;
  }
  return true;
}

export async function getActiveCampaigns({ campaignType = null, sellerId = null } = {}) {
  const now = new Date();
  const query = {
    status: CAMPAIGN_STATUS.ACTIVE,
    startAt: { $lte: now },
    endAt: { $gte: now },
  };
  if (campaignType) query.campaignType = campaignType;
  if (sellerId) query["createdBy.sellerId"] = sellerId;

  return RewardCampaign.find(query).sort({ priority: 1, createdAt: -1 }).lean();
}

export async function evaluateCampaignsForOrder(
  order,
  { campaignTypes = [CAMPAIGN_TYPE.CASHBACK, CAMPAIGN_TYPE.REWARD], atDelivery = true } = {},
) {
  const customerId = order.customer;
  const campaigns = await getActiveCampaigns();
  const matches = [];

  for (const campaign of campaigns) {
    if (!campaignTypes.includes(campaign.campaignType)) continue;
    if (!(await passesBudget(campaign))) continue;

    const rules = campaign.rules || {};
    const subtype = campaign.rewardConfig?.rewardSubtype;
    const orderAmount = Number(
      order.paymentBreakdown?.grandTotal || order.pricing?.total || 0,
    );

    if (rules.minPurchase && orderAmount < rules.minPurchase) continue;
    if (!matchesScope(rules, order, subtype)) continue;
    if (!(await passesCustomerType(rules, customerId, order, { atDelivery }))) continue;
    if (!(await passesSubtypeRules(campaign, customerId, order, { atDelivery }))) continue;
    if (!(await passesMilestone(rules, customerId))) continue;

    const grantCounts = await getCustomerGrantCounts(customerId, campaign._id);
    if (
      rules.maxRewardPerCustomer != null &&
      grantCounts.totalForCampaign >= rules.maxRewardPerCustomer
    ) {
      continue;
    }
    if (
      rules.maxRewardsPerDay != null &&
      grantCounts.todayForCampaign >= rules.maxRewardsPerDay
    ) {
      continue;
    }

    const eligibleAmount = getScopedEligibleAmount(rules, order, subtype);
    const amount = computeRewardAmount(campaign, eligibleAmount);
    if (amount <= 0 && campaign.campaignType !== CAMPAIGN_TYPE.COUPON) continue;

    matches.push({
      campaign,
      amount,
      eligibleAmount,
    });
  }

  return matches;
}

export async function evaluateReferralCampaigns({ referrerId, refereeId, trigger }) {
  const campaigns = await getActiveCampaigns({ campaignType: CAMPAIGN_TYPE.REFERRAL });
  return campaigns.filter((c) => {
    const subtype = c.rewardConfig?.rewardSubtype || "";
    if (trigger === "registration") {
      return subtype === REWARD_SUBTYPE.REFERRAL_REGISTRATION;
    }
    if (trigger === "first_purchase") {
      return subtype === REWARD_SUBTYPE.REFERRAL_FIRST_PURCHASE;
    }
    return false;
  });
}
