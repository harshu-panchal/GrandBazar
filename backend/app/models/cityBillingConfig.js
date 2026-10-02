import mongoose from "mongoose";
import {
  ALL_DELIVERY_PRICING_MODES,
  ALL_EXTRA_CHARGE_APPLIES_TO,
  ALL_EXTRA_CHARGE_REVENUE_TYPES,
  ALL_EXTRA_CHARGE_TYPES,
  DELIVERY_PRICING_MODE,
  EXTRA_CHARGE_APPLIES_TO,
  EXTRA_CHARGE_REVENUE_TYPE,
  EXTRA_CHARGE_TYPE,
} from "../constants/finance.js";

/**
 * Per-city override for customer-facing billing. Shares the cityKey
 * normalization convention with CityCommission so both models can be
 * looked up from the same identity without introducing a City collection.
 *
 * Fields inside deliveryCharges intentionally mirror the global Setting
 * document's shape so cityBillingResolver can merge a config into the
 * same `deliverySettings`-shaped object that pricingService already
 * consumes — no duplicate delivery-calculation code path.
 */

const extraChargeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    type: {
      type: String,
      enum: ALL_EXTRA_CHARGE_TYPES,
      default: EXTRA_CHARGE_TYPE.FLAT,
    },
    amount: { type: Number, default: 0, min: 0 },
    enabled: { type: Boolean, default: true },
    appliesTo: {
      type: String,
      enum: ALL_EXTRA_CHARGE_APPLIES_TO,
      default: EXTRA_CHARGE_APPLIES_TO.ALL_ORDERS,
    },
    minimumOrderValue: { type: Number, default: 0, min: 0 },
    maximumOrderValue: { type: Number, default: 0, min: 0 },
    revenueType: {
      type: String,
      enum: ALL_EXTRA_CHARGE_REVENUE_TYPES,
      default: EXTRA_CHARGE_REVENUE_TYPE.PLATFORM,
    },
    platformPercentage: { type: Number, default: 100, min: 0, max: 100 },
    sellerPercentage: { type: Number, default: 0, min: 0, max: 100 },
    riderPercentage: { type: Number, default: 0, min: 0, max: 100 },
  },
  { _id: true, timestamps: true },
);

const cityBillingConfigSchema = new mongoose.Schema(
  {
    cityKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    cityName: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    country: { type: String, trim: true, default: "IN" },

    isActive: { type: Boolean, default: true },

    deliveryCharges: {
      enabled: { type: Boolean, default: true },
      pricingMode: {
        type: String,
        enum: ALL_DELIVERY_PRICING_MODES,
        default: DELIVERY_PRICING_MODE.DISTANCE_BASED,
      },
      fixedCharge: { type: Number, default: 30, min: 0 },
      baseCharge: { type: Number, default: 30, min: 0 },
      baseDistanceKm: { type: Number, default: 0.5, min: 0 },
      additionalChargePerKm: { type: Number, default: 10, min: 0 },
      riderBasePayout: { type: Number, default: 30, min: 0 },
      riderRatePerKm: { type: Number, default: 5, min: 0 },
      freeDeliveryThreshold: { type: Number, default: 0, min: 0 },
      minimumOrderValue: { type: Number, default: 0, min: 0 },
      maximumDeliveryCharge: { type: Number, default: 0, min: 0 }, // 0 = no cap
    },

    weatherCharges: {
      enabled: { type: Boolean, default: false },
      active: { type: Boolean, default: false },
      amount: { type: Number, default: 0, min: 0 },
      reason: { type: String, default: "", trim: true },
      revenueSplit: {
        platform: { type: Number, default: 100, min: 0, max: 100 },
        seller: { type: Number, default: 0, min: 0, max: 100 },
      },
      activatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
        default: null,
      },
      activatedAt: { type: Date, default: null },
    },

    extraCharges: { type: [extraChargeSchema], default: [] },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true },
);

cityBillingConfigSchema.pre("save", function normalizeCityBilling() {
  this.cityKey = String(this.cityKey || "").trim().toLowerCase();

  const weather = this.weatherCharges;
  if (weather?.revenueSplit) {
    const platform = Number(weather.revenueSplit.platform ?? 100);
    const seller = Number(weather.revenueSplit.seller ?? 0);
    if (Math.round(platform + seller) !== 100) {
      throw new Error(
        `weatherCharges.revenueSplit must sum to 100 (got ${platform + seller})`,
      );
    }
  }

  if (Array.isArray(this.extraCharges)) {
    this.extraCharges.forEach((charge) => {
      if (charge.revenueType === EXTRA_CHARGE_REVENUE_TYPE.SPLIT) {
        const sum =
          Number(charge.platformPercentage || 0) +
          Number(charge.sellerPercentage || 0) +
          Number(charge.riderPercentage || 0);
        if (Math.round(sum) !== 100) {
          throw new Error(
            `extraCharges[${charge.name}] split percentages must sum to 100 (got ${sum})`,
          );
        }
      }
      if (
        charge.maximumOrderValue &&
        charge.minimumOrderValue > charge.maximumOrderValue
      ) {
        throw new Error(
          `extraCharges[${charge.name}] minimumOrderValue must be <= maximumOrderValue`,
        );
      }
    });
  }
});

export default mongoose.model("CityBillingConfig", cityBillingConfigSchema);
