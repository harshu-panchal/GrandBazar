import Order from "../../models/order.js";
import SellerSubscriptionPayment from "../../models/sellerSubscriptionPayment.js";
import Setting from "../../models/setting.js";
import TaxFilingRecord from "../../models/taxFilingRecord.js";
import { PAYMENT_STATUS } from "../../constants/payment.js";
import { roundCurrency } from "../../utils/money.js";

const DEFAULT_COMMISSION_SUBSCRIPTION_GST_RATE = 18; // standard GST slab for services in India

function monthRange(month) {
  const [year, mon] = String(month).split("-").map(Number);
  if (!year || !mon) return null;
  return { $gte: new Date(year, mon - 1, 1), $lte: new Date(year, mon, 0, 23, 59, 59, 999) };
}

function resolveRange({ month, from, to }) {
  if (month) return monthRange(month);
  if (from || to) {
    const range = {};
    if (from) range.$gte = new Date(from);
    if (to) range.$lte = new Date(to);
    return range;
  }
  return null;
}

// Output/input GST on the PLATFORM's OWN revenue (commission + subscription
// income) — distinct from the per-order product GST already shown on the
// Accountant Home / Orders-GMV screens, which is the seller's GST on the
// product, not the platform's. There is no GST-rate configuration or
// gateway-fee-GST capture anywhere else in this codebase, so both the rate
// and the "input GST" figure are explicitly flagged rather than invented —
// same caveat the reference mock itself carries ("confirmed by the CA
// before release").
export async function getGstTcsSummary({ month, from, to } = {}) {
  const range = resolveRange({ month, from, to });
  const orderMatch = { status: { $ne: "cancelled" } };
  if (range) orderMatch.createdAt = range;
  const subscriptionMatch = { status: PAYMENT_STATUS.CAPTURED };
  if (range) subscriptionMatch.createdAt = range;

  const [orderTotals, subscriptionTotals, settings, filingRecords] = await Promise.all([
    Order.aggregate([
      { $match: orderMatch },
      {
        $group: {
          _id: null,
          gmv: { $sum: { $ifNull: ["$paymentBreakdown.grandTotal", 0] } },
          commission: { $sum: { $ifNull: ["$paymentBreakdown.adminProductCommissionTotal", 0] } },
        },
      },
    ]),
    SellerSubscriptionPayment.aggregate([
      { $match: subscriptionMatch },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]),
    Setting.findOne({}).lean(),
    month ? TaxFilingRecord.find({ period: month }).sort({ type: 1 }).lean() : [],
  ]);

  const gmv = roundCurrency(orderTotals[0]?.gmv || 0);
  const commission = roundCurrency(orderTotals[0]?.commission || 0);
  const subscriptionIncome = roundCurrency(subscriptionTotals[0]?.amount || 0);

  const gstRatePercent = settings?.commissionSubscriptionGstRatePercent ?? DEFAULT_COMMISSION_SUBSCRIPTION_GST_RATE;
  const tcsRatePercent = settings?.tcsRatePercent ?? 1;

  const outputGstCommission = roundCurrency((commission * gstRatePercent) / 100);
  const outputGstSubscription = roundCurrency((subscriptionIncome * gstRatePercent) / 100);
  const outputGstTotal = roundCurrency(outputGstCommission + outputGstSubscription);

  const tcsLiability = roundCurrency((gmv * tcsRatePercent) / 100);

  return {
    period: month || null,
    gst: {
      gstRatePercent,
      outputGstCommission,
      outputGstSubscription,
      outputGstTotal,
      inputGst: null, // not available — gateway-fee GST isn't captured anywhere in this codebase
      netGstPayable: outputGstTotal,
      formulaConfirmed: false,
      note: "Estimated at the configured commission/subscription GST rate. Confirm the formula and rate with your CA before filing.",
    },
    tcs: {
      tcsRatePercent,
      gmv,
      tcsLiability,
      note: "Computed liability (GMV × rate), not a confirmed collected/withheld figure. Record what was actually filed below.",
    },
    filingRecords,
  };
}

export async function listTaxFilingRecords({ period } = {}) {
  const match = {};
  if (period) match.period = period;
  return TaxFilingRecord.find(match).sort({ period: -1, type: 1 }).lean();
}

export async function upsertTaxFilingRecord(payload, reportedBy) {
  const { period, type } = payload;
  if (!period || !type) {
    const err = new Error("period and type are required");
    err.statusCode = 400;
    throw err;
  }
  const update = {
    status: payload.status || "pending",
    filedAmount: payload.filedAmount ?? null,
    filedDate: payload.filedDate || null,
    dueDate: payload.dueDate || null,
    referenceNumber: payload.referenceNumber?.trim() || "",
    notes: payload.notes?.trim() || "",
    reportedBy,
  };
  return TaxFilingRecord.findOneAndUpdate(
    { period, type },
    { $set: update, $setOnInsert: { period, type } },
    { new: true, upsert: true },
  );
}

export async function deleteTaxFilingRecord(id) {
  const record = await TaxFilingRecord.findById(id);
  if (!record) {
    const err = new Error("Filing record not found");
    err.statusCode = 404;
    throw err;
  }
  await record.deleteOne();
}
