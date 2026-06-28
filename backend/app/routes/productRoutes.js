import express from "express";
import {
    getProducts,
    getSellerProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    getProductById,
    getModerationProducts,
    approveProduct,
    rejectProduct,
    publishSellerProduct,
    bulkPublishSellerProducts,
    getUnpublishedSellerProducts,
} from "../controller/productController.js";
import { adjustStock, getStockHistory } from "../controller/stockController.js";
import {
    verifyToken,
    allowRoles,
    optionalVerifyToken,
    requireApprovedSeller,
    resolveActiveStore,
    checkSubSellerPermission,
    requireBusinessModelChosen,
    requireSellerOperational,
} from "../middleware/authMiddleware.js";
import multer from "multer";

const storage = multer.memoryStorage();
const upload = multer({ storage });

const router = express.Router();

// Public routes with optional auth (to detect admin/seller vs customer)
router.get("/", optionalVerifyToken, getProducts);

const sellerChain = [verifyToken, allowRoles("seller"), resolveActiveStore, requireApprovedSeller, requireBusinessModelChosen, requireSellerOperational];

// Seller protected routes
router.get("/seller/me", ...sellerChain, checkSubSellerPermission("products", "read"), getSellerProducts);
router.get("/seller/unpublished", ...sellerChain, checkSubSellerPermission("products", "read"), getUnpublishedSellerProducts);
router.patch("/seller/publish-bulk", ...sellerChain, checkSubSellerPermission("products", "write"), bulkPublishSellerProducts);
router.patch("/seller/:id/publish", ...sellerChain, checkSubSellerPermission("products", "write"), publishSellerProduct);
router.get("/stock-history", ...sellerChain, checkSubSellerPermission("inventory", "read"), getStockHistory);
router.post("/adjust-stock", ...sellerChain, checkSubSellerPermission("inventory", "write"), adjustStock);
router.get("/moderation", verifyToken, allowRoles("admin"), getModerationProducts);
router.patch("/moderation/:id/approve", verifyToken, allowRoles("admin"), approveProduct);
router.patch("/moderation/:id/reject", verifyToken, allowRoles("admin"), rejectProduct);
router.get("/:id", optionalVerifyToken, getProductById);

router.post(
    "/",
    verifyToken,
    allowRoles("seller", "admin"),
    resolveActiveStore,
    requireApprovedSeller,
    requireBusinessModelChosen,
    checkSubSellerPermission("products", "write"),
    upload.any(),
    createProduct
);

router.put(
    "/:id",
    verifyToken,
    allowRoles("seller", "admin"),
    resolveActiveStore,
    requireApprovedSeller,
    requireBusinessModelChosen,
    checkSubSellerPermission("products", "write"),
    upload.any(),
    updateProduct
);

router.delete(
    "/:id",
    verifyToken,
    allowRoles("seller", "admin"),
    resolveActiveStore,
    requireApprovedSeller,
    requireBusinessModelChosen,
    checkSubSellerPermission("products", "write"),
    deleteProduct
);

export default router;
