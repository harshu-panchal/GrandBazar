import crypto from "crypto";
import axios from "axios";
import SellerSubscriptionPayment from "../models/sellerSubscriptionPayment.js";
import SubscriptionPlan from "../models/subscriptionPlan.js";
import {
  PAYMENT_REQUEST_TYPE,
} from "../constants/subscription.js";
import {
  PAYMENT_GATEWAY,
  PAYMENT_STATUS,
  canTransitionPaymentStatus,
} from "../constants/payment.js";
import {
  activateSubscriptionFromPhonePePayment,
  getActiveSubscriptionForSeller,
  resolveSubscriptionRequestType,
} from "./subscriptionService.js";
import { BUSINESS_MODEL } from "./sellerBusinessModelService.js";
import Seller from "../models/seller.js";

const MAX_MERCHANT_ORDER_ID_LENGTH = 63;
const SUBSCRIPTION_MERCHANT_PREFIX = "SUB-";

function getPhonePeConfig() {
  const merchantId = String(process.env.PHONEPE_MERCHANT_ID || process.env.PHONEPE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.PHONEPE_CLIENT_SECRET || "").trim();
  const clientVersion = parseInt(process.env.PHONEPE_CLIENT_VERSION || "1", 10);
  const isProd = String(process.env.PHONEPE_ENV || "").toUpperCase() === "PRODUCTION";

  if (!merchantId || !clientSecret) {
    throw new Error("PhonePe credentials not configured");
  }

  const baseUrl = isProd
    ? "https://api.phonepe.com/apis/hermes"
    : "https://api-preprod.phonepe.com/apis/pg-sandbox";

  return {
    merchantId,
    clientSecret,
    clientVersion,
    baseUrl,
    clientId: String(process.env.PHONEPE_CLIENT_ID || merchantId).trim(),
  };
}

export function isSubscriptionMerchantOrderId(merchantOrderId) {
  return String(merchantOrderId || "")
    .toUpperCase()
    .startsWith(SUBSCRIPTION_MERCHANT_PREFIX);
}

