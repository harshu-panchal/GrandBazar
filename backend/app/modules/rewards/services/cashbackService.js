import User from "../../../models/customer.js";
import RewardGrant from "../models/rewardGrant.model.js";
import RewardTransaction from "../models/rewardTransaction.model.js";
import RewardCampaign from "../models/rewardCampaign.model.js";
import {
  CREDIT_TIMING,
  GRANT_STATUS,
  REWARD_TXN_TYPE,
  REWARD_SUBTYPE,
} from "../reward.constants.js";
import { emitNotificationEvent } from "../../notifications/notification.emitter.js";
import { REWARD_NOTIFICATION_EVENTS } from "../reward.constants.js";

function roundAmount(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

async function writeTransaction({
  grantId,
  customerId,
  campaignId,
  orderId,
  orderPublicId,
  type,
  amount,
  balanceBefore,
  balanceAfter,
  reason,
}) {
  return RewardTransaction.create({
    grantId,
    customerId,
    campaignId,
    orderId,
    orderPublicId,
    type,
    amount: roundAmount(amount),
    balanceBefore: roundAmount(balanceBefore),
    balanceAfter: roundAmount(balanceAfter),
    reason,
  });
}

/**
 * Atomically checks the campaign's budget/daily/monthly caps AND reserves
 * `amount` against them in one DB round trip. The eligibility engine's
 * passesBudget() is only a pre-filter on a .lean() snapshot taken earlier in
 * the request — it reads-then-later-increments with no lock between the two,
 * so concurrent grants for the same campaign could each pass the check before
 * either `$inc` lands, blowing through budgetLimit/dailyLimit/monthlyLimit
 * with no bound. This findOneAndUpdate makes the check part of the same
 * atomic write: the condition on budgetUsed/dailyUsed/monthlyUsed is
 * evaluated by MongoDB against the current document right as it increments,
 * so only one of two racing claims can ever succeed.
 */
async function claimCampaignBudget(campaign, amount) {
  const claimAmount = roundAmount(amount);
  if (claimAmount <= 0) return true;

  const filter = { _id: campaign._id };
  if (campaign.budgetLimit != null) {
    filter.budgetUsed = { $lte: roundAmount(campaign.budgetLimit - claimAmount) };
  }
  if (campaign.dailyLimit != null) {
    filter.dailyUsed = { $lte: roundAmount(campaign.dailyLimit - claimAmount) };
  }
  if (campaign.monthlyLimit != null) {
    filter.monthlyUsed = { $lte: roundAmount(campaign.monthlyLimit - claimAmount) };
  }

  const updated = await RewardCampaign.findOneAndUpdate(filter, {
    $inc: {
      budgetUsed: claimAmount,
      dailyUsed: claimAmount,
      monthlyUsed: claimAmount,
      "stats.totalGrants": 1,
      "stats.totalAmount": claimAmount,
    },
  });
  return Boolean(updated);
}

export async function creditCustomerWallet({
  customerId,
  amount,
  grant,
  campaign,
  order,
  reason = "Cashback credited",
}) {
  const creditAmount = roundAmount(amount);
  if (creditAmount <= 0) return null;

  const user = await User.findById(customerId).select("walletBalance name phone");
  if (!user) throw new Error("Customer not found");

  const balanceBefore = Number(user.walletBalance || 0);
  const balanceAfter = balanceBefore + creditAmount;

  user.walletBalance = balanceAfter;
  await user.save();

  const txn = await writeTransaction({
    grantId: grant?._id,
    customerId,
    campaignId: campaign?._id,
    orderId: order?._id,
    orderPublicId: order?.orderId,
    type: REWARD_TXN_TYPE.CREDIT,
    amount: creditAmount,
    balanceBefore,
    balanceAfter,
    reason,
  });

  emitNotificationEvent(REWARD_NOTIFICATION_EVENTS.CASHBACK_CREDITED, {
    customerId,
    userId: customerId,
    role: "customer",
    amount: creditAmount,
    orderId: order?.orderId,
    campaignName: campaign?.name,
    balanceAfter,
  });

  return txn;
}

export async function debitCustomerWallet({
  customerId,
  amount,
  grant,
  order,
  reason = "Reward reversed",
}) {
  const debitAmount = roundAmount(amount);
  if (debitAmount <= 0) return null;

  const user = await User.findById(customerId).select("walletBalance");
  if (!user) throw new Error("Customer not found");

  const balanceBefore = Number(user.walletBalance || 0);
  const balanceAfter = Math.max(0, balanceBefore - debitAmount);
  const actualDebit = balanceBefore - balanceAfter;

  user.walletBalance = balanceAfter;
  await user.save();

  return writeTransaction({
    grantId: grant?._id,
    customerId,
    campaignId: grant?.campaignId,
    orderId: order?._id || grant?.orderId,
    orderPublicId: order?.orderId || grant?.orderPublicId,
    type: REWARD_TXN_TYPE.REVERSAL,
    amount: actualDebit,
    balanceBefore,
    balanceAfter,
    reason,
  });
}

export async function createGrantFromCampaign({ campaign, order, amount, status = GRANT_STATUS.PENDING }) {
  const validityDays = campaign.rewardConfig?.validityDays ?? 30;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + validityDays);

  return RewardGrant.create({
    campaignId: campaign._id,
    customerId: order.customer,
    orderId: order._id,
    orderPublicId: order.orderId,
    sellerId: order.seller,
    campaignType: campaign.campaignType,
    rewardSubtype: campaign.rewardConfig?.rewardSubtype,
    amount: roundAmount(amount),
    remainingAmount: status === GRANT_STATUS.ACTIVE ? roundAmount(amount) : 0,
    status,
    fundedBy: campaign.fundingSource,
    expiresAt,
    linkedCouponId: campaign.rewardConfig?.linkedCouponId || null,
  });
}

