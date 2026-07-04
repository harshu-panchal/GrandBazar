import mongoose from "mongoose";

const creditNoteSchema = new mongoose.Schema(
  {
    creditNoteId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    orderPublicId: { type: String, required: true, index: true },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      default: null,
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    reason: { type: String, default: "" },
    status: {
      type: String,
      enum: ["issued", "applied", "refunded", "cancelled"],
      default: "issued",
      index: true,
    },
    refundMode: {
      type: String,
      enum: ["wallet", "original_payment", "manual"],
      default: "wallet",
    },
    ledgerEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LedgerEntry",
      default: null,
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "issuedByModel",
      default: null,
    },
    issuedByModel: {
      type: String,
      enum: ["Admin", "Seller"],
      default: "Admin",
    },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true },
);

export default mongoose.model("CreditNote", creditNoteSchema);
