import mongoose from "mongoose";
import Order from "../../models/order.js";
import Store from "../../models/store.js";
import Complaint from "../../models/complaint.js";
import Setting from "../../models/setting.js";
import Payout from "../../models/payout.js";
import SellerBulkSettlement from "../../models/sellerBulkSettlement.js";
import { roundCurrency } from "../../utils/money.js";
import { requireCanonicalOrderId } from "../../utils/orderLookup.js";
import { nextSettlementInvoiceNo } from "../../utils/sequenceIds.js";
import { SETTLEMENT_STATE, PAYOUT_MODE, PAYOUT_TYPE } from "../../constants/finance.js";
import { COMPLAINT_STATUS } from "../../constants/complaint.js";
import {
  createPendingPayoutForOrder,
  processPayout,
  cancelPendingPayoutForOrder,
} from "./payoutService.js";
import { createSellerPayout, isTerminalSuccess, isTerminalFailure } from "./razorpayPayoutService.js";
import { emitNotificationEvent } from "../../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../../modules/notifications/notification.constants.js";

// ---------------------------------------------------------------------------
// Seller Settlement engine (BRD section 5). Ready-to-settle, the 4 checks/dots,
// the settled-amount formula, review-before-pay, manual/automatic (RazorpayX)
// payout with idempotency, invoice + ledger (via payoutService) and amount lock.
// Everything money-related is decided SERVER-SIDE; the browser is never trusted.
// ---------------------------------------------------------------------------

function httpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function loadConfig() {
  const s = await Setting.findOne({}).select("complaint refundWindowHours razorpay settlement").lean();
  return {
    windowHours: s?.complaint?.windowHours ?? s?.refundWindowHours ?? 24,
    payoutFeePercent: s?.razorpay?.payoutFeePercent ?? 2.35,
    requireDifferentReviewerAndPayer: Boolean(s?.settlement?.requireDifferentReviewerAndPayer),
  };
}

// ---- money ----------------------------------------------------------------
export function getQuoted(order) {
  // The seller's quoted price = their payout total frozen at order time.
  return roundCurrency(
    order.sellerSettlement?.quotedAmount || order.paymentBreakdown?.sellerPayoutTotal || 0,
  );
}
export function deductionsTotal(order) {
  const d = order.sellerSettlement?.deductions || {};
  return roundCurrency(
    (d.complaint || 0) + (d.packing || 0) + (d.extra || 0) + (d.quality || 0) + (d.priceMismatch || 0) + (d.misc || 0),
  );
}
export function computeSettled(order) {
  return roundCurrency(Math.max(0, getQuoted(order) - deductionsTotal(order)));
}

// ---- checks ---------------------------------------------------------------
function isDelivered(order) {
  return Boolean(order.deliveredAt) || order.status === "delivered" || String(order.workflowStatus || "").toUpperCase() === "DELIVERED";
}
export function paymentReceived(order) {
  // Gateway-aware: "payment received" = the order's actual capture is
  // reconciled, whichever gateway took it (live: Razorpay). A live fetch
  // could be added here keyed on the gateway payment id; the reconciled
  // status is the source of truth.
  const ps = String(order.paymentStatus || "").toUpperCase();
  if (["PAID", "CASH_COLLECTED", "COD_RECONCILED", "PARTIALLY_REMITTED"].includes(ps)) return true;
  return String(order.payment?.status || "").toLowerCase() === "completed";
}

function windowClose(order, windowHours) {
  if (order.complaintWindowClosesAt) return new Date(order.complaintWindowClosesAt);
  if (order.deliveredAt) return new Date(new Date(order.deliveredAt).getTime() + windowHours * 3600 * 1000);
  return null;
}

/**
 * The four BRD dots. Each: { key, label, dot: 'g'|'a'|'r', ok, tooltip }.
 * green = clear, amber = waiting, red = needs action.
 */
