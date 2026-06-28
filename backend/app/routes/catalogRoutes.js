import express from "express";
import {
  createCatalogProduct,
  createCatalogProductsBulk,
  getCatalogProducts,
  getCatalogProductById,
  updateCatalogProduct,
  deleteCatalogProduct,
  claimCatalogProduct,
  bulkClaimCatalogProducts
} from "../controller/catalogController.js";
import {
  verifyToken,
  allowRoles,
  requireApprovedSeller
} from "../middleware/authMiddleware.js";
import multer from "multer";

const storage = multer.memoryStorage();
const upload = multer({ storage });

const router = express.Router();

// General Catalog Browsing (shared by Admin and Sellers)
router.get(
  "/",
  verifyToken,
  allowRoles("admin", "seller"),
  getCatalogProducts
);

router.get(
  "/:id",
  verifyToken,
  allowRoles("admin", "seller"),
  getCatalogProductById
);

// Admin-only Catalog Management
router.post(
  "/",
  verifyToken,
  allowRoles("admin"),
  upload.any(),
  createCatalogProduct
);

router.post(
  "/bulk",
  verifyToken,
  allowRoles("admin"),
  createCatalogProductsBulk
);

router.put(
  "/:id",
  verifyToken,
  allowRoles("admin"),
  upload.any(),
  updateCatalogProduct
);

router.delete(
  "/:id",
  verifyToken,
  allowRoles("admin"),
  deleteCatalogProduct
);

// Seller-only Claim Action
router.post(
  "/claim",
  verifyToken,
  allowRoles("seller"),
  requireApprovedSeller,
  claimCatalogProduct
);

router.post(
  "/claim-bulk",
  verifyToken,
  allowRoles("seller"),
  requireApprovedSeller,
  bulkClaimCatalogProducts
);

export default router;
