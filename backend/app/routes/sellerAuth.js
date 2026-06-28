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
    getSellerStaffOverview,
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
import { verifyToken, allowRoles, resolveActiveStore, requireStoreOwner, checkSubSellerPermission } from "../middleware/authMiddleware.js";
import {
    listOwnerStores,
    createStore,
    getStoreById,
    updateStoreById,
    switchActiveStore,
    toggleStoreActive,
} from "../controller/seller/storeController.js";

const allowOwnerOnly = requireStoreOwner;

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

const sellerAuthChain = [verifyToken, allowRoles("seller"), resolveActiveStore];

// Store management (owner only)
router.get("/stores", ...sellerAuthChain, allowOwnerOnly, listOwnerStores);
router.post("/stores", upload.any(), ...sellerAuthChain, allowOwnerOnly, createStore);
router.get("/stores/:storeId", ...sellerAuthChain, allowOwnerOnly, getStoreById);
router.put("/stores/:storeId", ...sellerAuthChain, allowOwnerOnly, updateStoreById);
router.post("/stores/switch", ...sellerAuthChain, allowOwnerOnly, switchActiveStore);
router.patch("/stores/:storeId/toggle-active", ...sellerAuthChain, allowOwnerOnly, toggleStoreActive);

// Profile routes
router.get(
    "/profile",
    ...sellerAuthChain,
    getSellerProfile
);

router.put(
    "/profile",
    ...sellerAuthChain,
    checkSubSellerPermission("storefront", "write"),
    updateSellerProfile
);

// Analytics & Financials
router.get("/stats", ...sellerAuthChain, checkSubSellerPermission("analytics", "read"), getSellerStats);
router.get("/earnings", ...sellerAuthChain, checkSubSellerPermission("withdrawals", "read"), getSellerEarnings);
router.get("/wallet/summary", ...sellerAuthChain, checkSubSellerPermission("withdrawals", "read"), getSellerWalletSummaryController);
router.post("/request-withdrawal", ...sellerAuthChain, checkSubSellerPermission("withdrawals", "write"), requestWithdrawal);

// Coupons
router.post("/coupons", ...sellerAuthChain, checkSubSellerPermission("coupons", "write"), createSellerCoupon);
router.get("/coupons", ...sellerAuthChain, checkSubSellerPermission("coupons", "read"), getSellerCoupons);
router.put("/coupons/:id", ...sellerAuthChain, checkSubSellerPermission("coupons", "write"), updateSellerCoupon);
router.delete("/coupons/:id", ...sellerAuthChain, checkSubSellerPermission("coupons", "write"), deleteSellerCoupon);

// Assistant / role-based access management (owner only)
router.get("/staff/overview", ...sellerAuthChain, allowOwnerOnly, getSellerStaffOverview);
router.get("/staff", ...sellerAuthChain, allowOwnerOnly, getSellerStaff);
router.post("/staff", ...sellerAuthChain, allowOwnerOnly, createSellerStaff);
router.put("/staff/:id", ...sellerAuthChain, allowOwnerOnly, updateSellerStaff);
router.delete("/staff/:id", ...sellerAuthChain, allowOwnerOnly, deleteSellerStaff);

export default router;
