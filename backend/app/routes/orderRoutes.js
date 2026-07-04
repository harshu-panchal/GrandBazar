import express from "express";
import {
  placeOrder,
  getMyOrders,
  getOrderDetails,
  cancelOrder,
  approveCancelOrderRequest,
  rejectCancelOrderRequest,
  updateOrderStatus,
  getSellerOrders,
  getAvailableOrders,
  acceptOrder,
  skipOrder,
  requestReturn,
  getReturnDetails,
  getSellerReturns,
  approveReturnRequest,
  rejectReturnRequest,
  updateReturnQcStatus,
  assignReturnDelivery,
  acceptReturnPickup,
  rejectReturnPickup,
  updateReturnStatus,
  uploadReturnPickupProof,
} from "../controller/orderController.js";
import {
  createOrderWithFinancialSnapshot,
  markCodCollectedAfterDelivery,
  markOrderDeliveredAndSettle,
  previewCheckoutFinance,
  reconcileCodCashSubmission,
  verifyOnlineOrderPayment,
} from "../controller/orderFinanceController.js";
import {
  confirmPickup,
  markArrivedAtStore,
  advanceDeliveryRiderUi,
  requestDeliveryOtp,
  verifyDeliveryOtp,
  requestReturnPickupOtp,
  verifyReturnPickupOtp,
  requestReturnDropOtp,
  verifyReturnDropOtp,
  getOrderRoute,
} from "../controller/orderWorkflowController.js";
import {
  verifyToken,
  allowRoles,
  requireApprovedSeller,
  requireBusinessModelChosen,
  requireSellerOperational,
  resolveActiveStore,
  checkSubSellerPermission,
  checkAdminPermission,
  allowSuperAdminOnly,
} from "../middleware/authMiddleware.js";
import {
  getSellerSchedulingSettings,
  updateSellerSchedulingSettings,
  getAvailableDeliverySlots,
  rescheduleOrder,
  requestReschedule,
  approveReschedule,
  rejectReschedule,
  adminRescheduleOrder,
  adjustOrder,
  partialCancelOrder,
  payOrderDifference,
  createDispute,
  resolveDisputeHandler,
  listDisputesHandler,
  getOrderDispute,
  createCampaign,
  updateCampaign,
  listCampaigns,
  listCustomerCampaigns,
  getCampaignDetail,
  cancelCampaign,
  updateSelfLogisticsStatus,
  adminLogisticsOverride,
} from "../controller/orderLifecycleController.js";

const router = express.Router();
const sellerOrderChain = [verifyToken, allowRoles("admin", "seller"), resolveActiveStore, requireApprovedSeller, requireBusinessModelChosen, requireSellerOperational];
const sellerOrdersReadChain = [...sellerOrderChain, checkSubSellerPermission("orders", "read")];
const sellerOrdersWriteChain = [...sellerOrderChain, checkSubSellerPermission("orders", "write")];
const sellerReturnsReadChain = [...sellerOrderChain, checkSubSellerPermission("returns", "read")];
const sellerReturnsWriteChain = [...sellerOrderChain, checkSubSellerPermission("returns", "write")];
const sellerSchedulingReadChain = [...sellerOrderChain, checkSubSellerPermission("scheduling", "read")];
const sellerSchedulingWriteChain = [...sellerOrderChain, checkSubSellerPermission("scheduling", "write")];
const sellerCampaignReadChain = [...sellerOrderChain, checkSubSellerPermission("campaigns", "read")];
const sellerCampaignWriteChain = [...sellerOrderChain, checkSubSellerPermission("campaigns", "write")];
const sellerAdjustWriteChain = [...sellerOrderChain, checkSubSellerPermission("adjustments", "write")];
const sellerTrackingWriteChain = [...sellerOrderChain, checkSubSellerPermission("tracking", "write")];

