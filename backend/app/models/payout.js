import mongoose from "mongoose";
import {
  ALL_PAYOUT_STATUSES,
  ALL_PAYOUT_TYPES,
  ALL_PAYOUT_MODES,
  CURRENCY,
} from "../constants/finance.js";

const payoutSchema = new mongoose.Schema(
  {
    payoutType: {
      type: String,
      enum: ALL_PAYOUT_TYPES,
      required: true,
      index: true,
    },
    beneficiaryId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: CURRENCY,
      uppercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ALL_PAYOUT_STATUSES,
      default: "PENDING",
      index: true,
    },
    relatedOrderIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
      },
    ],
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    remarks: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    failedReason: {
      type: String,
      trim: true,
    },
    isBulkSettlement: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Itemized breakdown for seller-facing transparency (checklist 67, 332):
    // commission/packaging/tax are already computed in the order's
    // paymentBreakdown — surfaced here too so a payout record is
    // self-explanatory without joining back to the order.
    commissionAmount: {
      type: Number,
      default: 0,
    },
    packagingAmount: {
      type: Number,
      default: 0,
    },
    taxAmount: {
      type: Number,
      default: 0,
    },
    metadata: {
      type: Object,
      default: {},
    },

    // ---- Seller Settlement BRD payout execution (section 5.3) -----------
    // How this payout was executed. MANUAL: operator paid UPI/QR and recorded
    // txnNo. AUTOMATIC: RazorpayX payout API; UTR + final status from webhook.
    mode: { type: String, enum: [...ALL_PAYOUT_MODES, null], default: null },
    txnNo: { type: String, default: "" },
    razorpayPayoutId: { type: String, default: "", index: true },
    utr: { type: String, default: "" },
    // Last status seen from the Razorpay payout webhook (processing/processed/
    // reversed/failed), kept raw for traceability alongside `status`.
    webhookStatus: { type: String, default: "" },
    // One key per settlement/bulk settlement so a retried or double-clicked pay
    // request can't create a second payout (BRD "Do make payment idempotent").
    idempotencyKey: { type: String, default: null },
    // Shared bulk reference (BS-YYMM-NNN) when this payout is part of a bulk
    // settlement; links back to SellerBulkSettlement.refNo.
    bulkRef: { type: String, default: "", index: true },
  },
  { timestamps: true },
);

payoutSchema.index({ beneficiaryId: 1, payoutType: 1, status: 1 });
payoutSchema.index({ relatedOrderIds: 1 });
payoutSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

export default mongoose.model("Payout", payoutSchema);
