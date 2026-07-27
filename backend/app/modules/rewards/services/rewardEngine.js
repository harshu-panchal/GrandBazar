import Order from "../../../models/order.js";
import RewardGrant from "../models/rewardGrant.model.js";
import RewardCampaign from "../models/rewardCampaign.model.js";
import { CAMPAIGN_TYPE, GRANT_STATUS } from "../reward.constants.js";
import { evaluateCampaignsForOrder } from "./eligibilityEngine.js";
import { processCashbackGrant } from "./cashbackService.js";
import { processReferralRewardsOnDelivery } from "./referralService.js";
import { applySellerRewardSettlement } from "./settlementService.js";
import logger from "../../../services/logger.js";

export async function processOrderRewards(orderId) {
  const order = await Order.findById(orderId)
    .populate("items.product", "name category categoryId subcategoryId brand sellerId")
    .lean(false);

  if (!order) return { skipped: true, reason: "order_not_found" };
  if (order.financeFlags?.rewardsApplied) {
    return { skipped: true, reason: "already_applied" };
  }
  if (order.workflowStatus !== "DELIVERED" && order.status !== "delivered") {
    return { skipped: true, reason: "not_delivered" };
  }

  const matches = await evaluateCampaignsForOrder(order, {
    campaignTypes: [CAMPAIGN_TYPE.CASHBACK, CAMPAIGN_TYPE.REWARD],
  });

  const grantIds = [];

  for (const match of matches) {
    try {
      if (match.campaign.campaignType === CAMPAIGN_TYPE.CASHBACK) {
        const grant = await processCashbackGrant({
          campaign: match.campaign,
          order,
          amount: match.amount,
        });
        if (grant) grantIds.push(grant._id);
        await applySellerRewardSettlement({
          order,
          campaign: match.campaign,
          amount: match.amount,
        });
      } else if (match.campaign.campaignType === CAMPAIGN_TYPE.REWARD) {
        const grant = await processCashbackGrant({
          campaign: match.campaign,
          order,
          amount: match.amount,
        });
        if (grant) grantIds.push(grant._id);
      }
    } catch (error) {
      logger.error("Failed to process reward for campaign", {
        campaignId: match.campaign._id,
        orderId: order.orderId,
        message: error.message,
      });
    }
  }

  try {
    await processReferralRewardsOnDelivery(order);
  } catch (error) {
    logger.error("Referral reward processing failed", {
      orderId: order.orderId,
      message: error.message,
    });
  }

  order.financeFlags = order.financeFlags || {};
  order.financeFlags.rewardsApplied = true;
  if (grantIds.length) {
    order.rewardGrants = [...(order.rewardGrants || []), ...grantIds];
  }
  await order.save();

  return { processed: true, grantCount: grantIds.length };
}

export async function issueCouponFromCampaign({ campaign, customerId, order = null }) {
  const linkedCouponId = campaign.rewardConfig?.linkedCouponId;
  if (!linkedCouponId) return null;

  const grant = await RewardGrant.create({
    campaignId: campaign._id,
    customerId,
    orderId: order?._id || null,
    orderPublicId: order?.orderId || null,
    sellerId: order?.seller || null,
    campaignType: CAMPAIGN_TYPE.COUPON,
    rewardSubtype: campaign.rewardConfig?.rewardSubtype,
    amount: 0,
    status: GRANT_STATUS.ACTIVE,
    fundedBy: campaign.fundingSource,
    linkedCouponId,
    expiresAt: new Date(Date.now() + (campaign.rewardConfig?.validityDays || 30) * 86400000),
  });

  await RewardCampaign.findByIdAndUpdate(campaign._id, {
    $inc: { "stats.totalGrants": 1 },
  });

  return grant;
}

export default {
  processOrderRewards,
  issueCouponFromCampaign,
};
