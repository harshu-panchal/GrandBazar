import dotenv from "dotenv";
import Order from "../models/order.js";
import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import { processSellerTimeoutJob, processDeliveryTimeoutJob } from "../services/orderWorkflowService.js";
import { compensateOrderCancellation } from "../services/orderCompensation.js";
import { activateDueScheduledOrdersSweep } from "../services/orderActivationService.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import logger from "../services/logger.js";

dotenv.config();

const DEFAULT_INTERVAL_MS = 10000;
const AUTO_CANCEL_INTERVAL_MS = parseInt(
  process.env.AUTO_CANCEL_INTERVAL_MS || `${DEFAULT_INTERVAL_MS}`,
  10,
);

/**
 * Fallback when Bull/Redis is unavailable: reconciles expired seller-pending orders (v2)
 * by delegating to the same handler as the queue worker.
 * Legacy v1 orders use status + expiresAt only.
 */
const autoCancelExpiredOrders = async () => {
  const startTime = Date.now();
  
  try {
    const now = new Date();

    const v2Expired = await Order.find({
      workflowVersion: { $gte: 2 },
      workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
      sellerPendingExpiresAt: { $lte: now },
    })
      .select("orderId")
      .lean();

    for (const row of v2Expired) {
      try {
        await processSellerTimeoutJob({ orderId: row.orderId });
      } catch (err) {
        logger.error('v2 seller timeout failed', {
          jobName: 'orderAutoCancelJob',
          orderId: row.orderId,
          error: err.message
        });
      }
    }

    try {
      await activateDueScheduledOrdersSweep();
    } catch (err) {
      logger.error('scheduled activation sweep failed', {
        jobName: 'orderAutoCancelJob',
        error: err.message,
      });
    }

    // Scheduled/pre-order fulfillment gets a long (24h) seller-accept
    // window instead of the usual ~60s — previously the seller was only
    // ever notified once, at order placement, with no reminder before that
    // window quietly expired and the order auto-cancelled.
    try {
      const reminderWindowStart = now;
      const reminderWindowEnd = new Date(now.getTime() + 60 * 60 * 1000);
      const dueForReminder = await Order.find({
        workflowVersion: { $gte: 2 },
        workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
        fulfillmentType: { $in: ["scheduled", "preorder"] },
        sellerPendingExpiresAt: { $gt: reminderWindowStart, $lte: reminderWindowEnd },
        sellerAcceptReminderSentAt: null,
      })
        .select("orderId seller")
        .lean();

      for (const row of dueForReminder) {
        try {
          await Order.updateOne(
            { _id: row._id },
            { $set: { sellerAcceptReminderSentAt: new Date() } },
          );
          emitNotificationEvent(NOTIFICATION_EVENTS.SCHEDULED_ORDER_CUTOFF_REMINDER, {
            orderId: row.orderId,
            sellerId: row.seller,
          });
        } catch (err) {
          logger.error('seller accept-cutoff reminder failed', {
            jobName: 'orderAutoCancelJob',
            orderId: row.orderId,
            error: err.message,
          });
        }
      }
    } catch (err) {
      logger.error('seller accept-cutoff reminder sweep failed', {
        jobName: 'orderAutoCancelJob',
        error: err.message,
      });
    }

    // Scheduled/pre-orders are accepted well before their delivery date —
    // stock can run out in the meantime with no automated check at all
    // before now. Alert the seller once, ~24h ahead of delivery, if any
    // item no longer has enough stock.
    try {
      const Product = (await import("../models/product.js")).default;
      const lookahead = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const upcomingScheduled = await Order.find({
        workflowVersion: { $gte: 2 },
        workflowStatus: { $in: [WORKFLOW_STATUS.SCHEDULED_HOLD, WORKFLOW_STATUS.SELLER_ACCEPTED] },
        fulfillmentType: { $in: ["scheduled", "preorder"] },
        "schedule.deliveryDate": { $gt: now, $lte: lookahead },
        stockShortageAlertSentAt: null,
      })
        .select("orderId seller items schedule.deliveryDate")
        .lean();

      for (const order of upcomingScheduled) {
        try {
          const productIds = (order.items || []).map((i) => i.product).filter(Boolean);
          if (!productIds.length) continue;
          const products = await Product.find({ _id: { $in: productIds } })
            .select("_id name stock variants")
            .lean();
          const byId = new Map(products.map((p) => [String(p._id), p]));

          const shortItem = (order.items || []).find((item) => {
            const product = byId.get(String(item.product));
            if (!product) return true;
            const variantSku = String(item.variantSku || item.variantSlot || "").trim();
            if (variantSku) {
              const variant = (product.variants || []).find(
                (v) => String(v?.sku || "").trim() === variantSku,
              );
              return !variant || Number(variant.stock || 0) < Number(item.quantity || 0);
            }
            return Number(product.stock || 0) < Number(item.quantity || 0);
          });

          if (shortItem) {
            await Order.updateOne(
              { _id: order._id },
              { $set: { stockShortageAlertSentAt: new Date() } },
            );
            emitNotificationEvent(NOTIFICATION_EVENTS.SCHEDULED_ORDER_STOCK_SHORTAGE, {
              orderId: order.orderId,
              sellerId: order.seller,
              itemName: shortItem.name,
              deliveryDateLabel: order.schedule?.deliveryDate
                ? new Date(order.schedule.deliveryDate).toLocaleDateString()
                : null,
            });
          }
        } catch (err) {
          logger.error('stock shortage check failed for order', {
            jobName: 'orderAutoCancelJob',
            orderId: order.orderId,
            error: err.message,
          });
        }
      }
    } catch (err) {
      logger.error('stock shortage sweep failed', {
        jobName: 'orderAutoCancelJob',
        error: err.message,
      });
    }

    const v2DeliveryExpired = await Order.find({
      workflowVersion: { $gte: 2 },
      workflowStatus: WORKFLOW_STATUS.DELIVERY_SEARCH,
      deliverySearchExpiresAt: { $lte: now },
    })
      .select("orderId deliverySearchMeta")
      .lean();

    for (const row of v2DeliveryExpired) {
      try {
        const attempt = row.deliverySearchMeta?.attempt || 1;
        await processDeliveryTimeoutJob({ orderId: row.orderId, attempt });
      } catch (err) {
        logger.error('v2 delivery timeout failed', {
          jobName: 'orderAutoCancelJob',
          orderId: row.orderId,
          error: err.message
        });
      }
    }

    const paymentExpiredOrders = await Order.find({
      workflowVersion: { $gte: 2 },
      workflowStatus: WORKFLOW_STATUS.CREATED,
      paymentMode: "ONLINE",
      paymentStatus: { $ne: "PAID" },
      "stockReservation.status": { $ne: "RELEASED" },
      "stockReservation.expiresAt": { $lte: now },
    })
      .select("_id orderId")
      .lean();

    for (const row of paymentExpiredOrders) {
      try {
        const updated = await Order.findOneAndUpdate(
          {
            _id: row._id,
            workflowStatus: WORKFLOW_STATUS.CREATED,
            paymentStatus: { $ne: "PAID" },
          },
          {
            $set: {
              workflowStatus: WORKFLOW_STATUS.CANCELLED,
              status: "cancelled",
              orderStatus: "cancelled",
              cancelledBy: "system",
              cancelReason: "Payment timeout",
            },
          },
          { new: true },
        );
        if (updated) {
          await compensateOrderCancellation(updated, updated.orderId);
          emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CANCELLED, {
            orderId: updated.orderId,
            customerId: updated.customer,
            userId: updated.customer,
            sellerId: updated.seller,
            customerMessage: "Order cancelled due to payment timeout.",
            sellerMessage: `Order #${updated.orderId} cancelled due to payment timeout.`,
          });
        }
      } catch (err) {
        logger.error('payment timeout cancellation failed', {
          jobName: 'orderAutoCancelJob',
          orderId: row.orderId,
          error: err.message
        });
      }
    }

    const legacyExpired = await Order.find({
      $or: [
        { workflowVersion: { $exists: false } },
        { workflowVersion: { $lt: 2 } },
      ],
      status: "pending",
      expiresAt: { $lte: now },
    });

    for (const order of legacyExpired) {
      order.status = "cancelled";
      order.cancelledBy = "system";
      order.cancelReason = "Seller timeout (60s)";
      await order.save();

      try {
        await compensateOrderCancellation(order, order.orderId);
      } catch (e) {
        logger.error('legacy compensation failed', {
          jobName: 'orderAutoCancelJob',
          orderId: order.orderId,
          error: e.message
        });
      }

      emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CANCELLED, {
        orderId: order.orderId,
        customerId: order.customer,
        userId: order.customer,
        sellerId: order.seller,
        customerMessage:
          "Your order was cancelled because it was not accepted in time.",
        sellerMessage:
          `Order #${order.orderId} was cancelled because it was not accepted in time.`,
      });
    }

    const n =
      v2Expired.length +
      v2DeliveryExpired.length +
      paymentExpiredOrders.length +
      legacyExpired.length;
    
    const duration = Date.now() - startTime;
    
    if (n > 0) {
      logger.info('Order auto-cancel job completed', {
        jobName: 'orderAutoCancelJob',
        duration,
        v2SellerExpired: v2Expired.length,
        v2DeliveryExpired: v2DeliveryExpired.length,
        paymentExpired: paymentExpiredOrders.length,
        legacyExpired: legacyExpired.length,
        total: n
      });
    }
  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error('Order auto-cancel job failed', {
      jobName: 'orderAutoCancelJob',
      duration,
      error: err.message,
      stack: err.stack
    });
  }
};

/**
 * Start order auto-cancel job using distributed scheduler
 * This function is called by the scheduler process role
 */
export const startOrderAutoCancelJob = () => {
  // This function is now a no-op - the distributed scheduler handles registration
  // Kept for backward compatibility
  logger.warn('startOrderAutoCancelJob called directly - use distributed scheduler instead');
};

/**
 * Get the job handler function for distributed scheduler registration
 * @returns {Function}
 */
export const getOrderAutoCancelJobHandler = () => autoCancelExpiredOrders;

/**
 * Get the job interval in milliseconds
 * @returns {number}
 */
export const getOrderAutoCancelJobInterval = () => AUTO_CANCEL_INTERVAL_MS;

export default startOrderAutoCancelJob;
