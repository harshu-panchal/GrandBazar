import dotenv from "dotenv";
import logger from "../services/logger.js";
import { computeTrendingProductsSnapshot } from "../services/trendingProductsService.js";

dotenv.config();

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // hourly — same cadence as trendingSearchAggregationJob.js
const TRENDING_PRODUCTS_INTERVAL_MS = parseInt(
  process.env.TRENDING_PRODUCTS_INTERVAL_MS || `${DEFAULT_INTERVAL_MS}`,
  10,
);

const runTrendingProductsAggregation = async () => {
  const startTime = Date.now();
  try {
    const items = await computeTrendingProductsSnapshot();
    logger.info("Trending products aggregation completed", {
      jobName: "trendingProductsAggregationJob",
      duration: Date.now() - startTime,
      productCount: items.length,
    });
  } catch (err) {
    logger.error("Trending products aggregation failed", {
      jobName: "trendingProductsAggregationJob",
      duration: Date.now() - startTime,
      error: err.message,
      stack: err.stack,
    });
  }
};

export const getTrendingProductsAggregationJobHandler = () => runTrendingProductsAggregation;

export const getTrendingProductsAggregationJobInterval = () => TRENDING_PRODUCTS_INTERVAL_MS;

export default runTrendingProductsAggregation;
