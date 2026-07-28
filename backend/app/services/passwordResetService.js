import crypto from "crypto";
import jwt from "jsonwebtoken";
import Seller from "../models/seller.js";
import Admin from "../models/admin.js";
import OtpVerification from "../models/otpVerification.js";
import { getRedisClient } from "../config/redis.js";
import { getMockOtp } from "../utils/otp.js";
import { sendPasswordResetOtpEmail, useRealEmailOTP } from "./emailService.js";

const PASSWORD_RESET_PURPOSE_CLAIM = "password_reset";
const CHANNEL = "email";
const OTP_LENGTH = 4;

const ROLE_CONFIG = {
  seller: {
    model: Seller,
    purpose: "seller_password_reset",
    roleClaim: "seller",
    minPasswordLength: 6,
  },
  admin: {
    model: Admin,
    purpose: "admin_password_reset",
    roleClaim: "admin",
    minPasswordLength: 10,
  },
};

const OTP_EXPIRY_MINUTES = () =>
  parseInt(process.env.PASSWORD_RESET_OTP_EXPIRY_MINUTES || process.env.OTP_EXPIRY_MINUTES || "5", 10);
const OTP_RESEND_COOLDOWN_SECONDS = () =>
  parseInt(
    process.env.PASSWORD_RESET_OTP_RESEND_COOLDOWN_SECONDS ||
      process.env.OTP_RESEND_COOLDOWN_SECONDS ||
      "60",
    10,
  );
const OTP_MAX_FAILED_ATTEMPTS = () =>
  parseInt(
    process.env.PASSWORD_RESET_OTP_MAX_FAILED_ATTEMPTS ||
      process.env.OTP_MAX_FAILED_ATTEMPTS ||
      "5",
    10,
  );
const OTP_SEND_LIMIT_WINDOW_SECONDS = () =>
  parseInt(process.env.PASSWORD_RESET_OTP_SEND_LIMIT_WINDOW_SECONDS || "900", 10);
const OTP_SEND_LIMIT_PER_WINDOW = () =>
  parseInt(process.env.PASSWORD_RESET_OTP_SEND_LIMIT_PER_WINDOW || "5", 10);
const OTP_VERIFY_LIMIT_WINDOW_SECONDS = () =>
  parseInt(process.env.PASSWORD_RESET_OTP_VERIFY_LIMIT_WINDOW_SECONDS || "900", 10);
const OTP_VERIFY_LIMIT_PER_WINDOW = () =>
  parseInt(process.env.PASSWORD_RESET_OTP_VERIFY_LIMIT_PER_WINDOW || "20", 10);
const RESET_TOKEN_EXPIRY = () =>
  process.env.PASSWORD_RESET_TOKEN_EXPIRY || "10m";

function getRoleConfig(role) {
  const config = ROLE_CONFIG[role];
  if (!config) {
    const error = new Error("Unsupported password reset role");
    error.statusCode = 400;
    throw error;
  }
  return config;
}

function otpSecret() {
  return (
    process.env.PASSWORD_RESET_SECRET ||
    process.env.OTP_HASH_SECRET ||
    process.env.JWT_SECRET ||
    "unsafe-dev-secret"
  );
}

function resetTokenSecret() {
  return (
    process.env.PASSWORD_RESET_SECRET ||
    process.env.JWT_SECRET ||
    "unsafe-dev-secret"
  );
}

function useMockEmailOtp() {
  if (process.env.USE_MOCK_OTP === "true" || process.env.USE_MOCK_OTP === "1") {
    return true;
  }
  return !useRealEmailOTP();
}

function randomOtp(length) {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

function generateOtp() {
  return useMockEmailOtp() ? getMockOtp() : randomOtp(OTP_LENGTH);
}

function hashOtp(purpose, target, otp) {
  return crypto
    .createHmac("sha256", otpSecret())
    .update(`${purpose}:${CHANNEL}:${target}:${otp}`)
    .digest("hex");
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("Please enter a valid email address");
    error.statusCode = 400;
    throw error;
  }
  return email;
}

function maskEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  const [local, domain] = value.split("@");
  if (!local || !domain) {
    return "***";
  }
  const visibleLocal = local.length <= 2 ? `${local[0] || "*"}*` : `${local.slice(0, 2)}***`;
  return `${visibleLocal}@${domain}`;
}

