import mongoose from "mongoose";

// Consolidates the previously-scattered bulk-order financial fields
// (Order.isBulkOrder/bulkOrderReason/bulkOrderLineIndexes,
// Payout.isBulkSettlement) into one record per bulk order, so finance
// reporting has a single place to join from instead of two models.
const bulkSettlementSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    orderId: { type: String, required: true },
    payout: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payout",
      default: null,
    },
    bulkOrderReason: {
      type: String,
      enum: ["value_threshold", "qty_threshold", null],
      default: null,
    },
    bulkOrderLineIndexes: { type: [Number], default: [] },
    // Store the payout's beneficiary Store _id — same beneficiary semantics
    // as Payout.beneficiaryId for payoutType SELLER (Order.seller refs Store,
    // not Seller; see getAdminFinancePayoutsController's beneficiary lookup).
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      default: null,
    },
    sellerPayoutAmount: { type: Number, default: 0 },
    commissionAmount: { type: Number, default: 0 },
    packagingAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    settledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

bulkSettlementSchema.index({ order: 1 }, { unique: true });

export default mongoose.model("BulkSettlement", bulkSettlementSchema);
