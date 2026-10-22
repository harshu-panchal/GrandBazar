import { runComplaintSlaSweep } from "../services/complaintService.js";
import logger from "../services/logger.js";

// Daily complaint SLA sweep (BRD CMP-04 / flow-chart "Daily: Day 5 alert, Day 7
// OVERDUE flag"). Idempotent — guarded by day5AlertSentAt / isOverdue.
const DEFAULT_INTERVAL_MS = 6 * 3600000; // every 6h (sub-daily so the flag/alert is timely)

export function getComplaintSlaJobInterval() {
  return parseInt(process.env.COMPLAINT_SLA_JOB_INTERVAL_MS || `${DEFAULT_INTERVAL_MS}`, 10);
}

export function getComplaintSlaJobHandler() {
  return async () => {
    const startTime = Date.now();
    try {
      const result = await runComplaintSlaSweep();
      logger.info("Complaint SLA sweep completed", {
        jobName: "complaintSlaJob",
        duration: Date.now() - startTime,
        ...result,
      });
    } catch (error) {
      logger.error("Complaint SLA sweep failed", {
        jobName: "complaintSlaJob",
        duration: Date.now() - startTime,
        error: error.message,
      });
    }
  };
}
