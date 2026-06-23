import express from "express";
import {
    signupSeller,
    loginSeller,
    sendSellerSignupOtp,
    verifySellerSignupOtp,
} from "../controller/sellerAuthController.js";
import { getSellerProfile, updateSellerProfile, requestWithdrawal, getNearbySellers, getPublicSellerProfile } from "../controller/sellerController.js";
import { getSellerStats, getSellerEarnings } from "../controller/sellerStatsController.js";
import {
    getSellerStaff,
    createSellerStaff,
    updateSellerStaff,
    deleteSellerStaff
} from "../controller/seller/staffController.js";
import { getSellerWalletSummaryController } from "../controller/adminFinanceController.js";
import { 
    createSellerCoupon, 
    getSellerCoupons, 
    updateSellerCoupon, 
    deleteSellerCoupon 
} from "../controller/sellerCouponController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import handleResponse from "../utils/helper.js";

const allowOwnerOnly = (req, res, next) => {
  if (req.user && req.user.subSellerId) {
    return handleResponse(res, 403, "Access denied. Only the store owner can perform this action.");
  }
  next();
};

import {
    authRouteRateLimiter,
    createContentLengthGuard,
    otpRouteRateLimiter,
} from "../middleware/securityMiddlewares.js";
import multer from "multer";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const sellerOtpPayloadGuard = createContentLengthGuard(
    parseInt(process.env.AUTH_MAX_PAYLOAD_BYTES || "16384", 10),
    "Verification payload too large",
);

router.post(
    "/verification/send-otp",
    authRouteRateLimiter,
    otpRouteRateLimiter,
    sellerOtpPayloadGuard,
    sendSellerSignupOtp
);
router.post(
    "/verification/verify-otp",
    authRouteRateLimiter,
    otpRouteRateLimiter,
    sellerOtpPayloadGuard,
    verifySellerSignupOtp
);

router.post(
    "/signup",
    upload.any(),
    signupSeller
);
router.post("/login", loginSeller);
router.get("/nearby", getNearbySellers);
router.get("/public/:id", getPublicSellerProfile);

// Profile routes
router.get(
    "/profile",
    verifyToken,
    allowRoles("seller"),
    getSellerProfile
);

router.put(
    "/profile",
    verifyToken,
    allowRoles("seller"),
    updateSellerProfile
);

// Analytics & Financials
router.get("/stats", verifyToken, allowRoles("seller"), getSellerStats);
router.get("/earnings", verifyToken, allowRoles("seller"), getSellerEarnings);
router.get("/wallet/summary", verifyToken, allowRoles("seller"), getSellerWalletSummaryController);
router.post("/request-withdrawal", verifyToken, allowRoles("seller"), requestWithdrawal);

// Coupons
router.post("/coupons", verifyToken, allowRoles("seller"), createSellerCoupon);
router.get("/coupons", verifyToken, allowRoles("seller"), getSellerCoupons);
router.put("/coupons/:id", verifyToken, allowRoles("seller"), updateSellerCoupon);
router.delete("/coupons/:id", verifyToken, allowRoles("seller"), deleteSellerCoupon);

// Sub-Seller/Staff Management Routes
router.get("/staff", verifyToken, allowRoles("seller"), allowOwnerOnly, getSellerStaff);
router.post("/staff", verifyToken, allowRoles("seller"), allowOwnerOnly, createSellerStaff);
router.put("/staff/:id", verifyToken, allowRoles("seller"), allowOwnerOnly, updateSellerStaff);
router.delete("/staff/:id", verifyToken, allowRoles("seller"), allowOwnerOnly, deleteSellerStaff);

export default router;
