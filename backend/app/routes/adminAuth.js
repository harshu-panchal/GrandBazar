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
    getActiveFleet,
    getAdminWalletData,
    getDeliveryTransactions,
    settleTransaction,
    bulkSettleDelivery,
    getActiveSellers,
    getActiveSellerById,
    getPendingSellers,
    approveSellerApplication,
    rejectSellerApplication,
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
    getSellers,
    getSellerLocations,
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
    exportAdminFinanceStatementController,
    getAdminFinanceLedgerController,
    getAdminFinancePayoutsController,
    getAdminFinanceSummaryController,
    getDeliverySettingsController,
    processAdminFinancePayoutsController,
    updateDeliverySettingsController,
} from "../controller/adminFinanceController.js";
import { getAdminDashboard } from "../controller/admin/dashboardController.js";
import {
    getStoreCommission,
    getCityCommission,
    listCityCommissions,
    upsertCityCommissionController,
    updateStoreCommission,
} from "../controller/admin/commissionHierarchyController.js";

import { verifyToken, allowRoles, allowSuperAdminOnly } from "../middleware/authMiddleware.js";
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
    getAdminFinanceSummaryController,
);
router.get(
    "/finance/ledger",
    verifyToken,
    allowRoles("admin"),
    getAdminFinanceLedgerController,
);
router.get(
    "/finance/payouts",
    verifyToken,
    allowRoles("admin"),
    getAdminFinancePayoutsController,
);
router.post(
    "/finance/payouts/process",
    verifyToken,
    allowRoles("admin"),
    processAdminFinancePayoutsController,
);
router.get(
    "/finance/export-statement",
    verifyToken,
    allowRoles("admin"),
    exportAdminFinanceStatementController,
);
router.get(
    "/settings/platform",
    verifyToken,
    allowRoles("admin"),
    getPlatformSettings
);
router.get(
    "/settings/delivery",
    verifyToken,
    allowRoles("admin"),
    getDeliverySettingsController,
);
router.put(
    "/settings/delivery",
    verifyToken,
    allowRoles("admin"),
    updateDeliverySettingsController,
);
router.put(
    "/settings/platform",
    verifyToken,
    allowRoles("admin"),
    updatePlatformSettings
);
// Staff/Sub-admin Management Routes
router.get("/staff", verifyToken, allowSuperAdminOnly, getStaff);
router.post("/staff", verifyToken, allowSuperAdminOnly, createStaff);
router.put("/staff/:id", verifyToken, allowSuperAdminOnly, updateStaff);
router.delete("/staff/:id", verifyToken, allowSuperAdminOnly, deleteStaff);

router.get("/users", verifyToken, allowRoles("admin"), getUsers);
router.get("/users/:id", verifyToken, allowRoles("admin"), getUserById);
router.get("/login-activities", verifyToken, allowRoles("admin"), getLoginActivities);
router.delete("/login-activities/:id", verifyToken, allowRoles("admin"), terminateSession);
router.get("/sellers", verifyToken, allowRoles("admin"), getSellers);
router.get("/sellers/locations", verifyToken, allowRoles("admin"), getSellerLocations);
router.get("/sellers/active", verifyToken, allowRoles("admin"), getActiveSellers);
router.get("/sellers/active/:id", verifyToken, allowRoles("admin"), getActiveSellerById);
router.get("/sellers/pending", verifyToken, allowRoles("admin"), getPendingSellers);
router.patch("/sellers/approve/:id", verifyToken, allowRoles("admin"), approveSellerApplication);
router.delete("/sellers/reject/:id", verifyToken, allowRoles("admin"), rejectSellerApplication);
router.get("/sellers/:id/business-model", verifyToken, allowRoles("admin"), getAdminSellerBusinessModel);
router.put("/sellers/:id/business-model", verifyToken, allowRoles("admin"), updateAdminSellerBusinessModel);
router.put("/sellers/:id/commission", verifyToken, allowRoles("admin"), updateAdminSellerCommission);
router.get("/stores/:id/commission", verifyToken, allowRoles("admin"), getStoreCommission);
router.put("/stores/:id/commission", verifyToken, allowRoles("admin"), updateStoreCommission);
router.get("/commissions/cities", verifyToken, allowRoles("admin"), listCityCommissions);
router.get("/commissions/cities/:cityKey", verifyToken, allowRoles("admin"), getCityCommission);
router.put("/commissions/cities/:cityKey", verifyToken, allowRoles("admin"), upsertCityCommissionController);
router.get("/sellers/model-switch-requests", verifyToken, allowRoles("admin"), listModelSwitchRequests);
router.patch("/sellers/:id/model-switch/approve", verifyToken, allowRoles("admin"), approveModelSwitchRequest);
router.patch("/sellers/:id/model-switch/reject", verifyToken, allowRoles("admin"), rejectModelSwitchRequest);

