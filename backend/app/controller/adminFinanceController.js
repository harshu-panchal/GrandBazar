import Payout from "../models/payout.js";
import Wallet from "../models/wallet.js";
import Store from "../models/store.js";
import Delivery from "../models/delivery.js";
import Order from "../models/order.js";
import BulkSettlement from "../models/bulkSettlement.js";
import Refund from "../models/refund.js";
import handleResponse from "../utils/helper.js";
import { getAdminFinanceSummary } from "../services/finance/walletService.js";
import {
  getEarningsBreakdown,
  getDeliveryEarningsSummary,
  getSellerEarningsSummary,
} from "../services/finance/earningsBreakdownService.js";
import { buildKey, getOrSet, getTTL } from "../services/cacheService.js";
import { getLedgerEntries } from "../services/finance/ledgerService.js";
import { bulkProcessPayouts, processPayout } from "../services/finance/payoutService.js";
import { exportFinanceStatement } from "../services/finance/statementService.js";
import {
  FINANCE_AUDIT_ACTION,
  OWNER_TYPE,
} from "../constants/finance.js";
import {
  getOrCreateFinanceSettings,
  updateDeliveryFinanceSettings,
} from "../services/finance/financeSettingsService.js";
import { createFinanceAuditLog } from "../services/finance/auditLogService.js";
import { createLedgerEntry } from "../services/finance/ledgerService.js";
import { getOrCreateWallet } from "../services/finance/walletService.js";
import { LEDGER_DIRECTION, LEDGER_TRANSACTION_TYPE, PAYOUT_STATUS } from "../constants/finance.js";
import { roundCurrency } from "../utils/money.js";
import {
  financeLedgerQuerySchema,
  payoutProcessSchema,
  updateDeliverySettingsSchema,
} from "../validation/financeValidation.js";

function validateWithJoi(schema, payload) {
  const { error, value } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    return {
      isValid: false,
      message: error.details.map((item) => item.message).join("; "),
    };
  }
  return {
    isValid: true,
    value,
  };
}

