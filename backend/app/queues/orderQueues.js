import Bull from "bull";
import {
  getRedisOptionsForBull,
  isRedisEnabled,
  createBullRedisClient,
} from "../config/redis.js";

const redisOpts = getRedisOptionsForBull();

const queueSettings = {
  stalledInterval: 30000,
  maxStalledCount: 2,
};

function createNoopQueue() {
  return {
    add: async () => ({}),
    getJob: async () => null,
    process: () => {},
    on: () => {},
    close: async () => {},
  };
}

export const sellerTimeoutQueue = isRedisEnabled()
  ? new Bull("seller-timeout", {
      redis: redisOpts,
      createClient: createBullRedisClient,
      settings: queueSettings,
    })
  : createNoopQueue();

export const deliveryTimeoutQueue = isRedisEnabled()
  ? new Bull("delivery-timeout", {
      redis: redisOpts,
      createClient: createBullRedisClient,
      settings: queueSettings,
    })
  : createNoopQueue();

export const orderActivationQueue = isRedisEnabled()
  ? new Bull("order-activation", {
      redis: redisOpts,
      createClient: createBullRedisClient,
      settings: queueSettings,
    })
  : createNoopQueue();

export const preorderActivationQueue = isRedisEnabled()
  ? new Bull("preorder-activation", {
      redis: redisOpts,
      createClient: createBullRedisClient,
      settings: queueSettings,
    })
  : createNoopQueue();

export const extraPaymentDeadlineQueue = isRedisEnabled()
  ? new Bull("extra-payment-deadline", {
      redis: redisOpts,
      createClient: createBullRedisClient,
      settings: queueSettings,
    })
  : createNoopQueue();

export const JOB_NAMES = {
  SELLER_TIMEOUT: "seller-timeout",
  DELIVERY_TIMEOUT: "delivery-timeout",
  ORDER_ACTIVATION: "order-activation",
  PREORDER_SALE_START: "preorder-sale-start",
  EXTRA_PAYMENT_DEADLINE: "extra-payment-deadline",
};
