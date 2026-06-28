import mongoose from "mongoose";
import {
  ALL_PAYMENT_GATEWAYS,
  ALL_PAYMENT_STATUSES,
  PAYMENT_STATUS,
} from "../constants/payment.js";
import { PAYMENT_REQUEST_TYPE } from "../constants/subscription.js";

const sellerSubscriptionPaymentSchema = new mongoose.Schema(
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
      index: true,
    },
    requestType: {
      type: String,
      enum: Object.values(PAYMENT_REQUEST_TYPE),
      default: PAYMENT_REQUEST_TYPE.NEW,
    },
    gatewayName: {
      type: String,
      enum: ALL_PAYMENT_GATEWAYS,
      default: "PHONEPE",
    },
    gatewayOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    gatewayPaymentId: {
      type: String,
      default: null,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    currency: {
      type: String,
      default: "INR",
    },
    status: {
      type: String,
      enum: ALL_PAYMENT_STATUSES,
      default: PAYMENT_STATUS.CREATED,
      index: true,
    },
    planSnapshot: {
      name: String,
      shopCount: Number,
      productCountPerShop: Number,
      durationDays: Number,
      price: Number,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SellerSubscription",
    },
    paymentRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionPaymentRequest",
    },
    rawGatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    failureReason: String,
    capturedAt: Date,
    failedAt: Date,
  },
  { timestamps: true },
);

sellerSubscriptionPaymentSchema.index({ sellerId: 1, createdAt: -1 });
sellerSubscriptionPaymentSchema.index({ sellerId: 1, status: 1 });

export default mongoose.model("SellerSubscriptionPayment", sellerSubscriptionPaymentSchema);
