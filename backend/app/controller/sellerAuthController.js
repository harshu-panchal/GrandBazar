import Seller from "../models/seller.js";
import Store from "../models/store.js";
import handleResponse from "../utils/helper.js";
import {
    issueSellerVerificationOtp,
    verifySellerOtpCode,
    verifySellerVerificationToken,
} from "../services/sellerVerificationService.js";
import { uploadToCloudinary } from "../services/mediaService.js";
import { recordLogin } from "../services/loginActivityService.js";
import {
    buildStorePayloadFromBody,
    generateSellerToken,
    getMissingRequiredSellerDocuments,
    isStoreApproved,
    loadOwnerStores,
    parseDocumentsPayload,
    pickDefaultActiveStoreId,
    REQUIRED_SELLER_DOCUMENT_FIELDS,
    resolveSellerDocuments,
    SELLER_DOCUMENT_FIELDS,
} from "../services/storeService.js";

/* ===============================
   SELLER SIGNUP (account + first store)
================================ */
export const signupSeller = async (req, res) => {
    try {
        const {
            name,
            email,
            phone,
            password,
            emailVerificationToken,
            phoneVerificationToken,
            shopName,
            lat,
            lng,
            radius,
            aadharNumber,
            panNumber,
            accountHolder,
            accountNumber,
            ifsc,
            bankName,
        } = req.body || {};

        const documentFiles = req.files || [];
        const uploadedDocs = {};

        if (Array.isArray(documentFiles) && documentFiles.length > 0) {
            for (const file of documentFiles) {
                try {
                    const fieldName = file.fieldname;
                    if (fieldName && REQUIRED_SELLER_DOCUMENT_FIELDS.includes(fieldName)) {
                        uploadedDocs[fieldName] = await uploadToCloudinary(file.buffer, "docs", {
                            mimeType: file.mimetype,
                        });
                    }
                } catch (err) {
                    console.error("Failed to upload document to Cloudinary", err);
                }
            }
        }

        const augmentedBody = { ...req.body, ...uploadedDocs };
        const parsedLat = lat !== undefined ? Number(lat) : undefined;
        const parsedLng = lng !== undefined ? Number(lng) : undefined;
        const parsedRadius = radius !== undefined ? Number(radius) : undefined;

        if (!name || !email || !phone || !password || !shopName || !aadharNumber || !panNumber || !accountHolder || !accountNumber || !ifsc || !bankName) {
            return handleResponse(res, 400, "All fields (including Aadhaar, PAN, and Bank details) are required");
        }

        verifySellerVerificationToken({
            channel: "email",
            rawValue: email,
            token: emailVerificationToken,
        });
        verifySellerVerificationToken({
            channel: "phone",
            rawValue: phone,
            token: phoneVerificationToken,
        });

        if (lat !== undefined && (!Number.isFinite(parsedLat) || parsedLat < -90 || parsedLat > 90)) {
            return handleResponse(res, 400, "Invalid latitude");
        }
        if (lng !== undefined && (!Number.isFinite(parsedLng) || parsedLng < -180 || parsedLng > 180)) {
            return handleResponse(res, 400, "Invalid longitude");
        }
        if (radius !== undefined && (!Number.isFinite(parsedRadius) || parsedRadius < 1 || parsedRadius > 100)) {
            return handleResponse(res, 400, "Radius must be between 1 and 100 km");
        }

        const existingAccount = await Seller.findOne({ $or: [{ email }, { phone }] });
        if (existingAccount) {
            return handleResponse(res, 400, "Seller with this email or phone already exists");
        }

        const parsedDocuments = parseDocumentsPayload(req.body.documents);
        const storeDocuments = resolveSellerDocuments(augmentedBody, parsedDocuments);
        const missingRequiredDocuments = getMissingRequiredSellerDocuments(storeDocuments || {});

        if (missingRequiredDocuments.length > 0) {
            const readableMissing = missingRequiredDocuments
                .map((field) => SELLER_DOCUMENT_FIELDS[field] || field)
                .join(", ");
            return handleResponse(res, 400, `All required documents must be uploaded: ${readableMissing}`);
        }

        const account = await Seller.create({
            name,
            email,
            phone,
            password,
            accountType: "owner",
            role: "seller",
            emailVerified: true,
            phoneVerified: true,
        });

        const storePayload = buildStorePayloadFromBody(augmentedBody, uploadedDocs);
        storePayload.ownerId = account._id;
        const store = await Store.create(storePayload);

        account.lastActiveStoreId = store._id;
        await account.save();

        return handleResponse(res, 201, "Seller registered successfully. Store pending admin approval.", {
            account,
            store,
            applicationStatus: "pending",
            requiresApproval: true,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

export const sendSellerSignupOtp = async (req, res) => {
    try {
        const { channel, email, phone, value } = req.body || {};
        const targetValue =
            channel === "email"
                ? email || value
                : channel === "phone"
                    ? phone || value
                    : value;

        const result = await issueSellerVerificationOtp({
            channel,
            rawValue: targetValue,
            ipAddress: req.ip,
        });

        return handleResponse(res, 200, "OTP sent successfully", result);
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

export const verifySellerSignupOtp = async (req, res) => {
    try {
        const { channel, email, phone, value, otp } = req.body || {};
        const targetValue =
            channel === "email"
                ? email || value
                : channel === "phone"
                    ? phone || value
                    : value;

        const result = await verifySellerOtpCode({
            channel,
            rawValue: targetValue,
            otp,
            ipAddress: req.ip,
        });

        return handleResponse(res, 200, "OTP verified successfully", result);
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   SELLER LOGIN
================================ */
export const loginSeller = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return handleResponse(res, 400, "Email and password are required");
        }

        const seller = await Seller.findOne({ email }).select("+password");

        if (!seller) {
            return handleResponse(res, 404, "Seller not found");
        }

        const isMatch = await seller.comparePassword(password);
        if (!isMatch) {
            return handleResponse(res, 401, "Invalid credentials");
        }

        if (seller.accountType === "staff" || seller.parentId) {
            const store = await Store.findById(seller.parentId);
            if (!store) {
                return handleResponse(res, 404, "Parent store not found");
            }

            if (!isStoreApproved(store)) {
                const storeStatus = store.applicationStatus || (store.isVerified ? "approved" : "pending");
                const approvalMessage = storeStatus === "rejected"
                    ? "The store's application was rejected. Please contact support."
                    : "The store account is pending admin approval.";
                return handleResponse(res, 403, approvalMessage);
            }

            seller.lastLogin = new Date();
            await seller.save();
            await recordLogin(seller, "Seller", req.ip, req.headers["user-agent"]);

            const token = generateSellerToken({
                activeStoreId: store._id,
                staffRecord: seller,
            });

            return handleResponse(res, 200, "Login successful", {
                token,
                seller,
                account: null,
                stores: [store],
                activeStoreId: String(store._id),
                activeStore: store,
            });
        }

        // Owner account login
        const stores = await loadOwnerStores(seller._id);
        const activeStoreId = await pickDefaultActiveStoreId(seller, stores);
        const activeStore = stores.find((s) => String(s._id) === String(activeStoreId)) || null;

        seller.lastLogin = new Date();
        if (activeStoreId) {
            seller.lastActiveStoreId = activeStoreId;
        }
        await seller.save();
        await recordLogin(seller, "Seller", req.ip, req.headers["user-agent"]);

        const token = generateSellerToken({
            activeStoreId,
            accountId: seller._id,
        });

        return handleResponse(res, 200, "Login successful", {
            token,
            seller,
            account: seller,
            stores,
            activeStoreId: activeStoreId ? String(activeStoreId) : null,
            activeStore,
            hasApprovedStore: stores.some((s) => isStoreApproved(s)),
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
