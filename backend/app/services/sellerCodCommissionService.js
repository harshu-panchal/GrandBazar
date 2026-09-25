import mongoose from "mongoose";
import crypto from "crypto";
import axios from "axios";
import SellerCodCommissionPayment from "../models/sellerCodCommissionPayment.js";
import Wallet from "../models/wallet.js";
import Order from "../models/order.js";
import Transaction from "../models/transaction.js";
import {
  PAYMENT_GATEWAY,
  PAYMENT_STATUS,
  canTransitionPaymentStatus,
} from "../constants/payment.js";
import {
  OWNER_TYPE,
  LEDGER_TRANSACTION_TYPE,
  LEDGER_DIRECTION,
} from "../constants/finance.js";
import { getOrCreateWallet, updateCodCommissionDue, creditWallet } from "./finance/walletService.js";
import { createLedgerEntry } from "./finance/ledgerService.js";
import { roundCurrency } from "../utils/money.js";

const MAX_MERCHANT_ORDER_ID_LENGTH = 63;
const COMMISSION_MERCHANT_PREFIX = "COM-";

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

function sanitizePart(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

function buildCommissionMerchantOrderId(sellerId, attemptCount = 1) {
  const suffix = `-A${Math.max(1, Number(attemptCount) || 1)}`;
  const base = `${COMMISSION_MERCHANT_PREFIX}${sanitizePart(sellerId)}`;
  const maxBaseLength = MAX_MERCHANT_ORDER_ID_LENGTH - suffix.length;
  return `${base.slice(0, Math.max(8, maxBaseLength))}${suffix}`;
}

function mapPhonePeStatusToInternal(state) {
  const normalized = String(state || "").toUpperCase();
  if (normalized === "COMPLETED" || normalized === "SUCCESS" || normalized === "PAYMENT_SUCCESS") {
    return PAYMENT_STATUS.CAPTURED;
  }
  if (normalized === "FAILED" || normalized === "PAYMENT_ERROR") return PAYMENT_STATUS.FAILED;
  if (normalized === "CANCELLED" || normalized === "CANCELED") return PAYMENT_STATUS.CANCELLED;
  return PAYMENT_STATUS.PENDING;
}

export async function getSellerCodCommissionSummary(sellerId) {
  const wallet = await getOrCreateWallet(OWNER_TYPE.SELLER, sellerId);
  const codCommissionDue = roundCurrency(wallet.codCommissionDue || 0);

  // Find recent orders that incurred COD platform commission
  const orders = await Order.find({
    seller: sellerId,
    paymentMode: "COD",
    status: { $ne: "cancelled" },
    orderStatus: { $ne: "cancelled" },
    "financeFlags.codMarkedCollected": true,
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("orderId shortOrderId createdAt paymentBreakdown status orderStatus")
    .lean();

  // Find payment history
  const paymentHistory = await SellerCodCommissionPayment.find({ seller: sellerId })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  return {
    codCommissionDue,
    availableBalance: roundCurrency(wallet.availableBalance || 0),
    orders: orders.map((o) => ({
      orderId: o.orderId,
      shortOrderId: o.shortOrderId,
      createdAt: o.createdAt,
      totalCashCollected: roundCurrency(o.paymentBreakdown?.codCollectedAmount || o.paymentBreakdown?.grandTotal || 0),
      commissionAmount: roundCurrency(o.paymentBreakdown?.platformTotalEarning ?? o.paymentBreakdown?.adminProductCommissionTotal ?? 0),
      codCommissionDue: roundCurrency(o.paymentBreakdown?.codCommissionDue || 0),
    })),
    paymentHistory,
  };
}

export async function createSellerCodCommissionCheckout({ sellerId, amount }) {
  const wallet = await getOrCreateWallet(OWNER_TYPE.SELLER, sellerId);
  const currentDue = roundCurrency(wallet.codCommissionDue || 0);

  if (currentDue <= 0) {
    const err = new Error("No pending COD commission due to pay");
    err.statusCode = 400;
    throw err;
  }

  const payAmount = roundCurrency(amount ? Math.min(amount, currentDue) : currentDue);
  if (payAmount <= 0) {
    const err = new Error("Invalid payment amount");
    err.statusCode = 400;
    throw err;
  }

  const amountPaise = Math.round(payAmount * 100);

  // Check if an existing open payment session exists for this amount
  const existingOpen = await SellerCodCommissionPayment.findOne({
    seller: sellerId,
    status: { $in: [PAYMENT_STATUS.CREATED, PAYMENT_STATUS.PENDING] },
  }).sort({ createdAt: -1 });

  if (existingOpen?.rawGatewayResponse?.redirectUrl && existingOpen.amount === payAmount) {
    return {
      payment: existingOpen,
      redirectUrl: existingOpen.rawGatewayResponse.redirectUrl,
      duplicate: true,
    };
  }

  const attemptCount = (await SellerCodCommissionPayment.countDocuments({ seller: sellerId })) + 1;
  const merchantOrderId = buildCommissionMerchantOrderId(sellerId, attemptCount);

  let redirectUrlResult = null;
  let config;
  try {
    config = getPhonePeConfig();
  } catch (err) {
    // If PhonePe credentials are missing in local dev, provide dev mock response
    const mockPayment = await SellerCodCommissionPayment.create({
      seller: sellerId,
      gatewayName: PAYMENT_GATEWAY.PHONEPE,
      gatewayOrderId: merchantOrderId,
      amount: payAmount,
      currency: "INR",
      status: PAYMENT_STATUS.PENDING,
      rawGatewayResponse: {
        mock: true,
        redirectUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/seller/cod-commission-status?merchantOrderId=${merchantOrderId}`,
      },
    });
    return {
      payment: mockPayment,
      redirectUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/seller/cod-commission-status?merchantOrderId=${merchantOrderId}`,
      duplicate: false,
    };
  }

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const redirectUrl = `${frontendUrl}/seller/cod-commission-status?merchantOrderId=${merchantOrderId}`;

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
    if (!redirectUrlResult) throw new Error("No redirect url returned by PhonePe");
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    const error = new Error(`PhonePe Payment Initiation Failed: ${detail}`);
    error.statusCode = 502;
    throw error;
  }

  const payment = await SellerCodCommissionPayment.create({
    seller: sellerId,
    gatewayName: PAYMENT_GATEWAY.PHONEPE,
    gatewayOrderId: merchantOrderId,
    amount: payAmount,
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

export async function verifySellerCodCommissionPayment({ merchantOrderId, sellerId }) {
  const payment = await SellerCodCommissionPayment.findOne({ gatewayOrderId: merchantOrderId });
  if (!payment) {
    const err = new Error("Seller commission payment record not found");
    err.statusCode = 404;
    throw err;
  }

  if (sellerId && String(payment.seller) !== String(sellerId)) {
    const err = new Error("Not authorized to verify this payment");
    err.statusCode = 403;
    throw err;
  }

  if (payment.status === PAYMENT_STATUS.CAPTURED) {
    return { payment, status: payment.status, alreadyCaptured: true };
  }

  let nextStatus = PAYMENT_STATUS.PENDING;
  let responseData = null;

  try {
    const config = getPhonePeConfig();
    const endpoint = `/pg/v1/status/${config.merchantId}/${merchantOrderId}`;
    const signString = endpoint + config.clientSecret;
    const checksum = crypto.createHash("sha256").update(signString).digest("hex") + "###" + config.clientVersion;

    const apiRes = await axios.get(`${config.baseUrl}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": checksum,
        "X-MERCHANT-ID": config.merchantId,
      },
    });
    responseData = apiRes.data || {};
    nextStatus = mapPhonePeStatusToInternal(responseData?.code || responseData?.data?.state || "PENDING");
  } catch (err) {
    responseData = err.response?.data || { error: err.message };
    // If in dev environment and mock payment was initiated
    if (payment.rawGatewayResponse?.mock) {
      nextStatus = PAYMENT_STATUS.CAPTURED;
    }
  }

  if (canTransitionPaymentStatus(payment.status, nextStatus) || nextStatus === PAYMENT_STATUS.CAPTURED) {
    payment.status = nextStatus;
    payment.rawGatewayResponse = {
      ...(payment.rawGatewayResponse || {}),
      ...responseData,
    };
    if (responseData?.data?.transactionId) {
      payment.gatewayPaymentId = responseData.data.transactionId;
    }
    if (nextStatus === PAYMENT_STATUS.CAPTURED) {
      payment.capturedAt = new Date();
    } else if (nextStatus === PAYMENT_STATUS.FAILED || nextStatus === PAYMENT_STATUS.CANCELLED) {
      payment.failedAt = new Date();
    }
    await payment.save();
  }

  if (payment.status === PAYMENT_STATUS.CAPTURED) {
    await handleCommissionPaymentCaptured(payment);
  }

  return {
    payment,
    status: payment.status,
  };
}

async function handleCommissionPaymentCaptured(payment) {
  if (payment.ordersReconciled && payment.ordersReconciled.length > 0) {
    return payment;
  }

  const sellerId = payment.seller;
  const paidAmount = roundCurrency(payment.amount);

  // 1. Decrement seller's codCommissionDue liability
  await updateCodCommissionDue({
    ownerType: OWNER_TYPE.SELLER,
    ownerId: sellerId,
    deltaAmount: -paidAmount,
  });

  // 2. Credit Admin Wallet with received commission
  await creditWallet({
    ownerType: OWNER_TYPE.ADMIN,
    ownerId: null,
    amount: paidAmount,
    bucket: "available",
  });

  // 3. Create Ledger Entries
  const sellerWallet = await getOrCreateWallet(OWNER_TYPE.SELLER, sellerId);
  await createLedgerEntry({
    walletId: sellerWallet._id,
    actorType: OWNER_TYPE.SELLER,
    actorId: sellerId,
    type: LEDGER_TRANSACTION_TYPE.SELLER_COD_COMMISSION_REMITTED,
    direction: LEDGER_DIRECTION.DEBIT,
    amount: paidAmount,
    paymentMode: "ONLINE",
    metadata: {
      description: `COD commission payment of ₹${paidAmount} settled online via PhonePe`,
      gatewayOrderId: payment.gatewayOrderId,
      gatewayPaymentId: payment.gatewayPaymentId,
    },
  });

  // 4. Update orders reconciled
  const orders = await Order.find({
    seller: sellerId,
    paymentMode: "COD",
    "paymentBreakdown.codCommissionDue": { $gt: 0 },
  }).sort({ createdAt: 1 });

  let remaining = paidAmount;
  const settledOrders = [];

  for (const order of orders) {
    if (remaining <= 0) break;
    const due = roundCurrency(order.paymentBreakdown?.codCommissionDue || 0);
    const settle = Math.min(due, remaining);
    const newDue = Math.max(0, roundCurrency(due - settle));

    await Order.findByIdAndUpdate(order._id, {
      $set: { "paymentBreakdown.codCommissionDue": newDue },
    });

    remaining = roundCurrency(remaining - settle);
    settledOrders.push({
      orderId: order.orderId,
      amount: settle,
    });
  }

  payment.ordersReconciled = settledOrders;
  await payment.save();

  // 5. Create Transaction record for seller dashboard visibility
  await Transaction.create({
    user: sellerId,
    userModel: "Seller",
    type: "Settlement",
    amount: paidAmount,
    status: "Settled",
    reference: `REMIT-${payment.gatewayOrderId}`,
    notes: `Remitted COD commission ₹${paidAmount} to platform`,
  });

  return payment;
}

export async function adminReconcileSellerCommission({ sellerId, amount, notes = "", actorId = null }) {
  const numAmount = roundCurrency(Number(amount));
  if (numAmount <= 0) {
    const err = new Error("Invalid remittance amount");
    err.statusCode = 400;
    throw err;
  }

  const wallet = await getOrCreateWallet(OWNER_TYPE.SELLER, sellerId);
  const currentDue = roundCurrency(wallet.codCommissionDue || 0);

  const settleAmount = Math.min(numAmount, currentDue);
  if (settleAmount <= 0) {
    const err = new Error("No pending COD commission due to reconcile");
    err.statusCode = 400;
    throw err;
  }

  // 1. Decrement codCommissionDue
  await updateCodCommissionDue({
    ownerType: OWNER_TYPE.SELLER,
    ownerId: sellerId,
    deltaAmount: -settleAmount,
  });

  // 2. Credit Admin Wallet
  await creditWallet({
    ownerType: OWNER_TYPE.ADMIN,
    ownerId: null,
    amount: settleAmount,
    bucket: "available",
  });

  // 3. Record in SellerCodCommissionPayment
  const payment = await SellerCodCommissionPayment.create({
    seller: sellerId,
    amount: settleAmount,
    paymentMethod: "MANUAL_ADMIN_RECONCILIATION",
    gatewayOrderId: `MANUAL-${sanitizePart(sellerId)}-${Date.now()}`,
    status: PAYMENT_STATUS.CAPTURED,
    capturedAt: new Date(),
    notes: notes || "Reconciled manually by admin",
  });

  // 4. Create Ledger Entry
  await createLedgerEntry({
    walletId: wallet._id,
    actorType: OWNER_TYPE.SELLER,
    actorId: sellerId,
    type: LEDGER_TRANSACTION_TYPE.SELLER_COD_COMMISSION_REMITTED,
    direction: LEDGER_DIRECTION.DEBIT,
    amount: settleAmount,
    paymentMode: "COD",
    metadata: {
      description: `Manual admin cash reconciliation: ₹${settleAmount} COD commission settled`,
      reconciledBy: actorId,
      notes,
    },
  });

  // 5. Update order breakdown
  const orders = await Order.find({
    seller: sellerId,
    paymentMode: "COD",
    "paymentBreakdown.codCommissionDue": { $gt: 0 },
  }).sort({ createdAt: 1 });

  let remaining = settleAmount;
  const settledOrders = [];

  for (const order of orders) {
    if (remaining <= 0) break;
    const due = roundCurrency(order.paymentBreakdown?.codCommissionDue || 0);
    const settle = Math.min(due, remaining);
    const newDue = Math.max(0, roundCurrency(due - settle));

    await Order.findByIdAndUpdate(order._id, {
      $set: { "paymentBreakdown.codCommissionDue": newDue },
    });

    remaining = roundCurrency(remaining - settle);
    settledOrders.push({
      orderId: order.orderId,
      amount: settle,
    });
  }

  payment.ordersReconciled = settledOrders;
  await payment.save();

  return {
    success: true,
    reconciledAmount: settleAmount,
    remainingDue: roundCurrency(currentDue - settleAmount),
    payment,
  };
}
