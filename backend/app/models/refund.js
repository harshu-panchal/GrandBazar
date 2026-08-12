import mongoose from "mongoose";
import { ALL_REFUND_TYPES, ALL_REFUND_MODES, ALL_REFUND_STATUSES } from "../constants/finance.js";

const refundSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    orderId: { type: String, required: true },
    type: {
      type: String,
      enum: ALL_REFUND_TYPES,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    mode: {
      type: String,
      enum: ALL_REFUND_MODES,
      required: true,
    },
    status: {
      type: String,
      enum: ALL_REFUND_STATUSES,
      default: "initiated",
      index: true,
    },
    initiatedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    failedAt: {
      type: Date,
      default: null,
    },
    failureReason: {
      type: String,
      trim: true,
      default: "",
    },
    gatewayReference: {
      type: String,
      trim: true,
      default: "",
    },
    creditNoteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CreditNote",
      default: null,
    },
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true },
);

refundSchema.index({ order: 1, type: 1, createdAt: -1 });

export default mongoose.model("Refund", refundSchema);
