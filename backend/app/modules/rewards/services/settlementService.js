import Order from "../../../models/order.js";
import Payout from "../../../models/payout.js";
import { FUNDING_SOURCE } from "../reward.constants.js";
import { PAYOUT_STATUS, OWNER_TYPE, LEDGER_TRANSACTION_TYPE, LEDGER_DIRECTION } from "../../../constants/finance.js";
import { getOrCreateWallet } from "../../../services/finance/walletService.js";
import { createLedgerEntry } from "../../../services/finance/ledgerService.js";
import { roundCurrency } from "../../../utils/money.js";
import logger from "../../../services/logger.js";

/**
 * Track seller-funded reward costs on order for settlement reporting, AND
 * actually deduct it from the seller's payout — this was previously
 * reporting-only ("Full ledger deduction hooks into orderFinanceService in
 * phase 3" never happened), so a seller-funded cashback cost the seller
 * nothing; the platform silently absorbed it while still crediting the
 * seller's payout in full.
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

  // Reward processing (this function) runs off the ORDER_DELIVERED event,
  // fired AFTER settleDeliveredOrder/createPendingSellerPayout already
  // queued the seller's payout for the full amount — so this always has to
  // adjust an existing payout/wallet after the fact, never a fresh amount
  // at creation time.
  try {
    const payout = await Payout.findOne({
      payoutType: "SELLER",
      relatedOrderIds: order._id,
    }).sort({ createdAt: -1 });

    if (payout && payout.status !== PAYOUT_STATUS.CANCELLED) {
      const wallet = await getOrCreateWallet(OWNER_TYPE.SELLER, order.seller);
      const deduction = roundCurrency(Math.min(sellerCost, payout.amount));

      if (deduction > 0) {
        if (payout.status === PAYOUT_STATUS.PENDING || payout.status === PAYOUT_STATUS.PROCESSING) {
          payout.amount = roundCurrency(payout.amount - deduction);
          wallet.pendingBalance = roundCurrency(Math.max(0, (wallet.pendingBalance || 0) - deduction));
        } else {
          // Already paid out — claw back from available balance if there's
          // enough; if not, log it rather than pushing the wallet negative
          // (the seller's next settlement's admin can true this up manually).
          if ((wallet.availableBalance || 0) >= deduction) {
            wallet.availableBalance = roundCurrency((wallet.availableBalance || 0) - deduction);
          } else {
            logger.warn("Seller-funded reward cost could not be fully clawed back — insufficient available balance", {
              orderId: order.orderId,
              sellerId: String(order.seller),
              deduction,
              availableBalance: wallet.availableBalance || 0,
            });
          }
        }
        wallet.totalDebited = roundCurrency((wallet.totalDebited || 0) + deduction);
        payout.metadata = {
          ...(payout.metadata || {}),
          adjustments: [
            ...((payout.metadata || {}).adjustments || []),
            { amount: -deduction, reason: `Seller-funded reward cost (campaign ${campaign._id})`, at: new Date() },
          ],
        };
        await Promise.all([payout.save(), wallet.save()]);

        await createLedgerEntry({
          orderId: order._id,
          payoutId: payout._id,
          walletId: wallet._id,
          actorType: OWNER_TYPE.SELLER,
          actorId: order.seller,
          type: LEDGER_TRANSACTION_TYPE.ADJUSTMENT,
          direction: LEDGER_DIRECTION.DEBIT,
          amount: deduction,
          description: `Seller-funded reward cost for order ${order.orderId}`,
        });
      }
    } else {
      logger.warn("Seller reward cost recorded but no payout found to deduct from yet", {
        orderId: order.orderId,
        sellerId: String(order.seller),
        sellerCost,
      });
    }
  } catch (deductionError) {
    logger.error("Failed to deduct seller-funded reward cost from payout", {
      orderId: order.orderId,
      message: deductionError.message,
    });
  }

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