export function computeChecks(order, complaint, windowHours) {
  const now = new Date();
  const wc = windowClose(order, windowHours);
  const windowOpen = wc ? now < wc : false;

  const delivered = isDelivered(order);
  const paid = paymentReceived(order);

  // A seller-approved complaint is settlement-clear: the seller has accepted
  // the resolution and its approved deduction is already frozen on the order.
  // Customer refund/admin closure may complete afterwards without blocking the
  // seller's remaining payout.
  const complaintResolvedForSettlement = Boolean(
    complaint && [COMPLAINT_STATUS.SELLER_APPROVED, COMPLAINT_STATUS.CLOSED].includes(complaint.status),
  );

  let complaintDot;
  if (complaint && !complaintResolvedForSettlement) complaintDot = "r";
  else if (!complaint && windowOpen) complaintDot = "a";
  else complaintDot = "g";

  const penaltyClear = !order.financeFlags?.manualSettlementHold;

  const dots = [
    { key: "delivered", label: "Delivered", dot: delivered ? "g" : "r", ok: delivered,
      tooltip: delivered ? "Delivered" : "Not delivered yet" },
    { key: "payment", label: "Razorpay payment", dot: paid ? "g" : "r", ok: paid,
      tooltip: paid ? "Payment received" : "Payment not confirmed" },
    { key: "complaint", label: "No open complaint",
      dot: complaintDot, ok: complaintDot === "g",
      tooltip: complaintDot === "r" ? "Complaint open — settlement held"
        : complaintDot === "a" ? "Complaint window still open"
          : complaint?.status === COMPLAINT_STATUS.SELLER_APPROVED
            ? "Seller accepted the complaint resolution and deduction"
            : "No open complaint" },
    { key: "penalty", label: "No penalty / seller issue", dot: penaltyClear ? "g" : "r", ok: penaltyClear,
      tooltip: penaltyClear ? "No penalty" : "On hold / penalty pending" },
  ];
  const ready = dots.every((d) => d.dot === "g");
  return { dots, ready };
}

export function resolveSettlementState(order, checks) {
  const st = order.sellerSettlement || {};
  const cur = order.settlementStatus?.settlementState;
  if (st.lockedAt || cur === SETTLEMENT_STATE.SETTLED) return SETTLEMENT_STATE.SETTLED;
  if (cur === SETTLEMENT_STATE.PAYING) return SETTLEMENT_STATE.PAYING;
  if (cur === SETTLEMENT_STATE.FAILED) return SETTLEMENT_STATE.FAILED;
  const complaintDot = checks.dots.find((d) => d.key === "complaint")?.dot;
  if (complaintDot === "r") return SETTLEMENT_STATE.HELD;
  if (checks.ready) return st.reviewed ? SETTLEMENT_STATE.REVIEWED : SETTLEMENT_STATE.READY;
  if (complaintDot === "a") return SETTLEMENT_STATE.WINDOW_OPEN;
  return SETTLEMENT_STATE.HELD;
}

// ---- delivery hook --------------------------------------------------------
/**
 * Fields to $set when an order is delivered, to open the 24h window and start
 * the settlement machine. Called from the delivery completion path.
 */
export function openComplaintWindowOnDelivery(deliveredAt, windowHours) {
  const closes = new Date(new Date(deliveredAt).getTime() + windowHours * 3600 * 1000);
  return {
    complaintWindowClosesAt: closes,
    "settlementStatus.settlementState": SETTLEMENT_STATE.WINDOW_OPEN,
  };
}

// ---- per-minute READY sweep (background job) ------------------------------
export async function markReadySweep({ now = new Date() } = {}) {
  const { windowHours } = await loadConfig();
  let marked = 0;
  const cursor = Order.find({
    deliveredAt: { $ne: null },
    "settlementStatus.settlementState": { $in: [null, SETTLEMENT_STATE.WINDOW_OPEN, SETTLEMENT_STATE.HELD] },
  })
    .select("deliveredAt complaintWindowClosesAt complaintRef settlementStatus financeFlags paymentStatus payment status workflowStatus sellerSettlement paymentBreakdown")
    .cursor();

  for await (const order of cursor) {
    const complaint = order.complaintRef ? await Complaint.findById(order.complaintRef).select("status").lean() : null;
    const checks = computeChecks(order, complaint, windowHours);
    const next = resolveSettlementState(order, checks);
    const set = {};
    if (!order.complaintWindowClosesAt && order.deliveredAt) {
      set.complaintWindowClosesAt = windowClose(order, windowHours);
    }
    if (next !== order.settlementStatus?.settlementState) {
      set["settlementStatus.settlementState"] = next;
    }
    if (Object.keys(set).length) {
      await Order.updateOne({ _id: order._id }, { $set: set });
      if (set["settlementStatus.settlementState"] === SETTLEMENT_STATE.READY) marked += 1;
    }
  }
  return { markedReady: marked };
}

