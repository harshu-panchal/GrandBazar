import express from "express";
import {
    signupSeller,
    loginSeller,
    sendSellerSignupOtp,
    verifySellerSignupOtp,
} from "../controller/sellerAuthController.js";
import { getSellerProfile, updateSellerProfile, requestWithdrawal, getNearbySellers, getPublicSellerProfile, getSellerDeliverySettings } from "../controller/sellerController.js";
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
import { verifyToken, allowRoles, resolveActiveStore, requireStoreOwner, checkSubSellerPermission, requireBusinessModelChosen, requireSellerOperational } from "../middleware/authMiddleware.js";
import {
    listOwnerStores,
    createStore,
    resubmitStoreKyc,
    getStoreById,
    updateStoreById,
    switchActiveStore,
    toggleStoreActive,
} from "../controller/seller/storeController.js";
import {
    getSellerBusinessModel,
    chooseSellerBusinessModel,
    requestSellerBusinessModelSwitch,
    previewSellerCommission,
} from "../controller/seller/businessModelController.js";
import {
    getSellerSubscriptionPlans,
    getSellerSubscriptionStatus,
    submitSubscriptionPaymentRequest,
    initiateSubscriptionPhonePePayment,
    verifySubscriptionPhonePePaymentStatus,
} from "../controller/seller/subscriptionController.js";

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
router.patch("/stores/:storeId/kyc-resubmit", upload.any(), ...sellerAuthChain, allowOwnerOnly, resubmitStoreKyc);
router.get("/stores/:storeId", ...sellerAuthChain, allowOwnerOnly, getStoreById);
router.put("/stores/:storeId", ...sellerAuthChain, allowOwnerOnly, updateStoreById);
router.post("/stores/switch", ...sellerAuthChain, allowOwnerOnly, switchActiveStore);
router.patch("/stores/:storeId/toggle-active", ...sellerAuthChain, allowOwnerOnly, toggleStoreActive);

// Business model (owner only — no businessModel gate)
router.get("/business-model", ...sellerAuthChain, allowOwnerOnly, getSellerBusinessModel);
router.post("/business-model/choose", ...sellerAuthChain, allowOwnerOnly, chooseSellerBusinessModel);
router.post("/business-model/request-switch", ...sellerAuthChain, allowOwnerOnly, requestSellerBusinessModelSwitch);
router.get("/commission-preview", ...sellerAuthChain, allowOwnerOnly, previewSellerCommission);

const sellerSubscriptionChain = [...sellerAuthChain, allowOwnerOnly];
router.get("/subscription/plans", ...sellerSubscriptionChain, getSellerSubscriptionPlans);
router.get("/subscription/status", ...sellerSubscriptionChain, getSellerSubscriptionStatus);
router.post("/subscription/pay", ...sellerSubscriptionChain, initiateSubscriptionPhonePePayment);
router.get("/subscription/payment/verify", ...sellerSubscriptionChain, verifySubscriptionPhonePePaymentStatus);
router.post(
    "/subscription/payment-request",
    upload.single("proof"),
    ...sellerSubscriptionChain,
    submitSubscriptionPaymentRequest,
);

const sellerOpsChain = [...sellerAuthChain, requireBusinessModelChosen, requireSellerOperational];

// Profile routes
router.get(
    "/profile",
    ...sellerAuthChain,
    getSellerProfile
);
router.get(
    "/delivery-settings",
    ...sellerAuthChain,
    allowOwnerOnly,
    getSellerDeliverySettings
);

router.put(
    "/profile",
    ...sellerAuthChain,
    checkSubSellerPermission("storefront", "write"),
    updateSellerProfile
);

// Analytics & Financials
router.get("/stats", ...sellerOpsChain, checkSubSellerPermission("analytics", "read"), getSellerStats);
router.get("/earnings", ...sellerOpsChain, checkSubSellerPermission("withdrawals", "read"), getSellerEarnings);
router.get("/wallet/summary", ...sellerOpsChain, checkSubSellerPermission("withdrawals", "read"), getSellerWalletSummaryController);
router.post("/request-withdrawal", ...sellerOpsChain, checkSubSellerPermission("withdrawals", "write"), requestWithdrawal);

// Coupons
router.post("/coupons", ...sellerOpsChain, checkSubSellerPermission("coupons", "write"), createSellerCoupon);
router.get("/coupons", ...sellerOpsChain, checkSubSellerPermission("coupons", "read"), getSellerCoupons);
router.put("/coupons/:id", ...sellerOpsChain, checkSubSellerPermission("coupons", "write"), updateSellerCoupon);
router.delete("/coupons/:id", ...sellerOpsChain, checkSubSellerPermission("coupons", "write"), deleteSellerCoupon);

// Assistant / role-based access management (owner only)
router.get("/staff/overview", ...sellerAuthChain, allowOwnerOnly, getSellerStaffOverview);
router.get("/staff", ...sellerAuthChain, allowOwnerOnly, getSellerStaff);
router.post("/staff", ...sellerAuthChain, allowOwnerOnly, createSellerStaff);
router.put("/staff/:id", ...sellerAuthChain, allowOwnerOnly, updateSellerStaff);
router.delete("/staff/:id", ...sellerAuthChain, allowOwnerOnly, deleteSellerStaff);

export default router;
