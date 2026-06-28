import express from "express";
import {
  createCatalogProduct,
  createCatalogProductsBulk,
  getCatalogProducts,
  getCatalogProductById,
  updateCatalogProduct,
  deleteCatalogProduct,
  claimCatalogProduct
} from "../controller/catalogController.js";
import {
  verifyToken,
  allowRoles,
  requireApprovedSeller,
  resolveActiveStore,
  checkSubSellerPermission,
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
  checkSubSellerPermission("products", "read"),
  getCatalogProducts
);

router.get(
  "/:id",
  verifyToken,
  allowRoles("admin", "seller"),
  checkSubSellerPermission("products", "read"),
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
  resolveActiveStore,
  requireApprovedSeller,
  checkSubSellerPermission("products", "write"),
  claimCatalogProduct
);

export default router;
