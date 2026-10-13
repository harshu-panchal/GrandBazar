import express from "express";
import {
    getAdminSellerBusinessModel,
    updateAdminSellerBusinessModel,
    updateAdminSellerCommission,
    listModelSwitchRequests,
    approveModelSwitchRequest,
    rejectModelSwitchRequest,
} from "../controller/admin/sellerBusinessModelController.js";
import {
    listSubscriptionPlans,
    createSubscriptionPlan,
    updateSubscriptionPlan,
    deleteSubscriptionPlan,
    listPaymentRequests,
    approveSubscriptionPaymentRequest,
    rejectSubscriptionPaymentRequest,
    getSubscriptionPaymentSettingsAdmin,
    updateSubscriptionPaymentSettings,
    getSubscriptionOverview,
    listSubscriptionPayments,
    getComplimentarySubscriptions,
    assignComplimentarySubscriptionAdmin,
} from "../controller/admin/subscriptionController.js";
import {
    bootstrapAdmin,
    signupAdmin,
    loginAdmin,
    verifyAdminLoginOtp,
    sendAdminForgotPasswordOtp,
    verifyAdminForgotPasswordOtp,
    resetAdminPassword,
} from "../controller/adminAuthController.js";
import {
    getAdminProfile,
    updateAdminProfile,
    updateAdminPassword,
    getAdminStats,
    getDeliveryPartners,
    approveDeliveryPartner,
    rejectDeliveryPartner,
    updateDeliveryPartner,
    getActiveFleet,
    getUnassignedOrders,
    assignOrderToRider,
    getAdminWalletData,
    getDeliveryTransactions,
    settleTransaction,
    bulkSettleDelivery,
    getActiveSellers,
    getActiveSellerById,
    getPendingSellers,
    approveSellerApplication,
    rejectSellerApplication,
    createVendorAccount,
    updateSellerStoreSetup,
    resendSellerCredentials,
    inviteSeller,
    listSellerInvites,
    getSellerWithdrawals,
    getDeliveryWithdrawals,
    updateWithdrawalStatus,
    getSellerTransactions,
    getDeliveryCashBalances,
    getRiderCashDetails,
    settleRiderCash,
    getCashSettlementHistory,
    getUsers,
    getUserById,
    updateUser,
    updateUserStatus,
    sendCustomerNotification,
    getSellers,
    getSellerLocations,
    sendMessageToSeller,
    getPlatformSettings,
    updatePlatformSettings,
     getStaff,
     createStaff,
     updateStaff,
     deleteStaff,
     getLoginActivities,
     terminateSession
 } from "../controller/adminController.js";
import {
    listAdminRoles,
    createAdminRole,
    updateAdminRole,
    deleteAdminRole,
} from "../controller/admin/roleController.js";
import {
    adjustPayoutController,
    exportAdminFinanceStatementController,
    getAdminBulkSettlementsController,
    getAdminRefundsController,
    getAdminFinanceLedgerController,
    getAdminFinancePayoutsController,
    getAdminFinanceSummaryController,
    getEarningsBreakdownController,
    getDeliveryEarningsSummaryController,
    getSellerEarningsSummaryController,
    getDeliverySettingsController,
    processAdminFinancePayoutsController,
    settleSellerPayoutManualController,
    updateDeliverySettingsController,
    holdSellerPayoutController,
    releaseSellerPayoutController,
} from "../controller/adminFinanceController.js";
import { adminReconcileSellerCommissionController } from "../controller/sellerCodCommissionController.js";
import { getAdminDashboard } from "../controller/admin/dashboardController.js";
import {
    getStoreCommission,
    getCityCommission,
    listCityCommissions,
    listCityCommissionOptions,
    deleteCityCommission,
    upsertCityCommissionController,
    updateStoreCommission,
} from "../controller/admin/commissionHierarchyController.js";
import { getAuditLogsController, getRoleAccessAuditLogsController } from "../controller/admin/auditLogController.js";
import {
    getAccountantOverviewController,
    getOrdersGmvController,
    exportOrdersGmvController,
} from "../controller/admin/accountantController.js";
import {
    getExpensesController,
    createExpenseController,
    updateExpenseController,
    deleteExpenseController,
    exportExpensesExcelController,
    exportExpensesZipController,
} from "../controller/admin/expenseController.js";
import {
    getGstTcsSummaryController,
    getTaxFilingRecordsController,
    upsertTaxFilingRecordController,
    deleteTaxFilingRecordController,
} from "../controller/admin/gstTcsController.js";
import { generateAuditPackController } from "../controller/admin/auditPackController.js";
import { requireReason } from "../middleware/requireReasonMiddleware.js";
import {
    createCreditController,
    getApprovalsController,
    approveApprovalController,
    rejectApprovalController,
    getOperatorAuditLogController,
} from "../controller/admin/operationsController.js";
import {
    listCityBillingConfigsController,
    getCityBillingConfigController,
    upsertCityBillingConfigController,
    patchCityBillingStatusController,
    deleteCityBillingConfigController,
    duplicateCityBillingConfigController,
    activateWeatherChargeController,
    deactivateWeatherChargeController,
    addExtraChargeController,
    updateExtraChargeController,
    deleteExtraChargeController,
    previewCityBillingController,
} from "../controller/admin/cityBillingController.js";

