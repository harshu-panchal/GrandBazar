import mongoose from "mongoose";

const disputeNoteSchema = new mongoose.Schema(
  {
    authorId: { type: mongoose.Schema.Types.ObjectId, required: true },
    authorModel: {
      type: String,
      enum: ["User", "Seller", "Admin"],
      required: true,
    },
    authorRole: { type: String, default: "" },
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const disputeSchema = new mongoose.Schema(
  {
    disputeId: {
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
    status: {
      type: String,
      enum: ["open", "under_review", "resolved", "rejected"],
      default: "open",
      index: true,
    },
    reason: { type: String, required: true, trim: true },
    reasonCategory: {
      type: String,
      enum: [
        "wrong_item",
        "missing_item",
        "quality_issue",
        "late_delivery",
        "billing_issue",
        "other",
      ],
      default: "other",
    },
    raisedBy: {
      type: String,
      enum: ["customer", "seller"],
      required: true,
    },
    raisedById: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    resolution: {
      type: String,
      enum: ["none", "refund", "wallet_credit", "price_adjust", "reject"],
      default: "none",
    },
    refundAmount: { type: Number, default: 0, min: 0 },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    resolvedAt: { type: Date, default: null },
    resolutionNote: { type: String, default: "" },
    notes: { type: [disputeNoteSchema], default: [] },
    auditLog: {
      type: [
        {
          action: String,
          actorId: mongoose.Schema.Types.ObjectId,
          actorRole: String,
          at: { type: Date, default: Date.now },
          meta: Object,
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

disputeSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("Dispute", disputeSchema);
