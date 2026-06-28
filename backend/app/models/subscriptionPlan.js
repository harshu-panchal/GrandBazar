import mongoose from "mongoose";

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    shopCount: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    productCountPerShop: {
      type: Number,
      required: true,
      min: 1,
      default: 50,
    },
    durationDays: {
      type: Number,
      required: true,
      min: 1,
      default: 30,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    billingCycle: {
      type: String,
      enum: ["daily", "weekly", "monthly", "quarterly", "yearly"],
      default: "monthly",
    },
  },
  { timestamps: true },
);

subscriptionPlanSchema.index({ isActive: 1, sortOrder: 1 });

export default mongoose.model("SubscriptionPlan", subscriptionPlanSchema);
