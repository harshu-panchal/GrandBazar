import mongoose from "mongoose";
import Order from "../../models/order.js";
import Store from "../../models/store.js";
import Complaint from "../../models/complaint.js";
import Setting from "../../models/setting.js";
import SellerBulkSettlement from "../../models/sellerBulkSettlement.js";
import { requireCanonicalOrderId } from "../../utils/orderLookup.js";
import { nextBulkSettlementRef } from "../../utils/sequenceIds.js";
import { roundCurrency } from "../../utils/money.js";
import { SETTLEMENT_STATE, PAYOUT_MODE } from "../../constants/finance.js";
import {
  computeChecks,
  computeSettled,
  getQuoted,
  markReviewed,
  paySettlement,
} from "./sellerSettlementService.js";

// Bulk Settlement (BRD section 6): ONE seller, ready orders only, ONE shared
// reference number (BS-YYMM-NNN) stamped on every order, invoice and seller
// notification. Same pay flow as a single settlement, per-order partial failure.

function httpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function windowHoursFor() {
  const s = await Setting.findOne({}).select("complaint refundWindowHours").lean();
  return s?.complaint?.windowHours ?? s?.refundWindowHours ?? 24;
}

async function requireDifferentReviewerAndPayerFor() {
  const s = await Setting.findOne({}).select("settlement").lean();
  return Boolean(s?.settlement?.requireDifferentReviewerAndPayer);
}

// Resolve + validate the selection: one seller only, ready orders only,
// nothing already settled. Returns the order docs + per-order readiness.
async function resolveSelection(sellerId, orderIds) {
  if (!sellerId) throw httpError("Select a seller", 400);
  if (!Array.isArray(orderIds) || orderIds.length === 0) throw httpError("Select at least one order", 400);

  const canonical = [];
  for (const id of orderIds) canonical.push(await requireCanonicalOrderId(id));

  const orders = await Order.find({ orderId: { $in: canonical } })
    .populate("seller")
    .populate("customer", "name")
    .lean();

  if (orders.length !== canonical.length) throw httpError("Some orders were not found", 404);

  // One seller only (BRD: "Don't mix sellers in one bulk settlement").
  const mixed = orders.find((o) => String(o.seller?._id || o.seller) !== String(sellerId));
  if (mixed) throw httpError("All orders in a bulk settlement must belong to the same seller", 400);

  const windowHours = await windowHoursFor();
  const complaintIds = orders.map((o) => o.complaintRef).filter(Boolean);
  const complaints = complaintIds.length
    ? await Complaint.find({ _id: { $in: complaintIds } }).select("status").lean()
    : [];
  const complaintMap = new Map(complaints.map((c) => [String(c._id), c]));

  const enriched = orders.map((o) => {
    const complaint = o.complaintRef ? complaintMap.get(String(o.complaintRef)) : null;
    const checks = computeChecks(o, complaint, windowHours);
    const settled = Boolean(o.sellerSettlement?.lockedAt) || o.settlementStatus?.settlementState === SETTLEMENT_STATE.SETTLED;
    return { order: o, checks, settled };
  });

  return enriched;
}

