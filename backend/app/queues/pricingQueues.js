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

// Recomputes the denormalized customerPrice/customerSalePrice fields on
// Product/variant docs (display/search/sort only — never authoritative for
// checkout) whenever a commission setting changes at a scope wider than a
// single product. A single product's own price/commission edit is cheap
// enough to recompute inline in the request handler instead of via queue.
export const customerPriceRecalcQueue = isRedisEnabled()
  ? new Bull("customer-price-recalc", {
      redis: redisOpts,
      createClient: createBullRedisClient,
      settings: queueSettings,
    })
  : createNoopQueue();

export const JOB_NAMES = {
  RECALC_BY_CATEGORY: "recalc-by-category",
  RECALC_BY_SELLER: "recalc-by-seller",
  RECALC_BY_CITY: "recalc-by-city",
};
