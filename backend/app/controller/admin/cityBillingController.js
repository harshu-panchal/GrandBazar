import handleResponse from "../../utils/helper.js";
import {
  listCityBillingConfigs,
  getCityBillingConfigByKey,
  upsertCityBillingConfig,
  setCityBillingStatus,
  deleteCityBillingConfig,
  duplicateCityBillingConfig,
  activateWeatherCharge,
  deactivateWeatherCharge,
} from "../../services/finance/cityBillingService.js";
import {
  upsertCityBillingSchema,
  patchStatusSchema,
  activateWeatherSchema,
  extraChargeSchema,
} from "../../validation/cityBillingValidation.js";
import CityBillingConfig from "../../models/cityBillingConfig.js";
import { normalizeCityKey } from "../../services/cityCommissionService.js";
import { recordAuditLog } from "../../services/auditTrailService.js";
import { invalidateCityBillingCache, resolveCityBillingConfig } from "../../services/finance/cityBillingResolver.js";
import {
  calculateCustomerDeliveryFee,
  calculateRiderPayout,
  isWithinOddHourWindow,
} from "../../services/finance/pricingService.js";
import {
  EXTRA_CHARGE_APPLIES_TO,
  EXTRA_CHARGE_REVENUE_TYPE,
  EXTRA_CHARGE_TYPE,
  FINANCE_AUDIT_ACTION,
} from "../../constants/finance.js";

function handleServiceError(res, error) {
  const status = error.status || 500;
  return handleResponse(res, status, error.message, error.code ? { code: error.code } : undefined);
}

export async function listCityBillingConfigsController(req, res) {
  try {
    const items = await listCityBillingConfigs({ q: req.query.q || "" });
    return handleResponse(res, 200, "City billing configs fetched", items);
  } catch (error) {
    return handleServiceError(res, error);
  }
}

export async function getCityBillingConfigController(req, res) {
  try {
    const item = await getCityBillingConfigByKey(req.params.cityKey);
    if (!item) return handleResponse(res, 404, "City billing config not found");
    return handleResponse(res, 200, "City billing config fetched", item);
  } catch (error) {
    return handleServiceError(res, error);
  }
}

export async function upsertCityBillingConfigController(req, res) {
  try {
    const cityKey = normalizeCityKey(req.params.cityKey || req.body.cityKey);
    const { error, value } = upsertCityBillingSchema.validate(
      { ...req.body, cityKey },
      { stripUnknown: true, abortEarly: false },
    );
    if (error) {
      return handleResponse(res, 400, error.details.map((d) => d.message).join("; "));
    }
    const item = await upsertCityBillingConfig({
      payload: value,
      adminId: req.user?.id || null,
    });
    return handleResponse(res, 200, "City billing config saved", item);
  } catch (error) {
    return handleServiceError(res, error);
  }
}

export async function patchCityBillingStatusController(req, res) {
  try {
    const { error, value } = patchStatusSchema.validate(req.body);
    if (error) return handleResponse(res, 400, error.message);
    const item = await setCityBillingStatus({
      cityKey: req.params.cityKey,
      isActive: value.isActive,
      adminId: req.user?.id || null,
    });
    return handleResponse(res, 200, "Status updated", item);
  } catch (error) {
    return handleServiceError(res, error);
  }
}

export async function deleteCityBillingConfigController(req, res) {
  try {
    const item = await deleteCityBillingConfig({
      cityKey: req.params.cityKey,
      adminId: req.user?.id || null,
    });
    return handleResponse(res, 200, "City billing config deleted", { cityKey: item.cityKey });
  } catch (error) {
    return handleServiceError(res, error);
  }
}

export async function duplicateCityBillingConfigController(req, res) {
  try {
    const targetCityKey = normalizeCityKey(req.body.targetCityKey || "");
    if (!targetCityKey) return handleResponse(res, 400, "targetCityKey is required");
    const item = await duplicateCityBillingConfig({
      sourceCityKey: req.params.cityKey,
      targetCityKey,
      targetCityName: req.body.targetCityName || targetCityKey,
      adminId: req.user?.id || null,
    });
    return handleResponse(res, 201, "City billing config duplicated", item);
  } catch (error) {
    return handleServiceError(res, error);
  }
}