// ---- masking + wildcard ---------------------------------------------------
export function maskPhone(phone) {
  const p = String(phone || "");
  if (p.length <= 5) return p ? `●●●●●${p}` : "";
  return `●●●●●${p.slice(-5)}`;
}

export function wildcardToRegex(q) {
  // Escape regex specials, then turn the BRD wildcards * -> .* and ? -> .
  const escaped = String(q).trim().replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(escaped, "i");
}

// ---- list -----------------------------------------------------------------
export async function listSettlements({ q = "", sort = "date", dir = "desc", page = 1, limit = 20 } = {}) {
  const { windowHours } = await loadConfig();
  const orders = await Order.find({ deliveredAt: { $ne: null } })
    .select("orderId shortOrderId deliveredAt customer seller address items complaintRef settlementStatus financeFlags paymentStatus payment status workflowStatus sellerSettlement paymentBreakdown")
    .populate("customer", "name phone")
    .populate("seller", "shopName")
    .lean();

  const complaintMap = await loadComplaintMap(orders);

  let rows = orders.map((o) => buildRow(o, complaintMap, windowHours));

  if (q && q.trim()) {
    const re = wildcardToRegex(q);
    rows = rows.filter((r) =>
      re.test([r.orderId, r.customerName, r.sellerName, r._phoneRaw, r._itemNames, r.complaintId].join(" ")),
    );
  }

  const key = { date: "deliveredAt", id: "orderId", cust: "customerName", seller: "sellerName", amt: "settledAmount", rev: "reviewed", set: "settled" }[sort] || "deliveredAt";
  const factor = dir === "asc" ? 1 : -1;
  rows.sort((a, b) => (a[key] > b[key] ? factor : a[key] < b[key] ? -factor : 0));

  const total = rows.length;
  const start = (Math.max(1, Number(page)) - 1) * Number(limit);
  const paged = rows.slice(start, start + Number(limit)).map(stripInternal);

  return { items: paged, total, page: Number(page), limit: Number(limit) };
}

async function loadComplaintMap(orders) {
  const ids = orders.map((o) => o.complaintRef).filter(Boolean);
  if (!ids.length) return new Map();
  const complaints = await Complaint.find({ _id: { $in: ids } }).select("complaintId status amount").lean();
  return new Map(complaints.map((c) => [String(c._id), c]));
}

function buildRow(o, complaintMap, windowHours) {
  const complaint = o.complaintRef ? complaintMap.get(String(o.complaintRef)) : null;
  const checks = computeChecks(o, complaint, windowHours);
  const settled = Boolean(o.sellerSettlement?.lockedAt) || o.settlementStatus?.settlementState === SETTLEMENT_STATE.SETTLED;
  const phoneRaw = o.address?.phone || o.customer?.phone || "";
  return {
    orderId: o.orderId,
    shortOrderId: o.shortOrderId || null,
    deliveredAt: o.deliveredAt,
    customerName: o.customer?.name || "",
    sellerName: o.seller?.shopName || "",
    maskedPhone: maskPhone(phoneRaw),
    settlementAmount: computeSettled(o),
    settledAmount: computeSettled(o),
    reviewed: Boolean(o.sellerSettlement?.reviewed),
    settled,
    mode: o.sellerSettlement?.mode || null,
    state: o.settlementStatus?.settlementState || null,
    ready: checks.ready,
    dots: checks.dots,
    complaintId: complaint?.complaintId || "",
    complaintDeduction: complaint?.amount || 0,
    _phoneRaw: phoneRaw,
    _itemNames: (o.items || []).map((i) => i.name).join(" "),
  };
}

function stripInternal(r) {
  const { _phoneRaw, _itemNames, ...rest } = r;
  return rest;
}

