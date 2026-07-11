import Bull from "bull";
import {
  getRedisOptionsForBull,
  isRedisEnabled,
  createBullRedisClient,
} from "../../config/redis.js";

function createNoopQueue(name) {
  return {
    name,
    add: async () => ({}),
    process: () => {},
    on: () => {},
    close: async () => {},
  };
}

export const rewardQueue = isRedisEnabled()
  ? new Bull("rewards", {
      redis: getRedisOptionsForBull(),
      createClient: createBullRedisClient,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    })
  : createNoopQueue("rewards");

export const REWARD_JOB_NAMES = Object.freeze({
  ACTIVATE_PENDING: "activate-pending-grant",
  EXPIRE_CAMPAIGNS: "expire-campaigns",
  EXPIRY_REMINDER: "expiry-reminder",
  BIRTHDAY_REWARDS: "birthday-rewards",
});

export default { rewardQueue, REWARD_JOB_NAMES };
