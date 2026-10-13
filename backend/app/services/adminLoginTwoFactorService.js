import crypto from "crypto";
import jwt from "jsonwebtoken";
import Admin from "../models/admin.js";
import AdminRole from "../models/adminRole.js";
import OtpVerification from "../models/otpVerification.js";
import { getMockOtp } from "../utils/otp.js";
import { sendAdminLoginOtpEmail, useRealEmailOTP } from "./emailService.js";

// Mirrors passwordResetService.js's OTP generate/hash/verify pattern under
// a new purpose, rather than inventing a second OTP mechanism. The
// "pending" JWT plays the same role signResetToken()/verifyResetToken()
// play there — a short-lived, purpose-scoped token that proves "this
// caller already passed the password check" without yet being a usable
// session token.
const PURPOSE = "admin_login_2fa";
const CHANNEL = "email";
const OTP_LENGTH = 4;
const PENDING_TOKEN_PURPOSE = "admin_login_2fa_pending";

const OTP_EXPIRY_MINUTES = () => parseInt(process.env.ADMIN_2FA_OTP_EXPIRY_MINUTES || "5", 10);
const OTP_RESEND_COOLDOWN_SECONDS = () => parseInt(process.env.ADMIN_2FA_OTP_RESEND_COOLDOWN_SECONDS || "60", 10);
const OTP_MAX_FAILED_ATTEMPTS = () => parseInt(process.env.ADMIN_2FA_OTP_MAX_FAILED_ATTEMPTS || "5", 10);
const PENDING_TOKEN_EXPIRY = () => process.env.ADMIN_2FA_PENDING_TOKEN_EXPIRY || "10m";

function otpSecret() {
  return process.env.OTP_HASH_SECRET || process.env.JWT_SECRET || "unsafe-dev-secret";
}

function useMockOtp() {
  if (process.env.USE_MOCK_OTP === "true" || process.env.USE_MOCK_OTP === "1") return true;
  return !useRealEmailOTP();
}

function randomOtp(length) {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

function generateOtp() {
  return useMockOtp() ? getMockOtp() : randomOtp(OTP_LENGTH);
}

function hashOtp(target, otp) {
  return crypto.createHmac("sha256", otpSecret()).update(`${PURPOSE}:${CHANNEL}:${target}:${otp}`).digest("hex");
}

function signPendingToken(adminId) {
  return jwt.sign(
    { id: String(adminId), purpose: PENDING_TOKEN_PURPOSE },
    process.env.JWT_SECRET,
    { expiresIn: PENDING_TOKEN_EXPIRY() },
  );
}

function verifyPendingToken(token) {
  if (!token) {
    const error = new Error("2FA session token is required");
    error.statusCode = 400;
    throw error;
  }
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    const error = new Error("2FA session expired. Please log in again.");
    error.statusCode = 400;
    throw error;
  }
  if (payload?.purpose !== PENDING_TOKEN_PURPOSE || !payload?.id) {
    const error = new Error("Invalid 2FA session token");
    error.statusCode = 400;
    throw error;
  }
  return payload;
}

// A role requires 2FA if it's the root superadmin, or its linked AdminRole
// has requiresTwoFactor set. The bootstrap "admin" root account is
// deliberately exempt by default — forcing 2FA on the one account that
// provisions everything else risks locking the whole platform out if email
// isn't configured yet.
export async function adminRequiresTwoFactor(admin) {
  if (admin.role === "superadmin") return true;
  if (!admin.customRoleId) return false;
  const role = await AdminRole.findById(admin.customRoleId).select("requiresTwoFactor").lean();
  return Boolean(role?.requiresTwoFactor);
}

export async function sendLoginOtp(admin) {
  const target = admin.email;
  const now = new Date();

  let session = await OtpVerification.findOne({ purpose: PURPOSE, channel: CHANNEL, target }).select("+otpHash +expiresAt");
  if (session?.lastSentAt) {
    const elapsedMs = now.getTime() - new Date(session.lastSentAt).getTime();
    const cooldownMs = OTP_RESEND_COOLDOWN_SECONDS() * 1000;
    if (elapsedMs < cooldownMs) {
      const error = new Error(`Please wait ${Math.ceil((cooldownMs - elapsedMs) / 1000)}s before requesting another code`);
      error.statusCode = 429;
      throw error;
    }
  }

  const otp = generateOtp();
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES() * 60 * 1000);

  if (!session) {
    session = new OtpVerification({
      purpose: PURPOSE,
      channel: CHANNEL,
      target,
      otpHash: hashOtp(target, otp),
      expiresAt,
      verifiedAt: null,
      failedAttempts: 0,
      lastSentAt: now,
    });
  } else {
    session.otpHash = hashOtp(target, otp);
    session.expiresAt = expiresAt;
    session.verifiedAt = null;
    session.failedAttempts = 0;
    session.lastSentAt = now;
  }
  await session.save();

  await sendAdminLoginOtpEmail({ email: target, otp, name: admin.name });

  return {
    pendingToken: signPendingToken(admin._id),
    expiresInSeconds: OTP_EXPIRY_MINUTES() * 60,
  };
}

export async function verifyLoginOtp(pendingToken, otp) {
  const payload = verifyPendingToken(pendingToken);
  const admin = await Admin.findById(payload.id);
  if (!admin) {
    const error = new Error("Account not found");
    error.statusCode = 404;
    throw error;
  }

  const code = String(otp || "").trim();
  if (!/^\d{4}$/.test(code)) {
    const error = new Error("Please enter a valid code");
    error.statusCode = 400;
    throw error;
  }

  const session = await OtpVerification.findOne({ purpose: PURPOSE, channel: CHANNEL, target: admin.email }).select("+otpHash +expiresAt");

  const mockMode = useMockOtp() && process.env.NODE_ENV !== "production";
  let otpValid = false;
  if (mockMode && code === getMockOtp()) {
    otpValid = true;
  } else if (session?.otpHash && session?.expiresAt && session.expiresAt > new Date()) {
    otpValid = hashOtp(admin.email, code) === session.otpHash;
  }

  if (!otpValid) {
    if (session) {
      session.failedAttempts = (session.failedAttempts || 0) + 1;
      await session.save();
      if (session.failedAttempts >= OTP_MAX_FAILED_ATTEMPTS()) {
        await OtpVerification.deleteOne({ _id: session._id });
      }
    }
    const error = new Error("Invalid or expired code");
    error.statusCode = 400;
    throw error;
  }

  if (session) {
    session.verifiedAt = new Date();
    session.failedAttempts = 0;
    await session.save();
  }

  return admin;
}
