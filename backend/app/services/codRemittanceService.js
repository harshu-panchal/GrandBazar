import mongoose from "mongoose";
// PhonePe SDK removed due to class-transformer crash
import DeliveryCodRemittance from "../models/deliveryCodRemittance.js";
import Order from "../models/order.js";
import {
  PAYMENT_GATEWAY,
  PAYMENT_STATUS,
  canTransitionPaymentStatus,
} from "../constants/payment.js";
import { reconcileCodCash } from "./finance/orderFinanceService.js";
import { roundCurrency } from "../utils/money.js";

const MAX_MERCHANT_ORDER_ID_LENGTH = 63;
const COD_MERCHANT_PREFIX = "COD-";

import crypto from "crypto";
import axios from "axios";

// Manual HTTP setup for PhonePe to bypass broken pg-sdk-node plainToClass crash
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

  return { merchantId, clientSecret, clientVersion, baseUrl, clientId: String(process.env.PHONEPE_CLIENT_ID || merchantId).trim() };
}

export function isCodRemittanceMerchantOrderId(merchantOrderId) {
  return String(merchantOrderId || "")
    .toUpperCase()
    .startsWith(COD_MERCHANT_PREFIX);
}

function sanitizePart(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

function buildCodRemittanceMerchantOrderId(deliveryBoyId, attemptCount = 1) {
  const suffix = `-A${Math.max(1, Number(attemptCount) || 1)}`;
  const base = `${COD_MERCHANT_PREFIX}${sanitizePart(deliveryBoyId)}`;
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

async function transitionRemittancePaymentState(payment, { nextStatus, gatewayPaymentId, rawGatewayResponse }) {
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

async function handleRemittancePaymentCaptured(payment) {
  if (payment.ordersReconciled && payment.ordersReconciled.length > 0) {
    return payment; // Already reconciled
  }

  const deliveryBoyId = payment.deliveryBoy;
  const orders = await Order.find({
    deliveryBoy: deliveryBoyId,
    paymentMode: "COD",
    status: { $ne: "cancelled" },
    orderStatus: { $ne: "cancelled" },
    "financeFlags.codMarkedCollected": true,
    "paymentBreakdown.codPendingAmount": { $gt: 0 },
  })
    .select("orderId paymentBreakdown.codPendingAmount")
    .sort({ createdAt: 1 })
    .lean();

  let remaining = payment.amount;
  const settledOrders = [];

  for (const order of orders) {
    const amount = roundCurrency(order?.paymentBreakdown?.codPendingAmount || 0);
    if (amount <= 0 || remaining <= 0) continue;
    
    // We only deduct as much as was paid
    const settleAmount = roundCurrency(Math.min(amount, remaining));

    await reconcileCodCash(
      order._id,
      settleAmount,
      deliveryBoyId,
      {
        actorId: null,
        metadata: {
          source: "phonepe_cod_remittance",
          gatewayOrderId: payment.gatewayOrderId,
        },
      },
    );

    remaining = roundCurrency(remaining - settleAmount);
    settledOrders.push({
      orderId: order.orderId,
      amount: settleAmount,
    });
  }

  payment.ordersReconciled = settledOrders;
  await payment.save();
  return payment;
}

export async function createCodRemittanceCheckout({ deliveryBoyId, amount }) {
  if (!amount || amount <= 0) {
    const err = new Error("Invalid remittance amount");
    err.statusCode = 400;
    throw err;
  }

  const amountPaise = Math.round(Number(amount) * 100);

  const existingOpen = await DeliveryCodRemittance.findOne({
    deliveryBoy: deliveryBoyId,
    status: { $in: [PAYMENT_STATUS.CREATED, PAYMENT_STATUS.PENDING] },
  }).sort({ createdAt: -1 });

  if (existingOpen?.rawGatewayResponse?.redirectUrl && existingOpen.amount === amount) {
    return {
      payment: existingOpen,
      redirectUrl: existingOpen.rawGatewayResponse.redirectUrl,
      duplicate: true,
    };
  }

  const attemptCount = (await DeliveryCodRemittance.countDocuments({ deliveryBoy: deliveryBoyId })) + 1;
  const merchantOrderId = buildCodRemittanceMerchantOrderId(deliveryBoyId, attemptCount);

  const config = getPhonePeConfig();
  const redirectUrl = `${process.env.FRONTEND_URL}/delivery/cod-payment-status?merchantOrderId=${merchantOrderId}`;

  const payload = {
    merchantId: config.merchantId,
    merchantTransactionId: merchantOrderId,
    merchantUserId: String(deliveryBoyId),
    amount: amountPaise,
    redirectUrl: redirectUrl,
    redirectMode: "REDIRECT",
    paymentInstrument: {
      type: "PAY_PAGE"
    }
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
    if (!redirectUrlResult) throw new Error("No redirect url in response");
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    const error = new Error(detail);
    error.statusCode = 502;
    throw error;
  }

  const payment = await DeliveryCodRemittance.create({
    deliveryBoy: deliveryBoyId,
    gatewayName: PAYMENT_GATEWAY.PHONEPE,
    gatewayOrderId: merchantOrderId,
    amount: amount,
    currency: "INR",
    status: PAYMENT_STATUS.PENDING,
    rawGatewayResponse: {
      redirectUrl: redirectUrlResult,
      merchantOrderId,
      amount: amountPaise,
    },
  });

  return {
    payment,
    redirectUrl: redirectUrlResult,
    duplicate: false,
  };
}

export async function verifyCodRemittancePhonePePayment({ merchantOrderId, deliveryBoyId }) {
  const payment = await DeliveryCodRemittance.findOne({ gatewayOrderId: merchantOrderId });
  if (!payment) {
    const err = new Error("COD remittance payment not found");
    err.statusCode = 404;
    throw err;
  }

  if (deliveryBoyId && String(payment.deliveryBoy) !== String(deliveryBoyId)) {
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

  const nextStatus = mapPhonePeStatusToInternal(responseData?.code || responseData?.data?.state || "PENDING");

  await transitionRemittancePaymentState(payment, {
    nextStatus,
    gatewayPaymentId: responseData?.data?.transactionId,
    rawGatewayResponse: responseData,
  });

  if (nextStatus === PAYMENT_STATUS.CAPTURED) {
    await handleRemittancePaymentCaptured(payment);
  }

  return { payment, status: nextStatus };
}

export async function processCodRemittancePhonePeWebhook({ payload, correlationId = null }) {
  const merchantOrderId = payload.merchantOrderId;
  if (!isCodRemittanceMerchantOrderId(merchantOrderId)) {
    return { accepted: false, ignored: true };
  }

  const payment = await DeliveryCodRemittance.findOne({ gatewayOrderId: merchantOrderId });
  if (!payment) {
    return { accepted: true, ignored: true, reason: "COD remittance payment not found" };
  }

  const nextStatus = mapPhonePeStatusToInternal(payload.state);
  await transitionRemittancePaymentState(payment, {
    nextStatus,
    gatewayPaymentId: payload.transactionId,
    rawGatewayResponse: payload,
  });

  if (nextStatus === PAYMENT_STATUS.CAPTURED) {
    await handleRemittancePaymentCaptured(payment);
  }

  return {
    accepted: true,
    duplicate: false,
    paymentStatus: nextStatus,
    merchantOrderId,
    correlationId,
  };
}
