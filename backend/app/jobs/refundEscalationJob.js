import dotenv from "dotenv";
import Order from "../models/order.js";
import Admin from "../models/admin.js";
import logger from "../services/logger.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";

dotenv.config();

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000; // 30 min
const REFUND_ESCALATION_INTERVAL_MS = parseInt(
  process.env.REFUND_ESCALATION_INTERVAL_MS || `${DEFAULT_INTERVAL_MS}`,
  10,
);

// A return that has sat at "returned" (QC-pending) beyond this many hours
// gets a repeat admin nudge — previously RETURN_QC_REQUESTED fired exactly
// once, at return-drop time, so a missed/dismissed notification left the
// refund silently stuck with nobody re-alerted.
const REFUND_ESCALATION_SLA_HOURS = parseInt(
  process.env.REFUND_ESCALATION_SLA_HOURS || "24",
  10,
);

const escalateStaleRefunds = async () => {
  const startTime = Date.now();
  try {
    const slaThreshold = new Date(Date.now() - REFUND_ESCALATION_SLA_HOURS * 60 * 60 * 1000);

    const candidates = await Order.find({
      returnStatus: "returned",
      refundPendingSince: { $lte: slaThreshold },
      // Re-escalate at most once per SLA window, not every job tick.
      $or: [
        { refundEscalatedAt: null },
        { refundEscalatedAt: { $lte: slaThreshold } },
      ],
    })
      .select("_id orderId refundPendingSince")
      .lean();

    if (candidates.length === 0) return;

    const admins = await Admin.find().select("_id").lean();
    const adminIds = (admins || []).map((a) => a?._id).filter(Boolean);

    for (const row of candidates) {
      try {
        const hoursPending = Math.floor(
          (Date.now() - new Date(row.refundPendingSince).getTime()) / (60 * 60 * 1000),
        );
        emitNotificationEvent(NOTIFICATION_EVENTS.RETURN_QC_REQUESTED, {
          orderId: row.orderId,
          adminIds,
          data: { escalated: true, hoursPending },
        });
        await Order.updateOne({ _id: row._id }, { $set: { refundEscalatedAt: new Date() } });
      } catch (err) {
        logger.error("Failed to escalate stale refund", {
          jobName: "refundEscalationJob",
          orderId: row.orderId,
          error: err.message,
        });
      }
    }

    logger.info("Refund escalation job completed", {
      jobName: "refundEscalationJob",
      duration: Date.now() - startTime,
      escalatedCount: candidates.length,
    });
  } catch (err) {
    logger.error("Refund escalation job failed", {
      jobName: "refundEscalationJob",
      duration: Date.now() - startTime,
      error: err.message,
      stack: err.stack,
    });
  }
};

export const getRefundEscalationJobHandler = () => escalateStaleRefunds;
export const getRefundEscalationJobInterval = () => REFUND_ESCALATION_INTERVAL_MS;

export default escalateStaleRefunds;
