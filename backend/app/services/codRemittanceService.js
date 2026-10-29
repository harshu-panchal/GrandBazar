import mongoose from "mongoose";
import DeliveryCodRemittance from "../models/deliveryCodRemittance.js";
import Order from "../models/order.js";
import Transaction from "../models/transaction.js";
import Wallet from "../models/wallet.js";
import {
  PAYMENT_GATEWAY,
  PAYMENT_STATUS,
  canTransitionPaymentStatus,
} from "../constants/payment.js";
import { reconcileCodCash } from "./finance/orderFinanceService.js";
import { roundCurrency } from "../utils/money.js";
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
  mapRazorpayStatusToInternal,
  razorpayCheckoutConfig,
} from "./razorpay/razorpayCheckoutClient.js";

const MAX_MERCHANT_ORDER_ID_LENGTH = 63;
const COD_MERCHANT_PREFIX = "COD-";

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

async function recordRemittanceSettlement(payment, deliveryBoyId, settledOrders) {
  const reconciledAmount = roundCurrency(
    settledOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0),
  );
  const unappliedAmount = roundCurrency(
    Math.max(Number(payment.amount || 0) - reconciledAmount, 0),
  );
  payment.reconciledAmount = reconciledAmount;
  payment.unappliedAmount = unappliedAmount;
  await payment.save();

  await Transaction.findOneAndUpdate(
    { reference: `COD-REM-${payment._id}` },
    {
      $set: {
        amount: -reconciledAmount,
        status: "Settled",
        meta: {
          source: "razorpay_cod_remittance",
          gatewayOrderId: payment.gatewayOrderId,
          capturedAmount: roundCurrency(payment.amount || 0),
          orders: settledOrders,
          unappliedAmount,
        },
      },
      $setOnInsert: {
        user: deliveryBoyId,
        userModel: "Delivery",
        type: "Cash Settlement",
        reference: `COD-REM-${payment._id}`,
      },
    },
    { upsert: true, new: true },
  );
}

async function handleRemittancePaymentCaptured(payment) {
  if (
    payment.reconciliationCompleted ||
    (payment.ordersReconciled && payment.ordersReconciled.length > 0)
  ) {
    payment.reconciliationCompleted = true;
    await recordRemittanceSettlement(
      payment,
      payment.deliveryBoy,
      payment.ordersReconciled,
    );
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
          source: "razorpay_cod_remittance",
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
  payment.reconciliationCompleted = true;
  await recordRemittanceSettlement(payment, deliveryBoyId, settledOrders);
  return payment;
}

export async function createCodRemittanceCheckout({ deliveryBoyId, amount }) {
  const normalizedAmount = roundCurrency(amount);
  if (!Number.isFinite(Number(amount)) || normalizedAmount <= 0) {
    const err = new Error("Invalid remittance amount");
    err.statusCode = 400;
    throw err;
  }

  const [collectedOrders, wallet] = await Promise.all([
    Order.find({
      deliveryBoy: deliveryBoyId,
      paymentMode: "COD",
      status: { $ne: "cancelled" },
      orderStatus: { $ne: "cancelled" },
      "financeFlags.codMarkedCollected": true,
      "paymentBreakdown.codPendingAmount": { $gt: 0 },
    })
      .select("paymentBreakdown.codPendingAmount")
      .lean(),
    Wallet.findOne({
      ownerType: "DELIVERY_PARTNER",
      ownerId: deliveryBoyId,
    })
      .select("cashInHand")
      .lean(),
  ]);
  const readyToRemit = roundCurrency(
    collectedOrders.reduce(
      (sum, order) => sum + Number(order.paymentBreakdown?.codPendingAmount || 0),
      0,
    ),
  );
  const availableCash = roundCurrency(wallet?.cashInHand || 0);
  const maxRemittance = Math.min(readyToRemit, availableCash);
  if (normalizedAmount > maxRemittance) {
    const err = new Error(
      `Remittance cannot exceed collected COD cash of ${maxRemittance.toFixed(2)}`,
    );
    err.statusCode = 400;
    throw err;
  }

  const amountPaise = Math.round(normalizedAmount * 100);

  const existingOpen = await DeliveryCodRemittance.findOne({
    deliveryBoy: deliveryBoyId,
    status: { $in: [PAYMENT_STATUS.CREATED, PAYMENT_STATUS.PENDING] },
  }).sort({ createdAt: -1 });

  if (existingOpen?.gatewayOrderId && existingOpen.amount === normalizedAmount) {
    return {
      payment: existingOpen,
      razorpayOrderId: existingOpen.gatewayOrderId,
      amount: existingOpen.amount,
      currency: existingOpen.currency,
      keyId: razorpayCheckoutConfig().keyId,
      duplicate: true,
    };
  }

  const attemptCount = (await DeliveryCodRemittance.countDocuments({ deliveryBoy: deliveryBoyId })) + 1;
  const merchantOrderId = buildCodRemittanceMerchantOrderId(deliveryBoyId, attemptCount);

  const razorpayOrder = await createRazorpayOrder({
    amountPaise,
    currency: "INR",
    receipt: merchantOrderId,
    notes: { merchantOrderId, deliveryBoyId: String(deliveryBoyId) },
  });

  const payment = await DeliveryCodRemittance.create({
    deliveryBoy: deliveryBoyId,
    gatewayName: PAYMENT_GATEWAY.RAZORPAY,
    gatewayOrderId: razorpayOrder.razorpayOrderId,
    amount: normalizedAmount,
    currency: "INR",
    status: PAYMENT_STATUS.PENDING,
    rawGatewayResponse: {
      merchantOrderId,
      razorpayOrderId: razorpayOrder.razorpayOrderId,
      amount: normalizedAmount,
    },
  });

  return {
    payment,
    razorpayOrderId: razorpayOrder.razorpayOrderId,
    amount: amountPaise,
    currency: "INR",
    keyId: razorpayCheckoutConfig().keyId,
    duplicate: false,
  };
}

export async function verifyCodRemittanceRazorpayPayment({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  deliveryBoyId,
}) {
  const payment = await DeliveryCodRemittance.findOne({ gatewayOrderId: razorpayOrderId });
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
    await handleRemittancePaymentCaptured(payment);
    return { payment, status: payment.status, alreadyCaptured: true };
  }

  const signatureValid = verifyRazorpaySignature({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
  });
  const nextStatus = signatureValid ? PAYMENT_STATUS.CAPTURED : PAYMENT_STATUS.FAILED;

  await transitionRemittancePaymentState(payment, {
    nextStatus,
    gatewayPaymentId: razorpayPaymentId,
    rawGatewayResponse: { razorpayOrderId, razorpayPaymentId },
  });

  if (nextStatus === PAYMENT_STATUS.CAPTURED) {
    await handleRemittancePaymentCaptured(payment);
  }

  return { payment, status: nextStatus };
}

export async function processCodRemittanceRazorpayWebhook({ payload, correlationId = null }) {
  const merchantOrderId = payload.merchantOrderId;
  if (!isCodRemittanceMerchantOrderId(merchantOrderId)) {
    return { accepted: false, ignored: true };
  }

  const payment = await DeliveryCodRemittance.findOne({ gatewayOrderId: payload.razorpayOrderId });
  if (!payment) {
    return { accepted: true, ignored: true, reason: "COD remittance payment not found" };
  }

  const nextStatus = mapRazorpayStatusToInternal(payload.event || payload.status);
  await transitionRemittancePaymentState(payment, {
    nextStatus,
    gatewayPaymentId: payload.razorpayPaymentId,
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
