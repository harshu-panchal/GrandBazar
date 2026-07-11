import RewardGrant from "../models/rewardGrant.model.js";
import RewardCampaign from "../models/rewardCampaign.model.js";
import Order from "../../../models/order.js";
import { GRANT_STATUS } from "../reward.constants.js";
import { debitCustomerWallet } from "./cashbackService.js";

export async function reverseOrderRewards(orderId) {
  const order = await Order.findById(orderId);
  if (!order) return { reversed: 0 };

  const grants = await RewardGrant.find({
    orderId: order._id,
    status: { $in: [GRANT_STATUS.ACTIVE, GRANT_STATUS.PENDING, GRANT_STATUS.REDEEMED] },
  });

  let reversed = 0;

  for (const grant of grants) {
    if (grant.status === GRANT_STATUS.ACTIVE && grant.amount > 0) {
      await debitCustomerWallet({
        customerId: grant.customerId,
        amount: grant.amount,
        grant,
        order,
        reason: `Reversed due to order ${order.orderId} cancellation/refund`,
      });
    }

    grant.status = GRANT_STATUS.REVERSED;
    grant.reversedAt = new Date();
    await grant.save();

    if (grant.campaignId && grant.amount > 0) {
      await RewardCampaign.findByIdAndUpdate(grant.campaignId, {
        $inc: {
          budgetUsed: -Math.min(grant.amount, Number.MAX_SAFE_INTEGER),
          "stats.totalAmount": -Math.min(grant.amount, Number.MAX_SAFE_INTEGER),
        },
      });
    }

    reversed += 1;
  }

  if (order.financeFlags) {
    order.financeFlags.rewardsApplied = false;
    await order.save();
  }

  return { reversed };
}

export default { reverseOrderRewards };
