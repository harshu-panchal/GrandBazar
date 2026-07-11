import logger from "../../services/logger.js";

export function emitNotificationEvent(eventType, payload = {}) {
  if (process.env.NODE_ENV === "test") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setImmediate(async () => {
      try {
        const { notify } = await import("./notification.service.js");
        await notify(eventType, payload);

        const { handleRewardEvent } = await import("../rewards/reward.listener.js");
        await handleRewardEvent(eventType, payload);
      } catch (error) {
        logger.error("Failed to emit notification event", {
          eventType,
          message: error.message,
        });
      } finally {
        resolve();
      }
    });
  });
}

export default {
  emitNotificationEvent,
};
