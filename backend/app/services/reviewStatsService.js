import mongoose from "mongoose";
import Review from "../models/review.js";
import Product from "../models/product.js";
import Store from "../models/store.js";

function asObjectId(value) {
  if (!value) return value;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return value;
}

async function aggregateApprovedRatings(match) {
  const normalizedMatch = { ...match, status: "approved" };
  if (normalizedMatch.productId) {
    normalizedMatch.productId = asObjectId(normalizedMatch.productId);
  }
  if (normalizedMatch.storeId) {
    normalizedMatch.storeId = asObjectId(normalizedMatch.storeId);
  }

  const [stats] = await Review.aggregate([
    { $match: normalizedMatch },
    {
      $group: {
        _id: null,
        avgRating: { $avg: "$rating" },
        reviewCount: { $sum: 1 },
      },
    },
  ]);

  return {
    avgRating: Number(Number(stats?.avgRating || 0).toFixed(1)),
    reviewCount: Number(stats?.reviewCount || 0),
  };
}

function productReviewMatch(productId) {
  return {
    productId,
    $or: [
      { targetType: "product" },
      { targetType: { $exists: false } },
      { targetType: null },
    ],
  };
}

function storeReviewMatch(storeId) {
  return {
    storeId,
    targetType: "store",
  };
}

export async function refreshProductReviewStats(productId) {
  if (!productId) return null;
  const { avgRating, reviewCount } = await aggregateApprovedRatings(
    productReviewMatch(productId),
  );
  await Product.findByIdAndUpdate(productId, {
    $set: { avgRating, reviewCount },
  });
  return { avgRating, reviewCount };
}

export async function refreshStoreReviewStats(storeId) {
  if (!storeId) return null;
  const { avgRating, reviewCount } = await aggregateApprovedRatings(
    storeReviewMatch(storeId),
  );
  await Store.findByIdAndUpdate(storeId, {
    $set: { avgRating, reviewCount },
  });
  return { avgRating, reviewCount };
}

export async function refreshReviewStatsForReview(review) {
  if (!review) return null;
  const targetType = String(review.targetType || "").toLowerCase();
  if (targetType === "store" || (review.storeId && !review.productId)) {
    return refreshStoreReviewStats(review.storeId);
  }
  if (review.productId) {
    return refreshProductReviewStats(review.productId);
  }
  return null;
}

/** Publish stuck pending reviews and recompute store/product averages. */
export async function publishPendingReviewsAndRefreshStats() {
  const pending = await Review.find({ status: "pending" })
    .select("_id targetType productId storeId")
    .lean();
  if (!pending.length) return { published: 0 };

  await Review.updateMany(
    { status: "pending" },
    { $set: { status: "approved" } },
  );

  const storeIds = new Set();
  const productIds = new Set();
  for (const review of pending) {
    if (review.targetType === "store" && review.storeId) {
      storeIds.add(String(review.storeId));
    } else if (review.productId) {
      productIds.add(String(review.productId));
    }
  }

  await Promise.all([
    ...[...storeIds].map((id) => refreshStoreReviewStats(id)),
    ...[...productIds].map((id) => refreshProductReviewStats(id)),
  ]);

  return { published: pending.length };
}
