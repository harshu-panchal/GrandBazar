import { runRewardMaintenanceJobs } from "../modules/rewards/reward.worker.js";
import logger from "../services/logger.js";

const DEFAULT_INTERVAL_MS = 3600000; // 1 hour

export function getRewardMaintenanceJobInterval() {
  return parseInt(process.env.REWARD_MAINTENANCE_JOB_INTERVAL_MS || `${DEFAULT_INTERVAL_MS}`, 10);
}

export function getRewardMaintenanceJobHandler() {
  return async () => {
    const startTime = Date.now();
    try {
      const result = await runRewardMaintenanceJobs();
      logger.info("Reward maintenance job completed", {
        jobName: "rewardMaintenanceJob",
        duration: Date.now() - startTime,
        ...result,
      });
    } catch (error) {
      logger.error("Reward maintenance job failed", {
        jobName: "rewardMaintenanceJob",
        duration: Date.now() - startTime,
        error: error.message,
      });
    }
  };
}
