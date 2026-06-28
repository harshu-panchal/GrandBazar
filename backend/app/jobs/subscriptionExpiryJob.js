import logger from "../services/logger.js";
import { expireDueSubscriptions } from "../services/subscriptionService.js";

const DEFAULT_INTERVAL_MS = 300000;

export function getSubscriptionExpiryJobInterval() {
  return parseInt(
    process.env.SUBSCRIPTION_EXPIRY_JOB_INTERVAL_MS || `${DEFAULT_INTERVAL_MS}`,
    10,
  );
}

export function getSubscriptionExpiryJobHandler() {
  return async () => {
    const startTime = Date.now();
    try {
      const expiredCount = await expireDueSubscriptions();
      if (expiredCount > 0) {
        logger.info("Subscription expiry job completed", {
          jobName: "subscriptionExpiryJob",
          duration: Date.now() - startTime,
          expiredCount,
        });
      }
    } catch (error) {
      logger.error("Subscription expiry job failed", {
        jobName: "subscriptionExpiryJob",
        duration: Date.now() - startTime,
        error: error.message,
      });
    }
  };
}
