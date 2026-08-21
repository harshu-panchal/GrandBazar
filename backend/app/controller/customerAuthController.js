import Customer from "../models/customer.js";
import Transaction from "../models/transaction.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import handleResponse from "../utils/helper.js";
import {
    issueCustomerOtp,
    sanitizeCustomer,
    verifyCustomerOtpCode,
} from "../services/otpAuthService.js";
import {
    sendLoginOtpSchema,
    sendSignupOtpSchema,
    validateSchema,
    verifyOtpSchema,
} from "../validation/customerAuthValidation.js";
import { sendBecomeSellerLinksEmail } from "../services/emailService.js";

const generateToken = (customer) =>
    jwt.sign(
        { id: customer._id, role: "customer" },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );

/* ===============================
   SIGNUP – Send OTP
================================ */
export const signupCustomer = async (req, res) => {
    try {
        const payload = validateSchema(sendSignupOtpSchema, req.body || {});

        await issueCustomerOtp({
            name: payload.name,
            rawPhone: payload.phone,
            email: payload.email,
            password: payload.password,
            flow: "signup",
            ipAddress: req.ip,
            agreedToTerms: Boolean(payload.agreedToTerms),
        });

        return handleResponse(res, 200, "If the number is eligible, OTP has been sent");
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   LOGIN – Send OTP
================================ */
export const loginCustomer = async (req, res) => {
    try {
        const payload = validateSchema(sendLoginOtpSchema, req.body || {});

        await issueCustomerOtp({
            rawPhone: payload.phone,
            flow: "login",
            ipAddress: req.ip,
        });

        return handleResponse(res, 200, "If the number is eligible, OTP has been sent");
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   LOGIN WITH EMAIL – Customer
================================ */
export const loginCustomerWithEmail = async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) {
            return handleResponse(res, 400, "Email and password are required");
        }

        const customer = await Customer.findOne({ email: String(email).toLowerCase() }).select("+password");
        if (!customer) {
            return handleResponse(res, 401, "Invalid email or password");
        }

        if (!customer.password) {
            return handleResponse(res, 400, "Password not set for this account. Please log in via Mobile OTP.");
        }

        const isMatch = await bcrypt.compare(password, customer.password);
        if (!isMatch) {
            return handleResponse(res, 401, "Invalid email or password");
        }

        if (customer.isActive === false) {
            return handleResponse(res, 403, "This account has been deleted. Please contact support.");
        }

        const token = generateToken(customer);
        await recordLogin(customer, "Customer", req.ip, req.headers["user-agent"]).catch(() => {});

        return handleResponse(res, 200, "Login successful", {
            token,
            customer: sanitizeCustomer(customer),
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

import { recordLogin } from "../services/loginActivityService.js";

/* ===============================
   VERIFY OTP – Login / Signup
Back to standard logic
================================ */
export const verifyCustomerOTP = async (req, res) => {
    try {
        const payload = validateSchema(verifyOtpSchema, req.body || {});
        const customer = await verifyCustomerOtpCode({
            rawPhone: payload.phone,
            otp: payload.otp,
            ipAddress: req.ip,
        });

        if (customer.isActive === false) {
            return handleResponse(res, 403, "This account has been deleted. Please contact support.");
        }

        if (payload.referralCode) {
            const { attachReferralOnSignup } = await import("../modules/rewards/services/referralService.js");
            await attachReferralOnSignup({
                refereeId: customer._id,
                referralCode: payload.referralCode,
            }).catch(() => {});
        }

        const { ensureCustomerReferralCode } = await import("../modules/rewards/services/referralService.js");
        await ensureCustomerReferralCode(customer._id).catch(() => {});
        const token = generateToken(customer);

        // Record active login session
        await recordLogin(customer, "Customer", req.ip, req.headers["user-agent"]);

        return handleResponse(
            res,
            200,
            "Login successful",
            {
                token,
                customer: sanitizeCustomer(customer),
            }
        );
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   GET PROFILE
================================ */
export const getCustomerProfile = async (req, res) => {
    try {
        const customer = await Customer.findById(req.user.id).lean();
        if (!customer) {
            return handleResponse(res, 404, "Customer not found");
        }
        return handleResponse(res, 200, "Profile fetched successfully", sanitizeCustomer(customer));
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   UPDATE PROFILE
================================ */
export const updateCustomerProfile = async (req, res) => {
    try {
        const { name, email, addresses, dateOfBirth, notificationsEnabled, profileImage } = req.body;

        const customer = await Customer.findById(req.user.id);
        if (!customer) {
            return handleResponse(res, 404, "Customer not found");
        }

        if (name) customer.name = name;
        if (email) {
            const normalizedEmail = String(email).trim().toLowerCase();
            if (normalizedEmail !== (customer.email || "").toLowerCase()) {
                const existing = await Customer.findOne({
                    email: normalizedEmail,
                    _id: { $ne: customer._id },
                });
                if (existing) {
                    return handleResponse(res, 409, "This email is already registered to another account.");
                }
            }
            customer.email = normalizedEmail;
        }
        if (addresses) customer.addresses = addresses;
        if (profileImage !== undefined) customer.profileImage = profileImage || null;
        if (notificationsEnabled !== undefined) {
            customer.notificationsEnabled = Boolean(notificationsEnabled);
        }
        if (dateOfBirth !== undefined) {
            if (dateOfBirth === null || dateOfBirth === "") {
                customer.dateOfBirth = null;
            } else {
                const parsed = new Date(dateOfBirth);
                if (Number.isNaN(parsed.getTime())) {
                    return handleResponse(res, 400, "Invalid date of birth");
                }
                if (parsed > new Date()) {
                    return handleResponse(res, 400, "Date of birth cannot be in the future");
                }
                customer.dateOfBirth = parsed;
            }
        }

        try {
            await customer.save();
        } catch (saveError) {
            if (saveError?.code === 11000 && saveError?.keyPattern?.email) {
                return handleResponse(res, 409, "This email is already registered to another account.");
            }
            throw saveError;
        }

        return handleResponse(res, 200, "Profile updated successfully", sanitizeCustomer(customer));
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   DELETE ACCOUNT (soft delete)
================================ */
export const deleteCustomerAccount = async (req, res) => {
    try {
        const customer = await Customer.findById(req.user.id);
        if (!customer) {
            return handleResponse(res, 404, "Customer not found");
        }

        // Soft delete: keep the document (orders/transactions still reference it)
        // but mark inactive so the account can no longer authenticate, mirroring
        // the isActive convention used for store deactivation elsewhere.
        customer.isActive = false;
        await customer.save();

        return handleResponse(res, 200, "Account deleted successfully");
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   GET WALLET TRANSACTIONS
================================ */
export const getCustomerTransactions = async (req, res) => {
    try {
        const customerId = req.user.id;
        const { page = 1, limit = 20 } = req.query;
        const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(50, Math.max(1, parseInt(limit, 10)));
        const perPage = Math.min(50, Math.max(1, parseInt(limit, 10)));

        const [transactions, total] = await Promise.all([
            Transaction.find({ user: customerId, userModel: "User" })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(perPage)
                .populate("order", "orderId")
                .lean(),
            Transaction.countDocuments({ user: customerId, userModel: "User" }),
        ]);

        const items = transactions.map((t) => ({
            _id: t._id,
            type: t.type === "Refund" ? "credit" : "debit",
            title: t.type === "Refund" ? "Refund" : t.type,
            amount: Math.abs(t.amount),
            date: t.createdAt,
            reference: t.reference,
            orderId: t.order?.orderId,
        }));

        return handleResponse(res, 200, "Transactions fetched", {
            items,
            total,
            page: parseInt(page, 10),
            totalPages: Math.ceil(total / perPage) || 1,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   BECOME SELLER LEAD
================================ */
export const requestBecomeSeller = async (req, res) => {
    try {
        const { name, email, phone, category } = req.body || {};
        if (!email) {
            return handleResponse(res, 400, "Email is required");
        }
        
        const result = await sendBecomeSellerLinksEmail({ email: String(email).trim(), name });
        if (!result.success && !result.mocked) {
             return handleResponse(res, 500, "Failed to send email");
        }

        return handleResponse(res, 200, "App links and registration details have been sent to your email!");
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