// ---- preview (review table / PDF) -----------------------------------------
export async function previewBulk({ sellerId, orderIds }, actor) {
  const enriched = await resolveSelection(sellerId, orderIds);
  const store = await Store.findById(sellerId).select("shopName").lean();
  const requireDifferentReviewerAndPayer = await requireDifferentReviewerAndPayerFor();

  const rows = enriched.map(({ order, checks, settled }) => ({
    orderId: order.orderId,
    shortOrderId: order.shortOrderId || null,
    customerName: order.customer?.name || "",
    delivered: checks.dots.find((d) => d.key === "delivered")?.dot === "g",
    razorpay: checks.dots.find((d) => d.key === "payment")?.dot === "g",
    noComplaint: checks.dots.find((d) => d.key === "complaint")?.dot === "g",
    noPenalty: checks.dots.find((d) => d.key === "penalty")?.dot === "g",
    ready: checks.ready,
    settled,
    amount: computeSettled(order),
    quotedAmount: getQuoted(order),
    reviewed: Boolean(order.sellerSettlement?.reviewed),
    // Would THIS actor paying it trip the maker-checker rule? Only knowable
    // for orders already reviewed by someone; an unreviewed order will be
    // auto-reviewed by whoever pays it, so it would also trip the rule.
    makerCheckerBlocked:
      requireDifferentReviewerAndPayer &&
      (!order.sellerSettlement?.reviewed ||
        String(order.sellerSettlement?.reviewedBy || "") === String(actor?.id || "")),
  }));

  const readyRows = rows.filter((r) => r.ready && !r.settled);
  const total = roundCurrency(readyRows.reduce((a, r) => a + r.amount, 0));

  return {
    sellerId,
    sellerName: store?.shopName || "",
    rows,
    readyCount: readyRows.length,
    notReadyCount: rows.length - readyRows.length,
    total,
    requireDifferentReviewerAndPayer,
    makerCheckerBlockedCount: readyRows.filter((r) => r.makerCheckerBlocked).length,
  };
}

// ---- pay ------------------------------------------------------------------
export async function payBulk({ sellerId, orderIds, mode = PAYOUT_MODE.AUTOMATIC, txnNo = "", idempotencyKey }, actor) {
  const enriched = await resolveSelection(sellerId, orderIds);

  // Reject the whole request if any selected order is not ready / already
  // settled — do NOT silently settle a tampered selection (BRD BLK-03).
  const bad = enriched.filter((e) => !e.checks.ready || e.settled);
  if (bad.length) {
    throw httpError(
      `These orders are not ready to settle: ${bad.map((e) => e.order.orderId).join(", ")}`,
      409,
    );
  }
  if (mode === PAYOUT_MODE.MANUAL && (!txnNo || !String(txnNo).trim())) {
    throw httpError("A transaction number is required for manual payment", 400);
  }

  const store = await Store.findById(sellerId).select("shopName").lean();
  const bulkKey = idempotencyKey || `bulk:${sellerId}:${Date.now()}`;

  // One reference number for the whole batch (BLK-07).
  const refNo = await nextBulkSettlementRef();

  const previewOrders = enriched.map(({ order }) => ({
    order: order._id,
    orderPublicId: order.orderId,
    quotedAmount: getQuoted(order),
    settledAmount: computeSettled(order),
    status: SETTLEMENT_STATE.PAYING,
  }));
  const total = roundCurrency(previewOrders.reduce((a, r) => a + r.settledAmount, 0));

  // Create the bulk record up front (idempotent via unique idempotencyKey).
  let bulk;
  try {
    bulk = await SellerBulkSettlement.create({
      refNo,
      seller: sellerId,
      sellerName: store?.shopName || "",
      createdBy: actor?.id || null,
      reviewedBy: actor?.id || null,
      mode,
      orderCount: previewOrders.length,
      total,
      idempotencyKey: bulkKey,
      status: "PENDING",
      orders: previewOrders,
    });
  } catch (e) {
    if (e.code === 11000) {
      // Duplicate idempotency key → return the existing batch (no double pay).
      return SellerBulkSettlement.findOne({ idempotencyKey: bulkKey }).lean();
    }
    throw e;
  }

  // Settle each order under the shared reference. Per-order partial failure:
  // successes stay SETTLED, failures show FAILED, same refNo (BLK-08).
  let settledCount = 0;
  let failedCount = 0;
  for (const { order } of enriched) {
    const result = { order: order._id, orderPublicId: order.orderId, quotedAmount: getQuoted(order), settledAmount: computeSettled(order) };
    try {
      // Mark reviewed (batch-level review confirmation) then pay — but only
      // auto-review if nobody has reviewed it yet. When maker-checker is
      // enabled (Setting.settlement.requireDifferentReviewerAndPayer), an
      // order that gets auto-reviewed here is reviewed by THIS actor, so
      // paySettlement's own reviewer!=payer check will correctly reject it
      // below (shows as FAILED for that order, rest of the batch continues —
      // BLK-08). An order already reviewed by someone else earlier passes
      // through untouched and this actor may pay it.
      if (!order.sellerSettlement?.reviewed) {
        await markReviewed(order.orderId, actor).catch(() => {});
      }
      const detail = await paySettlement(
        order.orderId,
        { mode, txnNo, idempotencyKey: `${bulkKey}:${order.orderId}`, bulkRef: refNo },
        actor,
      );
      if (detail?.settled || detail?.state === SETTLEMENT_STATE.SETTLED) {
        result.status = SETTLEMENT_STATE.SETTLED;
        result.invoiceNo = detail.invoiceNo || "";
        result.txnNo = detail.txnNo || txnNo;
        settledCount += 1;
      } else {
        // Automatic payouts complete asynchronously via the webhook.
        result.status = SETTLEMENT_STATE.PAYING;
      }
    } catch (e) {
      result.status = SETTLEMENT_STATE.FAILED;
      result.failureReason = e.message;
      failedCount += 1;
    }
    await SellerBulkSettlement.updateOne(
      { _id: bulk._id, "orders.order": order._id },
      { $set: { "orders.$": result } },
    );
  }

  const status = failedCount === 0 ? (settledCount === previewOrders.length ? "COMPLETED" : "PENDING")
    : settledCount === 0 ? "FAILED" : "PARTIAL";
  await SellerBulkSettlement.updateOne(
    { _id: bulk._id },
    { $set: { settledCount, failedCount, status, settledAt: status === "COMPLETED" ? new Date() : null } },
  );

  return SellerBulkSettlement.findById(bulk._id).lean();
}

