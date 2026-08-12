import Order from "../models/order.js";
import Product from "../models/product.js";
import TrendingProductSnapshot from "../models/trendingProductSnapshot.js";
import { getApprovedOrLegacyFilter } from "./productModerationService.js";
import logger from "./logger.js";

const TRAILING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const TOP_N = 20;

/**
 * "Trending products" — real sales volume over a rolling window, distinct
 * from trending *search terms* (searchTrendingService.js) and from the
 * generic "lowest price" merchandising row already on Home.jsx. Recomputed
 * periodically by trendingProductsAggregationJob.js (same pattern as
 * computeTrendingSnapshot for search) since this aggregation scans recent
 * orders and shouldn't run on every page load.
 */
export async function computeTrendingProductsSnapshot() {
  const since = new Date(Date.now() - TRAILING_WINDOW_MS);
  const rows = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: since },
        status: { $nin: ["cancelled", "partial_cancelled"] },
      },
    },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.product",
        unitsSold: { $sum: "$items.quantity" },
      },
    },
    { $sort: { unitsSold: -1 } },
    { $limit: TOP_N * 2 }, // headroom — some will be filtered out below (out of stock/unpublished)
  ]);

  const productIds = rows.map((row) => row._id).filter(Boolean);
  const visibleProducts = await Product.find({
    _id: { $in: productIds },
    status: "active",
    isPublished: { $ne: false },
    stock: { $gt: 0 },
    ...getApprovedOrLegacyFilter(),
  })
    .select("_id")
    .lean();
  const visibleIds = new Set(visibleProducts.map((p) => String(p._id)));

  const items = rows
    .filter((row) => visibleIds.has(String(row._id)))
    .slice(0, TOP_N)
    .map((row) => ({ productId: row._id, unitsSold: row.unitsSold }));

  await TrendingProductSnapshot.findByIdAndUpdate(
    "latest",
    { $set: { items, computedAt: new Date() } },
    { upsert: true },
  );

  return items;
}

const PRODUCT_CARD_FIELDS =
  "name slug price salePrice mainImage stock avgRating reviewCount headerId categoryId subcategoryId sellerId";

export async function getTrendingProducts({ limit = 10 } = {}) {
  const snapshot = await TrendingProductSnapshot.findById("latest").lean();
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  if (!items.length) return [];

  const ids = items.slice(0, limit).map((i) => i.productId);
  const products = await Product.find({
    _id: { $in: ids },
    status: "active",
    isPublished: { $ne: false },
    stock: { $gt: 0 },
  })
    .select(PRODUCT_CARD_FIELDS)
    .populate("sellerId", "shopName")
    .lean();

  const productById = new Map(products.map((p) => [String(p._id), p]));
  // Preserve the trending rank order, not whatever order Mongo returned them in.
  return ids
    .map((id) => productById.get(String(id)))
    .filter(Boolean);
}

export async function refreshTrendingProductsSnapshot() {
  try {
    const items = await computeTrendingProductsSnapshot();
    logger.info("Trending products aggregation completed", {
      jobName: "trendingProductsAggregationJob",
      productCount: items.length,
    });
    return items;
  } catch (error) {
    logger.error("Trending products aggregation failed", {
      jobName: "trendingProductsAggregationJob",
      error: error.message,
    });
    return [];
  }
}
