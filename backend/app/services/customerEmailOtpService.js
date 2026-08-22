import crypto from "crypto";
import Customer from "../models/customer.js";
import OtpVerification from "../models/otpVerification.js";
import { getRedisClient } from "../config/redis.js";
import { getMockOtp } from "../utils/otp.js";
import { sendCustomerLoginOtpEmail, useRealEmailOTP } from "./emailService.js";

const PURPOSE = "customer_login";
const CHANNEL = "email";
const OTP_LENGTH = 4;

const OTP_EXPIRY_MINUTES = () =>
  parseInt(process.env.CUSTOMER_EMAIL_OTP_EXPIRY_MINUTES || process.env.OTP_EXPIRY_MINUTES || "5", 10);
const OTP_RESEND_COOLDOWN_SECONDS = () =>
  parseInt(
    process.env.CUSTOMER_EMAIL_OTP_RESEND_COOLDOWN_SECONDS ||
      process.env.OTP_RESEND_COOLDOWN_SECONDS ||
      "60",
    10,
  );
const OTP_MAX_FAILED_ATTEMPTS = () =>
  parseInt(
    process.env.CUSTOMER_EMAIL_OTP_MAX_FAILED_ATTEMPTS ||
      process.env.OTP_MAX_FAILED_ATTEMPTS ||
      "5",
    10,
  );
const OTP_SEND_LIMIT_WINDOW_SECONDS = () =>
  parseInt(process.env.CUSTOMER_EMAIL_OTP_SEND_LIMIT_WINDOW_SECONDS || "900", 10);
const OTP_SEND_LIMIT_PER_WINDOW = () =>
  parseInt(process.env.CUSTOMER_EMAIL_OTP_SEND_LIMIT_PER_WINDOW || "5", 10);
const OTP_VERIFY_LIMIT_WINDOW_SECONDS = () =>
  parseInt(process.env.CUSTOMER_EMAIL_OTP_VERIFY_LIMIT_WINDOW_SECONDS || "900", 10);
const OTP_VERIFY_LIMIT_PER_WINDOW = () =>
  parseInt(process.env.CUSTOMER_EMAIL_OTP_VERIFY_LIMIT_PER_WINDOW || "20", 10);

function otpSecret() {
  return (
    process.env.OTP_HASH_SECRET ||
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

function hashOtp(target, otp) {
  return crypto
    .createHmac("sha256", otpSecret())
    .update(`${PURPOSE}:${CHANNEL}:${target}:${otp}`)
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

  if (!globalThis.__CUSTOMER_EMAIL_OTP_WINDOW_COUNTER__) {
    globalThis.__CUSTOMER_EMAIL_OTP_WINDOW_COUNTER__ = new Map();
  }

  const now = Date.now();
  const store = globalThis.__CUSTOMER_EMAIL_OTP_WINDOW_COUNTER__;
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

function otpAuditLog(event, meta) {
  console.log(
    JSON.stringify({
      level: "info",
      ts: new Date().toISOString(),
      event,
      ...meta,
    }),
  );
}

export async function sendCustomerLoginOtp({ email, ipAddress = "unknown" }) {
  const target = normalizeEmail(email);

  const sendAllowed = await incrementWindowCounter(`customer-email-otp:send:${target}`, {
    limit: OTP_SEND_LIMIT_PER_WINDOW(),
    windowSeconds: OTP_SEND_LIMIT_WINDOW_SECONDS(),
  });
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

  const customer = await Customer.findOne({ email: target, isVerified: true })
    .select("_id name email isActive")
    .lean();
  if (!customer || customer.isActive === false) {
    return genericResponse;
  }

  const now = new Date();
  let session = await OtpVerification.findOne({
    purpose: PURPOSE,
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

  try {
    await sendCustomerLoginOtpEmail({
      email: target,
      otp,
      name: customer.name,
      expiresInMinutes: OTP_EXPIRY_MINUTES(),
    });
  } catch (error) {
    if (!error.statusCode) {
      error.statusCode = 502;
    }
    throw error;
  }

  otpAuditLog("customer_email_otp_issued", {
    target: maskEmail(target),
    ipAddress,
    mode: useMockEmailOtp() ? "mock" : "real",
  });

  return genericResponse;
}

export async function verifyCustomerLoginOtp({ email, otp, ipAddress = "unknown" }) {
  const target = normalizeEmail(email);
  const code = String(otp || "").trim();

  if (!/^\d{4}$/.test(code)) {
    const error = new Error("Please enter a valid OTP");
    error.statusCode = 400;
    throw error;
  }

  const verifyAllowed = await incrementWindowCounter(`customer-email-otp:verify:${target}`, {
    limit: OTP_VERIFY_LIMIT_PER_WINDOW(),
    windowSeconds: OTP_VERIFY_LIMIT_WINDOW_SECONDS(),
  });
  if (!verifyAllowed) {
    const error = new Error("Too many OTP verification attempts. Try again later.");
    error.statusCode = 429;
    throw error;
  }

  const customer = await Customer.findOne({ email: target, isVerified: true });
  if (!customer) {
    const error = new Error("Invalid or expired OTP");
    error.statusCode = 400;
    throw error;
  }

  const session = await OtpVerification.findOne({
    purpose: PURPOSE,
    channel: CHANNEL,
    target,
  }).select("+otpHash +expiresAt");

  const mockMode = useMockEmailOtp();
  const mockOtp = getMockOtp();
  let otpValid = false;

  if (mockMode && code === mockOtp) {
    otpValid = true;
  } else if (session?.otpHash && session?.expiresAt && session.expiresAt > new Date()) {
    otpValid = hashOtp(target, code) === session.otpHash;
  }

  if (!otpValid) {
    if (session) {
      session.failedAttempts = (session.failedAttempts || 0) + 1;
      await session.save();
      if (session.failedAttempts >= OTP_MAX_FAILED_ATTEMPTS()) {
        await OtpVerification.deleteOne({ _id: session._id });
      }
    }
    otpAuditLog("customer_email_otp_verify_failed", {
      target: maskEmail(target),
      ipAddress,
    });
    const error = new Error("Invalid or expired OTP");
    error.statusCode = 400;
    throw error;
  }

  await OtpVerification.deleteOne({ _id: session._id });

  customer.isVerified = true;
  customer.lastLogin = new Date();
  await customer.save();

  otpAuditLog("customer_email_otp_verify_success", {
    target: maskEmail(target),
    ipAddress,
  });

  return customer;
}