import {
    verifyToken,
    allowRoles,
    allowSuperAdminOnly,
    checkAdminPermission,
    checkAnyAdminPermission,
} from "../middleware/authMiddleware.js";
import {
    adminBootstrapRateLimiter,
    authRouteRateLimiter,
    createContentLengthGuard,
    otpRouteRateLimiter,
} from "../middleware/securityMiddlewares.js";

const router = express.Router();

const smallAdminPayload = createContentLengthGuard(
    parseInt(process.env.ADMIN_AUTH_MAX_PAYLOAD_BYTES || "20480", 10),
    "Admin auth payload too large",
);
router.post("/bootstrap", adminBootstrapRateLimiter, smallAdminPayload, bootstrapAdmin);
router.post("/signup", adminBootstrapRateLimiter, smallAdminPayload, signupAdmin);
router.post("/login", authRouteRateLimiter, smallAdminPayload, loginAdmin);
router.post("/login/verify-2fa", authRouteRateLimiter, smallAdminPayload, verifyAdminLoginOtp);

router.post(
    "/forgot-password/send-otp",
    authRouteRateLimiter,
    otpRouteRateLimiter,
    smallAdminPayload,
    sendAdminForgotPasswordOtp,
);
router.post(
    "/forgot-password/verify-otp",
    authRouteRateLimiter,
    otpRouteRateLimiter,
    smallAdminPayload,
    verifyAdminForgotPasswordOtp,
);
router.post(
    "/forgot-password/reset",
    authRouteRateLimiter,
    smallAdminPayload,
    resetAdminPassword,
);

// Profile routes
router.get(
    "/profile",
    verifyToken,
    allowRoles("admin"),
    getAdminProfile
);

router.put(
    "/profile",
    verifyToken,
    allowRoles("admin"),
    updateAdminProfile
);

router.put(
    "/profile/password",
    verifyToken,
    allowRoles("admin"),
    updateAdminPassword
);

