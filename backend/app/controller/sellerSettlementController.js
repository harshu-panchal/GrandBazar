import handleResponse from "../utils/helper.js";
import {
  listSettlements,
  getSettlementDetail,
  setIssues,
  markReviewed,
  paySettlement,
  retrySettlement,
  getSettlementInvoice,
  handlePayoutWebhook,
  listSellerSettlements,
  getSellerSettlementInvoice,
} from "../services/finance/sellerSettlementService.js";
import { verifyWebhookSignature } from "../services/finance/razorpayPayoutService.js";
import logger from "../services/logger.js";

// Admin/Finance HTTP layer for Seller Settlement (BRD section 5). Role gating
// lives in the routes; money is always recomputed server-side.

const actorOf = (req) => ({ id: req.user?.id, role: req.user?.role });

export const listSettlementsHandler = async (req, res) => {
  try {
    const result = await listSettlements(req.query);
    return handleResponse(res, 200, "Settlements", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const getSettlementDetailHandler = async (req, res) => {
  try {
    // Order-money box + fees are Admin/Finance only (SEC-01). These routes are
    // already admin/finance-gated, so includeMoney is safe here.
    const result = await getSettlementDetail(req.params.orderId, { includeMoney: true });
    return handleResponse(res, 200, "Settlement", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const setIssuesHandler = async (req, res) => {
  try {
    const result = await setIssues(req.params.orderId, req.body?.issues || req.body, actorOf(req));
    return handleResponse(res, 200, "Issues updated", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const markReviewedHandler = async (req, res) => {
  try {
    const result = await markReviewed(req.params.orderId, actorOf(req));
    return handleResponse(res, 200, "Marked reviewed", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const paySettlementHandler = async (req, res) => {
  try {
    const result = await paySettlement(
      req.params.orderId,
      {
        mode: req.body?.mode,
        txnNo: req.body?.txnNo,
        idempotencyKey: req.body?.idempotencyKey,
      },
      actorOf(req),
    );
    return handleResponse(res, 200, "Settlement processed", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const retrySettlementHandler = async (req, res) => {
  try {
    const result = await retrySettlement(
      req.params.orderId,
      { mode: req.body?.mode, txnNo: req.body?.txnNo, idempotencyKey: req.body?.idempotencyKey },
      actorOf(req),
    );
    return handleResponse(res, 200, "Retry processed", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const getInvoiceHandler = async (req, res) => {
  try {
    const result = await getSettlementInvoice(req.params.orderId);
    return handleResponse(res, 200, "Settlement invoice", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

// Seller: own settlements list + own settlement invoice (store-scoped).
export const listSellerSettlementsHandler = async (req, res) => {
  try {
    const sellerId = req.user.activeStoreId || req.user.id;
    const result = await listSellerSettlements(sellerId, req.query);
    return handleResponse(res, 200, "Settlements", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const getSellerSettlementInvoiceHandler = async (req, res) => {
  try {
    const sellerId = req.user.activeStoreId || req.user.id;
    const result = await getSellerSettlementInvoice(req.params.orderId, sellerId);
    return handleResponse(res, 200, "Settlement invoice", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

// Public Razorpay payout webhook (final status for automatic settlements).
export const razorpayPayoutWebhookHandler = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = req.rawBody || JSON.stringify(req.body || {});
    if (!verifyWebhookSignature(rawBody, signature)) {
      return handleResponse(res, 400, "Invalid webhook signature");
    }
    const result = await handlePayoutWebhook(req.body);
    return handleResponse(res, 200, "Webhook processed", result);
  } catch (error) {
    logger.error("Razorpay payout webhook failed", { message: error.message });
    // Always 200 to avoid endless retries on a non-retryable error; log it.
    return handleResponse(res, 200, "Webhook received", { ok: false });
  }
};
