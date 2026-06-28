import Seller from "../models/seller.js";
import Store from "../models/store.js";
import handleResponse from "../utils/helper.js";
import {
    issueSellerVerificationOtp,
    verifySellerOtpCode,
    verifySellerVerificationToken,
} from "../services/sellerVerificationService.js";
import { recordLogin } from "../services/loginActivityService.js";
import {
    generateSellerToken,
    isStoreApproved,
    loadOwnerStores,
    pickDefaultActiveStoreId,
} from "../services/storeService.js";
import {
    getOwnerAccountApplicationStatus,
    isOwnerAccountApproved,
} from "../services/sellerAccountService.js";

/* ===============================
   SELLER ADMIN SIGNUP (account only — shops added later)
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
        } = req.body || {};

        if (!name || !email || !phone || !password) {
            return handleResponse(res, 400, "Name, email, phone, and password are required");
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

        const existingAccount = await Seller.findOne({ $or: [{ email }, { phone }] });
        if (existingAccount) {
            return handleResponse(res, 400, "Seller with this email or phone already exists");
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
            isVerified: false,
            applicationStatus: "pending",
            isActive: true,
        });

        const token = generateSellerToken({
            accountId: account._id,
            activeStoreId: null,
        });

        return handleResponse(res, 201, "Seller admin registration submitted for admin approval.", {
            token,
            seller: account,
            account,
            stores: [],
            activeStoreId: null,
            hasApprovedStore: false,
            isAccountApproved: false,
            accountApplicationStatus: "pending",
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
        const isAccountApproved = isOwnerAccountApproved(seller);
        const accountApplicationStatus = getOwnerAccountApplicationStatus(seller);

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
            isAccountApproved,
            accountApplicationStatus,
            rejectionReason: seller.rejectionReason || "",
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