router.get(
    "/stats",
    verifyToken,
    allowRoles("admin"),
    getAdminStats
);
router.get(
    "/finance/summary",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("wallet"),
    getAdminFinanceSummaryController,
);
router.get(
    "/finance/ledger",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("wallet"),
    getAdminFinanceLedgerController,
);
router.get(
    "/finance/payouts",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("wallet"),
    getAdminFinancePayoutsController,
);
router.get(
    "/finance/bulk-settlements",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("bulk_settlements"),
    getAdminBulkSettlementsController,
);
router.get(
    "/finance/earnings-breakdown",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("wallet"),
    getEarningsBreakdownController,
);
router.get(
    "/finance/delivery-earnings-summary",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("wallet"),
    getDeliveryEarningsSummaryController,
);
router.get(
    "/finance/seller-earnings-summary",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("wallet"),
    getSellerEarningsSummaryController,
);
router.get(
    "/finance/refunds",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("wallet"),
    getAdminRefundsController,
);
router.get(
    "/audit-logs",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("audit_logs"),
    getAuditLogsController,
);
router.post(
    "/finance/payouts/process",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("wallet.write"),
    processAdminFinancePayoutsController,
);
router.post(
    "/finance/settlement/manual",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("wallet.write"),
    settleSellerPayoutManualController,
);
router.post(
    "/finance/reconcile-seller-cod",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("wallet.write"),
    adminReconcileSellerCommissionController,
);
router.post(
    "/finance/payouts/:payoutId/adjust",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("wallet.write"),
    adjustPayoutController,
);
router.post(
    "/finance/orders/:orderId/hold",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("wallet.write"),
    holdSellerPayoutController,
);
router.post(
    "/finance/orders/:orderId/release",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("wallet.write"),
    releaseSellerPayoutController,
);
router.get(
    "/finance/export-statement",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("wallet"),
    exportAdminFinanceStatementController,
);
router.get(
    "/settings/platform",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("billing"),
    getPlatformSettings
);
router.get(
    "/settings/delivery",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("billing"),
    getDeliverySettingsController,
);
router.put(
    "/settings/delivery",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("billing.write"),
    updateDeliverySettingsController,
);
router.put(
    "/settings/platform",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("billing.write"),
    updatePlatformSettings
);
// Staff/Sub-admin Management Routes
router.get("/staff", verifyToken, allowSuperAdminOnly, getStaff);
router.post("/staff", verifyToken, allowSuperAdminOnly, createStaff);
router.put("/staff/:id", verifyToken, allowSuperAdminOnly, updateStaff);
router.delete("/staff/:id", verifyToken, allowSuperAdminOnly, deleteStaff);

// Custom Role Management (admin can define multiple roles with their own
// permission matrices; staff accounts are then assigned to one of them).
router.get("/roles", verifyToken, allowSuperAdminOnly, listAdminRoles);
router.post("/roles", verifyToken, allowSuperAdminOnly, createAdminRole);
router.put("/roles/:id", verifyToken, allowSuperAdminOnly, updateAdminRole);
router.delete("/roles/:id", verifyToken, allowSuperAdminOnly, deleteAdminRole);
router.get("/roles/access-logs", verifyToken, allowSuperAdminOnly, getRoleAccessAuditLogsController);

