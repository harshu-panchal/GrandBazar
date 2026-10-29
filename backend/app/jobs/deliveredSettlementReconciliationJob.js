import Order from "../models/order.js";
import logger from "../services/logger.js";
import { applyDeliveredSettlement } from "../services/orderSettlement.js";

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_BATCH_SIZE = 25;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;

export function getDeliveredSettlementReconciliationJobInterval() {
  const interval = Number.parseInt(
    process.env.DELIVERED_SETTLEMENT_RECONCILIATION_INTERVAL_MS ||
      `${DEFAULT_INTERVAL_MS}`,
    10,
  );
  return Number.isFinite(interval) && interval > 0 ? interval : DEFAULT_INTERVAL_MS;
}

export function getDeliveredSettlementReconciliationJobHandler() {
  return async () => {
    const startedAt = Date.now();
    const now = new Date();
    const cutoff = new Date(Date.now() - DEFAULT_INTERVAL_MS);
    const candidates = await Order.find({
      status: "delivered",
      deliveredAt: { $lte: cutoff },
      $and: [
        {
          $or: [
            { "financeFlags.deliveredSettlementApplied": { $ne: true } },
            {
              paymentMode: "COD",
              fulfillmentMethod: "platform_logistics",
              deliveryBoy: { $exists: true, $ne: null },
              "financeFlags.codMarkedCollected": { $ne: true },
            },
          ],
        },
        {
          $or: [
            { "financeFlags.deliverySettlementRetryAt": null },
            { "financeFlags.deliverySettlementRetryAt": { $lte: now } },
          ],
        },
      ],
    })
      .select("_id orderId deliveredAt financeFlags.deliverySettlementRetryCount")
      .sort({ deliveredAt: 1 })
      .limit(DEFAULT_BATCH_SIZE)
      .lean();

    let settledCount = 0;
    let failedCount = 0;

    for (const order of candidates) {
      try {
        await applyDeliveredSettlement(order, order.orderId);
        settledCount += 1;
      } catch (error) {
        failedCount += 1;
        const retryCount =
          Number(order.financeFlags?.deliverySettlementRetryCount || 0) + 1;
        const retryDelay = Math.min(
          DEFAULT_INTERVAL_MS * 2 ** Math.min(retryCount - 1, 10),
          MAX_RETRY_DELAY_MS,
        );
        try {
          await Order.updateOne(
            { _id: order._id },
            {
              $set: {
                "financeFlags.deliverySettlementRetryCount": retryCount,
                "financeFlags.deliverySettlementRetryAt": new Date(
                  Date.now() + retryDelay,
                ),
              },
            },
          );
        } catch (retryError) {
          logger.error("Failed to schedule delivered settlement retry", {
            jobName: "deliveredSettlementReconciliationJob",
            orderId: order.orderId,
            error: retryError.message,
          });
        }
        logger.error("Delivered order finance reconciliation failed", {
          jobName: "deliveredSettlementReconciliationJob",
          orderId: order.orderId,
          retryCount,
          retryDelayMs: retryDelay,
          error: error.message,
          stack: error.stack,
        });
        continue;
      }

      try {
        await Order.updateOne(
          { _id: order._id },
          {
            $set: { "financeFlags.deliverySettlementRetryCount": 0 },
            $unset: { "financeFlags.deliverySettlementRetryAt": 1 },
          },
        );
      } catch (error) {
        logger.warn("Failed to clear delivered settlement retry state", {
          jobName: "deliveredSettlementReconciliationJob",
          orderId: order.orderId,
          error: error.message,
        });
      }
    }

    if (candidates.length > 0) {
      logger.info("Delivered order finance reconciliation completed", {
        jobName: "deliveredSettlementReconciliationJob",
        duration: Date.now() - startedAt,
        candidateCount: candidates.length,
        settledCount,
        failedCount,
      });
    }
  };
}
