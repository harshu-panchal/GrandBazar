import Order from "../../models/order.js";
import Payment from "../../models/payment.js";
import Refund from "../../models/refund.js";
import Payout from "../../models/payout.js";
import SellerSubscriptionPayment from "../../models/sellerSubscriptionPayment.js";
import { getOrCreateWallet } from "./walletService.js";
import { PAYMENT_STATUS } from "../../constants/payment.js";
import { PAYOUT_STATUS, PAYOUT_TYPE, OWNER_TYPE, REFUND_MODE } from "../../constants/finance.js";
import { roundCurrency } from "../../utils/money.js";

function dateRange({ from, to }) {
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to);
  return Object.keys(range).length ? range : null;
}

// Everything an Accountant needs on one screen: GMV vs. gateway vs.
// seller-payout+revenue+refunds, a wallet-based stand-in for a bank
// reconciliation (there's no external bank-feed import in this codebase),
// and the concrete list of rows that don't tie together — unmatched
// payments and refunds missing a gateway reference. No GSTN/government
// filing data exists, so no "GST reports" comparison is fabricated here;
// that's handled by the GST/TCS module (Phase 4) against what the
// accountant has actually recorded as filed.
export async function getAccountantOverview({ from, to } = {}) {
  const createdAt = dateRange({ from, to });
  const orderMatch = { status: { $ne: "cancelled" } };
  if (createdAt) orderMatch.createdAt = createdAt;

  const paymentMatch = { status: PAYMENT_STATUS.CAPTURED };
  if (createdAt) paymentMatch.capturedAt = createdAt;

  const refundMatch = { status: "completed" };
  if (createdAt) refundMatch.createdAt = createdAt;

  const payoutMatch = { status: PAYOUT_STATUS.COMPLETED };
  if (createdAt) payoutMatch.createdAt = createdAt;

  const subscriptionMatch = { status: PAYMENT_STATUS.CAPTURED };
  if (createdAt) subscriptionMatch.createdAt = createdAt;

  const [
    orderTotals,
    orderCount,
    gatewayTotals,
    unmatchedPayments,
    refundTotals,
    refundsMissingRef,
    sellerPaidTotals,
    riderPaidTotals,
    subscriptionTotals,
    adminWallet,
  ] = await Promise.all([
    Order.aggregate([
      { $match: orderMatch },
      {
        $group: {
          _id: null,
          gmv: { $sum: { $ifNull: ["$paymentBreakdown.grandTotal", 0] } },
          sellerPayable: { $sum: { $ifNull: ["$paymentBreakdown.sellerPayoutTotal", 0] } },
          platformEarning: { $sum: { $ifNull: ["$paymentBreakdown.platformTotalEarning", 0] } },
          commission: { $sum: { $ifNull: ["$paymentBreakdown.adminProductCommissionTotal", 0] } },
          gstCollected: {
            $sum: {
              $add: [
                { $ifNull: ["$paymentBreakdown.cgstTotal", 0] },
                { $ifNull: ["$paymentBreakdown.sgstTotal", 0] },
                { $ifNull: ["$paymentBreakdown.igstTotal", 0] },
              ],
            },
          },
          additionalChargesCustomer: {
            $sum: {
              $add: [
                { $ifNull: ["$paymentBreakdown.customerSurchargeAmount", 0] },
                { $ifNull: ["$paymentBreakdown.weatherSurchargeAmount", 0] },
              ],
            },
          },
          packingCharges: { $sum: { $ifNull: ["$paymentBreakdown.productPackagingChargeAmount", 0] } },
        },
      },
    ]),
    Order.countDocuments(orderMatch),
    Payment.aggregate([
      { $match: paymentMatch },
      { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    // Payments captured against an order that no longer resolves — the
    // mock's "payments with no matching order" drill-down line.
    Payment.aggregate([
      { $match: paymentMatch },
      {
        $lookup: {
          from: "orders",
          localField: "order",
          foreignField: "_id",
          as: "matchedOrder",
        },
      },
      { $match: { matchedOrder: { $size: 0 } } },
      { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    Refund.aggregate([
      { $match: refundMatch },
      { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    Refund.aggregate([
      { $match: { ...refundMatch, mode: REFUND_MODE.GATEWAY, gatewayReference: "" } },
      { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    Payout.aggregate([
      { $match: { ...payoutMatch, payoutType: PAYOUT_TYPE.SELLER } },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]),
    Payout.aggregate([
      { $match: { ...payoutMatch, payoutType: PAYOUT_TYPE.DELIVERY_PARTNER } },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]),
    SellerSubscriptionPayment.aggregate([
      { $match: subscriptionMatch },
      { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    getOrCreateWallet(OWNER_TYPE.ADMIN, null),
  ]);

  const orders = orderTotals[0] || {};
  const gmv = roundCurrency(orders.gmv || 0);
  const sellerPayable = roundCurrency(orders.sellerPayable || 0);
  const platformEarning = roundCurrency(orders.platformEarning || 0);
  const commission = roundCurrency(orders.commission || 0);
  const gstCollected = roundCurrency(orders.gstCollected || 0);
  const subscriptionIncome = roundCurrency(subscriptionTotals[0]?.amount || 0);
  const gatewayCollected = roundCurrency(gatewayTotals[0]?.amount || 0);
  const totalRefunds = roundCurrency(refundTotals[0]?.amount || 0);
  const sellerPaid = roundCurrency(sellerPaidTotals[0]?.amount || 0);
  const riderPaid = roundCurrency(riderPaidTotals[0]?.amount || 0);

  // Equation 1 (mock: "Orders = Gateway = Sellers + Revenue + Refunds").
  // COD orders never appear in `gatewayCollected`, so GMV vs. gateway is
  // reported as a fact, not forced into a false "match" — only the
  // seller+revenue+refunds decomposition of GMV is a real identity check.
  const decomposed = roundCurrency(sellerPayable + platformEarning + totalRefunds);
  const decompositionDiff = roundCurrency(gmv - decomposed);

  // Equation 2 (mock: "Bank = Settlements − Payouts − Expenses"). There is
  // no external bank-statement import in this codebase, so "bank" here is
  // the platform's own admin wallet balance — the closest real number we
  // have. Expenses (Phase 3) are netted in once that module exists.
  const expectedWalletBalance = roundCurrency(gatewayCollected - sellerPaid - riderPaid);
  const actualWalletBalance = roundCurrency(adminWallet.availableBalance || 0);
  const walletDiff = roundCurrency(actualWalletBalance - expectedWalletBalance);

  const mismatches = [];
  const unmatched = unmatchedPayments[0];
  if (unmatched?.count) {
    mismatches.push({
      label: `${unmatched.count} payment${unmatched.count === 1 ? "" : "s"} with no matching order`,
      amount: roundCurrency(unmatched.amount || 0),
    });
  }
  const missingRef = refundsMissingRef[0];
  if (missingRef?.count) {
    mismatches.push({
      label: `${missingRef.count} refund${missingRef.count === 1 ? "" : "s"} missing a gateway reference`,
      amount: roundCurrency(missingRef.amount || 0),
    });
  }

  return {
    period: { from: from || null, to: to || null },
    gmv: {
      gmv,
      orderCount,
      gatewayCollected,
      sellerPayable,
      sellerPaid,
      sellerPending: roundCurrency(Math.max(sellerPayable - sellerPaid, 0)),
      additionalChargesCustomer: roundCurrency(orders.additionalChargesCustomer || 0),
      packingCharges: roundCurrency(orders.packingCharges || 0),
    },
    revenue: {
      commission,
      subscriptionIncome,
      refunds: totalRefunds,
      netRevenue: roundCurrency(commission + subscriptionIncome - totalRefunds),
      gstCollected,
    },
    reconciliation: {
      decompositionDiff,
      isGmvDecompositionClean: Math.abs(decompositionDiff) < 1,
      walletDiff,
      isWalletReconciled: Math.abs(walletDiff) < 1,
      mismatches,
    },
  };
}

export async function getOrdersGmv({ from, to, page = 1, limit = 25, sellerId, status } = {}) {
  const createdAt = dateRange({ from, to });
  const match = {};
  if (createdAt) match.createdAt = createdAt;
  if (sellerId) match.seller = sellerId;
  if (status) match.status = status;

  const skip = (Math.max(Number(page) || 1, 1) - 1) * Math.max(Number(limit) || 25, 1);
  const pageSize = Math.max(Number(limit) || 25, 1);

  const [rows, total] = await Promise.all([
    Order.find(match)
      .populate("customer", "name phone")
      .populate("seller", "shopName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    Order.countDocuments(match),
  ]);

  const items = rows.map((order) => {
    const pb = order.paymentBreakdown || {};
    return {
      orderId: order.shortOrderId || String(order._id),
      date: order.createdAt,
      seller: order.seller?.shopName || "—",
      customer: order.customer?.name || "—",
      product: order.items?.[0]?.name
        ? order.items.length > 1
          ? `${order.items[0].name} +${order.items.length - 1} more`
          : order.items[0].name
        : "—",
      taxable: roundCurrency(pb.productSubtotal || 0),
      gst: roundCurrency((pb.cgstTotal || 0) + (pb.sgstTotal || 0) + (pb.igstTotal || 0)),
      delivery: roundCurrency(pb.deliveryFeeCharged || 0),
      weather: roundCurrency(pb.weatherSurchargeAmount || 0),
      packing: roundCurrency(pb.packingFeeCharged || pb.productPackagingChargeAmount || 0),
      gross: roundCurrency(pb.grandTotal || 0),
      refund: roundCurrency(order.returnRefundAmount || 0),
      net: roundCurrency((pb.grandTotal || 0) - (order.returnRefundAmount || 0)),
      status: order.status,
      paymentMode: order.paymentMode,
    };
  });

  return {
    items,
    total,
    page: Math.max(Number(page) || 1, 1),
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
  };
}
