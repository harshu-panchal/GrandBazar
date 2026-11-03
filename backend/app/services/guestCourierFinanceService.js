import mongoose from "mongoose";
import crypto from "crypto";
import Order from "../models/order.js";
import LedgerEntry from "../models/ledgerEntry.js";
import GuestCourierAssignment from "../models/guestCourierAssignment.js";
import GuestCourierCashSettlement from "../models/guestCourierCashSettlement.js";
import { creditWallet } from "./finance/walletService.js";
import { createLedgerEntry } from "./finance/ledgerService.js";
import { OWNER_TYPE, LEDGER_DIRECTION, LEDGER_TRANSACTION_TYPE } from "../constants/finance.js";
import { roundCurrency } from "../utils/money.js";
import { createRazorpayOrder, verifyRazorpaySignature, razorpayCheckoutConfig } from "./razorpay/razorpayCheckoutClient.js";

export async function creditGuestCourierAmountToAdmin(orderOrId, assignment, { isReturn = false } = {}) {
  const order = typeof orderOrId === "object" && orderOrId._id
    ? orderOrId
    : await Order.findById(orderOrId);
  if (!order) throw new Error("Order not found");
  const flag = isReturn ? "guestReturnAdminEarningCredited" : "guestCourierAdminEarningCredited";
  if (order.financeFlags?.[flag]) return null;
  const amount = roundCurrency(isReturn
    ? (Number(order.returnDeliveryCommission) || 30)
    : Number(order.paymentBreakdown?.riderPayoutTotal || 0));
  if (amount <= 0) {
    await Order.updateOne(
      { _id: order._id, [`financeFlags.${flag}`]: { $ne: true } },
      { $set: { [`financeFlags.${flag}`]: true } },
    );
    return null;
  }

  const transactionId = `${isReturn ? "GUEST-RETURN" : "GUEST-DELIVERY"}-ADMIN-${order.orderId}`;
  const session = await mongoose.startSession();
  let result = null;
  try {
    await session.withTransaction(async () => {
      if (await LedgerEntry.exists({ transactionId }).session(session)) {
        await Order.updateOne(
          { _id: order._id },
          { $set: { [`financeFlags.${flag}`]: true } },
          { session },
        );
        return;
      }

      // Claim, credit and ledger are one transaction. Completion callbacks are
      // retryable, so concurrent retries can never credit the admin twice.
      const claimed = await Order.findOneAndUpdate(
        { _id: order._id, [`financeFlags.${flag}`]: { $ne: true } },
        { $set: { [`financeFlags.${flag}`]: true } },
        { new: true, session },
      );
      if (!claimed) return;

      const credited = await creditWallet({ ownerType: OWNER_TYPE.ADMIN, ownerId: null, amount, session });
      await createLedgerEntry({
        transactionId,
        orderId: order._id,
        walletId: credited.wallet._id,
        actorType: OWNER_TYPE.ADMIN,
        actorId: null,
        type: LEDGER_TRANSACTION_TYPE.ADMIN_EARNING_CREDITED,
        direction: LEDGER_DIRECTION.CREDIT,
        amount,
        paymentMode: order.paymentMode,
        balanceBefore: credited.before,
        balanceAfter: credited.after,
        metadata: {
          source: isReturn ? "guest_return_commission_redirect" : "guest_delivery_payout_redirect",
          guestAssignmentId: assignment?._id || assignment,
        },
        description: isReturn
          ? "Guest return-pickup commission redirected to admin"
          : "Guest courier delivery earning redirected to admin",
        reference: order.orderId,
      }, { session });
      result = { amount };
    });
  } finally {
    await session.endSession();
  }
  return result;
}

export async function createGuestCodLiability(order, assignment) {
  if (String(order.paymentMode || "").toUpperCase() !== "COD") return null;
  const gross = roundCurrency(order.paymentBreakdown?.grandTotal || order.pricing?.total || 0);
  const settlement = await GuestCourierCashSettlement.findOneAndUpdate(
    { assignment: assignment._id },
    {
      $setOnInsert: {
        assignment: assignment._id,
        order: order._id,
        orderId: order.orderId,
        courier: assignment.courier,
        grossCollected: gross,
        amountDueToAdmin: gross,
        amountRemitted: 0,
        pendingAmount: gross,
        status: gross > 0 ? "pending" : "settled",
      },
    },
    { upsert: true, new: true },
  );
  await Order.updateOne(
    { _id: order._id },
    {
      $set: {
        paymentStatus: "CASH_COLLECTED",
        "payment.status": "completed",
        "financeFlags.codMarkedCollected": true,
        "financeFlags.riderPayoutQueued": false,
        "settlementStatus.riderPayout": "NOT_APPLICABLE",
        "paymentBreakdown.codGrossCollectedAmount": gross,
        "paymentBreakdown.codRiderCommissionRetained": 0,
        "paymentBreakdown.codCollectedAmount": gross,
        "paymentBreakdown.codPendingAmount": settlement.pendingAmount,
      },
    },
  );
  return settlement;
}

