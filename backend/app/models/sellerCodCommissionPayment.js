import mongoose from "mongoose";
import { PAYMENT_GATEWAY, PAYMENT_STATUS, ALL_PAYMENT_STATUSES, ALL_PAYMENT_GATEWAYS } from "../constants/payment.js";

const sellerCodCommissionPaymentSchema = new mongoose.Schema(
  {
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    currency: {
      type: String,
      default: "INR",
    },
    paymentMethod: {
      type: String,
      // ONLINE_PHONEPE kept for historical records written before the
      // Razorpay migration; new online payments write ONLINE_RAZORPAY.
      enum: ["ONLINE_PHONEPE", "ONLINE_RAZORPAY", "MANUAL_ADMIN_RECONCILIATION", "AUTO_WALLET_OFFSET"],
      default: "ONLINE_RAZORPAY",
    },
    gatewayName: {
      type: String,
      enum: ALL_PAYMENT_GATEWAYS,
      default: PAYMENT_GATEWAY.RAZORPAY,
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
    },
    status: {
      type: String,
      enum: ALL_PAYMENT_STATUSES,
      default: PAYMENT_STATUS.CREATED,
      index: true,
    },
    rawGatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    capturedAt: {
      type: Date,
      default: null,
    },
    failedAt: {
      type: Date,
      default: null,
    },
    ordersReconciled: [
      {
        orderId: String,
        amount: Number,
      },
    ],
    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

export default mongoose.model("SellerCodCommissionPayment", sellerCodCommissionPaymentSchema);