// Finance-aware checkout/order flow
router.post(
  "/checkout/preview",
  verifyToken,
  allowRoles("customer", "user", "admin"),
  previewCheckoutFinance,
);
router.post(
  "/",
  verifyToken,
  allowRoles("customer", "user", "admin"),
  createOrderWithFinancialSnapshot,
);
router.post(
  "/:id/payment/verify-online",
  verifyToken,
  allowRoles("customer", "user", "admin"),
  verifyOnlineOrderPayment,
);
router.post(
  "/:id/cod/mark-collected",
  verifyToken,
  allowRoles("delivery", "admin"),
  markCodCollectedAfterDelivery,
);
router.post(
  "/:id/delivered",
  verifyToken,
  allowRoles("delivery", "admin", "seller"),
  requireApprovedSeller,
  markOrderDeliveredAndSettle,
);
router.post(
  "/:id/cod/reconcile",
  verifyToken,
  allowRoles("delivery", "admin"),
  reconcileCodCashSubmission,
);

// Customer routes
router.post(
  "/place",
  verifyToken,
  allowRoles("customer", "user", "admin"),
  placeOrder,
);
router.get("/my-orders", verifyToken, getMyOrders);
router.get("/details/:orderId", verifyToken, getOrderDetails);
router.put("/cancel/:orderId", verifyToken, cancelOrder);
router.put(
  "/cancel/:orderId/approve",
  verifyToken,
  allowRoles("admin"),
  approveCancelOrderRequest,
);
router.put(
  "/cancel/:orderId/reject",
  verifyToken,
  allowRoles("admin"),
  rejectCancelOrderRequest,
);
router.post("/:orderId/returns", verifyToken, requestReturn);
router.get("/:orderId/returns", verifyToken, getReturnDetails);

// Admin/Seller routes
router.get(
  "/seller-orders",
  ...sellerOrdersReadChain,
  getSellerOrders,
);
router.put(
  "/status/:orderId",
  ...sellerOrdersWriteChain,
  updateOrderStatus,
);
router.get(
  "/seller-returns",
  ...sellerReturnsReadChain,
  getSellerReturns,
);
router.put(
  "/returns/:orderId/approve",
  ...sellerReturnsWriteChain,
  approveReturnRequest,
);
router.put(
  "/returns/:orderId/reject",
  ...sellerReturnsWriteChain,
  rejectReturnRequest,
);
router.put(
  "/returns/:orderId/qc",
  verifyToken,
  allowRoles("admin"),
  updateReturnQcStatus,
);
router.put(
  "/returns/:orderId/assign-delivery",
  ...sellerReturnsWriteChain,
  assignReturnDelivery,
);

// Delivery routes
router.get(
  "/available",
  verifyToken,
  allowRoles("admin", "delivery"),
  getAvailableOrders,
);
router.put(
  "/accept/:orderId",
  verifyToken,
  allowRoles("admin", "delivery"),
  acceptOrder,
);
router.put(
  "/skip/:orderId",
  verifyToken,
  allowRoles("admin", "delivery"),
  skipOrder,
);
router.put(
  "/returns/:orderId/accept-pickup",
  verifyToken,
  allowRoles("admin", "delivery"),
  acceptReturnPickup,
);
router.put(
  "/returns/:orderId/reject-pickup",
  verifyToken,
  allowRoles("admin", "delivery"),
  rejectReturnPickup,
);
router.put(
  "/return-status/:orderId",
  verifyToken,
  allowRoles("admin", "delivery"),
  updateReturnStatus,
);

// Workflow routes — standard delivery
router.post(
  "/workflow/:orderId/pickup/confirm",
  verifyToken,
  allowRoles("delivery", "admin"),
  confirmPickup,
);
router.post(
  "/workflow/:orderId/pickup/ready",
  verifyToken,
  allowRoles("delivery", "admin"),
  markArrivedAtStore,
);
router.post(
  "/workflow/:orderId/rider/advance-ui",
  verifyToken,
  allowRoles("delivery", "admin"),
  advanceDeliveryRiderUi,
);
router.post(
  "/workflow/:orderId/otp/request",
  verifyToken,
  allowRoles("delivery", "admin"),
  requestDeliveryOtp,
);
router.post(
  "/workflow/:orderId/otp/verify",
  verifyToken,
  allowRoles("delivery", "admin"),
  verifyDeliveryOtp,
);

// Workflow routes — return pickup OTP (customer)
router.post(
  "/workflow/:orderId/return-otp/request",
  verifyToken,
  allowRoles("delivery", "admin"),
  requestReturnPickupOtp,
);
router.post(
  "/workflow/:orderId/return-otp/verify",
  verifyToken,
  allowRoles("delivery", "admin"),
  verifyReturnPickupOtp,
);

