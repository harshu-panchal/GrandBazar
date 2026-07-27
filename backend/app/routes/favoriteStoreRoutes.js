import express from "express";
import {
  getFavoriteStores,
  toggleFavoriteStore,
  removeFavoriteStore,
} from "../controller/favoriteStoreController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(verifyToken);

router.get("/", getFavoriteStores);
router.post("/toggle", toggleFavoriteStore);
router.delete("/remove/:storeId", removeFavoriteStore);

export default router;