// ---- detail ---------------------------------------------------------------
export async function getSettlementDetail(orderId, { includeMoney = true } = {}) {
  orderId = await requireCanonicalOrderId(orderId);
  const { windowHours, payoutFeePercent } = await loadConfig();
  const order = await Order.findOne({ orderId })
    .populate("customer", "name phone")
    .populate("seller", "shopName upiId accountNumber ifsc")
    .lean();
  if (!order) throw httpError("Order not found", 404);

  const complaint = order.complaintRef ? await Complaint.findById(order.complaintRef).select("complaintId status amount").lean() : null;
  const checks = computeChecks(order, complaint, windowHours);

  const detail = {
    orderId: order.orderId,
    shortOrderId: order.shortOrderId || null,
    customerName: order.customer?.name || "",
    maskedPhone: maskPhone(order.address?.phone || order.customer?.phone || ""),
    sellerName: order.seller?.shopName || "",
    deliveredAt: order.deliveredAt,
    items: (order.items || []).map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, lineTotal: roundCurrency((i.quantity || 1) * (i.price || 0)) })),
    quotedAmount: getQuoted(order),
    deductions: order.sellerSettlement?.deductions || {},
    settledAmount: computeSettled(order),
    reviewed: Boolean(order.sellerSettlement?.reviewed),
    settled: Boolean(order.sellerSettlement?.lockedAt),
    mode: order.sellerSettlement?.mode || null,
    failureReason: order.sellerSettlement?.failureReason || "",
    state: order.settlementStatus?.settlementState || null,
    payoutProgress: {
      razorpay: order.sellerSettlement?.mode === PAYOUT_MODE.AUTOMATIC
        ? order.settlementStatus?.settlementState === SETTLEMENT_STATE.SETTLED
          ? "PROCESSED"
          : order.settlementStatus?.settlementState === SETTLEMENT_STATE.FAILED
            ? "FAILED"
            : order.settlementStatus?.settlementState === SETTLEMENT_STATE.PAYING
              ? "PROCESSING"
              : "PENDING"
        : "NOT_APPLICABLE",
      settlement: order.sellerSettlement?.lockedAt || order.settlementStatus?.settlementState === SETTLEMENT_STATE.SETTLED
        ? "SETTLED"
        : "PENDING",
    },
    payoutHold: order.settlementStatus?.sellerPayout === "HOLD",
    manualHold: Boolean(order.financeFlags?.manualSettlementHold),
    holdReason: order.financeFlags?.manualSettlementHoldReason || "",
    checks: checks.dots,
    ready: checks.ready,
    complaint: complaint ? { complaintId: complaint.complaintId, status: complaint.status, deduction: complaint.amount } : null,
    invoiceNo: order.sellerSettlement?.invoiceNo || "",
    txnNo: order.sellerSettlement?.txnNo || "",
    bulkRef: order.sellerSettlement?.bulkRef || "",
    seller: { upiId: order.seller?.upiId || "" },
  };

  // Order-money box is Admin/Finance only (SET-11 / SEC-01).
  if (includeMoney) {
    const pb = order.paymentBreakdown || {};
    detail.orderMoney = {
      customerPaid: roundCurrency(pb.grandTotal || 0),
      itemPrice: getQuoted(order),
      gst: roundCurrency(pb.taxTotal || 0),
      commission: roundCurrency(pb.adminProductCommissionTotal || 0),
      deliveryCharge: roundCurrency(pb.deliveryFeeCharged || 0),
      riderCost: roundCurrency(pb.riderPayoutTotal || 0),
      // Informational only (BRD SET-11) — never deducted from the seller's
      // settled amount; the settled-amount formula doesn't include it, so
      // Zinto absorbs the gateway fee, not the seller (open BRD question).
      gatewayFee: roundCurrency((roundCurrency(pb.grandTotal || 0) * payoutFeePercent) / 100),
      gatewayFeePercent: payoutFeePercent,
    };
  }
  return detail;
}

// ---- set issue deductions -------------------------------------------------
export async function setIssues(orderId, issues = {}, actor) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId }).select("sellerSettlement orderId");
  if (!order) throw httpError("Order not found", 404);
  if (order.sellerSettlement?.lockedAt) throw httpError("Settlement is locked — amounts cannot be edited", 409);

  const clean = (v) => roundCurrency(Math.max(0, Number(v) || 0));
  const set = {};
  for (const k of ["packing", "extra", "quality", "priceMismatch", "misc"]) {
    if (issues[k] != null) set[`sellerSettlement.deductions.${k}`] = clean(issues[k]);
  }
  if (!Object.keys(set).length) throw httpError("No issue amounts provided", 400);
  await Order.updateOne({ _id: order._id }, { $set: set });
  return getSettlementDetail(orderId);
}