async function incrementWindowCounter(redisKey, { limit, windowSeconds }) {
  const redis = getRedisClient();
  if (redis) {
    try {
      const [count] = await Promise.all([
        redis.incr(redisKey),
        redis.expire(redisKey, windowSeconds),
      ]);
      return Number(count) <= limit;
    } catch {
      // fall back to in-memory counter
    }
  }

  if (!globalThis.__PASSWORD_RESET_OTP_WINDOW_COUNTER__) {
    globalThis.__PASSWORD_RESET_OTP_WINDOW_COUNTER__ = new Map();
  }

  const now = Date.now();
  const store = globalThis.__PASSWORD_RESET_OTP_WINDOW_COUNTER__;
  const entry = store.get(redisKey);

  if (!entry || entry.expiresAt <= now) {
    store.set(redisKey, {
      count: 1,
      expiresAt: now + windowSeconds * 1000,
    });
    return true;
  }

  entry.count += 1;
  store.set(redisKey, entry);
  return entry.count <= limit;
}

function validateNewPassword(password, role) {
  const { minPasswordLength } = getRoleConfig(role);
  const value = String(password || "");

  if (value.length < minPasswordLength) {
    const error = new Error(`Password must be at least ${minPasswordLength} characters`);
    error.statusCode = 400;
    throw error;
  }

  if (value.length > 128) {
    const error = new Error("Password must be at most 128 characters");
    error.statusCode = 400;
    throw error;
  }

  if (role === "admin") {
    if (!/[a-z]/.test(value)) {
      const error = new Error("Password must contain at least one lowercase letter");
      error.statusCode = 400;
      throw error;
    }
    if (!/[A-Z]/.test(value)) {
      const error = new Error("Password must contain at least one uppercase letter");
      error.statusCode = 400;
      throw error;
    }
    if (!/[0-9]/.test(value)) {
      const error = new Error("Password must contain at least one number");
      error.statusCode = 400;
      throw error;
    }
  }

  return value;
}

function signResetToken({ id, role }) {
  const { roleClaim } = getRoleConfig(role);
  return jwt.sign(
    {
      id: String(id),
      role: roleClaim,
      purpose: PASSWORD_RESET_PURPOSE_CLAIM,
    },
    resetTokenSecret(),
    { expiresIn: RESET_TOKEN_EXPIRY() },
  );
}

function verifyResetToken(token, expectedRole) {
  if (!token) {
    const error = new Error("Reset token is required");
    error.statusCode = 400;
    throw error;
  }

  let payload;
  try {
    payload = jwt.verify(token, resetTokenSecret());
  } catch {
    const error = new Error("Reset session expired. Please verify OTP again.");
    error.statusCode = 400;
    throw error;
  }

  const { roleClaim } = getRoleConfig(expectedRole);
  if (
    payload?.purpose !== PASSWORD_RESET_PURPOSE_CLAIM ||
    payload?.role !== roleClaim ||
    !payload?.id
  ) {
    const error = new Error("Invalid reset token");
    error.statusCode = 400;
    throw error;
  }

  return payload;
}

export async function sendPasswordResetOtp({ role, email, ipAddress = "unknown" }) {
  const config = getRoleConfig(role);
  const target = normalizeEmail(email);

  const sendAllowed = await incrementWindowCounter(
    `password-reset:otp:send:${role}:${target}`,
    {
      limit: OTP_SEND_LIMIT_PER_WINDOW(),
      windowSeconds: OTP_SEND_LIMIT_WINDOW_SECONDS(),
    },
  );
  if (!sendAllowed) {
    const error = new Error("Too many OTP requests. Please try again later.");
    error.statusCode = 429;
    throw error;
  }

  const genericResponse = {
    sent: true,
    channel: CHANNEL,
    maskedTarget: maskEmail(target),
    expiresInSeconds: OTP_EXPIRY_MINUTES() * 60,
  };

  const account = await config.model.findOne({ email: target }).select("_id email").lean();
  if (!account) {
    return genericResponse;
  }

  const now = new Date();
  let session = await OtpVerification.findOne({
    purpose: config.purpose,
    channel: CHANNEL,
    target,
  }).select("+otpHash +expiresAt");

  if (session?.lastSentAt) {
    const elapsedMs = now.getTime() - new Date(session.lastSentAt).getTime();
    const cooldownMs = OTP_RESEND_COOLDOWN_SECONDS() * 1000;
    if (elapsedMs < cooldownMs) {
      const waitSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
      const error = new Error(`Please wait ${waitSeconds}s before requesting another OTP`);
      error.statusCode = 429;
      throw error;
    }
  }

  const otp = generateOtp();
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES() * 60 * 1000);

  if (!session) {
    session = new OtpVerification({
      purpose: config.purpose,
      channel: CHANNEL,
      target,
      otpHash: hashOtp(config.purpose, target, otp),
      expiresAt,
      verifiedAt: null,
      failedAttempts: 0,
      lastSentAt: now,
    });
  } else {
    session.otpHash = hashOtp(config.purpose, target, otp);
    session.expiresAt = expiresAt;
    session.verifiedAt = null;
    session.failedAttempts = 0;
    session.lastSentAt = now;
  }

  await session.save();

  try {
    await sendPasswordResetOtpEmail({
      email: target,
      otp,
      expiresInMinutes: OTP_EXPIRY_MINUTES(),
      role,
    });
  } catch (error) {
    if (!error.statusCode) {
      error.statusCode = 502;
    }
    throw error;
  }

  console.log(
    JSON.stringify({
      level: "info",
      ts: new Date().toISOString(),
      event: "password_reset_otp_issued",
      role,
      target: maskEmail(target),
      ipAddress,
      mode: useMockEmailOtp() ? "mock" : "real",
    }),
  );

  return genericResponse;
}