export const getAdminFinanceSummaryController = async (req, res) => {
  try {
    // 6 parallel Order/Payout aggregations, all unbounded full-collection
    // scans, previously recomputed from scratch on every load — same
    // rationale as the admin dashboard stats cache.
    const summary = await getOrSet(
      buildKey("admin", "financeSummary"),
      () => getAdminFinanceSummary(),
      getTTL("dashboard"),
    );
    return handleResponse(res, 200, "Admin finance summary fetched", summary);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getAdminFinanceLedgerController = async (req, res) => {
  try {
    const validated = validateWithJoi(financeLedgerQuerySchema, req.query || {});
    if (!validated.isValid) {
      return handleResponse(res, 400, validated.message);
    }
    const ledger = await getLedgerEntries(validated.value);
    return handleResponse(res, 200, "Finance ledger fetched", ledger);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getAdminFinancePayoutsController = async (req, res) => {
  try {
    const {
      seller,
      rider,
      status,
      bulkOnly,
      page = 1,
      limit = 25,
    } = req.query;

    const query = {};
    if (status) query.status = status;
    if (String(bulkOnly).toLowerCase() === "true") query.isBulkSettlement = true;

    const includeSeller = String(seller).toLowerCase() === "true";
    const includeRider = String(rider).toLowerCase() === "true";
    if (includeSeller && !includeRider) query.payoutType = "SELLER";
    if (!includeSeller && includeRider) query.payoutType = "DELIVERY_PARTNER";

    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
    const skip = (safePage - 1) * safeLimit;

    const [rawItems, total] = await Promise.all([
      Payout.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .populate("relatedOrderIds", "orderId paymentMode paymentStatus status settlementStatus")
        .lean(),
      Payout.countDocuments(query),
    ]);

    const sellerIds = rawItems
      .filter((item) => item.payoutType === "SELLER")
      .map((item) => item.beneficiaryId);
    const riderIds = rawItems
      .filter((item) => item.payoutType === "DELIVERY_PARTNER")
      .map((item) => item.beneficiaryId);

    const [sellers, riders] = await Promise.all([
      Store.find({ _id: { $in: sellerIds } })
        .select("_id shopName")
        .lean(),
      Delivery.find({ _id: { $in: riderIds } })
        .select("_id name phone")
        .lean(),
    ]);

    const sellerMap = new Map(sellers.map((seller) => [String(seller._id), seller]));
    const riderMap = new Map(riders.map((rider) => [String(rider._id), rider]));

    const items = rawItems.map((item) => {
      const beneficiary =
        item.payoutType === "SELLER"
          ? sellerMap.get(String(item.beneficiaryId))
          : riderMap.get(String(item.beneficiaryId));
      return {
        ...item,
        beneficiary: beneficiary || null,
      };
    });

    return handleResponse(res, 200, "Finance payouts fetched", {
      items,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Admin earnings sliced by product/category/shop/city — previously the
// admin Wallet page only ever showed lump-sum totals, with zero dimensional
// breakdown anywhere in the app for admin commission earnings.
export const getEarningsBreakdownController = async (req, res) => {
  try {
    const { dimension, from, to, limit } = req.query;
    const breakdown = await getEarningsBreakdown({ dimension, from, to, limit });
    return handleResponse(res, 200, "Earnings breakdown fetched", breakdown);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

// Platform's cut of delivery-partner earnings — the one item from the
// target list with genuinely no existing view anywhere (DeliveryFunds/
// CashCollection only ever showed rider payouts and cash-in-hand).
export const getDeliveryEarningsSummaryController = async (req, res) => {
  try {
    const { from, to } = req.query;
    const summary = await getDeliveryEarningsSummary({ from, to });
    return handleResponse(res, 200, "Delivery earnings summary fetched", summary);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const getSellerEarningsSummaryController = async (req, res) => {
  try {
    const { from, to, limit } = req.query;
    const summary = await getSellerEarningsSummary({ from, to, limit });
    return handleResponse(res, 200, "Seller earnings summary fetched", summary);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

// Read-side for BulkSettlement: the model has been populated correctly by
// payoutService.js for every bulk-order payout, but nothing surfaced it back
// to admin — only the coarse Payout.isBulkSettlement filter existed. This
// gives admin the actual per-order commission/packaging/tax breakdown.
export const getAdminBulkSettlementsController = async (req, res) => {
  try {
    const { status, sellerId, orderId, from, to, page = 1, limit = 25 } = req.query;

    const query = buildBulkSettlementQuery({ status, sellerId, orderId, from, to });

    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
    const skip = (safePage - 1) * safeLimit;

    const [items, total, totals] = await Promise.all([
      BulkSettlement.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .populate("sellerId", "shopName")
        .populate("payout", "status amount")
        .populate("order", "orderId status")
        .lean(),
      BulkSettlement.countDocuments(query),
      getBulkSettlementTotals(query),
    ]);

    return handleResponse(res, 200, "Bulk settlements fetched", {
      items,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1,
      totals,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Same read-side as above, scoped to the logged-in seller's own store — the
// BulkSettlement collection was admin-only until now, so sellers had no way
// to see the commission/packaging/tax split behind their "Bulk" order badge.
export const getSellerBulkSettlementsController = async (req, res) => {
  try {
    const sellerId = req.user?.id;
    const { status, orderId, from, to, page = 1, limit = 25 } = req.query;

    const query = buildBulkSettlementQuery({ status, sellerId, orderId, from, to });

    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
    const skip = (safePage - 1) * safeLimit;

    const [items, total, totals] = await Promise.all([
      BulkSettlement.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .populate("payout", "status amount")
        .populate("order", "orderId status")
        .lean(),
      BulkSettlement.countDocuments(query),
      getBulkSettlementTotals(query),
    ]);

    return handleResponse(res, 200, "Bulk settlements fetched", {
      items,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1,
      totals,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

const buildBulkSettlementQuery = ({ status, sellerId, orderId, from, to }) => {
  const query = {};
  if (status) query.status = status;
  if (sellerId) query.sellerId = sellerId;
  if (orderId) query.orderId = { $regex: String(orderId).trim(), $options: "i" };
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) query.createdAt.$lte = new Date(to);
  }
  return query;
};

const getBulkSettlementTotals = async (query) => {
  const [row] = await BulkSettlement.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        sellerPayoutAmount: { $sum: "$sellerPayoutAmount" },
        commissionAmount: { $sum: "$commissionAmount" },
        packagingAmount: { $sum: "$packagingAmount" },
        taxAmount: { $sum: "$taxAmount" },
      },
    },
  ]);
  return {
    count: row?.count || 0,
    sellerPayoutAmount: roundCurrency(row?.sellerPayoutAmount || 0),
    commissionAmount: roundCurrency(row?.commissionAmount || 0),
    packagingAmount: roundCurrency(row?.packagingAmount || 0),
    taxAmount: roundCurrency(row?.taxAmount || 0),
  };
};

// Read-side for Refund: the model is correctly written on every return,
// price-adjustment, and cancellation refund, but nothing ever reads it back
// — admin's Returns page shows refund amounts from the Order's own return
// subdocument instead. This is the only place `mode`/`gatewayReference`/
// `failureReason` are recorded, so it's also the only way to find a refund
// that's stuck in "initiated" (gateway refunds aren't auto-reconciled here).
export const getAdminRefundsController = async (req, res) => {
  try {
    const { status, type, mode, orderId, page = 1, limit = 25 } = req.query;

    const query = {};
    if (status) query.status = status;
    if (type) query.type = type;
    if (mode) query.mode = mode;
    if (orderId) query.orderId = { $regex: String(orderId).trim(), $options: "i" };

    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
    const skip = (safePage - 1) * safeLimit;

    const [items, total, stuckCount] = await Promise.all([
      Refund.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .populate("order", "orderId status seller customer")
        .lean(),
      Refund.countDocuments(query),
      // "Stuck" = still initiated after more than an hour — gateway refunds
      // in this codebase aren't auto-reconciled, so these need a human to check.
      Refund.countDocuments({
        status: "initiated",
        mode: "gateway",
        createdAt: { $lte: new Date(Date.now() - 60 * 60 * 1000) },
      }),
    ]);

    return handleResponse(res, 200, "Refunds fetched", {
      items,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1,
      stuckCount,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const processAdminFinancePayoutsController = async (req, res) => {
  try {
    const validated = validateWithJoi(payoutProcessSchema, req.body || {});
    if (!validated.isValid) {
      return handleResponse(res, 400, validated.message);
    }

    const result = await bulkProcessPayouts({
      payoutIds: validated.value.payoutIds,
      payoutType: validated.value.payoutType,
      limit: validated.value.limit,
      remarks: validated.value.remarks || "",
      adminId: req.user?.id || null,
    });

    return handleResponse(res, 200, "Payout processing completed", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const settleSellerPayoutManualController = async (req, res) => {
  try {
    const { payoutId, remarks, transactionRef } = req.body || {};
    if (!payoutId) {
      return handleResponse(res, 400, "payoutId is required");
    }

    const payout = await Payout.findById(payoutId);
    if (!payout) {
      return handleResponse(res, 404, "Payout record not found");
    }

    if (payout.status === "COMPLETED") {
      return handleResponse(res, 400, "Payout has already been marked as settled.");
    }

    if (transactionRef) {
      payout.metadata = { ...(payout.metadata || {}), transactionRef };
      await payout.save();
    }

    // Previously duplicated processPayout()'s own hold-check and status
    // writes here, but skipped the actual Wallet pendingBalance ->
    // availableBalance move and LedgerEntry write — every payout "manually
    // settled" through this admin route left the seller's wallet balance
    // permanently out of sync with what Payout/Order records showed as
    // settled. This route's hold-check was never actually a deliberate
    // bypass of processPayout's — it enforced the identical condition — so
    // delegating to processPayout (which also keeps BulkSettlement and
    // settlementStatus.overall in sync) is a strict fix, not a behavior
    // change for callers.
    const processed = await processPayout(payoutId, {
      remarks,
      adminId: req.user?.id || null,
    });

    return handleResponse(res, 200, "Seller payout successfully settled by admin", processed);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return handleResponse(res, statusCode, error.message);
  }
};

/**
 * Manually place a seller's payout for this order on hold — distinct from
 * the automatic return-window hold (order.js financeFlags.sellerPayoutHeld).
 * Excluded from returnWindowReleaseJob.js's auto-release query, so this
 * only clears via releaseSellerPayoutController below, not by the return
 * window simply expiring.
 */
export const holdSellerPayoutController = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body || {};
    if (!reason || !String(reason).trim()) {
      return handleResponse(res, 400, "reason is required to place a payout on hold");
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return handleResponse(res, 404, "Order not found");
    }
    if (["COMPLETED", "NOT_APPLICABLE"].includes(order.settlementStatus?.sellerPayout)) {
      return handleResponse(res, 400, `Cannot hold a payout that is already ${order.settlementStatus?.sellerPayout}`);
    }

    order.settlementStatus = {
      ...(order.settlementStatus || {}),
      sellerPayout: "HOLD",
    };
    order.financeFlags = {
      ...(order.financeFlags || {}),
      sellerPayoutHeld: true,
      manualSettlementHold: true,
      manualSettlementHoldReason: String(reason).trim(),
    };
    await order.save();

    await createFinanceAuditLog({
      action: FINANCE_AUDIT_ACTION.SELLER_PAYOUT_HELD,
      actorType: OWNER_TYPE.ADMIN,
      actorId: req.user?.id || null,
      orderId: order._id,
      metadata: { reason: String(reason).trim() },
    });

    return handleResponse(res, 200, "Seller payout placed on hold", order);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/** Releases a manual hold placed by holdSellerPayoutController above. */
export const releaseSellerPayoutController = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId });
    if (!order) {
      return handleResponse(res, 404, "Order not found");
    }
    if (order.settlementStatus?.sellerPayout !== "HOLD") {
      return handleResponse(res, 400, "This payout is not currently on hold");
    }

    order.settlementStatus = {
      ...(order.settlementStatus || {}),
      sellerPayout: "PENDING",
    };
    order.financeFlags = {
      ...(order.financeFlags || {}),
      sellerPayoutHeld: false,
      manualSettlementHold: false,
      manualSettlementHoldReason: "",
    };
    await order.save();

    await createFinanceAuditLog({
      action: FINANCE_AUDIT_ACTION.SELLER_PAYOUT_RELEASED,
      actorType: OWNER_TYPE.ADMIN,
      actorId: req.user?.id || null,
      orderId: order._id,
    });

    return handleResponse(res, 200, "Seller payout hold released", order);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/**
 * Apply a manual settlement adjustment (deduction or addition) to a seller
 * payout — the "apply settlement deductions" admin capability the checklist
 * asks for that previously didn't exist (admin could only mark a payout
 * COMPLETED wholesale, never adjust its amount).
 */
export const adjustPayoutController = async (req, res) => {
  try {
    const { payoutId } = req.params;
    const { amount, reason } = req.body || {};

    const normalizedAmount = Number(amount);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount === 0) {
      return handleResponse(res, 400, "amount must be a non-zero number (positive = credit seller, negative = deduct)");
    }
    if (!reason || !String(reason).trim()) {
      return handleResponse(res, 400, "reason is required for a settlement adjustment");
    }

    const payout = await Payout.findById(payoutId);
    if (!payout) {
      return handleResponse(res, 404, "Payout record not found");
    }
    if (payout.status === PAYOUT_STATUS.CANCELLED) {
      return handleResponse(res, 400, "Cannot adjust a cancelled payout");
    }

    const isCredit = normalizedAmount > 0;
    const absAmount = roundCurrency(Math.abs(normalizedAmount));
    const ownerType = payout.payoutType === "SELLER" ? "SELLER" : "DELIVERY_PARTNER";
    const wallet = await getOrCreateWallet(ownerType, payout.beneficiaryId);

    if (payout.status === PAYOUT_STATUS.PENDING || payout.status === PAYOUT_STATUS.PROCESSING) {
      // Not yet paid out — adjust both the payout total and the pending bucket it's sitting in.
      const newAmount = roundCurrency(payout.amount + normalizedAmount);
      if (newAmount < 0) {
        return handleResponse(res, 400, `Adjustment would make payout amount negative (current: ${payout.amount})`);
      }
      payout.amount = newAmount;
      wallet.pendingBalance = roundCurrency(Math.max(0, (wallet.pendingBalance || 0) + normalizedAmount));
    } else {
      // Already settled — adjust the available balance directly; the payout
      // record's original amount is left as history, the adjustment is its
      // own ledger entry so the settlement stays auditable.
      if (!isCredit && (wallet.availableBalance || 0) < absAmount) {
        return handleResponse(res, 400, "Insufficient available balance for this deduction");
      }
      wallet.availableBalance = roundCurrency((wallet.availableBalance || 0) + normalizedAmount);
    }
    // createLedgerEntry only writes a ledger doc, it never touches wallet
    // aggregates — keep totalCredited/totalDebited in step with the ledger
    // the same way every other wallet-mutating flow in this file does.
    if (isCredit) {
      wallet.totalCredited = roundCurrency((wallet.totalCredited || 0) + absAmount);
    } else {
      wallet.totalDebited = roundCurrency((wallet.totalDebited || 0) + absAmount);
    }

    payout.metadata = {
      ...(payout.metadata || {}),
      adjustments: [
        ...((payout.metadata || {}).adjustments || []),
        { amount: normalizedAmount, reason: String(reason).trim(), adminId: req.user?.id || null, at: new Date() },
      ],
    };
    await Promise.all([payout.save(), wallet.save()]);

    await createLedgerEntry({
      orderId: payout.relatedOrderIds?.[0] || null,
      payoutId: payout._id,
      walletId: wallet._id,
      actorType: ownerType,
      actorId: payout.beneficiaryId,
      type: LEDGER_TRANSACTION_TYPE.ADJUSTMENT,
      direction: isCredit ? LEDGER_DIRECTION.CREDIT : LEDGER_DIRECTION.DEBIT,
      amount: absAmount,
      description: `Admin settlement adjustment: ${String(reason).trim()}`,
    });

    await createFinanceAuditLog({
      action: FINANCE_AUDIT_ACTION.FINANCE_ADJUSTMENT_APPLIED,
      actorType: OWNER_TYPE.ADMIN,
      actorId: req.user?.id || null,
      payoutId: payout._id,
      metadata: { amount: normalizedAmount, reason: String(reason).trim() },
    });

    // Keep the bulk-order breakdown modal (AdminWallet.jsx) honest — without
    // this it kept showing the pre-adjustment sellerPayoutAmount forever.
    if (payout.isBulkSettlement && payout.payoutType === "SELLER") {
      const wasPending = payout.status === PAYOUT_STATUS.PENDING || payout.status === PAYOUT_STATUS.PROCESSING;
      await BulkSettlement.updateOne(
        { payout: payout._id },
        wasPending
          ? { $set: { sellerPayoutAmount: payout.amount } }
          : { $inc: { sellerPayoutAmount: normalizedAmount } },
      );
    }

    return handleResponse(res, 200, "Settlement adjustment applied", { payout, wallet });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const exportAdminFinanceStatementController = async (req, res) => {
  try {
    const statement = await exportFinanceStatement(req.query || {});
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${statement.fileName}"`,
    );
    return res.status(200).send(statement.csv);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getDeliverySettingsController = async (req, res) => {
  try {
    const settings = await getOrCreateFinanceSettings();
    return handleResponse(res, 200, "Delivery finance settings fetched", settings);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateDeliverySettingsController = async (req, res) => {
  try {
    const validated = validateWithJoi(updateDeliverySettingsSchema, req.body || {});
    if (!validated.isValid) {
      return handleResponse(res, 400, validated.message);
    }
    const updated = await updateDeliveryFinanceSettings(validated.value);
    await createFinanceAuditLog({
      action: FINANCE_AUDIT_ACTION.DELIVERY_SETTINGS_UPDATED,
      actorType: OWNER_TYPE.ADMIN,
      actorId: req.user?.id || null,
      metadata: {
        updatedFields: Object.keys(validated.value || {}),
      },
    });
    return handleResponse(res, 200, "Delivery finance settings updated", updated);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getSellerWalletSummaryController = async (req, res) => {
  try {
    const sellerId = req.user?.id;
    const wallet = await Wallet.findOne({ ownerType: "SELLER", ownerId: sellerId }).lean();
    return handleResponse(res, 200, "Seller wallet summary fetched", {
      availableBalance: wallet?.availableBalance || 0,
      pendingBalance: wallet?.pendingBalance || 0,
      totalCredited: wallet?.totalCredited || 0,
      totalDebited: wallet?.totalDebited || 0,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getRiderWalletSummaryController = async (req, res) => {
  try {
    const riderId = req.user?.id;
    const wallet = await Wallet.findOne({
      ownerType: "DELIVERY_PARTNER",
      ownerId: riderId,
    }).lean();
    return handleResponse(res, 200, "Rider wallet summary fetched", {
      availableBalance: wallet?.availableBalance || 0,
      pendingBalance: wallet?.pendingBalance || 0,
      cashInHand: wallet?.cashInHand || 0,
      totalCredited: wallet?.totalCredited || 0,
      totalDebited: wallet?.totalDebited || 0,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