// ---- review ---------------------------------------------------------------
export async function markReviewed(orderId, actor) {
  orderId = await requireCanonicalOrderId(orderId);
  const { windowHours } = await loadConfig();
  const order = await Order.findOne({ orderId });
  if (!order) throw httpError("Order not found", 404);
  if (order.sellerSettlement?.lockedAt) throw httpError("Settlement already completed", 409);

  const complaint = order.complaintRef ? await Complaint.findById(order.complaintRef).select("status").lean() : null;
  const checks = computeChecks(order, complaint, windowHours);
  if (!checks.ready) throw httpError("All four checks must be green before review", 409);

  order.sellerSettlement = {
    ...(order.sellerSettlement?.toObject?.() || order.sellerSettlement || {}),
    reviewed: true,
    reviewedBy: actor?.id || null,
    reviewedAt: new Date(),
    quotedAmount: getQuoted(order),
  };
  order.settlementStatus = { ...(order.settlementStatus || {}), settlementState: SETTLEMENT_STATE.REVIEWED };
  await order.save();
  return getSettlementDetail(orderId);
}

// ---- pay (manual + automatic) ---------------------------------------------
export async function paySettlement(orderId, { mode = PAYOUT_MODE.AUTOMATIC, txnNo = "", idempotencyKey, bulkRef = "" }, actor) {
  orderId = await requireCanonicalOrderId(orderId);
  const { windowHours, requireDifferentReviewerAndPayer } = await loadConfig();

  const order = await Order.findOne({ orderId }).populate("seller");
  if (!order) throw httpError("Order not found", 404);
  if (order.sellerSettlement?.lockedAt || order.settlementStatus?.settlementState === SETTLEMENT_STATE.SETTLED) {
    // Idempotent: already settled -> return current state, don't pay twice.
    return getSettlementDetail(orderId);
  }
  if (!order.sellerSettlement?.reviewed) throw httpError("Review the order before paying", 409);
  // Maker-checker (BRD SEC-05, opt-in via Setting.settlement.requireDifferentReviewerAndPayer).
  if (
    requireDifferentReviewerAndPayer &&
    order.sellerSettlement?.reviewedBy &&
    actor?.id &&
    String(order.sellerSettlement.reviewedBy) === String(actor.id)
  ) {
    throw httpError(
      "Maker-checker is enabled: the reviewer and the payer must be different people. Ask another Admin/Finance user to process this payment.",
      409,
    );
  }

  const complaint = order.complaintRef ? await Complaint.findById(order.complaintRef).select("status").lean() : null;
  const checks = computeChecks(order, complaint, windowHours);
  if (!checks.ready) throw httpError("All four checks must be green before paying", 409);

  const settledAmount = computeSettled(order);
  if (!(settledAmount > 0)) throw httpError("Settled amount must be positive", 400);

  // Razorpay's X-Payout-Idempotency header only accepts letters, digits,
  // hyphens, underscores and spaces. Keep it compact and deterministic enough
  // for a single payment attempt; the database claim still prevents doubles.
  const rawKey = idempotencyKey || `settle-${order.shortOrderId || String(order._id)}-${Date.now()}`;
  const key = String(rawKey)
    .replace(/[^A-Za-z0-9_ -]/g, "-")
    .slice(0, 40);

  // Atomically claim the settlement so a double-click / retry can't start two
  // payouts. Only transitions a not-yet-paying order into PAYING + stamps key.
  const claimed = await Order.findOneAndUpdate(
    {
      _id: order._id,
      "sellerSettlement.lockedAt": null,
      "sellerSettlement.idempotencyKey": null,
      "settlementStatus.settlementState": { $ne: SETTLEMENT_STATE.SETTLED },
    },
    {
      $set: {
        "sellerSettlement.idempotencyKey": key,
        "sellerSettlement.mode": mode,
        "sellerSettlement.quotedAmount": getQuoted(order),
        "sellerSettlement.bulkRef": bulkRef,
        "settlementStatus.settlementState": SETTLEMENT_STATE.PAYING,
      },
    },
    { new: true },
  );
  if (!claimed) {
    // Someone else already claimed it (in-flight) — idempotent no-op.
    return getSettlementDetail(orderId);
  }

  // Reconcile the order's payout to exactly the settled amount: reverse any
  // stale auto-created pending payout, then create a fresh one at the settled
  // amount so wallet accounting stays correct.
  await cancelPendingPayoutForOrder(order._id, PAYOUT_TYPE.SELLER, { remarks: "Re-created for settlement", adminId: actor?.id });
  const payout = await createPendingPayoutForOrder({
    order,
    payoutType: PAYOUT_TYPE.SELLER,
    beneficiaryId: order.seller?._id || order.seller,
    amount: settledAmount,
    remarks: "Seller settlement",
    metadata: { settlement: true, mode, bulkRef },
  });
  if (!payout) {
    await failSettlement(order._id, "Could not create payout");
    throw httpError("Could not create payout", 500);
  }
  await Payout.updateOne({ _id: payout._id }, { $set: { mode, idempotencyKey: key, bulkRef, txnNo } });

  if (mode === PAYOUT_MODE.MANUAL) {
    if (!txnNo || !String(txnNo).trim()) {
      await failSettlement(order._id, "Transaction number required");
      throw httpError("A transaction number is required for manual payment", 400);
    }
    try {
      await processPayout(payout._id, { remarks: `Manual settlement · ${txnNo}`, adminId: actor?.id });
      await finalizeSettlement(order._id, { payoutId: payout._id, txnNo, mode });
      return getSettlementDetail(orderId);
    } catch (error) {
      // Do not leave a failed manual attempt permanently stuck in PAYING with
      // its idempotency key claimed. A retry will cancel/reconcile the still
      // pending payout before creating the replacement.
      const latestPayout = await Payout.findById(payout._id).select("status").lean();
      if (latestPayout?.status !== "COMPLETED") {
        await failSettlement(order._id, error.message || "Manual payout failed");
      }
      throw error;
    }
  }

  // AUTOMATIC: call RazorpayX; completion arrives via the webhook.
  try {
    const result = await createSellerPayout({
      store: order.seller,
      amount: settledAmount,
      idempotencyKey: key,
      // Razorpay caps reference_id at 40 characters. The previous full order
      // ID + idempotency key exceeded that limit and caused HTTP 400.
      referenceId: `SETTLE-${order.shortOrderId || String(order._id)}-${Date.now()}`.slice(0, 40),
    });
    await Payout.updateOne(
      { _id: payout._id },
      { $set: { status: "PROCESSING", razorpayPayoutId: result.payoutId, webhookStatus: result.status } },
    );
    await Order.updateOne(
      { _id: order._id },
      { $set: { "sellerSettlement.razorpayPayoutId": result.payoutId } },
    );
    if (result.fundAccountId && order.seller?._id) {
      await Store.updateOne({ _id: order.seller._id }, { $set: { razorpayFundAccountId: result.fundAccountId } });
    }
    return getSettlementDetail(orderId);
  } catch (e) {
    await failSettlement(order._id, e.message || "Payout API failed");
    throw httpError(`Payout failed: ${e.message}`, 502);
  }
}

