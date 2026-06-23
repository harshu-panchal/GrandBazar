import mongoose from "mongoose";

const loginActivitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    userModel: {
      type: String,
      required: true,
      enum: ["Seller", "Customer", "Delivery", "Admin"],
    },
    name: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      required: true,
    },
    loginAt: {
      type: Date,
      default: Date.now,
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
    ipAddress: String,
    userAgent: String,
    status: {
      type: String,
      enum: ["active", "logged_out"],
      default: "active",
    },
  },
  { timestamps: true }
);

loginActivitySchema.index({ userId: 1, status: 1 });
loginActivitySchema.index({ lastActiveAt: -1 });

export default mongoose.model("LoginActivity", loginActivitySchema);
