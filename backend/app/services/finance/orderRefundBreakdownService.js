import Order from "../../models/order.js";
import Refund from "../../models/refund.js";
import Transaction from "../../models/transaction.js";
import CreditNote from "../../models/creditNote.js";
import { orderMatchQueryFlexible } from "../../utils/orderLookup.js";
import { roundCurrency } from "../../utils/money.js";

const REFUND_SOURCE_LABELS = {
  return: "Return refund",
  price_adjustment: "Price adjustment",
  cancellation: "Order cancellation",
  complaint: "Complaint refund",
  dispute: "Dispute refund",
};

const REFUND_PAYER_LABELS = {
  seller: "Seller",
  platform: "Platform",
  shared: "Shared",
  order_reversal: "Order-wide reversal",
  unallocated: "Not recorded",
};

function isRepresentedByRefund(refund, transaction, orderId) {
  const meta = transaction.meta || {};
  const refundId = String(refund._id || "");
  const sourceReference = String(refund.sourceReference || "");

  if (String(meta.refundId || "") === refundId) return true;
  if (sourceReference && [transaction.reference, meta.complaintId, meta.disputeId].some(
    (value) => String(value || "") === sourceReference,
  )) return true;

  if (refund.type === "return" && (meta.type === "return_wallet" || transaction.reference === `REF-WALLET-${orderId}`)) {
    return true;
  }
  if (
    refund.type === "price_adjustment" &&
    refund.creditNoteId &&
    String(meta.creditNoteId || "") === String(refund.creditNoteId)
  ) {
    return true;
  }
  if (refund.type === "cancellation" && meta.kind === "cancellation_wallet_refund") {
    return true;
  }
  return false;
}

function transactionSource(transaction) {
  const meta = transaction.meta || {};
  if (meta.complaintId) return { type: "complaint", sourceReference: String(meta.complaintId) };
  if (meta.disputeId) return { type: "dispute", sourceReference: String(meta.disputeId) };
  if (meta.type === "return_wallet") return { type: "return", sourceReference: "" };
  if (meta.kind === "cancellation_wallet_refund") return { type: "cancellation", sourceReference: "" };
  if (meta.creditNoteId) return { type: "price_adjustment", sourceReference: String(meta.creditNoteId) };
  if (/REFUND-ADDITEMS-/i.test(String(transaction.reference || ""))) {
    return { type: "price_adjustment", sourceReference: String(transaction.reference) };
  }
  return { type: "refund", sourceReference: String(transaction.reference || "") };
}

