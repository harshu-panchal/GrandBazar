import express from "express";
import {
    signupCustomer,
    loginCustomer,
    loginCustomerWithEmail,
    verifyCustomerOTP,
    getCustomerProfile,
    updateCustomerProfile,
    deleteCustomerAccount,
    getCustomerTransactions,
} from "../controller/customerAuthController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import {
    authRouteRateLimiter,
    createContentLengthGuard,
    otpRouteRateLimiter,
} from "../middleware/securityMiddlewares.js";

const router = express.Router();
const smallAuthPayload = createContentLengthGuard(
    parseInt(process.env.AUTH_MAX_PAYLOAD_BYTES || "16384", 10),
    "Auth payload too large",
);
router.post("/send-signup-otp", authRouteRateLimiter, otpRouteRateLimiter, smallAuthPayload, signupCustomer);
router.post("/send-login-otp", authRouteRateLimiter, otpRouteRateLimiter, smallAuthPayload, loginCustomer);
router.post("/login-email", authRouteRateLimiter, smallAuthPayload, loginCustomerWithEmail);
router.post("/verify-otp", authRouteRateLimiter, otpRouteRateLimiter, smallAuthPayload, verifyCustomerOTP);

// Profile routes
router.get("/profile", verifyToken, getCustomerProfile);
router.put("/profile", verifyToken, updateCustomerProfile);
router.delete("/account", verifyToken, deleteCustomerAccount);

// Wallet
router.get("/transactions", verifyToken, getCustomerTransactions);

export default router;