// ---- reads ----------------------------------------------------------------
export async function getBulkSettlement(refNo) {
  const bulk = await SellerBulkSettlement.findOne({ refNo }).lean();
  if (!bulk) throw httpError("Bulk settlement not found", 404);
  return bulk;
}

export async function listBulkSettlements({ sellerId, page = 1, limit = 20 } = {}) {
  const query = {};
  if (sellerId) query.seller = sellerId;
  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    SellerBulkSettlement.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    SellerBulkSettlement.countDocuments(query),
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
}

// List a seller's unsettled orders for the bulk page (BLK-02).
export async function listSellerUnsettledOrders(sellerId) {
  const windowHours = await windowHoursFor();
  const orders = await Order.find({
    seller: sellerId,
    deliveredAt: { $ne: null },
    "sellerSettlement.lockedAt": null,
  })
    .select("orderId shortOrderId deliveredAt customer items complaintRef settlementStatus financeFlags paymentStatus payment status workflowStatus sellerSettlement paymentBreakdown complaintWindowClosesAt")
    .populate("customer", "name")
    .sort({ deliveredAt: -1 })
    .lean();

  const complaintIds = orders.map((o) => o.complaintRef).filter(Boolean);
  const complaints = complaintIds.length
    ? await Complaint.find({ _id: { $in: complaintIds } }).select("complaintId status amount").lean()
    : [];
  const cmap = new Map(complaints.map((c) => [String(c._id), c]));

  return orders.map((o) => {
    const complaint = o.complaintRef ? cmap.get(String(o.complaintRef)) : null;
    const checks = computeChecks(o, complaint, windowHours);
    return {
      orderId: o.orderId,
      shortOrderId: o.shortOrderId || null,
      date: o.deliveredAt,
      customerName: o.customer?.name || "",
      settlementAmount: computeSettled(o),
      reviewed: Boolean(o.sellerSettlement?.reviewed),
      ready: checks.ready,
      dots: checks.dots,
      complaintId: complaint?.complaintId || "",
    };
  });
}
