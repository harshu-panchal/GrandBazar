import mongoose from "mongoose";
import { SUBSCRIPTION_STATUS } from "../constants/subscription.js";

const sellerSubscriptionSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
      index: true,
    },
    // Subscriptions are per STORE, not per seller account: a seller with 3
    // shops can have 3 independent subscriptions (different plans, different
    // billing). sellerId stays denormalized above for "all of this seller's
    // subscriptions" admin queries, but storeId is the authoritative key for
    // every operational check (is THIS store's subscription active).
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(SUBSCRIPTION_STATUS),
      default: SUBSCRIPTION_STATUS.PENDING_PAYMENT,
      index: true,
    },
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    planSnapshot: {
      name: String,
      shopCount: Number,
      productCountPerShop: Number,
      durationDays: Number,
      price: Number,
    },
    activatedAt: Date,
    expiredAt: Date,
    lastPaymentRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionPaymentRequest",
    },
    isComplimentary: {
      type: Boolean,
      default: false,
      index: true,
    },
    grantedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    grantNote: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true },
);

sellerSubscriptionSchema.index({ sellerId: 1, status: 1 });
sellerSubscriptionSchema.index({ storeId: 1, status: 1 });
sellerSubscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });

export default mongoose.model("SellerSubscription", sellerSubscriptionSchema);
