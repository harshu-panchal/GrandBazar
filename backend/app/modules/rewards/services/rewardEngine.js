import crypto from "crypto";
import Order from "../../../models/order.js";
import Coupon from "../../../models/coupon.js";
import RewardGrant from "../models/rewardGrant.model.js";
import RewardCampaign from "../models/rewardCampaign.model.js";
import {
  CAMPAIGN_TYPE,
  GRANT_STATUS,
  REWARD_SUBTYPE,
  REWARD_NOTIFICATION_EVENTS,
} from "../reward.constants.js";
import { evaluateCampaignsForOrder } from "./eligibilityEngine.js";
import { processCashbackGrant } from "./cashbackService.js";
import { processReferralRewardsOnDelivery } from "./referralService.js";
import { applySellerRewardSettlement } from "./settlementService.js";
import { emitNotificationEvent } from "../../notifications/notification.emitter.js";
import logger from "../../../services/logger.js";

function couponDiscountTypeFromSubtype(subtype) {
  if (subtype === REWARD_SUBTYPE.PERCENT_COUPON) return "percentage";
  if (subtype === REWARD_SUBTYPE.FREE_DELIVERY) return "free_delivery";
  return "fixed";
}

async function ensurePersonalVoucherCoupon({ campaign, customerId, order }) {
  const linkedCouponId = campaign.rewardConfig?.linkedCouponId;
  if (linkedCouponId) {
    const existing = await Coupon.findById(linkedCouponId);
    if (existing) return existing;
  }

  const validityDays = Number(campaign.rewardConfig?.validityDays || 30);
  const validFrom = new Date();
  const validTill = new Date(Date.now() + validityDays * 86400000);
  const subtype = campaign.rewardConfig?.rewardSubtype;
  const discountType = couponDiscountTypeFromSubtype(subtype);
  const code = `RV${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

  return Coupon.create({
    code,
    sellerId: null,
    sponsor: "admin",
    title: campaign.name || "Reward Voucher",
    description: campaign.description || "Digital reward voucher",
    discountType,
    discountValue:
      discountType === "free_delivery"
        ? 0
        : Number(campaign.rewardConfig?.value || 0),
    maxDiscount: campaign.rewardConfig?.maxRewardAmount ?? undefined,
    couponType:
      discountType === "free_delivery" ? "free_delivery" : "generic",
    minOrderValue: Number(
      campaign.redemptionRules?.minOrderAmount ||
        campaign.rules?.minPurchase ||
        0,
    ),
    usageLimit: 1,
    perUserLimit: 1,
    validFrom,
    validTill,
    isActive: true,
    metadata: {
      issuedToCustomerId: String(customerId),
      campaignId: String(campaign._id),
      orderId: order?._id ? String(order._id) : null,
      rewardSubtype: subtype,
      festivalName: campaign.rewardConfig?.festivalName || "",
    },
  });
}

export async function issueCouponFromCampaign({ campaign, customerId, order = null }) {
  const existingGrant = await RewardGrant.findOne({
    campaignId: campaign._id,
    customerId,
    status: { $in: [GRANT_STATUS.ACTIVE, GRANT_STATUS.PENDING, GRANT_STATUS.CREATED] },
    ...(order?._id ? { orderId: order._id } : {}),
  }).lean();
  if (existingGrant) return existingGrant;

  const coupon = await ensurePersonalVoucherCoupon({ campaign, customerId, order });
  const validityDays = Number(campaign.rewardConfig?.validityDays || 30);

  const grant = await RewardGrant.create({
    campaignId: campaign._id,
    customerId,
    orderId: order?._id || null,
    orderPublicId: order?.orderId || null,
    sellerId: order?.seller || null,
    campaignType: CAMPAIGN_TYPE.COUPON,
    rewardSubtype: campaign.rewardConfig?.rewardSubtype,
    amount: Number(campaign.rewardConfig?.value || 0),
    remainingAmount: 0,
    status: GRANT_STATUS.ACTIVE,
    fundedBy: campaign.fundingSource,
    linkedCouponId: coupon._id,
    expiresAt: new Date(Date.now() + validityDays * 86400000),
    activatedAt: new Date(),
    meta: {
      couponCode: coupon.code,
      festivalName: campaign.rewardConfig?.festivalName || "",
    },
  });

  await RewardCampaign.findByIdAndUpdate(campaign._id, {
    $inc: { "stats.totalGrants": 1 },
  });

  emitNotificationEvent(REWARD_NOTIFICATION_EVENTS.COUPON_ISSUED, {
    customerId,
    userId: customerId,
    role: "customer",
    couponCode: coupon.code,
    campaignName: campaign.name,
  });

  return grant;
}

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
    campaignTypes: [
      CAMPAIGN_TYPE.CASHBACK,
      CAMPAIGN_TYPE.REWARD,
      CAMPAIGN_TYPE.COUPON,
    ],
  });

  const grantIds = [];

  for (const match of matches) {
    try {
      if (
        match.campaign.campaignType === CAMPAIGN_TYPE.CASHBACK ||
        match.campaign.campaignType === CAMPAIGN_TYPE.REWARD
      ) {
        const grant = await processCashbackGrant({
          campaign: match.campaign,
          order,
          amount: match.amount,
        });
        if (grant) grantIds.push(grant._id);
        if (match.campaign.campaignType === CAMPAIGN_TYPE.CASHBACK) {
          await applySellerRewardSettlement({
            order,
            campaign: match.campaign,
            amount: match.amount,
          });
        }
      } else if (match.campaign.campaignType === CAMPAIGN_TYPE.COUPON) {
        const grant = await issueCouponFromCampaign({
          campaign: match.campaign,
          customerId: order.customer,
          order,
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

export default {
  processOrderRewards,
  issueCouponFromCampaign,
};
