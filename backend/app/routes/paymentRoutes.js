import express from "express";
import {
  createPaymentOrder,
  verifyPaymentStatus,
  handlePhonePeWebhook,
  resolvePhoneOrderPayLinkController,
} from "../controller/paymentController.js";
import { verifyToken, optionalVerifyToken } from "../middleware/authMiddleware.js";
import { paymentRouteRateLimiter } from "../middleware/securityMiddlewares.js";

const paymentRoute = express.Router();

/**
 * Initiate a PhonePe payment order for a specific CheckoutGroupId or OrderId.
 * Auth: Required (Customer paying for their own order)
 */
paymentRoute.post(
  "/create-order",
  verifyToken,
  paymentRouteRateLimiter,
  createPaymentOrder,
);

/**
 * Verify payment status from client side (after redirect back from PhonePe).
 * Auth: a bearer token for a normal logged-in customer, OR a payLinkToken
 * query param for an anonymous phone-order customer (see verifyPaymentStatus
 * for the fallback logic — optionalVerifyToken itself never 401s).
 */
paymentRoute.get(
  "/status/:id",
  optionalVerifyToken,
  paymentRouteRateLimiter,
  verifyPaymentStatus,
);

/**
 * Resolve an admin-phone-order pay-by-link token into a PhonePe checkout.
 * Auth: None (anonymous recipient of an SMS/email link) — identity comes
 * from the signed token itself.
 */
paymentRoute.get(
  "/pay-link/:token",
  paymentRouteRateLimiter,
  resolvePhoneOrderPayLinkController,
);

/**
 * PhonePe Server-to-Server Webhook.
 * Auth: None (Internal verification via x-verify / authorization header)
 */
paymentRoute.post(
  "/webhook/phonepe",
  express.raw({ type: "application/json" }), // SDK needs raw body for verification
  handlePhonePeWebhook,
);

export default paymentRoute;
