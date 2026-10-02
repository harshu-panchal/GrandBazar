import Joi from "joi";
import {
  ALL_DELIVERY_PRICING_MODES,
  ALL_EXTRA_CHARGE_APPLIES_TO,
  ALL_EXTRA_CHARGE_REVENUE_TYPES,
  ALL_EXTRA_CHARGE_TYPES,
  EXTRA_CHARGE_REVENUE_TYPE,
} from "../constants/finance.js";

const deliveryChargesSchema = Joi.object({
  enabled: Joi.boolean().default(true),
  pricingMode: Joi.string()
    .valid(...ALL_DELIVERY_PRICING_MODES)
    .required(),
  fixedCharge: Joi.number().min(0).default(0),
  baseCharge: Joi.number().min(0).default(0),
  baseDistanceKm: Joi.number().min(0).default(0),
  additionalChargePerKm: Joi.number().min(0).default(0),
  riderBasePayout: Joi.number().min(0).default(0),
  riderRatePerKm: Joi.number().min(0).default(0),
  freeDeliveryThreshold: Joi.number().min(0).default(0),
  minimumOrderValue: Joi.number().min(0).default(0),
  maximumDeliveryCharge: Joi.number().min(0).default(0),
});

const revenueSplitSchema = Joi.object({
  platform: Joi.number().min(0).max(100).required(),
  seller: Joi.number().min(0).max(100).required(),
}).custom((value, helpers) => {
  const sum = Number(value.platform || 0) + Number(value.seller || 0);
  if (Math.round(sum) !== 100) {
    // helpers.message() replaces Joi's default "invalid value" text so the
    // toast the admin sees actually names the problem.
    return helpers.message(
      `Revenue split must sum to 100 (Platform ${value.platform}% + Seller ${value.seller}% = ${sum}%).`,
    );
  }
  return value;
});

const weatherChargesSchema = Joi.object({
  enabled: Joi.boolean().default(false),
  active: Joi.boolean().default(false),
  amount: Joi.number().min(0).default(0),
  reason: Joi.string().allow("").max(200).default(""),
  revenueSplit: revenueSplitSchema.default({ platform: 100, seller: 0 }),
});

export const extraChargeSchema = Joi.object({
  name: Joi.string().trim().min(1).max(80).required(),
  description: Joi.string().allow("").max(300).default(""),
  type: Joi.string()
    .valid(...ALL_EXTRA_CHARGE_TYPES)
    .required(),
  amount: Joi.number().min(0).required(),
  enabled: Joi.boolean().default(true),
  appliesTo: Joi.string()
    .valid(...ALL_EXTRA_CHARGE_APPLIES_TO)
    .default("all_orders"),
  minimumOrderValue: Joi.number().min(0).default(0),
  maximumOrderValue: Joi.number().min(0).default(0),
  revenueType: Joi.string()
    .valid(...ALL_EXTRA_CHARGE_REVENUE_TYPES)
    .default("platform"),
  platformPercentage: Joi.number().min(0).max(100).default(100),
  sellerPercentage: Joi.number().min(0).max(100).default(0),
  riderPercentage: Joi.number().min(0).max(100).default(0),
})
  .custom((value, helpers) => {
    if (value.maximumOrderValue && value.minimumOrderValue > value.maximumOrderValue) {
      return helpers.message(
        `Extra charge "${value.name}": minimumOrderValue (${value.minimumOrderValue}) must be <= maximumOrderValue (${value.maximumOrderValue}).`,
      );
    }
    if (value.revenueType === EXTRA_CHARGE_REVENUE_TYPE.SPLIT) {
      const sum =
        Number(value.platformPercentage || 0) +
        Number(value.sellerPercentage || 0) +
        Number(value.riderPercentage || 0);
      if (Math.round(sum) !== 100) {
        return helpers.message(
          `Extra charge "${value.name}": split percentages must sum to 100 (got ${sum}%).`,
        );
      }
    }
    if (value.type === "percentage" && value.amount > 100) {
      return helpers.message(
        `Extra charge "${value.name}": percentage amount must be <= 100 (got ${value.amount}%).`,
      );
    }
    return value;
  });

export const upsertCityBillingSchema = Joi.object({
  cityKey: Joi.string().trim().lowercase().min(1).max(80).required(),
  cityName: Joi.string().trim().min(1).max(120).required(),
  state: Joi.string().allow("").trim().max(80).default(""),
  country: Joi.string().allow("").trim().max(3).default("IN"),
  isActive: Joi.boolean().default(true),
  deliveryCharges: deliveryChargesSchema.required(),
  weatherCharges: weatherChargesSchema.default({}),
  extraCharges: Joi.array().items(extraChargeSchema).default([]),
  updatedAt: Joi.date().optional(), // optimistic concurrency check
});

export const patchStatusSchema = Joi.object({
  isActive: Joi.boolean().required(),
});

export const activateWeatherSchema = Joi.object({
  amount: Joi.number().min(0).required(),
  reason: Joi.string().allow("").max(200).default(""),
  revenueSplit: revenueSplitSchema.optional(),
});
