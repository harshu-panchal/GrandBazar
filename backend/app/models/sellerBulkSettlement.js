import mongoose from "mongoose";
import {
  ALL_PAYOUT_MODES,
  PAYOUT_MODE,
  SETTLEMENT_STATE,
} from "../constants/finance.js";

// BRD "Bulk Settlement" (section 6): one seller, ready orders only, ONE shared
// reference number (e.g. BS-2610-001) stamped on every order, settlement invoice
// and seller notification in the batch.
//
// NOTE: this is a different concept from the existing bulkSettlement.js model,
// which records multi-line "bulk ORDERS" (value/qty threshold splitting). That
// one is left untouched; this one keyed by refNo is the seller bulk settlement.
const perOrderResultSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    orderPublicId: { type: String, required: true },
    quotedAmount: { type: Number, default: 0 },
    settledAmount: { type: Number, default: 0 },
    // Per-order outcome — successes stay SETTLED, failures show FAILED, all under
    // the same refNo (BLK-08).
    status: {
      type: String,
      enum: [SETTLEMENT_STATE.SETTLED, SETTLEMENT_STATE.FAILED, SETTLEMENT_STATE.PAYING],
      default: SETTLEMENT_STATE.PAYING,
    },
    invoiceNo: { type: String, default: "" },
    txnNo: { type: String, default: "" },
    razorpayPayoutId: { type: String, default: "" },
    failureReason: { type: String, default: "" },
  },
  { _id: false },
);

const sellerBulkSettlementSchema = new mongoose.Schema(
  {
    refNo: { type: String, required: true, unique: true, index: true }, // BS-YYMM-NNN
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true, index: true },
    sellerName: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },

    mode: { type: String, enum: ALL_PAYOUT_MODES, default: PAYOUT_MODE.AUTOMATIC },

    orderCount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    settledCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["PENDING", "PARTIAL", "COMPLETED", "FAILED"],
      default: "PENDING",
      index: true,
    },

    // Idempotency: one key per bulk settlement so a retry / double-click cannot
    // pay twice (BRD "Do make payment idempotent").
    idempotencyKey: { type: String, required: true, unique: true },

    orders: { type: [perOrderResultSchema], default: [] },
    settledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export default mongoose.model("SellerBulkSettlement", sellerBulkSettlementSchema);
