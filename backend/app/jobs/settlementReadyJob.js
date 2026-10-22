import { markReadySweep } from "../services/finance/sellerSettlementService.js";
import logger from "../services/logger.js";

// Per-minute sweep (BRD / flow-chart "Every minute: close expired 24h windows,
// mark orders READY when checks turn green"). Also backfills complaintWindowClosesAt.
const DEFAULT_INTERVAL_MS = 60000;

export function getSettlementReadyJobInterval() {
  return parseInt(process.env.SETTLEMENT_READY_JOB_INTERVAL_MS || `${DEFAULT_INTERVAL_MS}`, 10);
}

export function getSettlementReadyJobHandler() {
  return async () => {
    const startTime = Date.now();
    try {
      const result = await markReadySweep();
      logger.info("Settlement READY sweep completed", {
        jobName: "settlementReadyJob",
        duration: Date.now() - startTime,
        ...result,
      });
    } catch (error) {
      logger.error("Settlement READY sweep failed", {
        jobName: "settlementReadyJob",
        duration: Date.now() - startTime,
        error: error.message,
      });
    }
  };
}
