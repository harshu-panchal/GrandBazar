import mongoose from "mongoose";
import {
  ALL_COMMISSION_FIXED_RULES,
  ALL_COMMISSION_TYPES,
} from "../constants/finance.js";

const cityCommissionSchema = new mongoose.Schema(
  {
    cityKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    cityName: {
      type: String,
      trim: true,
      default: "",
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    applyCommission: {
      type: Boolean,
      default: false,
    },
    adminCommission: {
      type: Number,
      default: 0,
      min: 0,
    },
    adminCommissionType: {
      type: String,
      enum: ALL_COMMISSION_TYPES,
      default: "percentage",
    },
    adminCommissionValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    adminCommissionFixedRule: {
      type: String,
      enum: ALL_COMMISSION_FIXED_RULES,
      default: "per_qty",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true },
);

cityCommissionSchema.pre("save", function normalizeCommission(next) {
  try {
    this.cityKey = String(this.cityKey || "").trim().toLowerCase();
    const value = Math.max(0, Number(this.adminCommissionValue ?? this.adminCommission ?? 0) || 0);
    this.adminCommissionValue = value;
    this.adminCommission = this.adminCommissionType === "percentage" ? value : 0;
    next();
  } catch (error) {
    next(error);
  }
});

export default mongoose.model("CityCommission", cityCommissionSchema);
