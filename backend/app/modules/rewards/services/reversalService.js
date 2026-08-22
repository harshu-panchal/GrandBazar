import RewardGrant from "../models/rewardGrant.model.js";
import RewardCampaign from "../models/rewardCampaign.model.js";
import Order from "../../../models/order.js";
import { GRANT_STATUS } from "../reward.constants.js";
import { debitCustomerWallet } from "./cashbackService.js";

function roundAmount(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Reverses reward grants tied to an order.
 *
 * `refundAmount`, when given, is used to derive what fraction of the order
 * was actually returned/refunded (refundAmount / order grandTotal), and only
 * that fraction of each grant is reversed — REFUND_COMPLETED fires for both
 * full and partial returns, and a partial return must not wipe out 100% of a
 * cashback/reward grant earned on items the customer kept. Omitting it (e.g.
 * for ORDER_CANCELLED, a whole-order event) reverses the grant in full.
 */
export async function reverseOrderRewards(orderId, { refundAmount } = {}) {
  const order = await Order.findById(orderId);
  if (!order) return { reversed: 0 };

  const grandTotal = Number(order.paymentBreakdown?.grandTotal || order.pricing?.total || 0);
  const fraction =
    refundAmount != null && grandTotal > 0
      ? Math.min(1, Math.max(0, Number(refundAmount) / grandTotal))
      : 1;
  if (fraction <= 0) return { reversed: 0 };

  const grants = await RewardGrant.find({
    orderId: order._id,
    status: { $in: [GRANT_STATUS.ACTIVE, GRANT_STATUS.PENDING, GRANT_STATUS.REDEEMED] },
  });

  const isFullReversal = fraction >= 1;
  let reversed = 0;

  for (const grant of grants) {
    const grantAmount = Number(grant.amount || 0);
    const reverseAmount = Math.min(grantAmount, roundAmount(grantAmount * fraction));

    if (grant.status === GRANT_STATUS.ACTIVE && reverseAmount > 0) {
      await debitCustomerWallet({
        customerId: grant.customerId,
        amount: reverseAmount,
        grant,
        order,
        reason: isFullReversal
          ? `Reversed due to order ${order.orderId} cancellation/refund`
          : `Partially reversed (${Math.round(fraction * 100)}%) due to a partial return on order ${order.orderId}`,
      });
    }

    const remainingAmount = Math.max(0, roundAmount(grantAmount - reverseAmount));
    grant.amount = remainingAmount;

    // Only move the grant to its terminal REVERSED state on a full
    // reversal, or once a series of partial reversals has exhausted it —
    // otherwise leave its status (ACTIVE/PENDING/REDEEMED) untouched so the
    // remaining, un-returned portion stays valid/redeemable.
    if (isFullReversal || remainingAmount <= 0) {
      grant.status = GRANT_STATUS.REVERSED;
      grant.reversedAt = new Date();
    }
    await grant.save();

    if (grant.campaignId && reverseAmount > 0) {
      await RewardCampaign.findByIdAndUpdate(grant.campaignId, {
        $inc: {
          budgetUsed: -Math.min(reverseAmount, Number.MAX_SAFE_INTEGER),
          "stats.totalAmount": -Math.min(reverseAmount, Number.MAX_SAFE_INTEGER),
        },
      });
    }

    reversed += 1;
  }

  if (isFullReversal && order.financeFlags) {
    order.financeFlags.rewardsApplied = false;
    await order.save();
  }

  return { reversed };
}

export default { reverseOrderRewards };
