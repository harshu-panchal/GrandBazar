import express from "express";
import {
  submitReview,
  getProductReviews,
  getStoreReviews,
  getPendingReviews,
  getAdminReviews,
  getSellerReviews,
  updateReviewStatus,
} from "../controller/reviewController.js";
import {
  verifyToken,
  allowRoles,
  resolveActiveStore,
  requireApprovedSeller,
  checkSubSellerPermission,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// Public routes
router.get("/product/:productId", getProductReviews);
router.get("/store/:storeId", getStoreReviews);

// Authenticated customer routes
router.post("/submit", verifyToken, submitReview);

// Admin only routes
router.get("/admin", verifyToken, allowRoles("admin"), getAdminReviews);
router.get("/admin/pending", verifyToken, allowRoles("admin"), getPendingReviews);
router.patch("/admin/status/:id", verifyToken, allowRoles("admin"), updateReviewStatus);

// Seller only route — resolve and enforce the active store before scoping data.
router.get(
  "/seller/mine",
  verifyToken,
  allowRoles("seller"),
  resolveActiveStore,
  requireApprovedSeller,
  checkSubSellerPermission("products", "read"),
  getSellerReviews,
);

export default router;