export async function processCashbackGrant({ campaign, order, amount }) {
  const claimed = await claimCampaignBudget(campaign, amount);
  if (!claimed) {
    throw Object.assign(new Error("Campaign budget/usage cap reached"), {
      code: "CAMPAIGN_BUDGET_EXCEEDED",
    });
  }

  const creditTiming = campaign.rewardConfig?.creditTiming || CREDIT_TIMING.ON_DELIVERY;
  const awaitsFirstOrder = creditTiming === CREDIT_TIMING.AFTER_FIRST_ORDER;
  const isDelayed =
    creditTiming === CREDIT_TIMING.DELAYED_DAYS ||
    awaitsFirstOrder ||
    campaign.rewardConfig?.rewardSubtype === REWARD_SUBTYPE.FUTURE_CASHBACK;

  if (isDelayed) {
    const grant = await createGrantFromCampaign({
      campaign,
      order,
      amount,
      status: GRANT_STATUS.PENDING,
    });
    if (awaitsFirstOrder) {
      // Event-gated, not time-gated — leave meta.activateAt unset and mark it
      // so the worker's time-based sweep (activateDuePendingGrants) skips it;
      // referralService.processReferralRewardsOnDelivery activates it instead.
      grant.meta = { ...(grant.meta || {}), awaitFirstOrder: true };
      await grant.save();
    } else {
      const delayedDays = Number(campaign.rewardConfig?.delayedDays || 0);
      if (delayedDays > 0) {
        grant.meta = { ...(grant.meta || {}), activateAt: new Date(Date.now() + delayedDays * 86400000) };
        await grant.save();
      }
    }
    return grant;
  }

  const grant = await createGrantFromCampaign({
    campaign,
    order,
    amount,
    status: GRANT_STATUS.ACTIVE,
  });
  grant.activatedAt = new Date();
  grant.remainingAmount = roundAmount(amount);
  await grant.save();

  await creditCustomerWallet({
    customerId: order.customer,
    amount,
    grant,
    campaign,
    order,
  });

  emitNotificationEvent(REWARD_NOTIFICATION_EVENTS.REWARD_EARNED, {
    customerId: order.customer,
    userId: order.customer,
    role: "customer",
    amount,
    orderId: order.orderId,
    campaignName: campaign.name,
  });

  return grant;
}

