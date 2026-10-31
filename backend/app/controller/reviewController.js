import Review from "../models/review.js";
import mongoose from "mongoose";
import Product from "../models/product.js";
import Store from "../models/store.js";
import Order from "../models/order.js";
import handleResponse from "../utils/helper.js";
import getPagination from "../utils/pagination.js";
import { refreshReviewStatsForReview } from "../services/reviewStatsService.js";
import { orderMatchQueryFlexible } from "../utils/orderLookup.js";

/**
 * Verifies orderId (if supplied) belongs to this customer, is delivered, and
 * actually contains the product/store being reviewed — returns whether the
 * review should be flagged verifiedPurchase. Never throws for a missing/bad
 * orderId — order-linkage is optional, a review is still valid without it.
 * Accepts either the Mongo _id or the customer-facing orderId string (the
 * frontend order object is keyed by the latter).
 */
async function resolveVerifiedPurchase({ orderId, userId, productId, storeId }) {
  if (!orderId) return { verifiedPurchase: false, orderRef: null };
  const matchQuery = orderMatchQueryFlexible(orderId);
  if (!matchQuery) return { verifiedPurchase: false, orderRef: null };
  const order = await Order.findOne({ ...matchQuery, customer: userId })
    .select("_id status workflowStatus seller items.product")
    .lean();
  if (!order) return { verifiedPurchase: false, orderRef: null };
  const isDelivered = order.status === "delivered" || order.workflowStatus === "DELIVERED";
  if (!isDelivered) return { verifiedPurchase: false, orderRef: null };

  if (productId) {
    const hasProduct = (order.items || []).some(
      (item) => String(item.product) === String(productId),
    );
    if (!hasProduct) return { verifiedPurchase: false, orderRef: null };
  } else if (storeId && String(order.seller) !== String(storeId)) {
    return { verifiedPurchase: false, orderRef: null };
  }

  return { verifiedPurchase: true, orderRef: order._id };
}

function normalizeTargetType(body = {}) {
  const explicit = String(body.targetType || "").toLowerCase();
  if (explicit === "store" || explicit === "product") return explicit;
  if (body.storeId && !body.productId) return "store";
  return "product";
}

// Submit a review (Customer) — product or store
export const submitReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const rating = Number(req.body.rating);
    const comment = String(req.body.comment || "").trim();
    const targetType = normalizeTargetType(req.body);
    const productId = req.body.productId || null;
    const storeId = req.body.storeId || null;
    const orderId = req.body.orderId || null;

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return handleResponse(res, 400, "Rating must be between 1 and 5");
    }
    if (!comment) {
      return handleResponse(res, 400, "Review comment is required");
    }

    if (targetType === "product") {
      if (!productId) {
        return handleResponse(res, 400, "productId is required");
      }
      const product = await Product.findById(productId).select("_id").lean();
      if (!product) {
        return handleResponse(res, 404, "Product not found");
      }

      const existingReview = await Review.findOne({
        userId,
        productId,
        targetType: "product",
      });
      if (existingReview) {
        return handleResponse(res, 400, "You have already reviewed this product");
      }

      const { verifiedPurchase, orderRef } = await resolveVerifiedPurchase({
        orderId,
        userId,
        productId,
      });

      const newReview = await Review.create({
        userId,
        targetType: "product",
        productId,
        storeId: null,
        orderId: orderRef,
        verifiedPurchase,
        rating,
        comment,
        status: "approved",
      });

      await refreshReviewStatsForReview(newReview);

      return handleResponse(
        res,
        201,
        "Review submitted successfully",
        newReview,
      );
    }

    if (!storeId) {
      return handleResponse(res, 400, "storeId is required");
    }
    const store = await Store.findOne({
      _id: storeId,
      isActive: true,
      isVerified: true,
      applicationStatus: "approved",
    })
      .select("_id")
      .lean();
    if (!store) {
      return handleResponse(res, 404, "Store not found");
    }

    const existingReview = await Review.findOne({
      userId,
      storeId,
      targetType: "store",
    });
    if (existingReview) {
      return handleResponse(res, 400, "You have already reviewed this store");
    }

    const { verifiedPurchase, orderRef } = await resolveVerifiedPurchase({
      orderId,
      userId,
      storeId,
    });

    const newReview = await Review.create({
      userId,
      targetType: "store",
      storeId,
      productId: null,
      orderId: orderRef,
      verifiedPurchase,
      rating,
      comment,
      status: "approved",
    });

    const stats = await refreshReviewStatsForReview(newReview);

    return handleResponse(
      res,
      201,
      "Store review submitted successfully",
      { ...newReview.toObject?.() ? newReview.toObject() : newReview, stats },
    );
  } catch (error) {
    if (error?.code === 11000) {
      return handleResponse(res, 400, "You have already submitted a review");
    }
    return handleResponse(res, 500, error.message);
  }
};

