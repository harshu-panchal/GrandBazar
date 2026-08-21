import mongoose from "mongoose";
import Order from "../../models/order.js";
import Wallet from "../../models/wallet.js";
import Payout from "../../models/payout.js";
import Transaction from "../../models/transaction.js";
import FinanceAuditLog from "../../models/financeAuditLog.js";
import BulkSettlement from "../../models/bulkSettlement.js";
import {
  PAYOUT_STATUS,
  PAYOUT_TYPE,
  OWNER_TYPE,
  LEDGER_TRANSACTION_TYPE,
  LEDGER_DIRECTION,
} from "../../constants/finance.js";
import { getOrCreateWallet } from "./walletService.js";
import { createLedgerEntry } from "./ledgerService.js";

const roundCurrency = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

function payoutTypeToOwnerType(payoutType) {
  if (payoutType === PAYOUT_TYPE.SELLER) return OWNER_TYPE.SELLER;
  if (payoutType === PAYOUT_TYPE.DELIVERY_PARTNER) return OWNER_TYPE.DELIVERY_PARTNER;
  throw new Error(`Unsupported payout type: ${payoutType}`);
}

async function createFinanceAuditLog(data, { session } = {}) {
  return await FinanceAuditLog.create([data], { session });
}

export async function createPendingPayoutForOrder({
  order,
  payoutType,
  beneficiaryId,
  amount,
  remarks = "Automatic payout creation on delivery.",
  metadata = {},
  isBulkSettlement = false,
  commissionAmount = 0,
  packagingAmount = 0,
  taxAmount = 0,
}) {
  if (!order || !beneficiaryId || amount <= 0) return null;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const existing = await Payout.findOne({
      relatedOrderIds: order._id,
      payoutType,
      status: { $ne: PAYOUT_STATUS.CANCELLED },
    }).session(session);

    if (existing) {
      await session.abortTransaction();
      return existing;
    }

    const ownerType = payoutTypeToOwnerType(payoutType);
    const wallet = await getOrCreateWallet(ownerType, beneficiaryId, { session });

    const payout = await Payout.create(
      [
        {
          payoutType,
          beneficiaryId,
          amount: roundCurrency(amount),
          status: PAYOUT_STATUS.PENDING,
          relatedOrderIds: [order._id],
          remarks,
          isBulkSettlement: Boolean(isBulkSettlement),
          commissionAmount: roundCurrency(commissionAmount || 0),
          packagingAmount: roundCurrency(packagingAmount || 0),
          taxAmount: roundCurrency(taxAmount || 0),
          metadata: {
            ...metadata,
            orderId: order.orderId,
          },
        },
      ],
      { session },
    );

    wallet.pendingBalance = roundCurrency((wallet.pendingBalance || 0) + amount);
    wallet.totalCredited = roundCurrency((wallet.totalCredited || 0) + amount);
    await wallet.save({ session });

    await createLedgerEntry(
      {
        orderId: order._id,
        payoutId: payout[0]._id,
        walletId: wallet._id,
        actorType: ownerType,
        actorId: beneficiaryId,
        // LEDGER_TRANSACTION_TYPE.PAYOUT_QUEUED does not exist (never did —
        // confirmed via runtime lookup) — this silently evaluated to
        // `type: undefined`, which fails LedgerEntry's required-field
        // validation on every single call, throwing inside this function's
        // own transaction and aborting it. Concretely: every seller/rider
        // payout creation on order delivery (settleDeliveredOrder ->
        // createPendingSellerPayout/createPendingRiderPayout -> here) has
        // been throwing, not just failing silently.
        type:
          payoutType === PAYOUT_TYPE.SELLER
            ? LEDGER_TRANSACTION_TYPE.SELLER_PAYOUT_PENDING
            : LEDGER_TRANSACTION_TYPE.RIDER_PAYOUT_PENDING,
        direction: LEDGER_DIRECTION.CREDIT,
        amount: roundCurrency(amount),
        description: `${payoutType} payout queued for order ${order.orderId}`,
      },
      { session },
    );

    // One consolidated record per bulk order — see WS-15 item 247. Only for
    // seller payouts: bulk-order commission/packaging/tax economics are a
    // seller-payout concept, rider payouts never set isBulkSettlement.
    if (isBulkSettlement && payoutType === PAYOUT_TYPE.SELLER) {
      await BulkSettlement.findOneAndUpdate(
        { order: order._id },
        {
          order: order._id,
          orderId: order.orderId,
          payout: payout[0]._id,
          bulkOrderReason: order.bulkOrderReason || order.paymentBreakdown?.bulkOrderReason || null,
          bulkOrderLineIndexes: order.paymentBreakdown?.bulkOrderLineIndexes || [],
          sellerId: beneficiaryId,
          sellerPayoutAmount: roundCurrency(amount),
          commissionAmount: roundCurrency(commissionAmount || 0),
          packagingAmount: roundCurrency(packagingAmount || 0),
          taxAmount: roundCurrency(taxAmount || 0),
          status: "PENDING",
        },
        { upsert: true, session },
      );
    }

    await session.commitTransaction();
    return payout[0];
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function processPayout(payoutId, { remarks = "", adminId = null } = {}) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const payout = await Payout.findById(payoutId).session(session);
    if (!payout) throw new Error("Payout not found.");
    if (payout.status !== PAYOUT_STATUS.PENDING && payout.status !== PAYOUT_STATUS.PROCESSING) {
      throw new Error(`Invalid payout status for processing: ${payout.status}`);
    }

    // A payout's own `status` never reflects an admin hold — that lives on
    // the related order(s) (settlementStatus.sellerPayout / financeFlags),
    // set by holdSellerPayoutController. Without this check "Approve" could
    // pay out a seller payout an admin explicitly put on hold, since the
    // Payout row itself still looks like ordinary PENDING.
    if (payout.payoutType === PAYOUT_TYPE.SELLER && payout.relatedOrderIds?.length) {
      const heldOrder = await Order.findOne({
        _id: { $in: payout.relatedOrderIds },
        $or: [
          { "settlementStatus.sellerPayout": "HOLD" },
          { "financeFlags.manualSettlementHold": true },
        ],
      })
        .select("orderId")
        .session(session)
        .lean();
      if (heldOrder) {
        const err = new Error(
          `Cannot process this payout — order ${heldOrder.orderId} is on settlement hold. Release the hold first.`,
        );
        err.statusCode = 409;
        throw err;
      }
    }

    const ownerType = payoutTypeToOwnerType(payout.payoutType);
    const wallet = await getOrCreateWallet(ownerType, payout.beneficiaryId, { session });

    const amount = roundCurrency(payout.amount);
    if (wallet.pendingBalance < amount) {
      console.warn(`[Payout] Warning: Pending balance (${wallet.pendingBalance}) less than payout (${amount}) for ${ownerType} ${payout.beneficiaryId}`);
    }

    wallet.pendingBalance = roundCurrency(Math.max(0, (wallet.pendingBalance || 0) - amount));
    wallet.availableBalance = roundCurrency((wallet.availableBalance || 0) + amount);
    await wallet.save({ session });

    payout.status = PAYOUT_STATUS.COMPLETED;
    payout.processedAt = new Date();
    payout.remarks = remarks || payout.remarks;
    if (adminId) payout.createdBy = adminId;
    await payout.save({ session });

    for (const orderId of payout.relatedOrderIds) {
      const order = await Order.findById(orderId).session(session);
      if (!order) continue;

      if (payout.payoutType === PAYOUT_TYPE.SELLER) {
        order.settlementStatus = { ...(order.settlementStatus || {}), sellerPayout: "COMPLETED" };
        order.financeFlags = { ...(order.financeFlags || {}), sellerPayoutQueued: true };
      } else if (payout.payoutType === PAYOUT_TYPE.DELIVERY_PARTNER) {
        order.settlementStatus = { ...(order.settlementStatus || {}), riderPayout: "COMPLETED" };
        order.financeFlags = { ...(order.financeFlags || {}), riderPayoutQueued: true };
      }
      await order.save({ session });
    }

    if (payout.isBulkSettlement && payout.payoutType === PAYOUT_TYPE.SELLER) {
      await BulkSettlement.updateOne(
        { payout: payout._id },
        { $set: { status: "COMPLETED", settledAt: new Date() } },
        { session },
      );
    }

    await createFinanceAuditLog(
      {
        action: "PAYOUT_PROCESSED",
        actorType: OWNER_TYPE.ADMIN,
        actorId: adminId || null,
        payoutId: payout._id,
        metadata: {
          payoutType: payout.payoutType,
          beneficiaryId: String(payout.beneficiaryId),
          amount: payout.amount,
        },
      },
      { session },
    );

    await session.commitTransaction();
    return payout;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function queueSellerPayouts({ orderIds = [] } = {}) {
  const query = {
    status: "delivered",
    "settlementStatus.sellerPayout": { $ne: "COMPLETED" },
  };
  if (Array.isArray(orderIds) && orderIds.length > 0) {
    query._id = { $in: orderIds };
  }

  const orders = await Order.find(query).lean();
  const created = [];
  for (const order of orders) {
    const payout = await createPendingPayoutForOrder({
      order,
      payoutType: PAYOUT_TYPE.SELLER,
      beneficiaryId: order.seller,
      amount: order.paymentBreakdown?.sellerPayoutTotal || 0,
      metadata: { trigger: "queueSellerPayouts" },
      isBulkSettlement: Boolean(order.isBulkOrder || order.paymentBreakdown?.isBulkOrder),
      commissionAmount: order.paymentBreakdown?.adminProductCommissionTotal || 0,
      packagingAmount: order.paymentBreakdown?.packagingChargeAmount || 0,
      taxAmount: order.paymentBreakdown?.taxTotal || 0,
    });
    if (payout) created.push(payout);
  }
  return created;
}

export async function queueRiderPayouts({ orderIds = [] } = {}) {
  const query = {
    status: "delivered",
    "settlementStatus.riderPayout": { $ne: "COMPLETED" },
    deliveryBoy: { $ne: null },
  };
  if (Array.isArray(orderIds) && orderIds.length > 0) {
    query._id = { $in: orderIds };
  }

  const orders = await Order.find(query).lean();
  const created = [];
  for (const order of orders) {
    const payout = await createPendingPayoutForOrder({
      order,
      payoutType: PAYOUT_TYPE.DELIVERY_PARTNER,
      beneficiaryId: order.deliveryBoy,
      amount: order.paymentBreakdown?.riderPayoutTotal || 0,
      metadata: { trigger: "queueRiderPayouts" },
    });
    if (payout) created.push(payout);
  }
  return created;
}

/**
 * Cancels a pending/processing payout for an order — or, when `partialAmount`
 * is given and is less than the full payout, reduces it by just that amount
 * instead. Needed because a return can cover only some of an order's items:
 * cancelling the whole payout would over-reverse the seller's earnings for
 * whatever wasn't returned. Returns the payout doc either way — callers can
 * tell full-cancel from partial-reduce via `payout.status`.
 */
export async function cancelPendingPayoutForOrder(orderId, payoutType, { remarks, adminId, session: externalSession, partialAmount } = {}) {
  const session = externalSession || (await mongoose.startSession());
  const managedSession = !externalSession;
  if (managedSession) session.startTransaction();

  try {
    const payout = await Payout.findOne({
      relatedOrderIds: orderId,
      payoutType,
      status: { $in: [PAYOUT_STATUS.PENDING, PAYOUT_STATUS.PROCESSING] },
    }, null, { session });

    if (!payout) return null;

    const fullAmount = roundCurrency(payout.amount);
    const hasPartialAmount = partialAmount !== undefined && partialAmount !== null;
    const reduceBy = hasPartialAmount
      ? roundCurrency(Math.max(0, Math.min(Number(partialAmount) || 0, fullAmount)))
      : fullAmount;
    // Rounding-tolerant: treat "reduces to ~0 remaining" as a full cancellation.
    const isFullCancellation = fullAmount - reduceBy <= 0.01;

    const ownerType = payoutTypeToOwnerType(payout.payoutType);
    const beneficiaryWallet = await getOrCreateWallet(ownerType, payout.beneficiaryId, { session });

    beneficiaryWallet.pendingBalance = roundCurrency(Math.max((beneficiaryWallet.pendingBalance || 0) - reduceBy, 0));
    beneficiaryWallet.totalCredited = roundCurrency(Math.max((beneficiaryWallet.totalCredited || 0) - reduceBy, 0));
    await beneficiaryWallet.save({ session });

    if (isFullCancellation) {
      payout.status = PAYOUT_STATUS.CANCELLED;
      payout.remarks = remarks || `Payout cancelled due to return/reversal.`;
      payout.cancelledAt = new Date();
    } else {
      payout.amount = roundCurrency(fullAmount - reduceBy);
      payout.remarks = [payout.remarks, remarks || `Reduced by ${reduceBy} due to partial return.`]
        .filter(Boolean)
        .join(" | ");
    }
    if (adminId) payout.createdBy = adminId;
    await payout.save({ session });

    if (isFullCancellation && payout.isBulkSettlement && payout.payoutType === PAYOUT_TYPE.SELLER) {
      await BulkSettlement.updateOne(
        { payout: payout._id },
        { $set: { status: "CANCELLED" } },
        { session },
      );
    }

    await createLedgerEntry(
      {
        orderId,
        payoutId: payout._id,
        walletId: beneficiaryWallet._id,
        actorType: ownerType,
        actorId: payout.beneficiaryId,
        type: LEDGER_TRANSACTION_TYPE.PAYOUT_CANCELLED || "PAYOUT_CANCELLED",
        direction: LEDGER_DIRECTION.DEBIT,
        amount: reduceBy,
        description: isFullCancellation
          ? `Pending ${payout.payoutType} payout reversed due to return.`
          : `Pending ${payout.payoutType} payout reduced due to partial return.`,
      },
      { session },
    );

    if (managedSession) await session.commitTransaction();
    return payout;
  } catch (error) {
    if (managedSession) await session.abortTransaction();
    throw error;
  } finally {
    if (managedSession) session.endSession();
  }
}

export const bulkProcessPayouts = async ({
  payoutIds = [],
  payoutType,
  limit = 50,
  adminId = null,
  remarks = "",
} = {}) => {
  let targets = payoutIds;
  if (!Array.isArray(targets) || targets.length === 0) {
    const query = {
      status: { $in: [PAYOUT_STATUS.PENDING, PAYOUT_STATUS.PROCESSING] },
    };
    if (payoutType) query.payoutType = payoutType;
    const list = await Payout.find(query)
      .sort({ createdAt: 1 })
      .limit(Math.max(Math.min(Number(limit) || 50, 200), 1))
      .select("_id")
      .lean();
    targets = list.map((row) => String(row._id));
  }

  const results = [];
  for (const id of targets) {
    try {
      const payout = await processPayout(id, { remarks, adminId });
      results.push({
        payoutId: String(payout._id),
        status: "COMPLETED",
      });
    } catch (error) {
      results.push({
        payoutId: String(id),
        status: "FAILED",
        reason: error.message,
      });
    }
  }

  return {
    total: results.length,
    completed: results.filter((row) => row.status === "COMPLETED").length,
    failed: results.filter((row) => row.status === "FAILED").length,
    results,
  };
}
