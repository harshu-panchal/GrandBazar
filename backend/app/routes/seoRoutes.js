import express from "express";
import {
  getPublicProductSeo,
  getPublicStoreSeo,
  getPublicCategorySeo,
  getPublicOfferSeo,
  getDiscoverCityData,
  getDiscoverPincodeData,
} from "../controller/publicSeoController.js";

const router = express.Router();

router.get("/products/:slugAndId", getPublicProductSeo);
router.get("/stores/:slugAndId", getPublicStoreSeo);
router.get("/categories/:slugAndId", getPublicCategorySeo);
router.get("/offers/:slugAndId", getPublicOfferSeo);
router.get("/discover/:citySlug", getDiscoverCityData);
router.get("/discover/:citySlug/:pincode", getDiscoverPincodeData);

export default router;
