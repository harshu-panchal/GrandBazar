import mongoose from "mongoose";
import { PAYMENT_GATEWAY, PAYMENT_STATUS, ALL_PAYMENT_STATUSES, ALL_PAYMENT_GATEWAYS } from "../constants/payment.js";

const deliveryCodRemittanceSchema = new mongoose.Schema(
  {
    deliveryBoy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1, // in rupees
    },
    currency: {
      type: String,
      default: "INR",
    },
    gatewayName: {
      type: String,
      enum: ALL_PAYMENT_GATEWAYS,
      default: PAYMENT_GATEWAY.PHONEPE,
    },
    gatewayOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true, // e.g. COD-RID123-1
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
      }
    ],
  },
  { timestamps: true }
);

export default mongoose.model("DeliveryCodRemittance", deliveryCodRemittanceSchema);
