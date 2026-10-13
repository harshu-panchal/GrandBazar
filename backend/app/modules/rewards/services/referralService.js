import crypto from "crypto";
import User from "../../../models/customer.js";
import Order from "../../../models/order.js";
import Referral from "../models/referral.model.js";
import RewardGrant from "../models/rewardGrant.model.js";
import {
  REFERRAL_CHANNEL,
  REFERRAL_STATUS,
  REFERRAL_TYPE,
  REWARD_SUBTYPE,
  CAMPAIGN_TYPE,
  GRANT_STATUS,
} from "../reward.constants.js";
import { evaluateReferralCampaigns } from "./eligibilityEngine.js";
import { processCashbackGrant, activatePendingGrant } from "./cashbackService.js";
import { emitNotificationEvent } from "../../notifications/notification.emitter.js";
import { REWARD_NOTIFICATION_EVENTS } from "../reward.constants.js";
import logger from "../../../services/logger.js";

function generateReferralCode(userId) {
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `GB${String(userId).slice(-4).toUpperCase()}${suffix}`;
}

export async function ensureCustomerReferralCode(customerId) {
  const user = await User.findById(customerId).select("referralCode name phone");
  if (!user) return null;
  if (user.referralCode) return user.referralCode;

  let code = generateReferralCode(customerId);
  let attempts = 0;
  while (attempts < 5) {
    const exists = await User.findOne({ referralCode: code }).select("_id").lean();
    if (!exists) break;
    code = generateReferralCode(customerId);
    attempts += 1;
  }

  user.referralCode = code;
  await user.save();
  return code;
}

export async function attachReferralOnSignup({ refereeId, referralCode, channel = REFERRAL_CHANNEL.CODE, ipAddress = null }) {
  if (!referralCode || !refereeId) return null;

  const normalizedCode = String(referralCode).trim().toUpperCase();
  const referrer = await User.findOne({ referralCode: normalizedCode }).select("_id phone");
  if (!referrer) return null;
  if (String(referrer._id) === String(refereeId)) return null;

  const referee = await User.findById(refereeId);
  if (!referee) return null;
  if (referee.referredBy) return null;

  // Fraud: block if referee phone matches referrer phone
  if (referee.phone && referrer.phone && referee.phone === referrer.phone) return null;

  const duplicate = await Referral.findOne({
    refereeId,
    referralType: REFERRAL_TYPE.CUSTOMER,
  });
  if (duplicate) return duplicate;

  // Rate limit referrals per referrer per day (basic abuse prevention)
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const todayCount = await Referral.countDocuments({
    referrerId: referrer._id,
    createdAt: { $gte: dayStart },
  });
  const maxPerDay = parseInt(process.env.REFERRAL_MAX_PER_DAY || "20", 10);
  if (todayCount >= maxPerDay) return null;

  // Atomic claim: a double-submitted/retried OTP-verify call could reach this
  // point twice concurrently. The plain read-then-save above only reduces the
  // race window; this conditional update is the actual guard — only the
  // request that flips referredBy from null wins, the other gets null back.
  const claimedReferee = await User.findOneAndUpdate(
    { _id: refereeId, referredBy: null },
    { $set: { referredBy: referrer._id } },
  );
  if (!claimedReferee) {
    const existing = await Referral.findOne({
      refereeId,
      referralType: REFERRAL_TYPE.CUSTOMER,
    });
    return existing || null;
  }

  let referral;
  try {
    referral = await Referral.create({
      referralType: REFERRAL_TYPE.CUSTOMER,
      referrerId: referrer._id,
      referrerModel: "User",
      refereeId,
      refereeModel: "User",
      referralCode: normalizedCode,
      channel,
      status: REFERRAL_STATUS.REGISTERED,
    });
  } catch (error) {
    // Duplicate key on the {refereeId, referralType} unique index — another
    // concurrent call already created the referral.
    if (error.code === 11000) {
      return await Referral.findOne({ refereeId, referralType: REFERRAL_TYPE.CUSTOMER });
    }
    throw error;
  }

  const campaigns = await evaluateReferralCampaigns({
    referrerId: referrer._id,
    refereeId,
    trigger: REWARD_SUBTYPE.REFERRAL_REGISTRATION,
  });

  for (const campaign of campaigns) {
    try {
      // rewardConfig.value on a REFERRAL_REGISTRATION campaign is labelled
      // "Referrer Reward" in the admin UI ("Pays the referrer when a referee
      // registers using their code") — it must be credited to the referrer,
      // not the referee who just signed up.
      const pseudoOrder = { customer: referrer._id, _id: null, orderId: null, seller: null };
      const amount = campaign.rewardConfig?.value || 0;
      if (amount > 0) {
        const grant = await processCashbackGrant({ campaign, order: pseudoOrder, amount });
        referral.referrerRewardGrantId = grant?._id;
      }
      await referral.save();
    } catch (error) {
      logger.error("Referral registration reward failed", { message: error.message });
    }
  }

  return referral;
}