// Workflow routes — return drop OTP (seller)
router.post(
  "/workflow/:orderId/return-drop-otp/request",
  verifyToken,
  allowRoles("delivery", "admin"),
  requestReturnDropOtp,
);
router.post(
  "/workflow/:orderId/return-drop-otp/verify",
  verifyToken,
  allowRoles("delivery", "admin"),
  verifyReturnDropOtp,
);

// Return pickup proof (images + condition)
router.post(
  "/returns/:orderId/pickup-proof",
  verifyToken,
  allowRoles("delivery", "admin"),
  uploadReturnPickupProof,
);

// Route map
router.get(
  "/workflow/:orderId/route",
  verifyToken,
  allowRoles("customer", "user", "delivery", "seller", "admin"),
  requireApprovedSeller,
  getOrderRoute,
);

// Scheduling & delivery windows
router.get("/scheduling/slots", verifyToken, getAvailableDeliverySlots);
router.get(
  "/scheduling/settings",
  ...sellerSchedulingReadChain,
  getSellerSchedulingSettings,
);
router.put(
  "/scheduling/settings",
  ...sellerSchedulingWriteChain,
  updateSellerSchedulingSettings,
);

// Rescheduling
router.put("/reschedule/:orderId", verifyToken, allowRoles("customer", "user"), rescheduleOrder);
router.post(
  "/reschedule/:orderId/request",
  verifyToken,
  allowRoles("customer", "user"),
  requestReschedule,
);
router.put(
  "/reschedule/:orderId/approve",
  verifyToken,
  allowRoles("seller", "admin"),
  requireApprovedSeller,
  approveReschedule,
);
router.put(
  "/reschedule/:orderId/reject",
  verifyToken,
  allowRoles("seller", "admin"),
  requireApprovedSeller,
  rejectReschedule,
);
router.put(
  "/reschedule/:orderId/admin",
  verifyToken,
  allowRoles("admin"),
  checkAdminPermission("scheduling:write"),
  adminRescheduleOrder,
);

// Price adjustments
router.put(
  "/:orderId/adjust",
  verifyToken,
  allowRoles("seller", "admin"),
  requireApprovedSeller,
  checkSubSellerPermission("adjustments", "write"),
  adjustOrder,
);
router.put(
  "/:orderId/partial-cancel",
  verifyToken,
  allowRoles("seller", "admin"),
  requireApprovedSeller,
  checkSubSellerPermission("adjustments", "write"),
  partialCancelOrder,
);
router.post(
  "/:orderId/pay-difference",
  verifyToken,
  allowRoles("customer", "user"),
  payOrderDifference,
);

// Disputes
router.post(
  "/:orderId/dispute",
  verifyToken,
  allowRoles("customer", "user", "seller", "admin"),
  createDispute,
);
router.get("/:orderId/dispute", verifyToken, getOrderDispute);
router.get(
  "/disputes",
  verifyToken,
  allowRoles("admin"),
  checkAdminPermission("disputes:read"),
  listDisputesHandler,
);
router.put(
  "/disputes/:disputeId/resolve",
  verifyToken,
  allowRoles("admin"),
  checkAdminPermission("disputes:write"),
  resolveDisputeHandler,
);

// Pre-order campaigns
router.get("/campaigns/active", verifyToken, listCustomerCampaigns);
router.get("/campaigns/:campaignId", verifyToken, getCampaignDetail);
router.get(
  "/campaigns",
  ...sellerCampaignReadChain,
  listCampaigns,
);
router.post(
  "/campaigns",
  ...sellerCampaignWriteChain,
  createCampaign,
);
router.put(
  "/campaigns/:campaignId",
  ...sellerCampaignWriteChain,
  updateCampaign,
);
router.put(
  "/campaigns/:campaignId/cancel",
  ...sellerCampaignWriteChain,
  cancelCampaign,
);

// Self logistics & admin override
router.put(
  "/:orderId/logistics/self",
  ...sellerTrackingWriteChain,
  updateSelfLogisticsStatus,
);
router.put(
  "/:orderId/logistics/override",
  verifyToken,
  allowRoles("admin"),
  checkAdminPermission("logistics:override"),
  adminLogisticsOverride,
);

export default router;