export async function activateWeatherChargeController(req, res) {
  try {
    const { error, value } = activateWeatherSchema.validate(req.body);
    if (error) return handleResponse(res, 400, error.details?.[0]?.message || error.message);
    const item = await activateWeatherCharge({
      cityKey: req.params.cityKey,
      amount: value.amount,
      reason: value.reason,
      revenueSplit: value.revenueSplit,
      adminId: req.user?.id || null,
    });
    return handleResponse(res, 200, "Weather charge activated", item);
  } catch (error) {
    return handleServiceError(res, error);
  }
}

export async function deactivateWeatherChargeController(req, res) {
  try {
    const item = await deactivateWeatherCharge({
      cityKey: req.params.cityKey,
      adminId: req.user?.id || null,
    });
    return handleResponse(res, 200, "Weather charge deactivated", item);
  } catch (error) {
    return handleServiceError(res, error);
  }
}

/**
 * Add a single extra-charge to a city's list. Used by the admin panel's
 * per-row create; whole-array replacement continues to go through
 * upsertCityBillingConfig.
 */
export async function addExtraChargeController(req, res) {
  try {
    const key = normalizeCityKey(req.params.cityKey);
    const doc = await CityBillingConfig.findOne({ cityKey: key });
    if (!doc) return handleResponse(res, 404, "City billing config not found");
    const { error, value } = extraChargeSchema.validate(req.body, {
      stripUnknown: true,
    });
    if (error) return handleResponse(res, 400, error.details?.[0]?.message || error.message);
    doc.extraCharges.push(value);
    doc.updatedBy = req.user?.id || null;
    await doc.save();
    await invalidateCityBillingCache(key);
    const added = doc.extraCharges[doc.extraCharges.length - 1];
    void recordAuditLog({
      actorId: req.user?.id || null,
      action: FINANCE_AUDIT_ACTION.CITY_EXTRA_CHARGE_CREATED,
      targetType: "CityBillingConfig.extraCharge",
      targetId: added._id,
      before: null,
      after: added.toObject(),
    });
    return handleResponse(res, 201, "Extra charge added", doc.toObject());
  } catch (error) {
    return handleServiceError(res, error);
  }
}

export async function updateExtraChargeController(req, res) {
  try {
    const key = normalizeCityKey(req.params.cityKey);
    const doc = await CityBillingConfig.findOne({ cityKey: key });
    if (!doc) return handleResponse(res, 404, "City billing config not found");
    const charge = doc.extraCharges.id(req.params.chargeId);
    if (!charge) return handleResponse(res, 404, "Extra charge not found");
    const { error, value } = extraChargeSchema.validate(req.body, {
      stripUnknown: true,
    });
    if (error) return handleResponse(res, 400, error.details?.[0]?.message || error.message);
    const before = charge.toObject();
    Object.assign(charge, value);
    doc.updatedBy = req.user?.id || null;
    await doc.save();
    await invalidateCityBillingCache(key);
    void recordAuditLog({
      actorId: req.user?.id || null,
      action: FINANCE_AUDIT_ACTION.CITY_EXTRA_CHARGE_UPDATED,
      targetType: "CityBillingConfig.extraCharge",
      targetId: charge._id,
      before,
      after: charge.toObject(),
    });
    return handleResponse(res, 200, "Extra charge updated", doc.toObject());
  } catch (error) {
    return handleServiceError(res, error);
  }
}

/**
 * Preview a customer-facing bill for a hypothetical order. The admin
 * types city + subtotal + distance + payment method + time; the server
 * runs the same resolver + delivery-fee math as real checkout and
 * returns the numbers. There is no cart hydration and no seller/product
 * lookup here — this is a configuration check, not a real quote.
 */
