import express from "express";
import {
  verifyToken,
  allowRoles,
  checkAnyAdminPermission,
} from "../middleware/authMiddleware.js";
import {
  listSettlementsHandler,
  getSettlementDetailHandler,
  setIssuesHandler,
  markReviewedHandler,
  paySettlementHandler,
  retrySettlementHandler,
  getInvoiceHandler,
  razorpayPayoutWebhookHandler,
  listSellerSettlementsHandler,
  getSellerSettlementInvoiceHandler,
} from "../controller/sellerSettlementController.js";
import {
  listSellerUnsettledHandler,
  bulkPreviewHandler,
  bulkPayHandler,
  getBulkHandler,
  listBulkHandler,
} from "../controller/bulkSettlementController.js";

const router = express.Router();

// Public Razorpay payout webhook (no auth; signature-verified in the handler).
router.post("/webhooks/razorpay/payout", razorpayPayoutWebhookHandler);

// Seller: own settlements (store-scoped server-side).
router.get("/seller/mine", verifyToken, allowRoles("seller"), listSellerSettlementsHandler);
router.get("/seller/:orderId/invoice", verifyToken, allowRoles("seller"), getSellerSettlementInvoiceHandler);

// Everything else is Admin/Finance only (SEC-01). "accountant"/"seller_payments"
// are the existing finance permission keys.
const finance = [verifyToken, allowRoles("admin"), checkAnyAdminPermission("accountant", "seller_payments")];

router.get("/", ...finance, listSettlementsHandler);

// Bulk Settlement (BRD section 6) — registered before the /:orderId routes so
// "bulk" is never captured as an order id.
router.get("/bulk", ...finance, listBulkHandler);
router.get("/bulk/seller/:sellerId/orders", ...finance, listSellerUnsettledHandler);
router.post("/bulk/preview", ...finance, bulkPreviewHandler);
router.post("/bulk/pay", ...finance, bulkPayHandler);
router.get("/bulk/:refNo", ...finance, getBulkHandler);

router.get("/:orderId", ...finance, getSettlementDetailHandler);
router.get("/:orderId/invoice", ...finance, getInvoiceHandler);
router.patch("/:orderId/issues", ...finance, setIssuesHandler);
router.post("/:orderId/review", ...finance, markReviewedHandler);
router.post("/:orderId/pay", ...finance, paySettlementHandler);
router.post("/:orderId/retry", ...finance, retrySettlementHandler);

export default router;