async function failSettlement(orderDbId, reason) {
  await Order.updateOne(
    { _id: orderDbId },
    {
      $set: {
        "settlementStatus.settlementState": SETTLEMENT_STATE.FAILED,
        "sellerSettlement.failureReason": reason,
        "sellerSettlement.idempotencyKey": null, // allow a retry
      },
    },
  );
  await syncBulkOrder(orderDbId, { status: SETTLEMENT_STATE.FAILED, failureReason: reason });
}

// Keep the SellerBulkSettlement per-order entry + counts in sync when an order
// that belongs to a bulk batch reaches a terminal state (manual, webhook, fail).
async function syncBulkOrder(orderDbId, patch) {
  const order = await Order.findById(orderDbId).select("sellerSettlement.bulkRef").lean();
  const ref = order?.sellerSettlement?.bulkRef;
  if (!ref) return;
  const bulk = await SellerBulkSettlement.findOne({ refNo: ref });
  if (!bulk) return;
  const idx = bulk.orders.findIndex((o) => String(o.order) === String(orderDbId));
  if (idx < 0) return;
  bulk.orders[idx] = { ...bulk.orders[idx].toObject?.() ? bulk.orders[idx].toObject() : bulk.orders[idx], ...patch };
  bulk.settledCount = bulk.orders.filter((o) => o.status === SETTLEMENT_STATE.SETTLED).length;
  bulk.failedCount = bulk.orders.filter((o) => o.status === SETTLEMENT_STATE.FAILED).length;
  bulk.status = bulk.failedCount === 0
    ? (bulk.settledCount === bulk.orderCount ? "COMPLETED" : "PENDING")
    : bulk.settledCount === 0 ? "FAILED" : "PARTIAL";
  if (bulk.status === "COMPLETED" && !bulk.settledAt) bulk.settledAt = new Date();
  await bulk.save();
}