router.get("/subscription/plans", verifyToken, allowRoles("admin"), listSubscriptionPlans);
router.post("/subscription/plans", verifyToken, allowRoles("admin"), createSubscriptionPlan);
router.put("/subscription/plans/:id", verifyToken, allowRoles("admin"), updateSubscriptionPlan);
router.delete("/subscription/plans/:id", verifyToken, allowRoles("admin"), deleteSubscriptionPlan);
router.get("/subscription/payment-requests", verifyToken, allowRoles("admin"), listPaymentRequests);
router.patch("/subscription/payment-requests/:id/approve", verifyToken, allowRoles("admin"), approveSubscriptionPaymentRequest);
router.patch("/subscription/payment-requests/:id/reject", verifyToken, allowRoles("admin"), rejectSubscriptionPaymentRequest);
router.get("/subscription/payment-settings", verifyToken, allowRoles("admin"), getSubscriptionPaymentSettingsAdmin);
router.put("/subscription/payment-settings", verifyToken, allowRoles("admin"), updateSubscriptionPaymentSettings);
router.get("/subscription/overview", verifyToken, allowRoles("admin"), getSubscriptionOverview);
router.get("/subscription/payments", verifyToken, allowRoles("admin"), listSubscriptionPayments);
router.get("/subscription/complimentary", verifyToken, allowRoles("admin"), getComplimentarySubscriptions);
router.post("/subscription/complimentary", verifyToken, allowRoles("admin"), assignComplimentarySubscriptionAdmin);

router.get(
    "/delivery-partners",
    verifyToken,
    allowRoles("admin"),
    getDeliveryPartners
);

router.patch(
    "/delivery-partners/approve/:id",
    verifyToken,
    allowRoles("admin"),
    approveDeliveryPartner
);

router.delete(
    "/delivery-partners/reject/:id",
    verifyToken,
    allowRoles("admin"),
    rejectDeliveryPartner
);

router.get("/active-fleet", verifyToken, allowRoles("admin"), getActiveFleet);
router.get("/wallet-data", verifyToken, allowRoles("admin"), getAdminWalletData);

// Delivery Payouts / Funds
router.get("/delivery-transactions", verifyToken, allowRoles('admin'), getDeliveryTransactions);
router.put("/transactions/:id/settle", verifyToken, allowRoles("admin"), settleTransaction);
router.put("/transactions/bulk-settle-delivery", verifyToken, allowRoles("admin"), bulkSettleDelivery);

// Cash Collection Hub
router.get("/delivery-cash", verifyToken, allowRoles("admin"), getDeliveryCashBalances);
router.get("/rider-cash-details/:id", verifyToken, allowRoles("admin"), getRiderCashDetails);
router.post("/settle-cash", verifyToken, allowRoles("admin"), settleRiderCash);
router.get("/cash-history", verifyToken, allowRoles("admin"), getCashSettlementHistory);

// Seller Withdrawal Management
router.get("/seller-withdrawals", verifyToken, allowRoles("admin"), getSellerWithdrawals);
router.get("/delivery-withdrawals", verifyToken, allowRoles("admin"), getDeliveryWithdrawals);
router.get("/seller-transactions", verifyToken, allowRoles("admin"), getSellerTransactions);
router.put("/withdrawals/:id", verifyToken, allowRoles("admin"), updateWithdrawalStatus);

// Platform overview dashboard
router.get(
    "/dashboard",
    verifyToken,
    allowRoles("admin"),
    getAdminDashboard
);

export default router;