function sanitizePart(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

function buildSubscriptionMerchantOrderId(sellerId, planId, attemptCount = 1) {
  const suffix = `-A${Math.max(1, Number(attemptCount) || 1)}`;
  const base = `${SUBSCRIPTION_MERCHANT_PREFIX}${sanitizePart(sellerId)}-${sanitizePart(planId)}`;
  const maxBaseLength = MAX_MERCHANT_ORDER_ID_LENGTH - suffix.length;
  return `${base.slice(0, Math.max(8, maxBaseLength))}${suffix}`;
}

function mapPhonePeStatusToInternal(state) {
  const normalized = String(state || "").toUpperCase();
  if (normalized === "COMPLETED" || normalized === "SUCCESS") return PAYMENT_STATUS.CAPTURED;
  if (normalized === "FAILED") return PAYMENT_STATUS.FAILED;
  if (normalized === "CANCELLED" || normalized === "CANCELED") return PAYMENT_STATUS.CANCELLED;
  if (normalized === "PENDING") return PAYMENT_STATUS.PENDING;
  return PAYMENT_STATUS.PENDING;
}

async function transitionSubscriptionPaymentState(payment, { nextStatus, gatewayPaymentId, rawGatewayResponse }) {
  const currentStatus = payment.status || PAYMENT_STATUS.CREATED;
  if (!canTransitionPaymentStatus(currentStatus, nextStatus) && currentStatus !== nextStatus) {
    return payment;
  }

  payment.status = nextStatus;
  if (gatewayPaymentId) payment.gatewayPaymentId = gatewayPaymentId;
  if (rawGatewayResponse) {
    payment.rawGatewayResponse = {
      ...(payment.rawGatewayResponse || {}),
      ...rawGatewayResponse,
    };
  }
  if (nextStatus === PAYMENT_STATUS.CAPTURED) {
    payment.capturedAt = new Date();
  }
  if (nextStatus === PAYMENT_STATUS.FAILED || nextStatus === PAYMENT_STATUS.CANCELLED) {
    payment.failedAt = new Date();
  }
  await payment.save();
  return payment;
}

async function handleSubscriptionPaymentCaptured(payment) {
  if (payment.subscriptionId) {
    return payment;
  }

  const result = await activateSubscriptionFromPhonePePayment({
    sellerId: payment.sellerId,
    planId: payment.planId,
    requestType: payment.requestType,
    gatewayOrderId: payment.gatewayOrderId,
    amount: payment.planSnapshot?.price || payment.amount / 100,
  });

  payment.subscriptionId = result.subscription?._id;
  payment.paymentRequestId = result.request?._id;
  await payment.save();
  return payment;
}

export async function createSubscriptionPhonePeCheckout({
  sellerId,
  planId,
  requestType = PAYMENT_REQUEST_TYPE.NEW,
}) {
  const plan = await SubscriptionPlan.findOne({ _id: planId, isActive: true }).lean();
  if (!plan) {
    const err = new Error("Subscription plan not found or inactive");
    err.statusCode = 404;
    throw err;
  }

  const amountPaise = Math.round(Number(plan.price) * 100);
  if (!Number.isFinite(amountPaise) || amountPaise < 100) {
    const err = new Error("Invalid plan price for payment");
    err.statusCode = 400;
    throw err;
  }

  const active = await getActiveSubscriptionForSeller(sellerId);
  let resolvedType = resolveSubscriptionRequestType({
    activeSubscription: active,
    selectedPlan: plan,
    explicitType: requestType,
  });

  const existingOpen = await SellerSubscriptionPayment.findOne({
    sellerId,
    status: { $in: [PAYMENT_STATUS.CREATED, PAYMENT_STATUS.PENDING] },
  }).sort({ createdAt: -1 });

  if (existingOpen?.rawGatewayResponse?.redirectUrl) {
    return {
      payment: existingOpen,
      redirectUrl: existingOpen.rawGatewayResponse.redirectUrl,
      duplicate: true,
    };
  }

  // Reserve a unique merchantOrderId via the DB's unique index BEFORE calling
  // PhonePe. PhonePe rejects a second pay() call for an already-used
  // merchantOrderId outright ("Duplicate merchantOrderId") rather than
  // returning the first call's response, so the race has to be closed here —
  // two concurrent requests reading the same countDocuments() value must not
  // both be able to call PhonePe with the same id. The unique index makes
  // exactly one of them win the insert; the loser retries with the next count.
  let payment = null;
  let attemptCount = await SellerSubscriptionPayment.countDocuments({ sellerId, planId }) + 1;
  const MAX_RESERVE_ATTEMPTS = 5;
  for (let i = 0; i < MAX_RESERVE_ATTEMPTS && !payment; i += 1) {
    const candidateOrderId = buildSubscriptionMerchantOrderId(sellerId, planId, attemptCount);
    try {
      payment = await SellerSubscriptionPayment.create({
        sellerId,
        planId: plan._id,
        requestType: resolvedType,
        gatewayName: PAYMENT_GATEWAY.PHONEPE,
        gatewayOrderId: candidateOrderId,
        amount: amountPaise,
        currency: "INR",
        status: PAYMENT_STATUS.CREATED,
        planSnapshot: {
          name: plan.name,
          shopCount: plan.shopCount,
          productCountPerShop: plan.productCountPerShop,
          durationDays: plan.durationDays,
          price: plan.price,
        },
      });
    } catch (error) {
      if (error?.code === 11000 && String(error?.message || "").includes("gatewayOrderId")) {
        attemptCount += 1;
        continue;
      }
      throw error;
    }
  }
  if (!payment) {
    const err = new Error("Could not reserve a unique subscription payment order id");
    err.statusCode = 409;
    throw err;
  }

  const merchantOrderId = payment.gatewayOrderId;
  const config = getPhonePeConfig();
  const redirectUrl = `${process.env.FRONTEND_URL}/seller/subscription/payment-status?merchantOrderId=${merchantOrderId}`;

  const payload = {
    merchantId: config.merchantId,
    merchantTransactionId: merchantOrderId,
    merchantUserId: String(sellerId),
    amount: amountPaise,
    redirectUrl: redirectUrl,
    redirectMode: "REDIRECT",
    paymentInstrument: {
      type: "PAY_PAGE",
    },
  };

  const payloadString = Buffer.from(JSON.stringify(payload)).toString("base64");
  const signString = payloadString + "/pg/v1/pay" + config.clientSecret;
  const checksum = crypto.createHash("sha256").update(signString).digest("hex") + "###" + config.clientVersion;

  let redirectUrlResult = null;
  try {
    const apiRes = await axios.post(
      `${config.baseUrl}/pg/v1/pay`,
      { request: payloadString },
      {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": checksum,
        },
      }
    );
    redirectUrlResult = apiRes.data?.data?.instrumentResponse?.redirectInfo?.url;
    if (!redirectUrlResult) {
      throw new Error(apiRes.data?.message || "No redirect url in PhonePe response");
    }
  } catch (error) {
    payment.status = PAYMENT_STATUS.FAILED;
    payment.failedAt = new Date();
    payment.failureReason = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    await payment.save();
    const detail = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    const err = new Error(`PhonePe pay request failed: ${detail}`);
    err.statusCode = 502;
    throw err;
  }

  payment.status = PAYMENT_STATUS.PENDING;
  payment.rawGatewayResponse = {
    redirectUrl: redirectUrlResult,
    merchantOrderId,
    amount: amountPaise,
  };
  await payment.save();

  await Seller.findByIdAndUpdate(sellerId, {
    businessModel: BUSINESS_MODEL.SUBSCRIPTION,
    businessModelChosenAt: new Date(),
  });

  return {
    payment,
    redirectUrl: redirectUrlResult,
    duplicate: false,
  };
}

