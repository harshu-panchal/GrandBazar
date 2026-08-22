import mongoose from "mongoose";
import Order from "../../models/order.js";
import User from "../../models/customer.js";
import Transaction from "../../models/transaction.js";
import Setting from "../../models/setting.js";
import {
  computeReturnWindowForOrder,
  resolveCategoryWindowOverrideHours,
} from "../../utils/returnWindow.js";
import {
  LEDGER_DIRECTION,
  LEDGER_TRANSACTION_TYPE,
  ORDER_PAYMENT_STATUS,
  ORDER_SETTLEMENT_STATUS,
  OWNER_TYPE,
  PAYOUT_TYPE,
} from "../../constants/finance.js";
import { addMoney, roundCurrency } from "../../utils/money.js";
import { createLedgerEntry } from "./ledgerService.js";
import { createFinanceAuditLog } from "./auditLogService.js";
import { emitNotificationEvent } from "../../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../../modules/notifications/notification.constants.js";
import {
  creditWallet,
  debitWallet,
  getOrCreateWallet,
  updateCashInHand,
} from "./walletService.js";
import { createPendingPayoutForOrder } from "./payoutService.js";
import { computeOverallSettlement } from "../../utils/settlementStatus.js";

function toOrderIdQuery(orderOrId) {
  if (!orderOrId) return null;
  if (typeof orderOrId === "object" && orderOrId._id) {
    return { _id: orderOrId._id };
  }
  if (mongoose.Types.ObjectId.isValid(orderOrId)) {
    return { _id: new mongoose.Types.ObjectId(orderOrId) };
  }
  return { orderId: String(orderOrId) };
}

async function findOrderForUpdate(orderOrId, session) {
  const query = toOrderIdQuery(orderOrId);
  if (!query) {
    throw new Error("Order not found");
  }
  const order = await Order.findOne(query, null, { session });
  if (!order) {
    throw new Error("Order not found");
  }
  // Backward-compat: older / partially-upgraded orders may have paymentBreakdown without snapshots.
  // Mongoose will throw a cast error on save if `paymentBreakdown.snapshots` is undefined.
  if (order.paymentBreakdown) {
    const snapshots = order.paymentBreakdown.snapshots;
    if (!snapshots || typeof snapshots !== "object") {
      order.paymentBreakdown.snapshots = {
        deliverySettings: {},
        categoryCommissionSettings: [],
        handlingFeeStrategy: null,
        handlingCategoryUsed: {},
      };
    }
  }
  return order;
}

function syncLegacyPricing(order) {
  const breakdown = order.paymentBreakdown || {};
  order.pricing = {
    subtotal: breakdown.productSubtotal || order.pricing?.subtotal || 0,
    deliveryFee: breakdown.deliveryFeeCharged || order.pricing?.deliveryFee || 0,
    platformFee:
      Number(breakdown.handlingFeeCharged || 0) +
        Number(breakdown.packingFeeCharged || 0) ||
      order.pricing?.platformFee ||
      0,
    gst: breakdown.taxTotal || order.pricing?.gst || 0,
    tip: breakdown.tipTotal || order.pricing?.tip || 0,
    discount: breakdown.discountTotal || order.pricing?.discount || 0,
    total: breakdown.grandTotal || order.pricing?.total || 0,
    walletAmount: breakdown.walletAmount || order.pricing?.walletAmount || 0,
  };
}

function ensurePaymentBreakdownSnapshots(order) {
  if (!order?.paymentBreakdown) return;
  const snapshots = order.paymentBreakdown.snapshots;
  if (snapshots && typeof snapshots === "object") return;
  order.paymentBreakdown.snapshots = {
    deliverySettings: {},
    categoryCommissionSettings: [],
    handlingFeeStrategy: null,
    handlingCategoryUsed: {},
  };
}