export async function previewCityBillingController(req, res) {
  try {
    const {
      cityKey = "",
      subtotal = 0,
      distanceKm = 0,
      paymentMethod = "ONLINE",
      orderPlacedAt = new Date(),
      hasDelivery = true,
    } = req.body || {};

    const resolved = await resolveCityBillingConfig({
      cityKey,
      address: { city: cityKey },
    });
    const settings = resolved.deliverySettings;

    const delivery = calculateCustomerDeliveryFee(distanceKm, settings);
    const rider = calculateRiderPayout(distanceKm, settings);

    const freeDeliveryThreshold = Number(settings.freeDeliveryThreshold || 0);
    const isFree = freeDeliveryThreshold > 0 && subtotal >= freeDeliveryThreshold;
    const deliveryFee = isFree ? 0 : delivery.deliveryFeeCharged;

    const oddHourWindow = settings.oddHourSurcharge || {};
    const oddHourActive =
      oddHourWindow.enabled &&
      Number(oddHourWindow.amount || 0) > 0 &&
      isWithinOddHourWindow(
        orderPlacedAt,
        oddHourWindow.windowStart,
        oddHourWindow.windowEnd,
      );
    const oddHourAmount = oddHourActive
      ? Number(oddHourWindow.amount || 0)
      : 0;

    const weather = settings.weatherSurcharge || {};
    const weatherAmount = weather.enabled ? Number(weather.amount || 0) : 0;

    const extras = (resolved.extraCharges || [])
      .map((c) => {
        if (c.appliesTo === EXTRA_CHARGE_APPLIES_TO.COD && paymentMethod !== "COD") return null;
        if (c.appliesTo === EXTRA_CHARGE_APPLIES_TO.ONLINE && paymentMethod !== "ONLINE") return null;
        if (c.appliesTo === EXTRA_CHARGE_APPLIES_TO.DELIVERY && !hasDelivery) return null;
        if (c.minimumOrderValue && subtotal < c.minimumOrderValue) return null;
        if (c.maximumOrderValue && subtotal > c.maximumOrderValue) return null;
        const amount =
          c.type === EXTRA_CHARGE_TYPE.PERCENTAGE
            ? Math.round(((subtotal * Number(c.amount || 0)) / 100) * 100) / 100
            : Math.round(Number(c.amount || 0) * 100) / 100;
        if (amount <= 0) return null;
        return { name: c.name, type: c.type, amount, revenueType: c.revenueType };
      })
      .filter(Boolean);
    const extrasTotal = extras.reduce((s, c) => s + c.amount, 0);

    const grandTotal =
      Number(subtotal || 0) +
      deliveryFee +
      oddHourAmount +
      weatherAmount +
      extrasTotal;

    return handleResponse(res, 200, "Preview computed", {
      billing: {
        source: resolved.meta.source,
        cityKey: resolved.meta.cityKey,
        cityName: resolved.meta.cityName,
      },
      breakdown: {
        subtotal: Number(subtotal || 0),
        deliveryFee,
        freeDeliveryApplied: isFree,
        riderPayout: rider.riderPayoutTotal,
        oddHourSurcharge: oddHourAmount,
        weatherSurcharge: weatherAmount,
        extraCharges: extras,
        extraChargesTotal: extrasTotal,
        grandTotal: Math.round(grandTotal * 100) / 100,
      },
      resolvedDeliverySettings: {
        pricingMode: settings.deliveryPricingMode,
        baseCharge: settings.customerBaseDeliveryFee,
        baseDistanceKm: settings.baseDistanceCapacityKm,
        additionalChargePerKm: settings.incrementalKmSurcharge,
        fixedDeliveryFee: settings.fixedDeliveryFee,
        freeDeliveryThreshold,
      },
    });
  } catch (error) {
    return handleServiceError(res, error);
  }
}

export async function deleteExtraChargeController(req, res) {
  try {
    const key = normalizeCityKey(req.params.cityKey);
    const doc = await CityBillingConfig.findOne({ cityKey: key });
    if (!doc) return handleResponse(res, 404, "City billing config not found");
    const charge = doc.extraCharges.id(req.params.chargeId);
    if (!charge) return handleResponse(res, 404, "Extra charge not found");
    const before = charge.toObject();
    charge.deleteOne();
    doc.updatedBy = req.user?.id || null;
    await doc.save();
    await invalidateCityBillingCache(key);
    void recordAuditLog({
      actorId: req.user?.id || null,
      action: FINANCE_AUDIT_ACTION.CITY_EXTRA_CHARGE_DELETED,
      targetType: "CityBillingConfig.extraCharge",
      targetId: before._id,
      before,
      after: null,
    });
    return handleResponse(res, 200, "Extra charge deleted", doc.toObject());
  } catch (error) {
    return handleServiceError(res, error);
  }
}