export async function processReferralRewardsOnDelivery(order) {
  const referee = await User.findById(order.customer).select("referredBy");
  if (!referee?.referredBy) return;

  // Atomic claim on the REGISTERED -> FIRST_ORDER transition: if two orders
  // for this referee deliver at nearly the same time, MongoDB serializes
  // concurrent findOneAndUpdate calls against the same document, so only one
  // of them can win this filter (status already moved off REGISTERED for the
  // other). Without this being atomic, two concurrent reads could both see
  // REGISTERED and both go on to grant the first-purchase reward twice.
  const referral = await Referral.findOneAndUpdate(
    {
      refereeId: order.customer,
      referralType: REFERRAL_TYPE.CUSTOMER,
      status: REFERRAL_STATUS.REGISTERED,
    },
    { $set: { status: REFERRAL_STATUS.FIRST_ORDER } },
    { new: true },
  );
  if (!referral) return;

  const priorDelivered = await Order.countDocuments({
    customer: order.customer,
    workflowStatus: "DELIVERED",
    _id: { $ne: order._id },
  });
  if (priorDelivered > 0) {
    // This order wasn't actually the referee's first delivery after all —
    // release the claim so whichever order legitimately was first (its own
    // processReferralRewardsOnDelivery call) can still pick it up.
    await Referral.updateOne(
      { _id: referral._id, status: REFERRAL_STATUS.FIRST_ORDER },
      { $set: { status: REFERRAL_STATUS.REGISTERED } },
    );
    return;
  }

  // Release the registration reward if it was configured to wait for the
  // referee's first order (creditTiming "after_first_order") instead of
  // crediting immediately at signup. The registration reward is credited to
  // the referrer (see attachReferralOnSignup), so it's tracked on
  // referrerRewardGrantId, not refereeRewardGrantId.
  if (referral.referrerRewardGrantId) {
    const pendingGrant = await RewardGrant.findById(referral.referrerRewardGrantId).select("status meta");
    if (pendingGrant?.status === GRANT_STATUS.PENDING && pendingGrant?.meta?.awaitFirstOrder) {
      await activatePendingGrant(pendingGrant._id).catch((error) => {
        logger.error("Failed to activate referral registration grant on first order", {
          grantId: pendingGrant._id,
          message: error.message,
        });
      });
    }
  }

  const campaigns = await evaluateReferralCampaigns({
    referrerId: referral.referrerId,
    refereeId: order.customer,
    trigger: REWARD_SUBTYPE.REFERRAL_FIRST_PURCHASE,
  });

  for (const campaign of campaigns) {
    const amount = campaign.rewardConfig?.value || 0;
    if (amount <= 0) continue;

    try {
      const referrerOrder = {
        customer: referral.referrerId,
        _id: order._id,
        orderId: order.orderId,
        seller: order.seller,
      };
      const refereeOrder = order;

      const referrerGrant = await processCashbackGrant({
        campaign,
        order: referrerOrder,
        amount,
      });
      referral.referrerRewardGrantId = referrerGrant?._id;

      const refereeGrant = await processCashbackGrant({
        campaign,
        order: refereeOrder,
        amount: campaign.rewardConfig?.refereeValue || amount,
      });
      referral.refereeRewardGrantId = refereeGrant?._id;

      referral.status = REFERRAL_STATUS.REWARDED;
      await referral.save();

      emitNotificationEvent(REWARD_NOTIFICATION_EVENTS.REFERRAL_SUCCESS, {
        customerId: referral.referrerId,
        userId: referral.referrerId,
        role: "customer",
        amount,
        refereeId: order.customer,
      });
    } catch (error) {
      logger.error("Referral first purchase reward failed", { message: error.message });
    }
  }
}

export async function getReferralStats(customerId) {
  const [code, referrals, rewarded] = await Promise.all([
    ensureCustomerReferralCode(customerId),
    Referral.countDocuments({ referrerId: customerId, referralType: REFERRAL_TYPE.CUSTOMER }),
    Referral.countDocuments({
      referrerId: customerId,
      referralType: REFERRAL_TYPE.CUSTOMER,
      status: REFERRAL_STATUS.REWARDED,
    }),
  ]);

  return { referralCode: code, totalReferrals: referrals, rewardedReferrals: rewarded };
}

export async function listMyReferrals(customerId, { page = 1, limit = 20 } = {}) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Referral.find({ referrerId: customerId, referralType: REFERRAL_TYPE.CUSTOMER })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("refereeId", "name phone")
      .lean(),
    Referral.countDocuments({ referrerId: customerId, referralType: REFERRAL_TYPE.CUSTOMER }),
  ]);
  return { items, total, page, limit };
}

export async function processSellerReferralReward(sellerId) {
  const campaigns = await evaluateReferralCampaigns({
    referrerId: sellerId,
    trigger: REWARD_SUBTYPE.REFERRAL_REGISTRATION,
  });
  for (const campaign of campaigns.filter((c) => c.campaignType === CAMPAIGN_TYPE.REFERRAL)) {
    logger.info("Seller referral campaign matched", { sellerId, campaignId: campaign._id });
  }
}

export default {
  ensureCustomerReferralCode,
  attachReferralOnSignup,
  processReferralRewardsOnDelivery,
  getReferralStats,
  listMyReferrals,
  processSellerReferralReward,
};
