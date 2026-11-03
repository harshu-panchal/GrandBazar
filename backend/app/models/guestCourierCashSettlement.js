import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    method: { type: String, enum: ["online", "physical_cash"], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    reference: { type: String, required: true, trim: true },
    gatewayOrderId: { type: String, default: null },
    gatewayPaymentId: { type: String, default: null },
    recordedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    note: { type: String, default: "" },
    paidAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const guestCourierCashSettlementSchema = new mongoose.Schema(
  {
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GuestCourierAssignment",
      required: true,
      unique: true,
      index: true,
    },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    orderId: { type: String, required: true, index: true },
    courier: {
      name: String,
      phone: String,
      email: String,
    },
    grossCollected: { type: Number, required: true, min: 0 },
    amountDueToAdmin: { type: Number, required: true, min: 0 },
    amountRemitted: { type: Number, default: 0, min: 0 },
    pendingAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["pending", "partially_settled", "settled"],
      default: "pending",
      index: true,
    },
    onlinePayment: {
      gatewayOrderId: { type: String, default: null, index: true },
      requestedAmount: { type: Number, default: 0 },
      createdAt: { type: Date, default: null },
    },
    payments: { type: [paymentSchema], default: [] },
    settledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

guestCourierCashSettlementSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("GuestCourierCashSettlement", guestCourierCashSettlementSchema);
