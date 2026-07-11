import Order from "../../../models/order.js";
import RewardCampaign from "../models/rewardCampaign.model.js";
import RewardGrant from "../models/rewardGrant.model.js";
import {
  CAMPAIGN_STATUS,
  CAMPAIGN_TYPE,
  CUSTOMER_ELIGIBILITY,
  GRANT_STATUS,
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

function computeRewardAmount(campaign, orderAmount) {
  const config = campaign.rewardConfig || {};
  const maxCap = config.maxRewardAmount ?? campaign.rules?.maxRewardPerCustomer ?? null;
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
  const monthStart = startOfMonth();
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
  return { totalForCampaign, todayForCampaign, monthStart };
}

function matchesScope(rules, order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const productIds = (rules.productIds || []).map(String);
  const categoryIds = (rules.categoryIds || []).map(String);
  const brandIds = (rules.brandIds || []).map(String);
  const shopIds = (rules.shopIds || []).map(String);
  const cityIds = (rules.cityIds || []).map((c) => String(c).toLowerCase());

  if (shopIds.length && !shopIds.includes(String(order.seller))) {
    return false;
  }

  if (cityIds.length) {
    const city = String(order.address?.city || "").toLowerCase();
    if (!city || !cityIds.includes(city)) return false;
  }

  if (productIds.length || categoryIds.length || brandIds.length) {
    const hasMatch = items.some((item) => {
      const pid = String(item.product || item.productId || "");
      const cid = String(item.categoryId || item.category || "");
      const brand = String(item.brand || item.brandName || "");
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

async function passesMilestone(rules, customerId, orderAmount) {
  if (rules.milestoneOrderCount != null) {
    const count = await Order.countDocuments({
      customer: customerId,
      workflowStatus: "DELIVERED",
    });
    if (count !== Number(rules.milestoneOrderCount)) return false;
  }
  if (rules.milestoneSpendAmount != null) {
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

export async function evaluateCampaignsForOrder(order, { campaignTypes = [CAMPAIGN_TYPE.CASHBACK, CAMPAIGN_TYPE.REWARD], atDelivery = true } = {}) {
  const customerId = order.customer;
  const orderAmount = Number(order.paymentBreakdown?.grandTotal || order.pricing?.total || 0);
  const campaigns = await getActiveCampaigns();
  const matches = [];

  for (const campaign of campaigns) {
    if (!campaignTypes.includes(campaign.campaignType)) continue;
    if (!(await passesBudget(campaign))) continue;

    const rules = campaign.rules || {};
    if (rules.minPurchase && orderAmount < rules.minPurchase) continue;
    if (!matchesScope(rules, order)) continue;
    if (!(await passesCustomerType(rules, customerId, order, { atDelivery }))) continue;
    if (!(await passesMilestone(rules, customerId, orderAmount))) continue;

    const grantCounts = await getCustomerGrantCounts(customerId, campaign._id);
    if (rules.maxRewardPerCustomer != null && grantCounts.totalForCampaign >= rules.maxRewardPerCustomer) {
      continue;
    }
    if (rules.maxRewardsPerDay != null && grantCounts.todayForCampaign >= rules.maxRewardsPerDay) {
      continue;
    }

    const amount = computeRewardAmount(campaign, orderAmount);
    if (amount <= 0 && campaign.campaignType !== CAMPAIGN_TYPE.COUPON) continue;

    matches.push({
      campaign,
      amount,
    });
  }

  return matches;
}

export async function evaluateReferralCampaigns({ referrerId, refereeId, trigger }) {
  const campaigns = await getActiveCampaigns({ campaignType: CAMPAIGN_TYPE.REFERRAL });
  return campaigns.filter((c) => {
    const subtype = c.rewardConfig?.rewardSubtype || "";
    return subtype === trigger;
  });
}

export default {
  evaluateCampaignsForOrder,
  evaluateReferralCampaigns,
  getActiveCampaigns,
  computeRewardAmount,
};