export async function getGuestCodSettlement(assignmentId) {
  return GuestCourierCashSettlement.findOne({ assignment: assignmentId }).lean();
}

export async function initiateGuestCodOnlinePayment(assignment, amount) {
  const settlement = await GuestCourierCashSettlement.findOne({ assignment: assignment._id });
  if (!settlement) throw Object.assign(new Error("No COD cash is pending for this task"), { statusCode: 404 });
  const requested = roundCurrency(amount || settlement.pendingAmount);
  if (requested <= 0 || requested > roundCurrency(settlement.pendingAmount)) {
    throw Object.assign(new Error(`Payment must be between 0.01 and ${settlement.pendingAmount}`), { statusCode: 400 });
  }
  const receipt = `GUEST-COD-${String(assignment._id).slice(-10)}-${Date.now()}`.slice(0, 40);
  const gateway = await createRazorpayOrder({
    amountPaise: Math.round(requested * 100),
    receipt,
    notes: { merchantOrderId: receipt, guestAssignmentId: String(assignment._id), orderId: assignment.orderId },
  });
  settlement.onlinePayment = { gatewayOrderId: gateway.razorpayOrderId, requestedAmount: requested, createdAt: new Date() };
  await settlement.save();
  return { ...gateway, keyId: razorpayCheckoutConfig().keyId, requestedAmount: requested };
}

async function applyRemittance(settlement, { method, amount, reference, gatewayOrderId = null, gatewayPaymentId = null, adminId = null, note = "" }) {
  const normalized = roundCurrency(amount);
  const duplicate = settlement.payments.some((payment) => payment.reference === reference);
  if (duplicate) return settlement;
  if (normalized <= 0 || normalized > roundCurrency(settlement.pendingAmount)) {
    throw Object.assign(new Error("Settlement amount exceeds pending guest COD cash"), { statusCode: 400 });
  }
  settlement.payments.push({ method, amount: normalized, reference, gatewayOrderId, gatewayPaymentId, recordedByAdmin: adminId, note });
  settlement.amountRemitted = roundCurrency(settlement.amountRemitted + normalized);
  settlement.pendingAmount = roundCurrency(settlement.amountDueToAdmin - settlement.amountRemitted);
  settlement.status = settlement.pendingAmount <= 0 ? "settled" : "partially_settled";
  if (settlement.status === "settled") settlement.settledAt = new Date();
  await settlement.save();
  await Order.updateOne(
    { _id: settlement.order },
    {
      $set: {
        "paymentBreakdown.codRemittedAmount": settlement.amountRemitted,
        "paymentBreakdown.codPendingAmount": settlement.pendingAmount,
        paymentStatus: settlement.pendingAmount <= 0 ? "COD_RECONCILED" : "PARTIALLY_REMITTED",
      },
    },
  );
  return settlement;
}

export async function verifyGuestCodOnlinePayment(assignment, payload = {}) {
  const settlement = await GuestCourierCashSettlement.findOne({ assignment: assignment._id });
  if (!settlement) throw Object.assign(new Error("Guest COD settlement not found"), { statusCode: 404 });
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = payload;
  if (razorpayOrderId !== settlement.onlinePayment?.gatewayOrderId) {
    throw Object.assign(new Error("Payment order does not match this guest task"), { statusCode: 400 });
  }
  if (!verifyRazorpaySignature({ orderId: razorpayOrderId, paymentId: razorpayPaymentId, signature: razorpaySignature })) {
    throw Object.assign(new Error("Invalid payment signature"), { statusCode: 400 });
  }
  return applyRemittance(settlement, {
    method: "online",
    amount: settlement.onlinePayment.requestedAmount,
    reference: `GUEST-COD-ONLINE-${razorpayPaymentId}`,
    gatewayOrderId: razorpayOrderId,
    gatewayPaymentId: razorpayPaymentId,
  });
}

export async function recordGuestPhysicalCash({ assignmentId, amount, adminId, note, receiptNumber }) {
  if (!mongoose.Types.ObjectId.isValid(assignmentId)) throw Object.assign(new Error("Invalid guest assignment"), { statusCode: 400 });
  const settlement = await GuestCourierCashSettlement.findOne({ assignment: assignmentId });
  if (!settlement) throw Object.assign(new Error("Guest COD settlement not found"), { statusCode: 404 });
  const reference = String(receiptNumber || `GUEST-CASH-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`).trim();
  return applyRemittance(settlement, { method: "physical_cash", amount, reference, adminId, note: String(note || "") });
}

export async function listGuestCashSettlements({ page = 1, limit = 25 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const [items, total] = await Promise.all([
    GuestCourierCashSettlement.find().populate("assignment", "courier taskType status").sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
    GuestCourierCashSettlement.countDocuments(),
  ]);
  return { items, total, page: safePage, limit: safeLimit, totalPages: Math.max(Math.ceil(total / safeLimit), 1) };
}
