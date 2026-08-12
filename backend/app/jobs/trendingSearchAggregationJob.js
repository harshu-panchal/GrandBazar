import dotenv from "dotenv";
import logger from "../services/logger.js";
import { computeTrendingSnapshot } from "../services/searchTrendingService.js";

dotenv.config();

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // hourly
const TRENDING_SEARCH_INTERVAL_MS = parseInt(
  process.env.TRENDING_SEARCH_INTERVAL_MS || `${DEFAULT_INTERVAL_MS}`,
  10,
);

const runTrendingSearchAggregation = async () => {
  const startTime = Date.now();
  try {
    const items = await computeTrendingSnapshot();
    logger.info("Trending search aggregation completed", {
      jobName: "trendingSearchAggregationJob",
      duration: Date.now() - startTime,
      termCount: items.length,
    });
  } catch (err) {
    logger.error("Trending search aggregation failed", {
      jobName: "trendingSearchAggregationJob",
      duration: Date.now() - startTime,
      error: err.message,
      stack: err.stack,
    });
  }
};

export const getTrendingSearchAggregationJobHandler = () => runTrendingSearchAggregation;

export const getTrendingSearchAggregationJobInterval = () => TRENDING_SEARCH_INTERVAL_MS;

export default runTrendingSearchAggregation;
