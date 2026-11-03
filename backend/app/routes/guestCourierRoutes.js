import express from "express";
import multer from "multer";
import handleResponse from "../utils/helper.js";
import { verifyGuestCourier } from "../middleware/guestCourierAuth.js";
import { uploadToCloudinary } from "../services/mediaService.js";
import {
  getGuestTask,
  postGuestLocation,
  postGuestArrived,
  postGuestPickup,
  postGuestAdvance,
  postGuestDeliveryOtpRequest,
  postGuestDeliveryOtpVerify,
  postGuestReturnProof,
  postGuestReturnPickupOtpRequest,
  postGuestReturnPickupOtpVerify,
  postGuestReturnDropOtpRequest,
  postGuestReturnDropOtpVerify,
  postGuestCodInitiate,
  postGuestCodVerify,
} from "../controller/guestCourierController.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
router.use(verifyGuestCourier);
router.get("/task", getGuestTask);
router.post("/location", postGuestLocation);
router.post("/arrived", postGuestArrived);
router.post("/pickup", postGuestPickup);
router.post("/advance", postGuestAdvance);
router.post("/delivery-otp/request", postGuestDeliveryOtpRequest);
router.post("/delivery-otp/verify", postGuestDeliveryOtpVerify);
router.post("/return/pickup-proof", postGuestReturnProof);
router.post("/return/pickup-otp/request", postGuestReturnPickupOtpRequest);
router.post("/return/pickup-otp/verify", postGuestReturnPickupOtpVerify);
router.post("/return/drop-otp/request", postGuestReturnDropOtpRequest);
router.post("/return/drop-otp/verify", postGuestReturnDropOtpVerify);
router.post("/cod/initiate", postGuestCodInitiate);
router.post("/cod/verify", postGuestCodVerify);
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file || !String(req.file.mimetype || "").startsWith("image/")) return handleResponse(res, 400, "An image file is required");
    const url = await uploadToCloudinary(req.file.buffer, "media/guest-delivery", { mimeType: req.file.mimetype, resourceType: "image" });
    return handleResponse(res, 200, "Image uploaded", { url });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
});

export default router;
