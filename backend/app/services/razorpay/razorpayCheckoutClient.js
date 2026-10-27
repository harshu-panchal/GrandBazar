import crypto from "crypto";
import axios from "axios";
import { PAYMENT_STATUS } from "../../constants/payment.js";

// Razorpay Orders/Payments (Checkout) client — shared by every "collect a
// payment" flow (customer checkout, phone-order pay-link, seller
// subscription, delivery-boy COD remittance). Axios + Basic-Auth against the
// same base used by razorpayPayoutService.js (RazorpayX payouts), but this is
// a different Razorpay product (standard Checkout/Orders, not payouts) so it
// gets its own webhook secret: RAZORPAY_CHECKOUT_WEBHOOK_SECRET.
const RZP_BASE = "https://api.razorpay.com/v1";

export function razorpayCheckoutConfig() {
  return {
    keyId: process.env.RAZORPAY_KEY_ID || "",
    keySecret: process.env.RAZORPAY_KEY_SECRET || "",
    webhookSecret: process.env.RAZORPAY_CHECKOUT_WEBHOOK_SECRET || "",
  };
}

export function isRazorpayCheckoutConfigured() {
  const c = razorpayCheckoutConfig();
  return Boolean(c.keyId && c.keySecret);
}

function authHeader() {
  const c = razorpayCheckoutConfig();
  const token = Buffer.from(`${c.keyId}:${c.keySecret}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

function requireConfigured() {
  if (!isRazorpayCheckoutConfigured()) {
    const err = new Error("Razorpay credentials not configured");
    err.code = "razorpay/not-configured";
    throw err;
  }
}

/**
 * Create a Razorpay Order for Checkout.js to open against.
 * `notes.merchantOrderId` carries the SUB-/COD- prefix convention the
 * webhook dispatcher uses to route to the right handler.
 */
export async function createRazorpayOrder({ amountPaise, currency = "INR", receipt, notes = {} }) {
  requireConfigured();
  if (!(Number(amountPaise) > 0)) {
    throw new Error("Razorpay order amount must be positive");
  }

  const res = await axios.post(
    `${RZP_BASE}/orders`,
    {
      amount: Math.round(Number(amountPaise)),
      currency,
      receipt,
      notes,
      payment_capture: 1,
    },
    { headers: { ...authHeader(), "Content-Type": "application/json" }, timeout: 20000 },
  );

  return {
    razorpayOrderId: res.data?.id,
    amount: res.data?.amount,
    currency: res.data?.currency,
    receipt: res.data?.receipt,
    status: res.data?.status,
    raw: res.data,
  };
}

/** Verify the signature Checkout.js's success handler returns to the client. */
export function verifyRazorpaySignature({ orderId, paymentId, signature }) {
  const { keySecret } = razorpayCheckoutConfig();
  if (!keySecret) return false;
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature || "")));
  } catch {
    return false;
  }
}

/** Verify X-Razorpay-Signature on an incoming webhook (HMAC over the raw body). */
export function verifyRazorpayWebhookSignature(rawBody, signatureHeader) {
  const { webhookSecret } = razorpayCheckoutConfig();
  if (!webhookSecret) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "");
  const expected = crypto.createHmac("sha256", webhookSecret).update(body).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signatureHeader || "")));
  } catch {
    return false;
  }
}

export async function fetchRazorpayPayment(paymentId) {
  requireConfigured();
  const res = await axios.get(`${RZP_BASE}/payments/${paymentId}`, {
    headers: authHeader(),
    timeout: 20000,
  });
  return res.data;
}

export async function createRazorpayRefund({ paymentId, amountPaise, notes = {} }) {
  requireConfigured();
  const body = { notes };
  if (Number(amountPaise) > 0) {
    body.amount = Math.round(Number(amountPaise));
  }
  const res = await axios.post(`${RZP_BASE}/payments/${paymentId}/refund`, body, {
    headers: { ...authHeader(), "Content-Type": "application/json" },
    timeout: 20000,
  });
  return {
    refundId: res.data?.id || "",
    status: res.data?.status || "",
    raw: res.data,
  };
}

/** Maps a Razorpay payment/event status onto our internal PAYMENT_STATUS enum. */
export function mapRazorpayStatusToInternal(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "captured" || normalized === "payment.captured") return PAYMENT_STATUS.CAPTURED;
  if (normalized === "failed" || normalized === "payment.failed") return PAYMENT_STATUS.FAILED;
  if (normalized === "refunded" || normalized === "payment.refunded") return PAYMENT_STATUS.REFUNDED;
  if (normalized === "authorized" || normalized === "payment.authorized") return PAYMENT_STATUS.AUTHORIZED;
  if (normalized === "created" || normalized === "order.paid") return PAYMENT_STATUS.PENDING;
  return PAYMENT_STATUS.PENDING;
}

export default {
  razorpayCheckoutConfig,
  isRazorpayCheckoutConfigured,
  createRazorpayOrder,
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
  fetchRazorpayPayment,
  createRazorpayRefund,
  mapRazorpayStatusToInternal,
};