async function finalizeSettlement(orderDbId, { payoutId, txnNo = "", utr = "", mode }) {
  const invoiceNo = await nextSettlementInvoiceNo();
  const now = new Date();
  await Order.updateOne(
    { _id: orderDbId },
    {
      $set: {
        "settlementStatus.settlementState": SETTLEMENT_STATE.SETTLED,
        "sellerSettlement.payout": payoutId,
        "sellerSettlement.txnNo": txnNo,
        "sellerSettlement.utr": utr,
        "sellerSettlement.mode": mode,
        "sellerSettlement.invoiceNo": invoiceNo,
        "sellerSettlement.paidAt": now,
        "sellerSettlement.lockedAt": now,
      },
    },
  );
  const order = await Order.findById(orderDbId)
    .select("orderId seller customer sellerSettlement")
    .populate("customer", "name")
    .lean();
  await syncBulkOrder(orderDbId, {
    status: SETTLEMENT_STATE.SETTLED,
    invoiceNo,
    txnNo,
    settledAmount: computeSettled(order),
  });
  // SLV-06: "a notification with Order ID, Customer Name, Amount and Settled
  // amount" — the persistent settlement list is the full "columns" view;
  // this push/in-app notification carries the same facts in its payload.
  // BLK-07: bulk invoices/notifications say "Bulk settlement".
  const bulkRef = order.sellerSettlement?.bulkRef || "";
  emitNotificationEvent(NOTIFICATION_EVENTS.SELLER_SETTLEMENT_PAID, {
    orderId: order.orderId,
    sellerId: order.seller,
    invoiceNo,
    customerName: order.customer?.name || "",
    quotedAmount: getQuoted(order),
    amount: computeSettled(order),
    bulkRef,
  });
  return invoiceNo;
}

// ---- webhook (automatic payout completion) --------------------------------
export async function handlePayoutWebhook(payload) {
  // Razorpay payout webhook: entity has id + status (+ utr on success).
  const entity = payload?.payload?.payout?.entity || payload?.payout || payload || {};
  const payoutId = entity.id || entity.payoutId;
  const status = entity.status;
  const utr = entity.utr || "";
  if (!payoutId) return { ok: false, reason: "no payout id" };

  const payout = await Payout.findOne({ razorpayPayoutId: payoutId });
  if (!payout) return { ok: false, reason: "payout not found" };
  await Payout.updateOne({ _id: payout._id }, { $set: { webhookStatus: status, utr } });

  const orderDbId = payout.relatedOrderIds?.[0];
  if (!orderDbId) return { ok: false, reason: "no order" };

  if (isTerminalSuccess(status)) {
    // Move money + ledger via the vetted path, then finalise the settlement.
    if (payout.status !== "COMPLETED") {
      await processPayout(payout._id, { remarks: `Razorpay payout ${payoutId} · UTR ${utr}` });
    }
    await finalizeSettlement(orderDbId, { payoutId: payout._id, utr, mode: PAYOUT_MODE.AUTOMATIC });
    return { ok: true, outcome: "SETTLED" };
  }
  if (isTerminalFailure(status)) {
    await Payout.updateOne({ _id: payout._id }, { $set: { status: "FAILED", failedReason: `webhook:${status}` } });
    await failSettlement(orderDbId, `Razorpay payout ${status}`);
    emitNotificationEvent(NOTIFICATION_EVENTS.SELLER_SETTLEMENT_FAILED, { payoutId });
    return { ok: true, outcome: "FAILED" };
  }
  return { ok: true, outcome: "PENDING" };
}

// ---- retry a failed payout ------------------------------------------------
export async function retrySettlement(orderId, { mode, txnNo, idempotencyKey }, actor) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId }).select("settlementStatus sellerSettlement orderId");
  if (!order) throw httpError("Order not found", 404);
  const state = order.settlementStatus?.settlementState;
  const recoverableManualPaying =
    state === SETTLEMENT_STATE.PAYING && order.sellerSettlement?.mode === PAYOUT_MODE.MANUAL;
  if (state !== SETTLEMENT_STATE.FAILED && !recoverableManualPaying) {
    throw httpError("Only a failed manual settlement can be retried", 409);
  }
  if (recoverableManualPaying) {
    const inFlight = await Payout.findOne({
      relatedOrderIds: order._id,
      status: { $in: ["PENDING", "FAILED", "CANCELLED"] },
    }).lean();
    if (!inFlight) {
      throw httpError("This payment may already be processing. Refresh before retrying.", 409);
    }
  }
  // Clear the failed claim so paySettlement can re-run idempotently.
  await Order.updateOne(
    { _id: order._id },
    {
      $set: {
        "sellerSettlement.idempotencyKey": null,
        "settlementStatus.settlementState": SETTLEMENT_STATE.REVIEWED,
      },
    },
  );
  return paySettlement(orderId, { mode: mode || order.sellerSettlement?.mode, txnNo, idempotencyKey }, actor);
}

