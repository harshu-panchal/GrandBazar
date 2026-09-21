import express from "express";
import {
    getCategories,
    createCategory,
    updateCategory,
    bulkUpdateCategoryCharges,
    deleteCategory
} from "../controller/categoryController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import multer from "multer";

const storage = multer.memoryStorage();
const upload = multer({ storage });

const router = express.Router();

// Public route to get categories
router.get("/", getCategories);

// Admin only routes
router.post(
    "/",
    verifyToken,
    allowRoles("admin"),
    upload.single("image"),
    createCategory
);

// Must be registered before "/:id" so "bulk-charges" isn't read as an id.
router.put(
    "/bulk-charges",
    verifyToken,
    allowRoles("admin"),
    bulkUpdateCategoryCharges
);

router.put(
    "/:id",
    verifyToken,
    allowRoles("admin"),
    upload.single("image"),
    updateCategory
);

router.delete(
    "/:id",
    verifyToken,
    allowRoles("admin"),
    deleteCategory
);

export default router;
