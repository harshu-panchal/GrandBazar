import Transaction from "../models/transaction.js";
import Order from "../models/order.js";
import CheckoutGroup from "../models/checkoutGroup.js";
import { releaseReservedStockForOrder } from "./stockService.js";
import { reverseOrderFinanceOnCancellation } from "./finance/orderFinanceService.js";
import logger from "./logger.js";

/**
 * Reverse stock, fail the seller transaction, and reverse any captured
 * payment/wallet debit when an order is cancelled after stock/money moved
 * at placement. This is the single choke point every cancellation path
 * (customer, seller, admin, and every auto-cancel job/timeout) already
 * routes through, so the finance reversal lives here rather than being
 * duplicated at each call site.
 */
export async function compensateOrderCancellation(order, orderIdString) {
  const existing = await Order.findById(order._id);
  if (existing) {
    await releaseReservedStockForOrder(existing, {
      reason: "Cancelled",
    });
    await existing.save();

    try {
      await reverseOrderFinanceOnCancellation(existing._id, {
        reason: existing.cancelReason || "Order cancelled",
      });
    } catch (financeError) {
      logger.error("[compensateOrderCancellation] finance reversal failed", {
        orderId: orderIdString,
        message: financeError.message,
      });
    }
  }

  await Transaction.findOneAndUpdate(
    { reference: orderIdString },
    { status: "Failed" },
  );

  if (existing?.checkoutGroupId) {
    const activeCount = await Order.countDocuments({
      checkoutGroupId: existing.checkoutGroupId,
      status: { $ne: "cancelled" },
      workflowStatus: { $ne: "CANCELLED" },
    });
    if (activeCount === 0) {
      await CheckoutGroup.updateOne(
        { checkoutGroupId: existing.checkoutGroupId },
        {
          $set: {
            status: "CANCELLED",
            paymentStatus: "FAILED",
            "stockReservation.status": "RELEASED",
            "stockReservation.releasedAt": new Date(),
          },
        },
      );
    }
  }
}
