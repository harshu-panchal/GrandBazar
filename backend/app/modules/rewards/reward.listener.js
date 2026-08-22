import { NOTIFICATION_EVENTS } from "../notifications/notification.constants.js";
import logger from "../../services/logger.js";

async function getOrderIdFromPayload(payload) {
  if (payload.orderId && typeof payload.orderId === "string" && !payload.orderId.match(/^[0-9a-f]{24}$/i)) {
    const Order = (await import("../../models/order.js")).default;
    const order = await Order.findOne({ orderId: payload.orderId }).select("_id").lean();
    return order?._id || payload.orderDbId || payload.order;
  }
  return payload.orderDbId || payload.order || payload.orderId;
}

export async function handleRewardEvent(eventType, payload = {}) {
  if (process.env.NODE_ENV === "test") return;

  try {
    const { processOrderRewards } = await import("./services/rewardEngine.js");
    const { reverseOrderRewards } = await import("./services/reversalService.js");

    if (eventType === NOTIFICATION_EVENTS.ORDER_DELIVERED) {
      const orderDbId = await getOrderIdFromPayload(payload);
      if (orderDbId) {
        await processOrderRewards(orderDbId);
      }
      return;
    }

    if (
      eventType === NOTIFICATION_EVENTS.ORDER_CANCELLED ||
      eventType === NOTIFICATION_EVENTS.REFUND_COMPLETED
    ) {
      const orderDbId = await getOrderIdFromPayload(payload);
      if (orderDbId) {
        // REFUND_COMPLETED fires for both full and partial returns; pass the
        // actual refunded amount so a partial return only reverses the
        // matching fraction of any reward grant (see reversalService.js).
        // ORDER_CANCELLED carries no refundAmount, so it stays a full
        // reversal, which is correct for a whole-order cancellation.
        const refundAmount =
          eventType === NOTIFICATION_EVENTS.REFUND_COMPLETED ? payload?.data?.refundAmount : undefined;
        await reverseOrderRewards(orderDbId, { refundAmount });
      }
      return;
    }

    if (eventType === NOTIFICATION_EVENTS.SELLER_ACCOUNT_APPROVED) {
      const { processSellerReferralReward } = await import("./services/referralService.js");
      const sellerId = payload.sellerId || payload.userId;
      if (sellerId) await processSellerReferralReward(sellerId);
    }
  } catch (error) {
    logger.error("Reward listener failed", { eventType, message: error.message });
  }
}

export default { handleRewardEvent };
