import Delivery from "../models/delivery.js";
import jwt from "jsonwebtoken";
import handleResponse from "../utils/helper.js";
import { sendSmsIndiaHubOtp } from "../services/smsIndiaHubService.js";
import { generateOTP, useRealSMS } from "../utils/otp.js";
import { uploadToCloudinary } from "../services/mediaService.js";

const generateToken = (delivery) =>
    jwt.sign(
        { id: delivery._id, role: "delivery" },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );

import { recordLogin } from "../services/loginActivityService.js";

/* ===============================
   SIGNUP – Send OTP
================================ */
export const signupDelivery = async (req, res) => {
    try {
        const {
            name, phone, vehicleType,
            email, address, currentArea, city, vehicleNumber,
            drivingLicenseNumber,
            accountHolder, accountNumber, ifsc
        } = req.body;

        if (!name || !phone) {
            return handleResponse(res, 400, "Name and phone are required");
        }

        let delivery = await Delivery.findOne({ phone });

        if (delivery && delivery.isVerified) {
            return handleResponse(res, 400, "Delivery partner already exists");
        }

        const otp = generateOTP();

        let aadharUrl = delivery?.documents?.aadhar || "";
        let panUrl = delivery?.documents?.pan || "";
        let dlUrl = delivery?.documents?.drivingLicense || "";
        let profileImageUrl = delivery?.profileImage || "";

        // Handle File Uploads via Multer concurrently
        if (req.files && Array.isArray(req.files)) {
            const uploadPromises = req.files.map(async (file) => {
                if (file.fieldname === "profileImage") {
                    profileImageUrl = await uploadToCloudinary(file.buffer, "delivery/profiles");
                } else if (file.fieldname === "aadhar") {
                    aadharUrl = await uploadToCloudinary(file.buffer, "delivery/documents");
                } else if (file.fieldname === "pan") {
                    panUrl = await uploadToCloudinary(file.buffer, "delivery/documents");
                } else if (file.fieldname === "dl") {
                    dlUrl = await uploadToCloudinary(file.buffer, "delivery/documents");
                }
            });
            await Promise.all(uploadPromises);
        }

        const normalizedAadhar = String(req.body?.aadharUrl || req.body?.aadhar || "").trim();
        const normalizedPan = String(req.body?.panUrl || req.body?.pan || "").trim();
        const normalizedDl = String(
          req.body?.drivingLicenseUrl || req.body?.dlUrl || req.body?.dl || "",
        ).trim();
        const normalizedProfileImage = String(req.body?.profileImageUrl || req.body?.profileImage || "").trim();

        if (/^https?:\/\//i.test(normalizedAadhar)) aadharUrl = normalizedAadhar;
        if (/^https?:\/\//i.test(normalizedPan)) panUrl = normalizedPan;
        if (/^https?:\/\//i.test(normalizedDl)) dlUrl = normalizedDl;
        if (/^https?:\/\//i.test(normalizedProfileImage)) profileImageUrl = normalizedProfileImage;

        const deliveryData = {
            name,
            phone,
            vehicleType,
            email,
            address,
            currentArea: currentArea || city || (address ? address.split(',').pop().trim() : '') || "Main City",
            vehicleNumber,
            drivingLicenseNumber,
            accountHolder,
            accountNumber,
            ifsc,
            profileImage: profileImageUrl,
            documents: {
                aadhar: aadharUrl,
                pan: panUrl,
                drivingLicense: dlUrl,
            },
            otp,
            otpExpiry: Date.now() + 5 * 60 * 1000,
        };

        if (!delivery) {
            delivery = await Delivery.create(deliveryData);
        } else {
            Object.assign(delivery, deliveryData);
            await delivery.save();
        }

        if (useRealSMS()) {
            await sendSmsIndiaHubOtp({ phone, otp });
        }

        return handleResponse(res, 200, "OTP sent successfully");
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   LOGIN – Send OTP
================================ */
export const loginDelivery = async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return handleResponse(res, 400, "Phone number is required");
        }

        const delivery = await Delivery.findOne({ phone });

        if (!delivery || !delivery.isPhoneVerified) {
            return handleResponse(res, 404, "Delivery partner not found");
        }

        const otp = generateOTP();

        delivery.otp = otp;
        delivery.otpExpiry = Date.now() + 5 * 60 * 1000;
        await delivery.save();

        if (useRealSMS()) {
            await sendSmsIndiaHubOtp({ phone, otp });
        }

        return handleResponse(res, 200, "OTP sent successfully");
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   VERIFY OTP
================================ */
export const verifyDeliveryOTP = async (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return handleResponse(res, 400, "Phone and OTP are required");
        }

        const delivery = await Delivery.findOne({
            phone,
            otp,
            otpExpiry: { $gt: Date.now() },
        });

        if (!delivery) {
            return handleResponse(res, 400, "Invalid or expired OTP");
        }

        // Confirms the phone number only — `isVerified` (admin document review)
        // and `isOnline` must not flip here or new signups skip approval entirely.
        delivery.isPhoneVerified = true;
        delivery.otp = undefined;
        delivery.otpExpiry = undefined;
        delivery.lastLogin = new Date();

        await delivery.save();

        // Record active login session
        await recordLogin(delivery, "Delivery", req.ip, req.headers["user-agent"]);

        const token = generateToken(delivery);

        return handleResponse(res, 200, "Login successful", {
            token,
            delivery,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   GET PROFILE
================================ */
export const getDeliveryProfile = async (req, res) => {
    try {
        const delivery = await Delivery.findById(req.user.id);
        if (!delivery) {
            return handleResponse(res, 404, "Delivery partner not found");
        }
        return handleResponse(res, 200, "Profile fetched successfully", delivery);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   UPDATE PROFILE
================================ */
export const updateDeliveryProfile = async (req, res) => {
    try {
        const {
            name, email, address, vehicleType, vehicleNumber, drivingLicenseNumber,
            currentArea, isOnline, documents, emergencyContacts,
            vehicleModel, vehicleColor, fuelType,
        } = req.body;

        const delivery = await Delivery.findById(req.user.id);
        if (!delivery) {
            return handleResponse(res, 404, "Delivery partner not found");
        }

        if (name) delivery.name = name;
        if (typeof email !== "undefined") delivery.email = email;
        if (typeof address !== "undefined") delivery.address = address;
        if (vehicleType) delivery.vehicleType = vehicleType;
        if (vehicleNumber) delivery.vehicleNumber = vehicleNumber;
        if (drivingLicenseNumber) delivery.drivingLicenseNumber = drivingLicenseNumber;
        if (currentArea) delivery.currentArea = currentArea;
        if (typeof vehicleModel !== "undefined") delivery.vehicleModel = vehicleModel;
        if (typeof vehicleColor !== "undefined") delivery.vehicleColor = vehicleColor;
        if (typeof fuelType !== "undefined") delivery.fuelType = fuelType;

        if (documents && typeof documents === "object") {
            const existing = delivery.documents || {};
            delivery.documents = {
                aadhar: typeof documents.aadhar !== "undefined" ? String(documents.aadhar || "").trim() : existing.aadhar,
                pan: typeof documents.pan !== "undefined" ? String(documents.pan || "").trim() : existing.pan,
                drivingLicense: typeof documents.drivingLicense !== "undefined" ? String(documents.drivingLicense || "").trim() : existing.drivingLicense,
            };
        }

        if (Array.isArray(emergencyContacts)) {
            delivery.emergencyContacts = emergencyContacts
                .filter((c) => c && String(c.name || "").trim() && String(c.phone || "").trim())
                .slice(0, 5)
                .map((c) => ({
                    name: String(c.name).trim(),
                    relation: String(c.relation || "").trim(),
                    phone: String(c.phone).trim(),
                }));
        }

        if (typeof isOnline !== 'undefined') {
            if (isOnline && !delivery.isVerified) {
                return handleResponse(
                    res,
                    403,
                    "Your account is pending admin verification. You can go online once it's approved."
                );
            }
            delivery.isOnline = isOnline;
        }

        await delivery.save();

        return handleResponse(res, 200, "Profile updated successfully", delivery);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