export function freezeFinancialSnapshot(order, breakdown) {
  if (!order || !breakdown) return order;

  const sanitized = { ...breakdown };
  if (!sanitized.snapshots || typeof sanitized.snapshots !== "object") {
    sanitized.snapshots = {
      deliverySettings: {},
      categoryCommissionSettings: [],
      handlingFeeStrategy: null,
      handlingCategoryUsed: {},
    };
  }

  order.paymentBreakdown = {
    ...sanitized,
    codCollectedAmount: roundCurrency(sanitized.codCollectedAmount || 0),
    codRemittedAmount: roundCurrency(sanitized.codRemittedAmount || 0),
    codPendingAmount: roundCurrency(sanitized.codPendingAmount || 0),
    walletAmount: roundCurrency(sanitized.walletAmount || order.pricing?.walletAmount || 0),
  };
  ensurePaymentBreakdownSnapshots(order);

  // Mirror to top level for easy querying (Order.find({ isBulkOrder: true })).
  order.isBulkOrder = Boolean(sanitized.isBulkOrder);
  order.bulkOrderReason = sanitized.bulkOrderReason || null;

  order.distanceSnapshot = {
    distanceKmActual: roundCurrency(sanitized.distanceKmActual || 0),
    distanceKmRounded: roundCurrency(sanitized.distanceKmRounded || 0),
    source: sanitized?.snapshots?.deliverySettings?.distanceSource || "haversine",
  };

  order.pricingSnapshot = {
    deliverySettings: sanitized?.snapshots?.deliverySettings || {},
    categoryCommissionSettings: sanitized?.snapshots?.categoryCommissionSettings || [],
    handlingFeeStrategy: sanitized?.snapshots?.handlingFeeStrategy || null,
    handlingCategoryUsed: sanitized?.snapshots?.handlingCategoryUsed || {},
  };

  syncLegacyPricing(order);
  return order;
}

export async function createPendingSellerPayout(order, { session, actorId } = {}) {
  if (!order?.seller) return null;
  if (order.financeFlags?.sellerPayoutQueued) return null;

  const amount = roundCurrency(order.paymentBreakdown?.sellerPayoutTotal || 0);
  if (amount <= 0) {
    order.settlementStatus = {
      ...(order.settlementStatus || {}),
      sellerPayout: "NOT_APPLICABLE",
    };
    return null;
  }

  const payout = await createPendingPayoutForOrder(
    {
      order,
      payoutType: PAYOUT_TYPE.SELLER,
      beneficiaryId: order.seller,
      amount,
      createdBy: actorId || null,
      metadata: { flow: "order_delivered" },
      // Without these, isBulkSettlement always defaults to false here (see
      // createPendingPayoutForOrder's signature) — so no BulkSettlement
      // record was ever created on the real delivery path, and the admin
      // "bulk order" badge/breakdown UI (AdminWallet.jsx) had nothing to
      // show. queueSellerPayouts already does this correctly; mirrored here.
      isBulkSettlement: Boolean(order.isBulkOrder || order.paymentBreakdown?.isBulkOrder),
      commissionAmount: order.paymentBreakdown?.adminProductCommissionTotal || 0,
      packagingAmount: order.paymentBreakdown?.packagingChargeAmount || 0,
      taxAmount: order.paymentBreakdown?.taxTotal || 0,
    },
    { session },
  );

  order.financeFlags = {
    ...(order.financeFlags || {}),
    sellerPayoutQueued: true,
  };
  order.settlementStatus = {
    ...(order.settlementStatus || {}),
    sellerPayout: "PENDING",
  };
  return payout;
}

