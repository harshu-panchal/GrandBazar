import SearchQueryLog from "../models/searchQueryLog.js";
import TrendingSearchSnapshot from "../models/trendingSearchSnapshot.js";
import logger from "./logger.js";

const TRAILING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const TOP_N = 10;
const MIN_QUERY_LENGTH = 2;

export async function logSearchQuery({ query, customerId = null, city = "", resultCount = 0 }) {
  const trimmed = String(query || "").trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return;
  try {
    await SearchQueryLog.create({
      query: trimmed,
      normalizedQuery: trimmed.toLowerCase(),
      customerId: customerId || null,
      city: city || "",
      resultCount: Number(resultCount) || 0,
    });
  } catch (err) {
    logger.warn("Failed to log search query", { error: err.message });
  }
}

export async function computeTrendingSnapshot() {
  const since = new Date(Date.now() - TRAILING_WINDOW_MS);
  const rows = await SearchQueryLog.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: "$normalizedQuery",
        count: { $sum: 1 },
        displayQuery: { $first: "$query" },
      },
    },
    { $sort: { count: -1 } },
    { $limit: TOP_N },
  ]);

  const items = rows.map((row) => ({ query: row.displayQuery || row._id, count: row.count }));

  await TrendingSearchSnapshot.findByIdAndUpdate(
    "latest",
    { $set: { items, computedAt: new Date() } },
    { upsert: true },
  );

  return items;
}

export async function getTrendingSearches() {
  const snapshot = await TrendingSearchSnapshot.findById("latest").lean();
  return Array.isArray(snapshot?.items) ? snapshot.items : [];
}
