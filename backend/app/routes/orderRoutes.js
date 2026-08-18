import express from "express";
import {
  placeOrder,
  getMyOrders,
  getOrderDetails,
  reorderOrder,
  cancelOrder,
  approveCancelOrderRequest,
  rejectCancelOrderRequest,
  updateOrderStatus,
  bulkUpdateOrderStatus,
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
  getOrderInvoice,
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
  optionalVerifyToken,
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
  sellerRescheduleOrder,
  adjustOrder,
  partialCancelOrder,
  payOrderDifference,
  addOrderItems,
  requestProductReplacement,
  reviewProductReplacement,
  splitOrderDelivery,
  updateSplitDeliveryStatus,
  getOrderModificationHistory,
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
  createAdminAdvanceBooking,
  listAdminAdvanceBookings,
  updateAdminAdvanceBooking,
  deleteAdminAdvanceBooking,
  cancelAdminAdvanceBooking,
  updateSelfLogisticsStatus,
  adminLogisticsOverride,
  getReassignCandidates,
  adminReassignOrder,
} from "../controller/orderLifecycleController.js";
import {
  getDeliveryOptionsForStore,
  getSellerDeliveryPolicy,
  updateSellerDeliveryPolicy,
  sellerMarkReadyForPickup,
  customerVerifyPickup,
  sellerVerifyPickup,
  getPickupStatus,
  sellerResendPickupOtp,
  adminGetStoreDeliveryPolicy,
  adminUpdateStoreDeliveryPolicy,
} from "../controller/deliveryPolicyController.js";

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
router.post("/:orderId/reorder", verifyToken, allowRoles("customer", "user"), reorderOrder);
router.get("/:orderId/invoice/:type", verifyToken, getOrderInvoice);
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
// Registered before "/status/:orderId" so "bulk" isn't swallowed as an :orderId param.
router.put(
  "/status/bulk",
  ...sellerOrdersWriteChain,
  bulkUpdateOrderStatus,
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
router.get("/delivery-options", verifyToken, getDeliveryOptionsForStore);
router.get(
  "/delivery-policy",
  ...sellerSchedulingReadChain,
  getSellerDeliveryPolicy,
);
router.put(
  "/delivery-policy",
  ...sellerSchedulingWriteChain,
  updateSellerDeliveryPolicy,
);
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
router.put(
  "/reschedule/:orderId/seller",
  ...sellerSchedulingWriteChain,
  sellerRescheduleOrder,
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
router.post(
  "/:orderId/add-items",
  verifyToken,
  allowRoles("customer", "user"),
  addOrderItems,
);
router.post(
  "/:orderId/replacements",
  verifyToken,
  allowRoles("seller", "admin"),
  requireApprovedSeller,
  checkSubSellerPermission("adjustments", "write"),
  requestProductReplacement,
);
router.put(
  "/:orderId/replacements/:requestId/review",
  verifyToken,
  allowRoles("customer", "user"),
  reviewProductReplacement,
);
router.post(
  "/:orderId/split-delivery",
  verifyToken,
  allowRoles("seller", "admin"),
  requireApprovedSeller,
  checkSubSellerPermission("adjustments", "write"),
  splitOrderDelivery,
);
router.put(
  "/:orderId/split-delivery/:splitId/status",
  verifyToken,
  allowRoles("seller", "admin"),
  requireApprovedSeller,
  checkSubSellerPermission("adjustments", "write"),
  updateSplitDeliveryStatus,
);
router.get(
  "/:orderId/modifications",
  verifyToken,
  allowRoles("customer", "user", "seller", "admin"),
  getOrderModificationHistory,
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

// Pre-order / advance booking campaigns
router.get("/campaigns/active", optionalVerifyToken, listCustomerCampaigns);
router.get("/campaigns/:campaignId", optionalVerifyToken, getCampaignDetail);
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

// Admin advance booking (choose seller + products + booking/delivery windows)
router.get(
  "/admin/advance-bookings",
  verifyToken,
  allowRoles("admin"),
  checkAdminPermission("marketing"),
  listAdminAdvanceBookings,
);
router.post(
  "/admin/advance-bookings",
  verifyToken,
  allowRoles("admin"),
  checkAdminPermission("marketing"),
  createAdminAdvanceBooking,
);
router.put(
  "/admin/advance-bookings/:campaignId",
  verifyToken,
  allowRoles("admin"),
  checkAdminPermission("marketing"),
  updateAdminAdvanceBooking,
);
router.delete(
  "/admin/advance-bookings/:campaignId",
  verifyToken,
  allowRoles("admin"),
  checkAdminPermission("marketing"),
  deleteAdminAdvanceBooking,
);
router.put(
  "/admin/advance-bookings/:campaignId/cancel",
  verifyToken,
  allowRoles("admin"),
  checkAdminPermission("marketing"),
  cancelAdminAdvanceBooking,
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

router.get(
  "/:orderId/reassign-candidates",
  verifyToken,
  allowRoles("admin"),
  getReassignCandidates,
);

router.put(
  "/:orderId/reassign-store",
  verifyToken,
  allowRoles("admin"),
  adminReassignOrder,
);

// Customer pickup verification
router.post(
  "/:orderId/pickup/ready",
  ...sellerOrdersWriteChain,
  sellerMarkReadyForPickup,
);
router.post(
  "/:orderId/pickup/verify",
  verifyToken,
  allowRoles("customer", "user"),
  customerVerifyPickup,
);
router.post(
  "/:orderId/pickup/verify-seller",
  ...sellerOrdersWriteChain,
  sellerVerifyPickup,
);
router.get(
  "/:orderId/pickup/status",
  verifyToken,
  allowRoles("customer", "user"),
  getPickupStatus,
);
router.post(
  "/:orderId/pickup/resend-otp",
  ...sellerOrdersWriteChain,
  sellerResendPickupOtp,
);
router.get(
  "/stores/:storeId/delivery-policy",
  verifyToken,
  allowRoles("admin"),
  adminGetStoreDeliveryPolicy,
);
router.put(
  "/stores/:storeId/delivery-policy",
  verifyToken,
  allowRoles("admin"),
  checkAdminPermission("logistics:override"),
  adminUpdateStoreDeliveryPolicy,
);

export default router;
