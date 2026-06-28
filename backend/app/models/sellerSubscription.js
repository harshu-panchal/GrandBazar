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
  },
  { timestamps: true },
);

sellerSubscriptionSchema.index({ sellerId: 1, status: 1 });
sellerSubscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });

export default mongoose.model("SellerSubscription", sellerSubscriptionSchema);