// ---- seller view (SLV-01..07) ---------------------------------------------
// What the seller sees: their own orders with quoted + settled amounts, status
// and the settlement invoice. Never commission / platform fee / customer paid /
// customer phone (SLV-04/05, SEC-01).
export async function listSellerSettlements(sellerStoreId, { page = 1, limit = 50 } = {}) {
  const orders = await Order.find({ seller: sellerStoreId, deliveredAt: { $ne: null } })
    .select("orderId shortOrderId deliveredAt customer items sellerSettlement settlementStatus paymentBreakdown")
    .populate("customer", "name")
    .sort({ deliveredAt: -1 })
    .lean();

  const items = orders.map((o) => {
    const settled = Boolean(
      o.sellerSettlement?.lockedAt || o.settlementStatus?.settlementState === SETTLEMENT_STATE.SETTLED,
    );
    const state = o.settlementStatus?.settlementState;
    const status = settled
      ? "Credited"
      : state === SETTLEMENT_STATE.PAYING
        ? "Processing"
        : state === SETTLEMENT_STATE.FAILED
          ? "Payment failed"
          : "Pending";
    return {
      orderId: o.orderId,
      shortOrderId: o.shortOrderId || null,
      date: o.deliveredAt,
      customerName: o.customer?.name || "",
      quotedAmount: getQuoted(o),
      settledAmount: computeSettled(o),
      settled,
      status,
      invoiceNo: o.sellerSettlement?.invoiceNo || "",
      txnNo: o.sellerSettlement?.txnNo || "",
      bulkRef: o.sellerSettlement?.bulkRef || "",
    };
  });

  const total = items.length;
  const start = (Math.max(1, Number(page)) - 1) * Number(limit);
  return { items: items.slice(start, start + Number(limit)), total, page: Number(page), limit: Number(limit) };
}

// Seller settlement invoice (ownership-checked), with NO commission/fees.
export async function getSellerSettlementInvoice(orderId, sellerStoreId) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId }).populate("seller", "shopName").lean();
  if (!order) throw httpError("Order not found", 404);
  if (String(order.seller?._id || order.seller) !== String(sellerStoreId)) {
    throw httpError("This order is not yours", 403);
  }
  if (!order.sellerSettlement?.invoiceNo) throw httpError("Settlement invoice not generated yet", 404);
  return {
    invoiceNo: order.sellerSettlement.invoiceNo,
    orderId: order.orderId,
    shortOrderId: order.shortOrderId || null,
    sellerName: order.seller?.shopName || "",
    quotedAmount: getQuoted(order),
    deductions: order.sellerSettlement.deductions || {},
    settledAmount: computeSettled(order),
    txnNo: order.sellerSettlement.txnNo || "",
    bulkRef: order.sellerSettlement.bulkRef || "",
    paidAt: order.sellerSettlement.paidAt,
    items: (order.items || []).map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })),
  };
}

// ---- invoice --------------------------------------------------------------
export async function getSettlementInvoice(orderId) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId }).populate("seller", "shopName").lean();
  if (!order) throw httpError("Order not found", 404);
  if (!order.sellerSettlement?.invoiceNo) throw httpError("Settlement invoice not generated yet", 404);
  return {
    invoiceNo: order.sellerSettlement.invoiceNo,
    orderId: order.orderId,
    shortOrderId: order.shortOrderId || null,
    sellerName: order.seller?.shopName || "",
    quotedAmount: getQuoted(order),
    deductions: order.sellerSettlement.deductions || {},
    settledAmount: computeSettled(order),
    txnNo: order.sellerSettlement.txnNo || "",
    utr: order.sellerSettlement.utr || "",
    bulkRef: order.sellerSettlement.bulkRef || "",
    paidAt: order.sellerSettlement.paidAt,
  };
}
