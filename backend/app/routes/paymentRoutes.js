import express from "express";
import {
  createPaymentOrder,
  getPaymentStatusById,
  verifyPaymentStatus,
  handleRazorpayWebhook,
  resolvePhoneOrderPayLinkController,
} from "../controller/paymentController.js";
import { verifyToken, optionalVerifyToken } from "../middleware/authMiddleware.js";
import { paymentRouteRateLimiter } from "../middleware/securityMiddlewares.js";

const paymentRoute = express.Router();

/**
 * Initiate a Razorpay order for a specific CheckoutGroupId or OrderId. The
 * frontend opens Razorpay's embedded Checkout.js against the returned
 * razorpayOrderId.
 * Auth: Required (Customer paying for their own order)
 */
paymentRoute.post(
  "/create-order",
  verifyToken,
  paymentRouteRateLimiter,
  createPaymentOrder,
);

/**
 * Passive DB-read status check (fallback/refresh — e.g. the status page
 * picking up a result the webhook already resolved).
 * Auth: a bearer token for a normal logged-in customer, OR a payLinkToken
 * query param for an anonymous phone-order customer.
 */
paymentRoute.get(
  "/status/:id",
  optionalVerifyToken,
  paymentRouteRateLimiter,
  getPaymentStatusById,
);

/**
 * Verify a payment right after Razorpay Checkout.js's success handler fires,
 * via razorpay_order_id/payment_id/signature in the body.
 * Auth: a bearer token for a normal logged-in customer, OR a payLinkToken
 * in the body for an anonymous phone-order customer.
 */
paymentRoute.post(
  "/status/:id",
  optionalVerifyToken,
  paymentRouteRateLimiter,
  verifyPaymentStatus,
);

/**
 * Resolve an admin-phone-order pay-by-link token into a Razorpay checkout.
 * Auth: None (anonymous recipient of an SMS/email link) — identity comes
 * from the signed token itself.
 */
paymentRoute.get(
  "/pay-link/:token",
  paymentRouteRateLimiter,
  resolvePhoneOrderPayLinkController,
);

/**
 * Razorpay Server-to-Server Webhook.
 * Auth: None (Internal verification via X-Razorpay-Signature header)
 */
paymentRoute.post(
  "/webhook/razorpay",
  express.raw({ type: "application/json" }), // needed raw body for HMAC verification
  handleRazorpayWebhook,
);

export default paymentRoute;
