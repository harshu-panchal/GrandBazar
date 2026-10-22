import crypto from "crypto";
import axios from "axios";
import Setting from "../../models/setting.js";
import logger from "../logger.js";

// RazorpayX Payouts client for automatic seller settlement (BRD SET-20) plus
// the payout webhook signature check (SET-20 / "final status from the webhook").
//
// Credentials come from env (never stored in the DB):
//   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET      — API auth
//   RAZORPAYX_ACCOUNT_NUMBER                  — source account for payouts
//   RAZORPAY_WEBHOOK_SECRET                   — webhook HMAC secret
//   RAZORPAY_PAYOUT_MODE (IMPS|NEFT|UPI)      — default IMPS
//
// When keys are absent the client runs in SIMULATION mode: it returns a fake
// payout id so the rest of the settlement flow (and tests/dev) works end to
// end, and `isSimulated` is true so callers/UI can show it's not a real payout.

const RZP_BASE = "https://api.razorpay.com/v1";

export function razorpayConfig() {
  return {
    keyId: process.env.RAZORPAY_KEY_ID || "",
    keySecret: process.env.RAZORPAY_KEY_SECRET || "",
    accountNumber: process.env.RAZORPAYX_ACCOUNT_NUMBER || "",
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
    payoutMode: process.env.RAZORPAY_PAYOUT_MODE || "IMPS",
  };
}

export function isRazorpayConfigured() {
  const c = razorpayConfig();
  return Boolean(c.keyId && c.keySecret && c.accountNumber);
}

function authHeader() {
  const c = razorpayConfig();
  const token = Buffer.from(`${c.keyId}:${c.keySecret}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

/**
 * Create a RazorpayX payout to a seller's bank/UPI.
 * Returns { payoutId, status, utr, isSimulated }. `idempotencyKey` is sent as
 * the X-Payout-Idempotency header so Razorpay itself de-dupes retries.
 */
export async function createSellerPayout({ store, amount, idempotencyKey, referenceId, narration = "Zinto seller settlement" }) {
  const cfg = razorpayConfig();
  const amountPaise = Math.round(Number(amount) * 100);
  if (!(amountPaise > 0)) throw new Error("Payout amount must be positive");

  if (!isRazorpayConfigured()) {
    // Simulation: mimic Razorpay's async "queued/processing" response. The
    // webhook can be simulated via the test endpoint to complete it.
    logger.warn("[RazorpayPayout] Simulated payout (Razorpay not configured)", { referenceId, amount });
    return {
      payoutId: `pout_SIM_${crypto.randomBytes(8).toString("hex")}`,
      status: "processing",
      utr: "",
      isSimulated: true,
    };
  }

  // Real RazorpayX call. Prefer a cached fund account; otherwise fall back to
  // a VPA/bank fund-account creation flow (kept minimal — a full contact +
  // fund-account bootstrap can be added when onboarding needs it).
  const body = {
    account_number: cfg.accountNumber,
    amount: amountPaise,
    currency: "INR",
    mode: cfg.payoutMode,
    purpose: "payout",
    reference_id: referenceId,
    narration,
    queue_if_low_balance: true,
    ...(store?.razorpayFundAccountId
      ? { fund_account_id: store.razorpayFundAccountId }
      : {
          fund_account: store?.upiId
            ? { account_type: "vpa", vpa: { address: store.upiId }, contact: contactFromStore(store) }
            : {
                account_type: "bank_account",
                bank_account: {
                  name: store?.accountHolder || store?.shopName || "Seller",
                  ifsc: store?.ifsc || "",
                  account_number: store?.accountNumber || "",
                },
                contact: contactFromStore(store),
              },
        }),
  };

  const res = await axios.post(`${RZP_BASE}/payouts`, body, {
    headers: { ...authHeader(), "X-Payout-Idempotency": idempotencyKey, "Content-Type": "application/json" },
    timeout: 20000,
  });
  return {
    payoutId: res.data?.id || "",
    status: res.data?.status || "processing",
    utr: res.data?.utr || "",
    fundAccountId: res.data?.fund_account_id || "",
    isSimulated: false,
  };
}

function contactFromStore(store) {
  return {
    name: store?.accountHolder || store?.shopName || "Seller",
    type: "vendor",
    reference_id: String(store?._id || ""),
  };
}

/**
 * Verify a Razorpay webhook signature (HMAC-SHA256 of the raw body).
 * In simulation mode (no secret) it returns true so dev/test can drive it.
 */
export function verifyWebhookSignature(rawBody, signature) {
  const cfg = razorpayConfig();
  if (!cfg.webhookSecret) return true; // simulation / dev
  const expected = crypto
    .createHmac("sha256", cfg.webhookSecret)
    .update(typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody))
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature || "")));
  } catch {
    return false;
  }
}

// Map a Razorpay payout status to our terminal settlement outcome.
export function isTerminalSuccess(status) {
  return ["processed"].includes(String(status || "").toLowerCase());
}
export function isTerminalFailure(status) {
  return ["reversed", "failed", "cancelled", "rejected"].includes(String(status || "").toLowerCase());
}

export default {
  createSellerPayout,
  verifyWebhookSignature,
  isRazorpayConfigured,
  isTerminalSuccess,
  isTerminalFailure,
  razorpayConfig,
};