export async function verifySubscriptionPhonePePayment({
  merchantOrderId,
  sellerId,
}) {
  const payment = await SellerSubscriptionPayment.findOne({ gatewayOrderId: merchantOrderId });
  if (!payment) {
    const err = new Error("Subscription payment not found");
    err.statusCode = 404;
    throw err;
  }

  if (sellerId && String(payment.sellerId) !== String(sellerId)) {
    const err = new Error("Not authorized to verify this payment");
    err.statusCode = 403;
    throw err;
  }

  if (payment.status === PAYMENT_STATUS.CAPTURED) {
    return { payment, status: payment.status, alreadyCaptured: true };
  }

  const config = getPhonePeConfig();
  const endpoint = `/pg/v1/status/${config.merchantId}/${merchantOrderId}`;
  const signString = endpoint + config.clientSecret;
  const checksum = crypto.createHash("sha256").update(signString).digest("hex") + "###" + config.clientVersion;

  let responseData = null;
  try {
    const apiRes = await axios.get(
      `${config.baseUrl}${endpoint}`,
      {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": checksum,
          "X-MERCHANT-ID": config.merchantId,
        },
      }
    );
    responseData = apiRes.data || {};
  } catch (err) {
    responseData = err.response?.data || {};
  }

  const responseState = responseData?.data?.state || responseData?.code || "PENDING";
  const nextStatus = mapPhonePeStatusToInternal(responseState);

  await transitionSubscriptionPaymentState(payment, {
    nextStatus,
    gatewayPaymentId: responseData?.data?.transactionId,
    rawGatewayResponse: responseData,
  });

  if (nextStatus === PAYMENT_STATUS.CAPTURED) {
    await handleSubscriptionPaymentCaptured(payment);
  }

  return { payment, status: nextStatus };
}

export async function processSubscriptionPhonePeWebhook({ payload, correlationId = null }) {
  const merchantOrderId = payload.merchantOrderId;
  if (!isSubscriptionMerchantOrderId(merchantOrderId)) {
    return { accepted: false, ignored: true };
  }

  const payment = await SellerSubscriptionPayment.findOne({ gatewayOrderId: merchantOrderId });
  if (!payment) {
    return { accepted: true, ignored: true, reason: "Subscription payment not found" };
  }

  const nextStatus = mapPhonePeStatusToInternal(payload.state);
  await transitionSubscriptionPaymentState(payment, {
    nextStatus,
    gatewayPaymentId: payload.transactionId,
    rawGatewayResponse: payload,
  });

  if (nextStatus === PAYMENT_STATUS.CAPTURED) {
    await handleSubscriptionPaymentCaptured(payment);
  }

  return {
    accepted: true,
    duplicate: false,
    paymentStatus: nextStatus,
    merchantOrderId,
    correlationId,
  };
}
