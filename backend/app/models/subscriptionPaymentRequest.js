import mongoose from "mongoose";
import {
  PAYMENT_REQUEST_STATUS,
  PAYMENT_REQUEST_TYPE,
} from "../constants/subscription.js";

const subscriptionPaymentRequestSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SellerSubscription",
    },
    requestType: {
      type: String,
      enum: Object.values(PAYMENT_REQUEST_TYPE),
      default: PAYMENT_REQUEST_TYPE.NEW,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      trim: true,
      default: "bank_transfer",
    },
    transactionRef: {
      type: String,
      trim: true,
      default: "",
    },
    proofDocumentUrl: {
      type: String,
      trim: true,
      default: "",
    },
    sellerNote: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: Object.values(PAYMENT_REQUEST_STATUS),
      default: PAYMENT_REQUEST_STATUS.PENDING,
      index: true,
    },
    reviewedAt: Date,
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: "",
    },
    planSnapshot: {
      name: String,
      shopCount: Number,
      productCountPerShop: Number,
      durationDays: Number,
      price: Number,
    },
  },
  { timestamps: true },
);

subscriptionPaymentRequestSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("SubscriptionPaymentRequest", subscriptionPaymentRequestSchema);
