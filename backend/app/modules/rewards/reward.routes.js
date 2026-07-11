import express from "express";
import { verifyToken, allowRoles, checkAdminPermission, checkSubSellerPermission } from "../../middleware/authMiddleware.js";
import {
  listCampaigns,
  createCampaign,
  updateCampaign,
  updateCampaignStatus,
  deleteCampaign,
  getAdminAnalytics,
  getAdminSettlements,
  listSellerCampaigns,
  createSellerCampaign,
  updateSellerCampaign,
  getSellerAnalytics,
  getCustomerSummary,
  getCustomerGrants,
  getCustomerTransactions,
  getCustomerCoupons,
  getMyReferrals,
  getMyReferralCode,
  inviteReferral,
} from "./reward.controller.js";

const router = express.Router();

// Admin routes
router.get("/admin/campaigns", verifyToken, allowRoles("admin", "superadmin"), checkAdminPermission("marketing"), listCampaigns);
router.post("/admin/campaigns", verifyToken, allowRoles("admin", "superadmin"), checkAdminPermission("marketing"), createCampaign);
router.put("/admin/campaigns/:id", verifyToken, allowRoles("admin", "superadmin"), checkAdminPermission("marketing"), updateCampaign);
router.put("/admin/campaigns/:id/status", verifyToken, allowRoles("admin", "superadmin"), checkAdminPermission("marketing"), updateCampaignStatus);
router.delete("/admin/campaigns/:id", verifyToken, allowRoles("admin", "superadmin"), checkAdminPermission("marketing"), deleteCampaign);
router.get("/admin/analytics", verifyToken, allowRoles("admin", "superadmin"), checkAdminPermission("marketing"), getAdminAnalytics);
router.get("/admin/settlements", verifyToken, allowRoles("admin", "superadmin"), checkAdminPermission("marketing"), getAdminSettlements);

// Seller routes
router.get("/seller/campaigns", verifyToken, allowRoles("seller"), checkSubSellerPermission("rewards", "read"), listSellerCampaigns);
router.post("/seller/campaigns", verifyToken, allowRoles("seller"), checkSubSellerPermission("rewards", "write"), createSellerCampaign);
router.put("/seller/campaigns/:id", verifyToken, allowRoles("seller"), checkSubSellerPermission("rewards", "write"), updateSellerCampaign);
router.get("/seller/analytics", verifyToken, allowRoles("seller"), checkSubSellerPermission("rewards", "read"), getSellerAnalytics);

// Customer routes
router.get("/customer/summary", verifyToken, allowRoles("customer"), getCustomerSummary);
router.get("/customer/grants", verifyToken, allowRoles("customer"), getCustomerGrants);
router.get("/customer/transactions", verifyToken, allowRoles("customer"), getCustomerTransactions);
router.get("/customer/coupons", verifyToken, allowRoles("customer"), getCustomerCoupons);
router.get("/customer/referrals", verifyToken, allowRoles("customer"), getMyReferrals);
router.get("/customer/referral-code", verifyToken, allowRoles("customer"), getMyReferralCode);
router.post("/customer/referrals/invite", verifyToken, allowRoles("customer"), inviteReferral);

export default router;