export async function getOrderRefundBreakdown(orderRouteId) {
  const orderQuery = orderMatchQueryFlexible(orderRouteId);
  if (!orderQuery) {
    const error = new Error("Order not found");
    error.statusCode = 404;
    throw error;
  }

  const order = await Order.findOne(orderQuery)
    .select("_id orderId paymentBreakdown.sellerPayoutTotal returnSellerClawback returnAdminCommissionClawback")
    .lean();
  if (!order) {
    const error = new Error("Order not found");
    error.statusCode = 404;
    throw error;
  }

  const [refunds, transactions] = await Promise.all([
    Refund.find({ order: order._id }).sort({ createdAt: 1 }).lean(),
    Transaction.find({
      order: order._id,
      userModel: "User",
      type: "Refund",
      amount: { $gt: 0 },
    }).sort({ createdAt: 1 }).lean(),
  ]);

  const creditNoteIds = refunds
    .filter((refund) => refund.type === "price_adjustment" && refund.creditNoteId)
    .map((refund) => refund.creditNoteId);
  const creditNotes = creditNoteIds.length
    ? await CreditNote.find({ _id: { $in: creditNoteIds } }).select("_id issuedByModel").lean()
    : [];
  const creditNoteById = new Map(creditNotes.map((note) => [String(note._id), note]));

  const items = refunds.map((refund) => {
    const linkedTransaction = transactions.find((transaction) => {
      const meta = transaction.meta || {};
      if (String(meta.refundId || "") === String(refund._id || "")) return true;
      const reference = String(refund.sourceReference || "");
      return Boolean(reference && [meta.complaintId, meta.disputeId].some((value) => String(value || "") === reference));
    });
    let payer = refund.payer;
    let payerNote = refund.payerNote || "";
    let recipientImpacts = refund.recipientImpacts || {};

    if (!payer && refund.type === "complaint" && linkedTransaction?.meta?.culprit) {
      payer = linkedTransaction.meta.culprit === "SELLER" ? "seller" : "platform";
      payerNote = linkedTransaction.meta.culprit === "RIDER_LOGISTICS"
        ? "Paid by platform; logistics recovery may be pending"
        : payer === "seller" ? "Seller-funded complaint refund" : "Platform-funded complaint refund";
    }

    if (!payer && refund.type === "return") {
      payer = "shared";
      payerNote = "Actual clawbacks are shown below";
    }
    if (refund.type === "return") {
      recipientImpacts = {
        ...recipientImpacts,
        seller: Number(recipientImpacts.seller || order.returnSellerClawback || 0),
        platform: Number(recipientImpacts.platform || order.returnAdminCommissionClawback || 0),
      };
    } else if (!payer && refund.type === "price_adjustment") {
      const issuer = creditNoteById.get(String(refund.creditNoteId))?.issuedByModel;
      payer = issuer === "Seller" ? "seller" : issuer === "Admin" ? "platform" : "unallocated";
      payerNote = issuer ? `Price decrease issued by ${issuer.toLowerCase()}` : "Payer not recorded on this older adjustment";
    } else if (!payer && refund.type === "cancellation") {
      payer = "order_reversal";
      payerNote = "Order-wide finance reversal";
    } else if (!payer && refund.type === "complaint") {
      payer = "unallocated";
      payerNote = "Payer not recorded on this older complaint refund";
    }
    if (!Number(recipientImpacts.seller || 0) && payer === "seller") {
      recipientImpacts.seller = Number(refund.amount || 0);
    }
    if (!Number(recipientImpacts.platform || 0) && payer === "platform") {
      recipientImpacts.platform = Number(refund.amount || 0);
    }

    return {
      id: String(refund._id),
      type: refund.type,
      source: REFUND_SOURCE_LABELS[refund.type] || "Customer refund",
      sourceReference: refund.sourceReference || refund.creditNoteId?.toString?.() || "",
      amount: roundCurrency(refund.amount),
      mode: refund.mode,
      status: refund.status,
      reference: refund.gatewayReference || "",
      failureReason: refund.failureReason || "",
      payer: payer || "unallocated",
      payerLabel: REFUND_PAYER_LABELS[payer] || REFUND_PAYER_LABELS.unallocated,
      payerNote,
      recipientImpacts: {
        seller: roundCurrency(recipientImpacts.seller || 0),
        platform: roundCurrency(recipientImpacts.platform || 0),
        rider: roundCurrency(recipientImpacts.rider || 0),
        tax: roundCurrency(recipientImpacts.tax || 0),
      },
      createdAt: refund.createdAt || refund.initiatedAt || null,
      completedAt: refund.completedAt || null,
    };
  });

  for (const transaction of transactions) {
    if (refunds.some((refund) => isRepresentedByRefund(refund, transaction, order.orderId))) continue;
    const source = transactionSource(transaction);
    items.push({
      id: `transaction:${transaction._id}`,
      ...source,
      source: REFUND_SOURCE_LABELS[source.type] || "Customer refund",
      amount: roundCurrency(transaction.amount),
      mode: "wallet",
      status: transaction.refundStatus || transaction.status,
      payer: transaction.meta?.culprit === "SELLER" ? "seller"
        : ["PLATFORM", "RIDER_LOGISTICS"].includes(transaction.meta?.culprit) ? "platform"
          : "unallocated",
      payerLabel: REFUND_PAYER_LABELS[
        transaction.meta?.culprit === "SELLER" ? "seller"
          : ["PLATFORM", "RIDER_LOGISTICS"].includes(transaction.meta?.culprit) ? "platform"
            : "unallocated"
      ],
      payerNote: transaction.meta?.culprit === "RIDER_LOGISTICS"
        ? "Paid by platform; logistics recovery may be pending"
        : transaction.meta?.culprit === "PLATFORM"
          ? "Platform-funded refund"
          : transaction.meta?.culprit === "SELLER"
            ? "Seller-funded refund"
            : "Payer not recorded on this older refund",
      recipientImpacts: {
        seller: transaction.meta?.culprit === "SELLER" ? roundCurrency(transaction.amount) : 0,
        platform: ["PLATFORM", "RIDER_LOGISTICS"].includes(transaction.meta?.culprit)
          ? roundCurrency(transaction.amount)
          : 0,
        rider: 0,
        tax: 0,
      },
      reference: transaction.reference || "",
      failureReason: "",
      createdAt: transaction.createdAt || transaction.date || null,
      completedAt: transaction.status === "Settled" ? transaction.createdAt || transaction.date || null : null,
    });
  }

  items.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  const completedRefunds = items.filter((item) =>
    ["completed", "settled", "refunded"].includes(String(item.status || "").toLowerCase()) &&
    item.mode !== "cod_adjustment",
  );
  const pendingRefunds = items.filter((item) =>
    ["initiated", "processing", "pending"].includes(String(item.status || "").toLowerCase()),
  );
  const failedRefunds = items.filter((item) =>
    ["failed", "cancelled"].includes(String(item.status || "").toLowerCase()),
  );
  const codAdjustments = items.filter((item) => item.mode === "cod_adjustment");
  const recipientImpactItems = completedRefunds;
  const recipientImpacts = recipientImpactItems.reduce((totals, item) => ({
    seller: roundCurrency(totals.seller + item.recipientImpacts.seller),
    platform: roundCurrency(totals.platform + item.recipientImpacts.platform),
    rider: roundCurrency(totals.rider + item.recipientImpacts.rider),
    tax: roundCurrency(totals.tax + item.recipientImpacts.tax),
  }), { seller: 0, platform: 0, rider: 0, tax: 0 });
  const sellerGross = roundCurrency(order.paymentBreakdown?.sellerPayoutTotal || 0);

  return {
    items,
    totalRefunded: roundCurrency(completedRefunds.reduce((sum, item) => sum + item.amount, 0)),
    totalPending: roundCurrency(pendingRefunds.reduce((sum, item) => sum + item.amount, 0)),
    totalFailed: roundCurrency(failedRefunds.reduce((sum, item) => sum + item.amount, 0)),
    totalCodAdjustments: roundCurrency(codAdjustments.reduce((sum, item) => sum + item.amount, 0)),
    recipientImpacts,
    sellerGross,
    sellerNet: roundCurrency(sellerGross - recipientImpacts.seller),
  };
}
