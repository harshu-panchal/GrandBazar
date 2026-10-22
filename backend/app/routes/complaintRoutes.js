import express from "express";
import {
  verifyToken,
  allowRoles,
  checkAdminPermission,
} from "../middleware/authMiddleware.js";
import {
  raiseComplaintHandler,
  getOrderComplaintHandler,
  getComplaintHandler,
  listComplaintsHandler,
  listSellerComplaintsHandler,
  getSellerComplaintHandler,
  acknowledgeFeedbackHandler,
  logCallHandler,
  assignCulpritHandler,
  sellerDecisionHandler,
  refundCustomerHandler,
  closeComplaintHandler,
} from "../controller/complaintController.js";

const router = express.Router();

// ---- Customer -------------------------------------------------------------
// Raise feedback or a complaint on a delivered order (24h window enforced
// server-side in the service — CMP-01/02).
router.post(
  "/order/:orderId",
  verifyToken,
  allowRoles("customer", "user"),
  raiseComplaintHandler,
);

// Read the complaint for a given order (customer tracks their ticket; seller
// and admin also read it — field-level masking is applied in Phase 3/7).
router.get("/order/:orderId", verifyToken, getOrderComplaintHandler);

// ---- Admin list + ticket read --------------------------------------------
router.get(
  "/",
  verifyToken,
  allowRoles("admin"),
  checkAdminPermission("complaints:read"),
  listComplaintsHandler,
);

router.get(
  "/:complaintId",
  verifyToken,
  allowRoles("admin"),
  checkAdminPermission("complaints:read"),
  getComplaintHandler,
);

// ---- Seller: own-store complaints (scoped server-side) --------------------
router.get("/seller/mine", verifyToken, allowRoles("seller"), listSellerComplaintsHandler);
router.get("/seller/:complaintId", verifyToken, allowRoles("seller"), getSellerComplaintHandler);
router.post(
  "/:complaintId/seller-decision",
  verifyToken,
  allowRoles("seller"),
  sellerDecisionHandler,
);

// ---- Admin actions (call log required before routing/closing) -------------
const adminManage = [verifyToken, allowRoles("admin"), checkAdminPermission("complaints:manage")];

router.post("/:complaintId/acknowledge", ...adminManage, acknowledgeFeedbackHandler);
router.post("/:complaintId/calls", ...adminManage, logCallHandler);
router.post("/:complaintId/assign", ...adminManage, assignCulpritHandler);
router.post("/:complaintId/refund", ...adminManage, refundCustomerHandler);
router.post("/:complaintId/close", ...adminManage, closeComplaintHandler);

export default router;
