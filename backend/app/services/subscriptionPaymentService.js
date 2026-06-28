import { StandardCheckoutClient, Env, StandardCheckoutPayRequest } from "@phonepe-pg/pg-sdk-node";
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

let phonePeClient = null;

function getPhonePeClient() {
  if (phonePeClient) return phonePeClient;

  const clientId = String(process.env.PHONEPE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.PHONEPE_CLIENT_SECRET || "").trim();
  const clientVersion = parseInt(process.env.PHONEPE_CLIENT_VERSION || "1", 10);
  const isProd = String(process.env.PHONEPE_ENV || "").toUpperCase() === "PRODUCTION";

  if (!clientId || !clientSecret) {
    throw new Error("PhonePe credentials not configured");
  }

  phonePeClient = StandardCheckoutClient.getInstance(
    clientId,
    clientSecret,
    clientVersion,
    isProd ? Env.PRODUCTION : Env.SANDBOX,
  );

  return phonePeClient;
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

  const attemptCount =
    (await SellerSubscriptionPayment.countDocuments({ sellerId, planId })) + 1;
  const merchantOrderId = buildSubscriptionMerchantOrderId(sellerId, planId, attemptCount);

  const client = getPhonePeClient();
  const redirectUrl = `${process.env.FRONTEND_URL}/seller/subscription/payment-status?merchantOrderId=${merchantOrderId}`;

  const request = StandardCheckoutPayRequest.builder()
    .merchantOrderId(merchantOrderId)
    .amount(amountPaise)
    .redirectUrl(redirectUrl)
    .build();

  const response = await client.pay(request);

  const payment = await SellerSubscriptionPayment.create({
    sellerId,
    planId: plan._id,
    requestType: resolvedType,
    gatewayName: PAYMENT_GATEWAY.PHONEPE,
    gatewayOrderId: merchantOrderId,
    amount: amountPaise,
    currency: "INR",
    status: PAYMENT_STATUS.PENDING,
    planSnapshot: {
      name: plan.name,
      shopCount: plan.shopCount,
      productCountPerShop: plan.productCountPerShop,
      durationDays: plan.durationDays,
      price: plan.price,
    },
    rawGatewayResponse: {
      redirectUrl: response.redirectUrl,
      merchantOrderId,
      amount: amountPaise,
    },
  });

  await Seller.findByIdAndUpdate(sellerId, {
    businessModel: BUSINESS_MODEL.SUBSCRIPTION,
    businessModelChosenAt: new Date(),
  });

  return {
    payment,
    redirectUrl: response.redirectUrl,
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

  const client = getPhonePeClient();
  const response = await client.getOrderStatus(merchantOrderId);
  const nextStatus = mapPhonePeStatusToInternal(response.state);

  await transitionSubscriptionPaymentState(payment, {
    nextStatus,
    gatewayPaymentId: response.transactionId,
    rawGatewayResponse: response,
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
