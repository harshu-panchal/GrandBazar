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
  getCatalogBundles,
  getCatalogBundle,
  createCatalogBundleHandler,
  updateCatalogBundleHandler,
  deleteCatalogBundleHandler,
  getAvailableCatalogBundles,
  getCatalogBundleImportStatus,
  importCatalogBundles,
} from "../controller/catalogBundleController.js";
import {
  verifyToken,
  allowRoles,
  requireApprovedSeller,
  requireBusinessModelChosen,
  requireSellerOperational,
  resolveActiveStore,
  checkSubSellerPermission,
} from "../middleware/authMiddleware.js";
import multer from "multer";

const storage = multer.memoryStorage();
const upload = multer({ storage });

const router = express.Router();

const sellerBundleChain = [
  verifyToken,
  allowRoles("seller"),
  resolveActiveStore,
  requireApprovedSeller,
  requireBusinessModelChosen,
  requireSellerOperational,
  checkSubSellerPermission("products", "write"),
];

// Catalog bundle routes (must be before /:id)
router.get(
  "/bundles",
  verifyToken,
  allowRoles("admin"),
  getCatalogBundles,
);

router.post(
  "/bundles",
  verifyToken,
  allowRoles("admin"),
  createCatalogBundleHandler,
);

router.get(
  "/bundles/available",
  verifyToken,
  allowRoles("seller"),
  resolveActiveStore,
  requireApprovedSeller,
  requireBusinessModelChosen,
  requireSellerOperational,
  checkSubSellerPermission("products", "read"),
  getAvailableCatalogBundles,
);

router.get(
  "/bundles/import-status",
  verifyToken,
  allowRoles("seller"),
  resolveActiveStore,
  requireApprovedSeller,
  requireBusinessModelChosen,
  requireSellerOperational,
  checkSubSellerPermission("products", "read"),
  getCatalogBundleImportStatus,
);

router.post(
  "/bundles/import",
  ...sellerBundleChain,
  importCatalogBundles,
);

router.get(
  "/bundles/:id",
  verifyToken,
  allowRoles("admin"),
  getCatalogBundle,
);

router.put(
  "/bundles/:id",
  verifyToken,
  allowRoles("admin"),
  updateCatalogBundleHandler,
);

router.delete(
  "/bundles/:id",
  verifyToken,
  allowRoles("admin"),
  deleteCatalogBundleHandler,
);

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
  requireBusinessModelChosen,
  requireSellerOperational,
  checkSubSellerPermission("products", "write"),
  claimCatalogProduct
);

router.post(
  "/claim-bulk",
  verifyToken,
  allowRoles("seller"),
  resolveActiveStore,
  requireApprovedSeller,
  requireBusinessModelChosen,
  requireSellerOperational,
  checkSubSellerPermission("products", "write"),
  bulkClaimCatalogProducts
);

export default router;
