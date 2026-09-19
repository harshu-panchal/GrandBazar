import mongoose from "mongoose";

const couponRedemptionSchema = new mongoose.Schema(
  {
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    orderPublicId: { type: String, default: null },
    couponCode: { type: String, trim: true, uppercase: true },
    discountAmount: { type: Number, default: 0 },
    redeemedAt: { type: Date, default: Date.now },
    // 1-based ordinal of this customer's use of this coupon; lets the unique
    // index below stop concurrent checkouts from both taking the same slot.
    useIndex: { type: Number, default: undefined },
  },
  { timestamps: true },
);

couponRedemptionSchema.index({ couponId: 1, customerId: 1 });
couponRedemptionSchema.index({ orderId: 1 });
couponRedemptionSchema.index(
  { couponId: 1, customerId: 1, useIndex: 1 },
  {
    unique: true,
    partialFilterExpression: { useIndex: { $type: "number" } },
  },
);
couponRedemptionSchema.index({ customerId: 1, redeemedAt: -1 });

export default mongoose.model("CouponRedemption", couponRedemptionSchema);