router.get("/users", verifyToken, allowRoles("admin"), getUsers);
router.get("/users/:id", verifyToken, allowRoles("admin"), getUserById);
router.put("/users/:id", verifyToken, allowRoles("admin"), updateUser);
router.patch("/users/:id/status", verifyToken, allowRoles("admin"), updateUserStatus);
router.post("/users/:id/notify", verifyToken, allowRoles("admin"), sendCustomerNotification);
router.get("/login-activities", verifyToken, allowRoles("admin"), getLoginActivities);
router.delete("/login-activities/:id", verifyToken, allowRoles("admin"), terminateSession);
router.get("/sellers", verifyToken, allowRoles("admin"), checkAdminPermission("sellers"), getSellers);
router.get("/sellers/locations", verifyToken, allowRoles("admin"), checkAdminPermission("sellers"), getSellerLocations);
router.get("/sellers/active", verifyToken, allowRoles("admin"), checkAdminPermission("sellers"), getActiveSellers);
router.get("/sellers/active/:id", verifyToken, allowRoles("admin"), checkAdminPermission("sellers"), getActiveSellerById);
router.get("/sellers/pending", verifyToken, allowRoles("admin"), checkAdminPermission("sellers"), getPendingSellers);
router.post("/sellers/create", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.write"), createVendorAccount);
router.put("/sellers/:id/store-setup", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.write"), updateSellerStoreSetup);
router.post("/sellers/:id/resend-credentials", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.write"), resendSellerCredentials);
router.post("/sellers/:id/message", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.write"), sendMessageToSeller);
router.post("/sellers/invite", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.write"), inviteSeller);
router.get("/sellers/invites", verifyToken, allowRoles("admin"), checkAdminPermission("sellers"), listSellerInvites);
router.patch("/sellers/approve/:id", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.write"), approveSellerApplication);
router.delete("/sellers/reject/:id", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.write"), rejectSellerApplication);
router.get("/sellers/:id/business-model", verifyToken, allowRoles("admin"), checkAdminPermission("sellers"), getAdminSellerBusinessModel);
router.put("/sellers/:id/business-model", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.write"), updateAdminSellerBusinessModel);
router.put("/sellers/:id/commission", verifyToken, allowRoles("admin"), checkAdminPermission("billing.write"), updateAdminSellerCommission);
router.get("/stores/:id/commission", verifyToken, allowRoles("admin"), checkAdminPermission("billing"), getStoreCommission);
router.put("/stores/:id/commission", verifyToken, allowRoles("admin"), checkAdminPermission("billing.write"), updateStoreCommission);
router.get("/commissions/cities", verifyToken, allowRoles("admin"), checkAdminPermission("billing"), listCityCommissions);
// Static path must be registered before the ":cityKey" routes.
router.get("/commissions/cities/options", verifyToken, allowRoles("admin"), checkAdminPermission("billing"), listCityCommissionOptions);
router.get("/commissions/cities/:cityKey", verifyToken, allowRoles("admin"), checkAdminPermission("billing"), getCityCommission);
router.delete("/commissions/cities/:cityKey", verifyToken, allowRoles("admin"), checkAdminPermission("billing.write"), deleteCityCommission);
router.put("/commissions/cities/:cityKey", verifyToken, allowRoles("admin"), checkAdminPermission("billing.write"), upsertCityCommissionController);

// City-wise billing (delivery / weather / extra charges). Separate from
// city commission above — commission affects seller payout, billing here
// affects customer-facing charges. Both models share cityKey identity.
router.get("/billing/cities", verifyToken, allowRoles("admin"), checkAdminPermission("billing"), listCityBillingConfigsController);
router.get("/billing/cities/:cityKey", verifyToken, allowRoles("admin"), checkAdminPermission("billing"), getCityBillingConfigController);
router.put("/billing/cities/:cityKey", verifyToken, allowRoles("admin"), checkAdminPermission("billing.write"), upsertCityBillingConfigController);
router.patch("/billing/cities/:cityKey/status", verifyToken, allowRoles("admin"), checkAdminPermission("billing.write"), patchCityBillingStatusController);
router.delete("/billing/cities/:cityKey", verifyToken, allowRoles("admin"), checkAdminPermission("billing.write"), deleteCityBillingConfigController);
router.post("/billing/cities/:cityKey/duplicate", verifyToken, allowRoles("admin"), checkAdminPermission("billing.write"), duplicateCityBillingConfigController);
router.post("/billing/cities/:cityKey/weather/activate", verifyToken, allowRoles("admin"), checkAdminPermission("billing.write"), activateWeatherChargeController);
router.post("/billing/cities/:cityKey/weather/deactivate", verifyToken, allowRoles("admin"), checkAdminPermission("billing.write"), deactivateWeatherChargeController);
router.post("/billing/cities/:cityKey/extra-charges", verifyToken, allowRoles("admin"), checkAdminPermission("billing.write"), addExtraChargeController);
router.put("/billing/cities/:cityKey/extra-charges/:chargeId", verifyToken, allowRoles("admin"), checkAdminPermission("billing.write"), updateExtraChargeController);
router.delete("/billing/cities/:cityKey/extra-charges/:chargeId", verifyToken, allowRoles("admin"), checkAdminPermission("billing.write"), deleteExtraChargeController);
router.post("/billing/preview", verifyToken, allowRoles("admin"), checkAdminPermission("billing"), previewCityBillingController);
router.get("/sellers/model-switch-requests", verifyToken, allowRoles("admin"), checkAdminPermission("sellers"), listModelSwitchRequests);
router.patch("/sellers/:id/model-switch/approve", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.write"), approveModelSwitchRequest);
router.patch("/sellers/:id/model-switch/reject", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.write"), rejectModelSwitchRequest);

router.get("/subscription/plans", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.subscriptions"), listSubscriptionPlans);
router.post("/subscription/plans", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.subscriptions_write"), createSubscriptionPlan);
router.put("/subscription/plans/:id", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.subscriptions_write"), updateSubscriptionPlan);
router.delete("/subscription/plans/:id", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.subscriptions_write"), deleteSubscriptionPlan);
router.get("/subscription/payment-requests", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.subscriptions"), listPaymentRequests);
router.patch("/subscription/payment-requests/:id/approve", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.subscriptions_write"), approveSubscriptionPaymentRequest);
router.patch("/subscription/payment-requests/:id/reject", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.subscriptions_write"), rejectSubscriptionPaymentRequest);
router.get("/subscription/payment-settings", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.subscriptions"), getSubscriptionPaymentSettingsAdmin);
router.put("/subscription/payment-settings", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.subscriptions_write"), updateSubscriptionPaymentSettings);
router.get("/subscription/overview", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.subscriptions"), getSubscriptionOverview);
router.get("/subscription/payments", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.subscriptions"), listSubscriptionPayments);
router.get("/subscription/complimentary", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.subscriptions"), getComplimentarySubscriptions);
router.post("/subscription/complimentary", verifyToken, allowRoles("admin"), checkAdminPermission("sellers.subscriptions_write"), assignComplimentarySubscriptionAdmin);

router.get(
    "/delivery-partners",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("delivery"),
    getDeliveryPartners
);

router.patch(
    "/delivery-partners/approve/:id",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("delivery.write"),
    approveDeliveryPartner
);

router.delete(
    "/delivery-partners/reject/:id",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("delivery.write"),
    rejectDeliveryPartner
);

router.put(
    "/delivery-partners/:id",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("delivery.write"),
    updateDeliveryPartner
);

router.get("/active-fleet", verifyToken, allowRoles("admin"), checkAdminPermission("delivery"), getActiveFleet);
router.get("/unassigned-orders", verifyToken, allowRoles("admin"), checkAdminPermission("delivery"), getUnassignedOrders);
router.post("/orders/:orderId/assign-rider", verifyToken, allowRoles("admin"), checkAnyAdminPermission("delivery.write", "operations.intervene"), requireReason, assignOrderToRider);
router.get("/wallet-data", verifyToken, allowRoles("admin"), checkAdminPermission("wallet"), getAdminWalletData);

// Delivery Payouts / Funds
router.get("/delivery-transactions", verifyToken, allowRoles('admin'), checkAdminPermission("delivery"), getDeliveryTransactions);
router.put("/transactions/:id/settle", verifyToken, allowRoles("admin"), checkAdminPermission("delivery.write"), settleTransaction);
router.put("/transactions/bulk-settle-delivery", verifyToken, allowRoles("admin"), checkAdminPermission("delivery.write"), bulkSettleDelivery);

// Cash Collection Hub
router.get("/delivery-cash", verifyToken, allowRoles("admin"), checkAdminPermission("cash_collection"), getDeliveryCashBalances);
router.get("/rider-cash-details/:id", verifyToken, allowRoles("admin"), checkAdminPermission("cash_collection"), getRiderCashDetails);
router.post("/settle-cash", verifyToken, allowRoles("admin"), checkAdminPermission("cash_collection.write"), settleRiderCash);
router.get("/cash-history", verifyToken, allowRoles("admin"), checkAdminPermission("cash_collection"), getCashSettlementHistory);

// Seller Withdrawal Management
router.get("/seller-withdrawals", verifyToken, allowRoles("admin"), checkAdminPermission("withdrawals"), getSellerWithdrawals);
router.get("/delivery-withdrawals", verifyToken, allowRoles("admin"), checkAdminPermission("withdrawals"), getDeliveryWithdrawals);
router.get("/seller-transactions", verifyToken, allowRoles("admin"), checkAdminPermission("seller_payments"), getSellerTransactions);
router.put("/withdrawals/:id", verifyToken, allowRoles("admin"), checkAdminPermission("withdrawals.write"), updateWithdrawalStatus);

// Platform overview dashboard
router.get(
    "/dashboard",
    verifyToken,
    allowRoles("admin"),
    checkAdminPermission("wallet"),
    getAdminDashboard
);

// Accountant dashboard — reconciliation overview + Orders/GMV report.
// Gated by its own "accountant" permission since it's a bespoke aggregate
// view spanning orders/payments/refunds/payouts, not a thin wrapper over
// one existing resource's permission.
router.get("/accountant/overview", verifyToken, allowRoles("admin"), checkAdminPermission("accountant"), getAccountantOverviewController);
router.get("/accountant/orders-gmv", verifyToken, allowRoles("admin"), checkAdminPermission("accountant"), getOrdersGmvController);
router.get("/accountant/orders-gmv/export", verifyToken, allowRoles("admin"), checkAdminPermission("accountant"), exportOrdersGmvController);

// Expenses — platform costs the accountant records and reconciles against
// the bank-balance equation on the Accountant Home screen. Bills are
// uploaded via the existing generic POST /media/upload endpoint; this API
// only ever receives the resulting URL string.
router.get("/expenses", verifyToken, allowRoles("admin"), checkAdminPermission("accountant.expenses"), getExpensesController);
router.post("/expenses", verifyToken, allowRoles("admin"), checkAdminPermission("accountant.expenses_write"), createExpenseController);
router.put("/expenses/:id", verifyToken, allowRoles("admin"), checkAdminPermission("accountant.expenses_write"), updateExpenseController);
router.delete("/expenses/:id", verifyToken, allowRoles("admin"), checkAdminPermission("accountant.expenses_write"), deleteExpenseController);
router.get("/expenses/export/excel", verifyToken, allowRoles("admin"), checkAdminPermission("accountant.expenses"), exportExpensesExcelController);
router.get("/expenses/export/zip", verifyToken, allowRoles("admin"), checkAdminPermission("accountant.expenses"), exportExpensesZipController);

// GST / TCS — estimated output GST on commission/subscription + TCS
// liability, and a manual filing tracker (no GSTN e-filing API exists in
// this codebase; the accountant records what was actually filed).
router.get("/gst-tcs/summary", verifyToken, allowRoles("admin"), checkAdminPermission("accountant.gst_tcs"), getGstTcsSummaryController);
router.get("/gst-tcs/filings", verifyToken, allowRoles("admin"), checkAdminPermission("accountant.gst_tcs"), getTaxFilingRecordsController);
router.post("/gst-tcs/filings", verifyToken, allowRoles("admin"), checkAdminPermission("accountant.gst_tcs_write"), upsertTaxFilingRecordController);
router.delete("/gst-tcs/filings/:id", verifyToken, allowRoles("admin"), checkAdminPermission("accountant.gst_tcs_write"), deleteTaxFilingRecordController);

// Audit Pack — bundles every report above into one ZIP for the CA.
router.get("/accountant/audit-pack", verifyToken, allowRoles("admin"), checkAdminPermission("accountant.audit_pack"), generateAuditPackController);

// Operations Console — Operator-tier credit/refund with Maker-Checker
// escalation, and the unified operator audit log.
router.post("/operations/credits", verifyToken, allowRoles("admin"), checkAdminPermission("operations.intervene"), createCreditController);
router.get("/operations/approvals", verifyToken, allowRoles("admin"), checkAnyAdminPermission("operations.manage_shops", "operations.payments"), getApprovalsController);
router.patch("/operations/approvals/:id/approve", verifyToken, allowRoles("admin"), checkAnyAdminPermission("operations.manage_shops", "operations.payments"), approveApprovalController);
router.patch("/operations/approvals/:id/reject", verifyToken, allowRoles("admin"), checkAnyAdminPermission("operations.manage_shops", "operations.payments"), rejectApprovalController);
router.get("/operations/audit-log", verifyToken, allowRoles("admin"), checkAdminPermission("operations.monitor"), getOperatorAuditLogController);

export default router;
