import Order from "../../../models/order.js";
import { FUNDING_SOURCE } from "../reward.constants.js";
import logger from "../../../services/logger.js";

/**
 * Track seller-funded reward costs on order for settlement reporting.
 * Full ledger deduction hooks into orderFinanceService in phase 3.
 */
export async function applySellerRewardSettlement({ order, campaign, amount }) {
  if (!campaign || !order) return;

  const fundedBy = campaign.fundingSource;
  if (fundedBy !== FUNDING_SOURCE.SELLER && fundedBy !== FUNDING_SOURCE.SHARED) {
    return;
  }

  let sellerCost = Number(amount || 0);
  if (fundedBy === FUNDING_SOURCE.SHARED) {
    const sellerPercent = campaign.sharedFunding?.sellerPercent ?? 50;
    sellerCost = Math.round((sellerCost * sellerPercent) / 100);
  }

  if (sellerCost <= 0) return;

  await Order.findByIdAndUpdate(order._id, {
    $inc: { "pricing.rewardCostToSeller": sellerCost },
    $set: {
      "meta.lastRewardSettlement": {
        campaignId: campaign._id,
        amount: sellerCost,
        at: new Date(),
      },
    },
  });

  logger.info("Seller reward cost recorded", {
    orderId: order.orderId,
    sellerId: order.seller,
    sellerCost,
    campaignId: campaign._id,
  });
}

export async function getSettlementSummary({ sellerId = null, fromDate, toDate } = {}) {
  const match = {
    "financeFlags.rewardsApplied": true,
    "pricing.rewardCostToSeller": { $gt: 0 },
  };
  if (sellerId) match.seller = sellerId;
  if (fromDate || toDate) {
    match.deliveredAt = {};
    if (fromDate) match.deliveredAt.$gte = new Date(fromDate);
    if (toDate) match.deliveredAt.$lte = new Date(toDate);
  }

  const rows = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$seller",
        totalRewardCost: { $sum: "$pricing.rewardCostToSeller" },
        orderCount: { $sum: 1 },
      },
    },
  ]);

  return rows;
}

export async function getAnalyticsSummary({ fromDate, toDate } = {}) {
  const RewardGrant = (await import("../models/rewardGrant.model.js")).default;
  const RewardCampaign = (await import("../models/rewardCampaign.model.js")).default;
  const CouponRedemption = (await import("../models/couponRedemption.model.js")).default;
  const Referral = (await import("../models/referral.model.js")).default;

  const dateFilter = {};
  if (fromDate || toDate) {
    dateFilter.createdAt = {};
    if (fromDate) dateFilter.createdAt.$gte = new Date(fromDate);
    if (toDate) dateFilter.createdAt.$lte = new Date(toDate);
  }

  const [grantStats, campaignCount, couponRedemptions, referralCount] = await Promise.all([
    RewardGrant.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: "$campaignType",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ]),
    RewardCampaign.countDocuments({ status: "active" }),
    CouponRedemption.countDocuments(dateFilter),
    Referral.countDocuments({ ...dateFilter, status: "rewarded" }),
  ]);

  return {
    grantStats,
    activeCampaigns: campaignCount,
    couponRedemptions,
    successfulReferrals: referralCount,
  };
}

export default {
  applySellerRewardSettlement,
  getSettlementSummary,
  getAnalyticsSummary,
};