export async function activatePendingGrant(grantId) {
  const grant = await RewardGrant.findById(grantId).populate("campaignId");
  if (!grant || grant.status !== GRANT_STATUS.PENDING) return null;

  // A grant held open-ended (e.g. an "after_first_order" referral reward) can
  // still be sitting PENDING past its own expiresAt if the triggering event
  // (the referee's first order) lands after validityDays has elapsed — don't
  // pay out a reward that's already expired.
  if (grant.expiresAt && grant.expiresAt < new Date()) {
    grant.status = GRANT_STATUS.EXPIRED;
    await grant.save();
    return null;
  }

  const order = grant.orderId
    ? await import("../../../models/order.js").then((m) => m.default.findById(grant.orderId))
    : null;

  grant.status = GRANT_STATUS.ACTIVE;
  grant.activatedAt = new Date();
  grant.remainingAmount = roundAmount(grant.amount);
  await grant.save();

  await creditCustomerWallet({
    customerId: grant.customerId,
    amount: grant.amount,
    grant,
    campaign: grant.campaignId,
    order,
    reason: "Future cashback activated",
  });

  return grant;
}

/**
 * FIFO: consume active cashback/reward grant balances when wallet is spent at checkout.
 */
export async function applyWalletSpendToGrants({
  customerId,
  amount,
  order = null,
  balanceBefore = null,
  balanceAfter = null,
}) {
  let remaining = roundAmount(amount);
  if (remaining <= 0) return [];

  const grants = await RewardGrant.find({
    customerId,
    status: GRANT_STATUS.ACTIVE,
    remainingAmount: { $gt: 0 },
    campaignType: { $in: ["cashback", "reward"] },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  })
    .sort({ expiresAt: 1, createdAt: 1 })
    .limit(50);

  const touched = [];
  let spent = 0;
  for (const grant of grants) {
    if (remaining <= 0) break;
    const take = Math.min(roundAmount(grant.remainingAmount), remaining);
    if (take <= 0) continue;

    grant.remainingAmount = roundAmount(grant.remainingAmount - take);
    if (grant.remainingAmount <= 0) {
      grant.remainingAmount = 0;
      grant.status = GRANT_STATUS.REDEEMED;
      grant.redeemedAt = new Date();
    }
    grant.meta = {
      ...(grant.meta || {}),
      lastRedeemedOrderId: order?._id || order?.orderId || null,
    };
    await grant.save();

    remaining = roundAmount(remaining - take);
    spent = roundAmount(spent + take);
    touched.push(grant);
  }

  if (spent > 0) {
    await writeTransaction({
      grantId: touched[0]?._id,
      customerId,
      campaignId: touched[0]?.campaignId,
      orderId: order?._id,
      orderPublicId: order?.orderId,
      type: REWARD_TXN_TYPE.DEBIT,
      amount: spent,
      balanceBefore: balanceBefore ?? 0,
      balanceAfter: balanceAfter ?? 0,
      reason: "Wallet used at checkout",
    });
  }

  return touched;
}

export async function expireExpiredGrants() {
  const now = new Date();
  const grants = await RewardGrant.find({
    status: { $in: [GRANT_STATUS.ACTIVE, GRANT_STATUS.PENDING] },
    expiresAt: { $ne: null, $lte: now },
  }).limit(200);

  let expired = 0;
  for (const grant of grants) {
    try {
      const clawback = roundAmount(
        grant.status === GRANT_STATUS.ACTIVE
          ? grant.remainingAmount ?? grant.amount
          : 0,
      );

      if (
        clawback > 0 &&
        (grant.campaignType === "cashback" || grant.campaignType === "reward") &&
        !grant.linkedCouponId
      ) {
        await debitCustomerWallet({
          customerId: grant.customerId,
          amount: clawback,
          grant,
          reason: "Reward expired",
        });
      }

      if (grant.linkedCouponId) {
        const Coupon = (await import("../../../models/coupon.js")).default;
        await Coupon.findByIdAndUpdate(grant.linkedCouponId, { isActive: false });
      }

      grant.status = GRANT_STATUS.EXPIRED;
      grant.remainingAmount = 0;
      grant.meta = { ...(grant.meta || {}), expiredAt: now };
      await grant.save();

      emitNotificationEvent(REWARD_NOTIFICATION_EVENTS.REWARD_EXPIRED, {
        customerId: grant.customerId,
        userId: grant.customerId,
        role: "customer",
        amount: grant.amount,
      });

      expired += 1;
    } catch {
      // continue batch
    }
  }
  return expired;
}

export default {
  creditCustomerWallet,
  debitCustomerWallet,
  createGrantFromCampaign,
  processCashbackGrant,
  activatePendingGrant,
  applyWalletSpendToGrants,
  expireExpiredGrants,
};