export async function releaseHeldSellerPayout(orderOrId, { actorId = null } = {}) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const order = await findOrderForUpdate(orderOrId, session);

    if (!order?.seller) {
      await session.commitTransaction();
      return null;
    }

    if (order.financeFlags?.sellerPayoutQueued) {
      await session.commitTransaction();
      return null;
    }

    const payout = await createPendingSellerPayout(order, { session, actorId });
    order.financeFlags = {
      ...(order.financeFlags || {}),
      sellerPayoutHeld: false,
    };
    if (payout) {
      order.settlementStatus = {
        ...(order.settlementStatus || {}),
        sellerPayout: "PENDING",
      };
    }

    await order.save({ session });
    await session.commitTransaction();
    return payout;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function createPendingRiderPayout(order, { session, actorId } = {}) {
  if (!order?.deliveryBoy) {
    order.settlementStatus = {
      ...(order.settlementStatus || {}),
      riderPayout: "NOT_APPLICABLE",
    };
    return null;
  }
  if (order.financeFlags?.riderPayoutQueued) return null;

  const amount = roundCurrency(order.paymentBreakdown?.riderPayoutTotal || 0);
  if (amount <= 0) {
    order.settlementStatus = {
      ...(order.settlementStatus || {}),
      riderPayout: "NOT_APPLICABLE",
    };
    return null;
  }

  const payout = await createPendingPayoutForOrder(
    {
      order,
      payoutType: PAYOUT_TYPE.DELIVERY_PARTNER,
      beneficiaryId: order.deliveryBoy,
      amount,
      createdBy: actorId || null,
      metadata: { flow: "order_delivered" },
    },
    { session },
  );

  order.financeFlags = {
    ...(order.financeFlags || {}),
    riderPayoutQueued: true,
  };
  order.settlementStatus = {
    ...(order.settlementStatus || {}),
    riderPayout: "PENDING",
  };
  return payout;
}

export async function creditAdminEarning(order, { session, actorId } = {}) {
  if (order.financeFlags?.adminEarningCredited) return null;

  // Requirement: For COD orders, do not recognize/credit admin earning at delivery time.
  // COD inflows are tracked via remittance (system float) instead.
  if (order.paymentMode === "COD") {
    order.settlementStatus = {
      ...(order.settlementStatus || {}),
      adminEarningCredited: true,
    };
    order.financeFlags = {
      ...(order.financeFlags || {}),
      adminEarningCredited: true,
    };
    return null;
  }

  const adminEarning = roundCurrency(order.paymentBreakdown?.platformTotalEarning || 0);
  if (adminEarning <= 0) {
    order.settlementStatus = {
      ...(order.settlementStatus || {}),
      adminEarningCredited: true,
    };
    order.financeFlags = {
      ...(order.financeFlags || {}),
      adminEarningCredited: true,
    };
    return null;
  }

  const adminWallet = await getOrCreateWallet(OWNER_TYPE.ADMIN, null, { session });
  await createLedgerEntry(
    {
      orderId: order._id,
      walletId: adminWallet._id,
      actorType: OWNER_TYPE.ADMIN,
      actorId: null,
      type: LEDGER_TRANSACTION_TYPE.ADMIN_EARNING_CREDITED,
      direction: LEDGER_DIRECTION.CREDIT,
      amount: adminEarning,
      paymentMode: order.paymentMode,
      description: "Platform earning recognized on delivery",
      reference: order.orderId,
    },
    { session },
  );

  order.settlementStatus = {
    ...(order.settlementStatus || {}),
    adminEarningCredited: true,
  };
  order.financeFlags = {
    ...(order.financeFlags || {}),
    adminEarningCredited: true,
  };

  await createFinanceAuditLog(
    {
      action: "ORDER_DELIVERED_SETTLED",
      actorType: OWNER_TYPE.ADMIN,
      actorId: actorId || null,
      orderId: order._id,
      metadata: { adminEarning },
    },
    { session },
  );

  return adminEarning;
}

/**
 * Online payment escrow flow (platform holds customer funds until settlement):
 * 1. Customer payment is captured and credited to the admin wallet (available bucket).
 * 2. Seller payout remains on HOLD until delivery completes and the return window elapses.
 * 3. Settlement releases seller share per business model (commission vs subscription).
 */