// Get approved reviews for a product (Public)
export const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const reviews = await Review.find({
      productId,
      status: "approved",
      $or: [
        { targetType: "product" },
        { targetType: { $exists: false } },
        { targetType: null },
      ],
    })
      .populate("userId", "name image")
      .sort({ createdAt: -1 })
      .lean();

    const product = await Product.findById(productId)
      .select("avgRating reviewCount")
      .lean();

    return handleResponse(res, 200, "Reviews fetched successfully", {
      reviews,
      avgRating: product?.avgRating || 0,
      reviewCount: product?.reviewCount || reviews.length,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Get approved reviews for a store (Public)
export const getStoreReviews = async (req, res) => {
  try {
    const { storeId } = req.params;
    const reviews = await Review.find({
      storeId,
      targetType: "store",
      status: "approved",
    })
      .populate("userId", "name image")
      .sort({ createdAt: -1 })
      .lean();

    const store = await Store.findById(storeId)
      .select("avgRating reviewCount shopName")
      .lean();

    return handleResponse(res, 200, "Store reviews fetched successfully", {
      reviews,
      avgRating: store?.avgRating || 0,
      reviewCount: store?.reviewCount || reviews.length,
      storeName: store?.shopName || "",
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

function buildReviewFilters(query = {}, { defaultStatus = null } = {}) {
  const filters = {};
  const status = String(query.status || defaultStatus || "").toLowerCase();
  const targetType = String(query.targetType || "").toLowerCase();
  const rating = Number(query.rating);

  if (["pending", "approved", "rejected"].includes(status)) {
    filters.status = status;
  }
  if (targetType === "product" || targetType === "store") {
    filters.targetType = targetType;
  }
  if (Number.isInteger(rating) && rating >= 1 && rating <= 5) {
    filters.rating = rating;
  }
  return filters;
}

async function findReviewsPage(req, query, { includeCustomerContact = false } = {}) {
  const { page, limit, skip } = getPagination(req, {
    defaultLimit: 25,
    maxLimit: 200,
  });
  const [reviews, total, summary] = await Promise.all([
    Review.find(query)
      .populate("userId", includeCustomerContact ? "name email phone image" : "name image")
      .populate("productId", "name images mainImage sellerId")
      .populate("storeId", "shopName banners")
      .populate("orderId", "orderId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments(query),
    Review.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
          verifiedCount: { $sum: { $cond: ["$verifiedPurchase", 1, 0] } },
        },
      },
    ]),
  ]);

  return {
    items: reviews,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
    summary: {
      avgRating: Number(Number(summary[0]?.avgRating || 0).toFixed(1)),
      verifiedCount: Number(summary[0]?.verifiedCount || 0),
    },
  };
}

// Admin: Get reviews of every status (product + store)
export const getAdminReviews = async (req, res) => {
  try {
    const query = buildReviewFilters(req.query);
    const result = await findReviewsPage(req, query, { includeCustomerContact: true });
    return handleResponse(res, 200, "Reviews fetched successfully", result);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Backwards-compatible endpoint retained for older admin clients.
export const getPendingReviews = async (req, res) => {
  try {
    const query = buildReviewFilters({ ...req.query, status: "pending" });
    const result = await findReviewsPage(req, query, { includeCustomerContact: true });
    return handleResponse(res, 200, "Pending reviews fetched successfully", result);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Seller: approved product/store reviews belonging to the active store only.
export const getSellerReviews = async (req, res) => {
  try {
    const storeId = req.user?.activeStoreId || req.user?.id;
    if (!storeId || !mongoose.Types.ObjectId.isValid(String(storeId))) {
      return handleResponse(res, 400, "Active store is required");
    }

    const storeObjectId = new mongoose.Types.ObjectId(String(storeId));
    const productIds = await Product.find({ sellerId: storeObjectId }).distinct("_id");
    const targetType = String(req.query.targetType || "").toLowerCase();
    const productOwnership = {
      productId: { $in: productIds },
      $or: [
        { targetType: "product" },
        { targetType: { $exists: false } },
        { targetType: null },
      ],
    };
    const ownership =
      targetType === "store"
        ? { targetType: "store", storeId: storeObjectId }
        : targetType === "product"
          ? productOwnership
          : {
              $or: [
                { targetType: "store", storeId: storeObjectId },
                productOwnership,
              ],
            };

    const filters = buildReviewFilters(req.query);
    filters.status = "approved";
    delete filters.targetType;
    const result = await findReviewsPage(req, { ...filters, ...ownership });
    return handleResponse(res, 200, "Seller reviews fetched successfully", result);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Admin: Update review status (Approve/Reject)
export const updateReviewStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    if (!["approved", "rejected", "pending"].includes(status)) {
      return handleResponse(res, 400, "Invalid review status");
    }

    const review = await Review.findByIdAndUpdate(
      id,
      { status },
      { new: true },
    );
    if (!review) return handleResponse(res, 404, "Review not found");

    await refreshReviewStatsForReview(review);

    return handleResponse(res, 200, `Review ${status} successfully`, review);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