export async function verifyPasswordResetOtp({
  role,
  email,
  otp,
  ipAddress = "unknown",
}) {
  const config = getRoleConfig(role);
  const target = normalizeEmail(email);
  const code = String(otp || "").trim();

  if (!/^\d{4}$/.test(code)) {
    const error = new Error("Please enter a valid OTP");
    error.statusCode = 400;
    throw error;
  }

  const verifyAllowed = await incrementWindowCounter(
    `password-reset:otp:verify:${role}:${target}`,
    {
      limit: OTP_VERIFY_LIMIT_PER_WINDOW(),
      windowSeconds: OTP_VERIFY_LIMIT_WINDOW_SECONDS(),
    },
  );
  if (!verifyAllowed) {
    const error = new Error("Too many verification attempts. Please try again later.");
    error.statusCode = 429;
    throw error;
  }

  const account = await config.model.findOne({ email: target }).select("_id").lean();
  if (!account) {
    const error = new Error("Invalid or expired OTP");
    error.statusCode = 400;
    throw error;
  }

  const session = await OtpVerification.findOne({
    purpose: config.purpose,
    channel: CHANNEL,
    target,
  }).select("+otpHash +expiresAt");

  const mockMode = useMockEmailOtp();
  const mockOtp = getMockOtp();
  let otpValid = false;

  if (mockMode && code === mockOtp) {
    otpValid = true;
  } else if (session?.otpHash && session?.expiresAt && session.expiresAt > new Date()) {
    otpValid = hashOtp(config.purpose, target, code) === session.otpHash;
  }

  if (!otpValid) {
    if (session) {
      session.failedAttempts = (session.failedAttempts || 0) + 1;
      await session.save();
      if (session.failedAttempts >= OTP_MAX_FAILED_ATTEMPTS()) {
        await OtpVerification.deleteOne({ _id: session._id });
      }
    }
    const error = new Error("Invalid or expired OTP");
    error.statusCode = 400;
    throw error;
  }

  if (session) {
    session.verifiedAt = new Date();
    session.failedAttempts = 0;
    await session.save();
  }

  console.log(
    JSON.stringify({
      level: "info",
      ts: new Date().toISOString(),
      event: "password_reset_otp_verified",
      role,
      target: maskEmail(target),
      ipAddress,
      mode: mockMode ? "mock" : "real",
    }),
  );

  return {
    verified: true,
    resetToken: signResetToken({ id: account._id, role }),
  };
}

export async function resetPasswordWithToken({ role, resetToken, newPassword }) {
  const config = getRoleConfig(role);
  const payload = verifyResetToken(resetToken, role);
  const password = validateNewPassword(newPassword, role);

  const account = await config.model.findById(payload.id).select("+password");
  if (!account) {
    const error = new Error("Account not found");
    error.statusCode = 404;
    throw error;
  }

  account.password = password;
  await account.save();

  if (account.email) {
    await OtpVerification.deleteOne({
      purpose: config.purpose,
      channel: CHANNEL,
      target: String(account.email).trim().toLowerCase(),
    });
  }

  console.log(
    JSON.stringify({
      level: "info",
      ts: new Date().toISOString(),
      event: "password_reset_completed",
      role,
      accountId: String(account._id),
    }),
  );

  return { reset: true };
}