export async function handleOnlineOrderFinance(
  orderOrId,
  { actorId = null, transactionId = "", metadata = {} } = {},
) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const order = await findOrderForUpdate(orderOrId, session);

    if (order.paymentMode !== "ONLINE") {
      order.paymentMode = "ONLINE";
    }

    if (order.financeFlags?.onlinePaymentCaptured) {
      await session.commitTransaction();
      return order;
    }

    const grandTotal = roundCurrency(order.paymentBreakdown?.grandTotal || order.pricing?.total || 0);
    const credit = await creditWallet({
      ownerType: OWNER_TYPE.ADMIN,
      ownerId: null,
      amount: grandTotal,
      bucket: "available",
      session,
    });

    await createLedgerEntry(
      {
        orderId: order._id,
        walletId: credit.wallet._id,
        actorType: OWNER_TYPE.ADMIN,
        actorId: null,
        type: LEDGER_TRANSACTION_TYPE.ORDER_ONLINE_PAYMENT_CAPTURED,
        direction: LEDGER_DIRECTION.CREDIT,
        amount: grandTotal,
        paymentMode: "ONLINE",
        metadata: {
          ...metadata,
          gatewayTransactionId: transactionId || undefined,
        },
        description: "Online payment captured from customer",
        reference: order.orderId,
        balanceBefore: credit.before,
        balanceAfter: credit.after,
      },
      { session },
    );

    order.financeFlags = {
      ...(order.financeFlags || {}),
      onlinePaymentCaptured: true,
    };
    order.paymentStatus = ORDER_PAYMENT_STATUS.PAID;
    order.payment = {
      ...(order.payment || {}),
      method: "online",
      status: "completed",
      transactionId: transactionId || order.payment?.transactionId,
    };

    await createFinanceAuditLog(
      {
        action: "ONLINE_PAYMENT_VERIFIED",
        actorType: OWNER_TYPE.ADMIN,
        actorId: actorId || null,
        orderId: order._id,
        metadata: {
          amount: grandTotal,
          gatewayTransactionId: transactionId || null,
        },
      },
      { session },
    );

    await order.save({ session });
    await session.commitTransaction();
    return order;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function handleCodOrderFinance(
  orderOrId,
  { amount = null, deliveryPartnerId = null, actorId = null } = {},
) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const order = await findOrderForUpdate(orderOrId, session);

    // An order can have a specially-tracked cash-due amount if the customer
    // added items post-placement (see addItemsToOrder):
    // - ONLINE: paymentMode stays ONLINE (the original amount really was
    //   captured via gateway) and only the tracked remainder gets collected
    //   here as a one-off top-up.
    // - COD: nothing was ever captured electronically, so codPendingAmount
    //   instead holds the TOTAL cash still owed for the whole order, net of
    //   all wallet usage across its lifetime — addItemsToOrder sets this flag
    //   for COD orders whenever any wallet amount was applied, even if it
    //   fully covered the delta, so this branch is always consulted instead
    //   of re-deriving the amount from the (wallet-inflated) grandTotal.
    const isExtraCashOnlyCollection = Boolean(order.financeFlags?.hasExtraCashDue);
    if (order.paymentMode === "ONLINE" && !isExtraCashOnlyCollection) {
      throw new Error("COD collection is not allowed for ONLINE orders");
    }

    if (order.paymentMode !== "COD" && !isExtraCashOnlyCollection) {
      order.paymentMode = "COD";
    }

    const isDelivered =
      order.status === "delivered" || order.orderStatus === "delivered";
    if (!isDelivered) {
      throw new Error("COD can only be collected after order delivery");
    }

    if (!isExtraCashOnlyCollection && order.financeFlags?.codMarkedCollected) {
      await session.commitTransaction();
      return order;
    }
    if (isExtraCashOnlyCollection && !(order.paymentBreakdown?.codPendingAmount > 0)) {
      await session.commitTransaction();
      return order;
    }

    if (!order.deliveryBoy && deliveryPartnerId) {
      order.deliveryBoy = deliveryPartnerId;
      order.deliveryPartner = deliveryPartnerId;
    }
    const partnerId = order.deliveryBoy || deliveryPartnerId;
    if (!partnerId) {
      throw new Error("Delivery partner is required for COD collection");
    }

    const defaultAmount = isExtraCashOnlyCollection
      ? order.paymentBreakdown?.codPendingAmount || 0
      : order.paymentBreakdown?.grandTotal || order.pricing?.total || 0;
    const codAmountGross = roundCurrency(amount == null ? defaultAmount : amount);
    if (codAmountGross <= 0) {
      throw new Error("COD collection amount must be greater than 0");
    }

    // Requirement: system float (COD) should track remittable cash with delivery partners,
    // i.e. gross order amount minus delivery partner commission.
    //
    // ONLINE extra-cash-only top-up: this collection is purely the platform's
    // money (a remainder that wasn't captured electronically) — the rider's
    // commission for the whole delivery was already queued separately
    // (createPendingRiderPayout) against the original delivery, so no
    // separate commission carve-out applies to this one-off collection.
    //
    // COD (whether or not extra-cash-only): this is still the rider's one
    // and only cash-collection event for the order, so they still keep their
    // full riderPayoutTotal commission out of whatever cash they collect,
    // exactly as in a normal COD delivery with no add-items involved.
    const deliveryPartnerCommission = isExtraCashOnlyCollection && order.paymentMode === "ONLINE"
      ? 0
      : roundCurrency(order.paymentBreakdown?.riderPayoutTotal || 0);
    const codAmountNet = roundCurrency(
      Math.max(codAmountGross - deliveryPartnerCommission, 0),
    );

    await updateCashInHand({
      ownerType: OWNER_TYPE.DELIVERY_PARTNER,
      ownerId: partnerId,
      deltaAmount: codAmountNet,
      session,
    });

    // Plain object spread ({...order.paymentBreakdown}) can silently drop
    // deeply-nested Mixed-type sub-fields (like `snapshots`) on a Mongoose
    // nested-path document field, depending on how that field was last
    // written — toObject() reliably serializes everything the document
    // actually holds.
    const currentBreakdown = order.paymentBreakdown?.toObject
      ? order.paymentBreakdown.toObject()
      : order.paymentBreakdown || {};
    order.paymentBreakdown = {
      ...currentBreakdown,
      codCollectedAmount: roundCurrency(
        (currentBreakdown.codCollectedAmount || 0) + codAmountNet,
      ),
      codRemittedAmount: roundCurrency(currentBreakdown.codRemittedAmount || 0),
      codPendingAmount: roundCurrency(
        (currentBreakdown.codCollectedAmount || 0) +
          codAmountNet -
          (currentBreakdown.codRemittedAmount || 0),
      ),
    };

    if (isExtraCashOnlyCollection) {
      order.financeFlags = {
        ...(order.financeFlags || {}),
        hasExtraCashDue: false,
      };
    }
    // A COD order's cash-collection status (paymentStatus/payment/
    // codMarkedCollected) must still be marked here even when it went
    // through the extra-cash-only branch above (i.e. add-items applied a
    // wallet payment before delivery) — this is still that order's one and
    // only real cash-collection event. Only skip this for ONLINE orders,
    // whose paymentStatus is already PAID from the original gateway capture
    // and has nothing to do with this one-off top-up collection.
    if (order.paymentMode !== "ONLINE") {
      order.paymentStatus = ORDER_PAYMENT_STATUS.CASH_COLLECTED;
      order.payment = {
        ...(order.payment || {}),
        method: "cash",
        status: "completed",
      };
      order.financeFlags = {
        ...(order.financeFlags || {}),
        codMarkedCollected: true,
      };
    }

    const riderWallet = await getOrCreateWallet(
      OWNER_TYPE.DELIVERY_PARTNER,
      partnerId,
      { session },
    );
    await createLedgerEntry(
      {
        orderId: order._id,
        walletId: riderWallet._id,
        actorType: OWNER_TYPE.DELIVERY_PARTNER,
        actorId: partnerId,
        type: LEDGER_TRANSACTION_TYPE.ORDER_COD_COLLECTED,
        direction: LEDGER_DIRECTION.CREDIT,
        amount: codAmountNet,
        paymentMode: "COD",
        description: "COD cash added to system float (net of rider commission)",
        reference: order.orderId,
      },
      { session },
    );

    await createFinanceAuditLog(
      {
        action: "COD_MARKED_COLLECTED",
        actorType: OWNER_TYPE.DELIVERY_PARTNER,
        actorId: actorId || partnerId,
        orderId: order._id,
        metadata: {
          amountGross: codAmountGross,
          deliveryPartnerCommission,
          amountNet: codAmountNet,
          deliveryPartnerId: String(partnerId),
        },
      },
      { session },
    );

    await order.save({ session });
    await session.commitTransaction();
    return order;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function settleDeliveredOrder(orderOrId, { actorId = null } = {}) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const order = await findOrderForUpdate(orderOrId, session);

    if (order.status !== "delivered") {
      order.status = "delivered";
    }
    order.orderStatus = "delivered";
    if (!order.deliveredAt) {
      order.deliveredAt = new Date();
    }

    if (!order.returnEligibleAt || !order.returnWindowExpiresAt) {
      // Same admin-configurable (platform Setting.refundWindowHours, or a
      // shorter/disabled per-category override) window requestReturn() and
      // disputeService.js already resolve — previously this used a private,
      // duplicated helper here that defaulted to a 2-MINUTE window when
      // RETURN_WINDOW_MINUTES wasn't set, so the seller payout hold below
      // (meant to protect against paying out before the return window
      // closes) released almost immediately in practice instead of
      // respecting the real (default 24h) admin-configured window.
      const [platformSettings, { overrideHours }] = await Promise.all([
        Setting.findOne({}).session(session).lean(),
        resolveCategoryWindowOverrideHours((order.items || []).map((item) => item.product)),
      ]);
      const { eligibleAt, windowExpiresAt } = computeReturnWindowForOrder(
        order,
        overrideHours ?? platformSettings?.refundWindowHours,
      );
      order.returnEligibleAt = order.returnEligibleAt || eligibleAt;
      order.returnWindowExpiresAt = order.returnWindowExpiresAt || windowExpiresAt;
      order.returnDeadline = order.returnDeadline || windowExpiresAt;
    }

    if (order.paymentMode === "ONLINE" && !order.financeFlags?.onlinePaymentCaptured) {
      throw new Error("Cannot settle delivered online order before payment capture");
    }

    if (order.financeFlags?.deliveredSettlementApplied) {
      await session.commitTransaction();
      return order;
    }

    const now = new Date();
    const holdSellerPayout =
      order.returnWindowExpiresAt instanceof Date && order.returnWindowExpiresAt > now;

    await createPendingSellerPayout(order, { session, actorId });

    if (holdSellerPayout) {
      order.financeFlags = {
        ...(order.financeFlags || {}),
        sellerPayoutHeld: true,
      };
      order.settlementStatus = {
        ...(order.settlementStatus || {}),
        sellerPayout: "HOLD",
      };
    }
    await createPendingRiderPayout(order, { session, actorId });
    await creditAdminEarning(order, { session, actorId });

    order.financeFlags = {
      ...(order.financeFlags || {}),
      deliveredSettlementApplied: true,
    };

    order.settlementStatus = computeOverallSettlement(order);

    await order.save({ session });
    await session.commitTransaction();

    // PDF generation + Cloudinary upload are slow I/O — never do them inside
    // the DB transaction. Fire-and-forget after commit; failures are logged
    // but never block order delivery or the caller's response.
    import("./invoiceService.js")
      .then(({ generateOrderInvoices }) => generateOrderInvoices(order))
      .catch((error) => {
        console.error(`[invoiceService] Failed to generate invoices for order ${order.orderId}:`, error);
      });

    return order;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function reconcileCodCash(
  orderOrId,
  amount,
  deliveryPartnerId,
  { actorId = null, metadata = {} } = {},
) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const order = await findOrderForUpdate(orderOrId, session);
    const partnerId = deliveryPartnerId || order.deliveryBoy;
    if (!partnerId) {
      throw new Error("Delivery partner is required for reconciliation");
    }
    if (order.paymentMode !== "COD") {
      throw new Error("COD reconciliation is only allowed for COD orders");
    }

    const requested = roundCurrency(amount || 0);
    if (requested <= 0) {
      throw new Error("Reconciliation amount must be greater than 0");
    }

    const codCollected = roundCurrency(order.paymentBreakdown?.codCollectedAmount || 0);
    const codRemitted = roundCurrency(order.paymentBreakdown?.codRemittedAmount || 0);
    const codPending = roundCurrency(codCollected - codRemitted);
    if (codPending <= 0) {
      throw new Error("No COD pending amount for this order");
    }
    if (requested > codPending) {
      throw new Error("Reconciliation amount exceeds COD pending amount");
    }

    await updateCashInHand({
      ownerType: OWNER_TYPE.DELIVERY_PARTNER,
      ownerId: partnerId,
      deltaAmount: -requested,
      session,
    });

    const adminCredit = await creditWallet({
      ownerType: OWNER_TYPE.ADMIN,
      ownerId: null,
      amount: requested,
      bucket: "available",
      session,
    });

    const riderWallet = await getOrCreateWallet(
      OWNER_TYPE.DELIVERY_PARTNER,
      partnerId,
      { session },
    );

    await createLedgerEntry(
      {
        orderId: order._id,
        walletId: riderWallet._id,
        actorType: OWNER_TYPE.DELIVERY_PARTNER,
        actorId: partnerId,
        type: LEDGER_TRANSACTION_TYPE.COD_REMITTED,
        direction: LEDGER_DIRECTION.DEBIT,
        amount: requested,
        paymentMode: "COD",
        metadata,
        description: "COD remitted by delivery partner",
        reference: order.orderId,
      },
      { session },
    );

    await createLedgerEntry(
      {
        orderId: order._id,
        walletId: adminCredit.wallet._id,
        actorType: OWNER_TYPE.ADMIN,
        actorId: null,
        type: LEDGER_TRANSACTION_TYPE.COD_REMITTED,
        direction: LEDGER_DIRECTION.CREDIT,
        amount: requested,
        paymentMode: "COD",
        metadata,
        description: "COD remittance credited to admin wallet",
        reference: order.orderId,
        balanceBefore: adminCredit.before,
        balanceAfter: adminCredit.after,
      },
      { session },
    );

    const nextRemitted = addMoney(codRemitted, requested);
    const nextPending = roundCurrency(codCollected - nextRemitted);

    order.paymentBreakdown = {
      ...(order.paymentBreakdown?.toObject ? order.paymentBreakdown.toObject() : order.paymentBreakdown || {}),
      codCollectedAmount: codCollected,
      codRemittedAmount: nextRemitted,
      codPendingAmount: nextPending,
    };

    order.paymentStatus =
      nextPending <= 0
        ? ORDER_PAYMENT_STATUS.COD_RECONCILED
        : ORDER_PAYMENT_STATUS.PARTIALLY_REMITTED;

    if (nextPending <= 0) {
      order.settlementStatus = {
        ...(order.settlementStatus || {}),
        reconciledAt: new Date(),
      };
    }

    await createFinanceAuditLog(
      {
        action: "COD_RECONCILED",
        actorType: OWNER_TYPE.ADMIN,
        actorId: actorId || null,
        orderId: order._id,
        metadata: {
          amount: requested,
          deliveryPartnerId: String(partnerId),
          codRemittedAmount: nextRemitted,
          codPendingAmount: nextPending,
        },
      },
      { session },
    );

    await order.save({ session });
    await session.commitTransaction();
    return order;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function reverseOrderFinanceOnCancellation(
  orderOrId,
  { actorId = null, reason = "Order cancelled before settlement" } = {},
) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const order = await findOrderForUpdate(orderOrId, session);

    if (order.financeFlags?.cancellationReversed) {
      await session.abortTransaction();
      return order;
    }

    let totalRefunded = 0;

    if (order.paymentMode === "ONLINE" && order.financeFlags?.onlinePaymentCaptured) {
      const refundAmount = roundCurrency(order.paymentBreakdown?.grandTotal || 0);
      if (refundAmount > 0) {
        totalRefunded += refundAmount;
        const debitResult = await debitWallet({
          ownerType: OWNER_TYPE.ADMIN,
          ownerId: null,
          amount: refundAmount,
          bucket: "available",
          session,
        });

        await createLedgerEntry(
          {
            orderId: order._id,
            walletId: debitResult.wallet._id,
            actorType: OWNER_TYPE.ADMIN,
            actorId: null,
            type: LEDGER_TRANSACTION_TYPE.REFUND,
            direction: LEDGER_DIRECTION.DEBIT,
            amount: refundAmount,
            paymentMode: "ONLINE",
            description: reason,
            reference: order.orderId,
            balanceBefore: debitResult.before,
            balanceAfter: debitResult.after,
          },
          { session },
        );
      }
      order.paymentStatus = ORDER_PAYMENT_STATUS.REFUNDED;
    }

    // Refund wallet amount the customer spent at checkout. This must land on
    // User.walletBalance — the customer's actual spendable balance (checked
    // and debited at checkout in orderPlacementService.js, shown on
    // WalletPage.jsx) — NOT the finance `Wallet` collection's CUSTOMER-owned
    // doc, which nothing ever reads back (that collection is real only for
    // SELLER/ADMIN/DELIVERY_PARTNER owners). Mirrors the working return-refund
    // pattern in orderController.js's completeReturnAndRefund.
    const walletUsed = roundCurrency(order.pricing?.walletAmount || order.paymentBreakdown?.walletAmount || 0);
    if (walletUsed > 0) {
      totalRefunded = roundCurrency(totalRefunded + walletUsed);
      await User.findByIdAndUpdate(
        order.customer,
        { $inc: { walletBalance: walletUsed } },
        { session },
      );
      await Transaction.create(
        [
          {
            user: order.customer,
            userModel: "User",
            order: order._id,
            type: "Refund",
            amount: walletUsed,
            status: "Settled",
            reference: `REF-CANCEL-WALLET-${order.orderId}`,
            meta: { orderId: order.orderId, reason, kind: "cancellation_wallet_refund" },
          },
        ],
        { session },
      );
    }

    if (totalRefunded > 0) {
      const Refund = (await import("../../models/refund.js")).default;
      await Refund.create(
        [
          {
            order: order._id,
            orderId: order.orderId,
            type: "cancellation",
            amount: totalRefunded,
            mode: "wallet",
            status: "completed",
            completedAt: new Date(),
          },
        ],
        { session },
      );
    }

    order.settlementStatus = {
      ...(order.settlementStatus || {}),
      overall: ORDER_SETTLEMENT_STATUS.CANCELLED,
      sellerPayout: "NOT_APPLICABLE",
      riderPayout: "NOT_APPLICABLE",
    };
    order.financeFlags = {
      ...(order.financeFlags || {}),
      cancellationReversed: true,
    };

    await createFinanceAuditLog(
      {
        action: "FINANCE_ADJUSTMENT_APPLIED",
        actorType: OWNER_TYPE.ADMIN,
        actorId: actorId || null,
        orderId: order._id,
        metadata: { reason },
      },
      { session },
    );

    await order.save({ session });
    await session.commitTransaction();

    // Every cancellation path in the app routes through here (via
    // compensateOrderCancellation), and until now none of them ever told
    // the customer their money came back — they only ever saw "Order
    // Cancelled". Fired only after a successful commit (not from inside the
    // transaction) so a rollback can never produce a false notification;
    // guarded by the cancellationReversed idempotency check above so a
    // retried reversal on an already-reversed order can't double-notify.
    if (totalRefunded > 0) {
      emitNotificationEvent(NOTIFICATION_EVENTS.REFUND_COMPLETED, {
        orderId: order.orderId,
        customerId: order.customer,
        userId: order.customer,
        amount: totalRefunded,
      });
    }

    return order;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
