import CityBillingConfig from "../../models/cityBillingConfig.js";
import { normalizeCityKey } from "../cityCommissionService.js";
import { getOrCreateFinanceSettings } from "./financeSettingsService.js";
import * as cacheService from "../cacheService.js";
import * as logger from "../logger.js";
import { BILLING_SOURCE } from "../../constants/finance.js";

const CACHE_TTL_SECONDS = Number(
  process.env.CACHE_CITY_BILLING_TTL || 300,
);

function cityCacheKey(cityKey) {
  return cacheService.buildKey("billing", "city", cityKey);
}

export async function invalidateCityBillingCache(cityKey) {
  if (!cityKey) return;
  const key = cityCacheKey(normalizeCityKey(cityKey));
  try {
    await cacheService.invalidate(key);
  } catch (error) {
    logger.warn?.("cityBillingResolver.invalidate failed", {
      cityKey,
      error: error.message,
    });
  }
}

/**
 * Load a raw CityBillingConfig by key, with a short-lived cache. Returns
 * null when no config exists — the caller should then fall back to the
 * global Setting document.
 */
export async function loadCityBillingConfig(cityKey, { session } = {}) {
  const normalized = normalizeCityKey(cityKey);
  if (!normalized) return null;

  if (session) {
    return CityBillingConfig.findOne({ cityKey: normalized })
      .session(session)
      .lean();
  }

  const key = cityCacheKey(normalized);
  return cacheService.getOrSet(
    key,
    async () =>
      (await CityBillingConfig.findOne({ cityKey: normalized }).lean()) ||
      null,
    CACHE_TTL_SECONDS,
  );
}

/**
 * Resolve the customer's delivery city key. Priority:
 *   1. explicit cityKey passed by caller
 *   2. address.city (customer's saved / checkout shipping address)
 *   3. address.cityName
 *   4. store city (legacy fallback — matches existing pricingService behavior)
 *
 * Geo-resolution from coordinates is intentionally NOT implemented here
 * yet: the checkout flow already asks the customer for a city, so an
 * inferred value from lat/lng would only silently override an explicit
 * one. When a coords-only path appears, extend this function rather
 * than mutating callers.
 */
export function resolveCustomerCityKey({
  cityKey = "",
  address = null,
  storeCity = "",
} = {}) {
  const candidates = [
    cityKey,
    address?.city,
    address?.cityName,
    storeCity,
  ];
  for (const raw of candidates) {
    const normalized = normalizeCityKey(raw || "");
    if (normalized) return normalized;
  }
  return "";
}

/**
 * Merge a CityBillingConfig into the same object shape that
 * pricingService.calculateCustomerDeliveryFee / calculateRiderPayout
 * already read from Setting. This lets the existing engine consume
 * city configs with zero changes to the calculation math.
 *
 * If the city config's deliveryCharges block is disabled or missing,
 * the caller's global settings pass through unchanged.
 */
export function mergeDeliverySettings(globalSettings, cityConfig) {
  if (!cityConfig || !cityConfig.deliveryCharges?.enabled) {
    return { ...globalSettings };
  }
  const d = cityConfig.deliveryCharges;
  return {
    ...globalSettings,
    deliveryPricingMode: d.pricingMode || globalSettings.deliveryPricingMode,
    pricingMode: d.pricingMode || globalSettings.pricingMode,
    fixedDeliveryFee:
      d.fixedCharge ?? globalSettings.fixedDeliveryFee,
    customerBaseDeliveryFee:
      d.baseCharge ?? globalSettings.customerBaseDeliveryFee,
    baseDeliveryCharge:
      d.baseCharge ?? globalSettings.baseDeliveryCharge,
    baseDistanceCapacityKm:
      d.baseDistanceKm ?? globalSettings.baseDistanceCapacityKm,
    incrementalKmSurcharge:
      d.additionalChargePerKm ?? globalSettings.incrementalKmSurcharge,
    riderBasePayout:
      d.riderBasePayout ?? globalSettings.riderBasePayout,
    deliveryPartnerRatePerKm:
      d.riderRatePerKm ?? globalSettings.deliveryPartnerRatePerKm,
    freeDeliveryThreshold:
      d.freeDeliveryThreshold ?? globalSettings.freeDeliveryThreshold,
    // Weather surcharge — city overrides global when the city has one
    // configured. Consumers that read `weatherSurcharge` (pricingService)
    // continue to work unchanged.
    weatherSurcharge: cityConfig.weatherCharges?.enabled
      ? {
          enabled:
            cityConfig.weatherCharges.enabled &&
            cityConfig.weatherCharges.active,
          amount: cityConfig.weatherCharges.amount || 0,
          activatedAt: cityConfig.weatherCharges.activatedAt || null,
          activatedBy: cityConfig.weatherCharges.activatedBy || null,
          revenueSplit: {
            platform:
              cityConfig.weatherCharges.revenueSplit?.platform ?? 100,
            seller:
              cityConfig.weatherCharges.revenueSplit?.seller ?? 0,
          },
        }
      : globalSettings.weatherSurcharge,
  };
}

/**
 * One-stop resolver used by checkout / order placement / preview.
 * Returns:
 *   - deliverySettings: settings-shaped object ready for pricingService
 *   - extraCharges: filtered, only enabled ones for this city
 *   - meta: {source, cityKey, cityName, cityConfigId}
 */
export async function resolveCityBillingConfig({
  cityKey = "",
  address = null,
  storeCity = "",
  session = null,
} = {}) {
  const globalSettings = await getOrCreateFinanceSettings({ session });
  const resolvedCityKey = resolveCustomerCityKey({
    cityKey,
    address,
    storeCity,
  });

  let cityConfig = null;
  if (resolvedCityKey) {
    cityConfig = await loadCityBillingConfig(resolvedCityKey, { session });
    if (cityConfig && cityConfig.isActive === false) {
      cityConfig = null;
    }
  }

  const deliverySettings = mergeDeliverySettings(globalSettings, cityConfig);
  const extraCharges = Array.isArray(cityConfig?.extraCharges)
    ? cityConfig.extraCharges.filter((c) => c.enabled !== false)
    : [];

  return {
    deliverySettings,
    extraCharges,
    meta: {
      source: cityConfig ? BILLING_SOURCE.CITY : BILLING_SOURCE.GLOBAL,
      cityKey: cityConfig?.cityKey || resolvedCityKey || "",
      cityName: cityConfig?.cityName || "",
      state: cityConfig?.state || "",
      cityConfigId: cityConfig?._id ? String(cityConfig._id) : null,
    },
  };
}
