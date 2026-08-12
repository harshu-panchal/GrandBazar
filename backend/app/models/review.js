import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: ["product", "store"],
      default: "product",
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
      index: true,
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      default: null,
      index: true,
    },
    // Set when the review was submitted from a specific delivered order
    // (see OrderDetailPage.jsx "Rate your order" prompt) rather than the
    // generic product/store review form. Optional — a review with no
    // orderId is still valid, just not order-linked/verified.
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    verifiedPurchase: {
      type: Boolean,
      default: false,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true },
);

// One product review per customer
reviewSchema.index(
  { userId: 1, productId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      targetType: "product",
      productId: { $type: "objectId" },
    },
  },
);

// One store review per customer
reviewSchema.index(
  { userId: 1, storeId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      targetType: "store",
      storeId: { $type: "objectId" },
    },
  },
);

const Review = mongoose.model("Review", reviewSchema);

/** Drop legacy unique index that blocks multiple store reviews (null productId). */
export async function ensureReviewIndexes() {
  try {
    const indexes = await Review.collection.indexes();
    const legacy = indexes.find(
      (idx) =>
        idx.name === "userId_1_productId_1" && !idx.partialFilterExpression,
    );
    if (legacy) {
      await Review.collection.dropIndex("userId_1_productId_1");
    }
  } catch (error) {
    if (error?.code !== 27 && error?.codeName !== "IndexNotFound") {
      console.warn("[reviews] ensureReviewIndexes:", error.message);
    }
  }

  try {
    const { publishPendingReviewsAndRefreshStats } = await import(
      "../services/reviewStatsService.js"
    );
    const result = await publishPendingReviewsAndRefreshStats();
    if (result?.published) {
      console.log(
        `[reviews] Published ${result.published} pending review(s) and refreshed ratings`,
      );
    }
  } catch (error) {
    console.warn("[reviews] pending publish backfill:", error.message);
  }
}

export default Review;
