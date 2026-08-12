import Setting from "../../models/setting.js";
import {
  DELIVERY_PRICING_MODE,
  HANDLING_FEE_STRATEGY,
} from "../../constants/finance.js";
import { roundCurrency } from "../../utils/money.js";

const DEFAULT_FINANCE_SETTINGS = {
  deliveryPricingMode: DELIVERY_PRICING_MODE.DISTANCE_BASED,
  customerBaseDeliveryFee: 30,
  riderBasePayout: 30,
  baseDistanceCapacityKm: 0.5,
  incrementalKmSurcharge: 10,
  deliveryPartnerRatePerKm: 5,
  fixedDeliveryFee: 30,
  handlingFeeStrategy: HANDLING_FEE_STRATEGY.HIGHEST_CATEGORY_FEE,
  codEnabled: true,
  onlineEnabled: true,
  customerSurchargeEnabled: false,
  customerSurchargeAmount: 0,
  customerSurchargeReason: "",
  oddHourSurcharge: {
    enabled: false,
    amount: 0,
    windowStart: "22:00",
    windowEnd: "06:00",
    revenueSplit: { platform: 100, seller: 0 },
  },
  weatherSurcharge: {
    enabled: false,
    amount: 0,
    revenueSplit: { platform: 100, seller: 0 },
  },
  bulkOrderQtyThreshold: 20,
  bulkOrderValueThreshold: 15000,
  bulkOrderCommissionRate: 0,
  platformFee: 0,
  freeDeliveryThreshold: 0,
};

export function normalizeFinanceSettings(raw = {}) {
  const deliveryPricingMode =
    raw.deliveryPricingMode ||
    raw.pricingMode ||
    DEFAULT_FINANCE_SETTINGS.deliveryPricingMode;

  const customerBaseDeliveryFee = roundCurrency(
    raw.customerBaseDeliveryFee ?? raw.baseDeliveryCharge ?? DEFAULT_FINANCE_SETTINGS.customerBaseDeliveryFee,
  );

  const riderBasePayout = roundCurrency(
    raw.riderBasePayout ?? raw.baseDeliveryCharge ?? DEFAULT_FINANCE_SETTINGS.riderBasePayout,
  );

  const deliveryPartnerRatePerKm = roundCurrency(
    raw.deliveryPartnerRatePerKm ??
      raw.fleetCommissionRatePerKm ??
      DEFAULT_FINANCE_SETTINGS.deliveryPartnerRatePerKm,
  );

  const baseDistanceCapacityKm = Number(
    raw.baseDistanceCapacityKm ?? DEFAULT_FINANCE_SETTINGS.baseDistanceCapacityKm,
  );

  const incrementalKmSurcharge = roundCurrency(
    raw.incrementalKmSurcharge ?? DEFAULT_FINANCE_SETTINGS.incrementalKmSurcharge,
  );

  const fixedDeliveryFee = roundCurrency(
    raw.fixedDeliveryFee ?? raw.baseDeliveryCharge ?? customerBaseDeliveryFee,
  );

  const handlingFeeStrategy =
    raw.handlingFeeStrategy || DEFAULT_FINANCE_SETTINGS.handlingFeeStrategy;

  const customerSurchargeEnabled = Boolean(
    raw.customerSurchargeEnabled ?? DEFAULT_FINANCE_SETTINGS.customerSurchargeEnabled,
  );
  const customerSurchargeAmount = roundCurrency(
    Math.max(0, Number(raw.customerSurchargeAmount ?? DEFAULT_FINANCE_SETTINGS.customerSurchargeAmount) || 0),
  );
  const customerSurchargeReason = String(
    raw.customerSurchargeReason ?? DEFAULT_FINANCE_SETTINGS.customerSurchargeReason,
  ).trim();

  const rawOddHour = raw.oddHourSurcharge || {};
  const oddHourSurcharge = {
    enabled: Boolean(rawOddHour.enabled ?? DEFAULT_FINANCE_SETTINGS.oddHourSurcharge.enabled),
    amount: roundCurrency(Math.max(0, Number(rawOddHour.amount ?? 0) || 0)),
    windowStart: String(rawOddHour.windowStart || DEFAULT_FINANCE_SETTINGS.oddHourSurcharge.windowStart),
    windowEnd: String(rawOddHour.windowEnd || DEFAULT_FINANCE_SETTINGS.oddHourSurcharge.windowEnd),
    revenueSplit: {
      platform: Number(rawOddHour.revenueSplit?.platform ?? 100),
      seller: Number(rawOddHour.revenueSplit?.seller ?? 0),
    },
  };

  const rawWeather = raw.weatherSurcharge || {};
  const weatherSurcharge = {
    enabled: Boolean(rawWeather.enabled ?? DEFAULT_FINANCE_SETTINGS.weatherSurcharge.enabled),
    amount: roundCurrency(Math.max(0, Number(rawWeather.amount ?? 0) || 0)),
    revenueSplit: {
      platform: Number(rawWeather.revenueSplit?.platform ?? 100),
      seller: Number(rawWeather.revenueSplit?.seller ?? 0),
    },
  };

  const bulkOrderQtyThreshold = Math.max(
    1,
    Number(raw.bulkOrderQtyThreshold ?? DEFAULT_FINANCE_SETTINGS.bulkOrderQtyThreshold) || DEFAULT_FINANCE_SETTINGS.bulkOrderQtyThreshold,
  );
  const bulkOrderValueThreshold = Math.max(
    0,
    Number(raw.bulkOrderValueThreshold ?? DEFAULT_FINANCE_SETTINGS.bulkOrderValueThreshold) || 0,
  );
  const bulkOrderCommissionRate = Math.max(
    0,
    Number(raw.bulkOrderCommissionRate ?? DEFAULT_FINANCE_SETTINGS.bulkOrderCommissionRate) || 0,
  );

  const platformFee = roundCurrency(
    Math.max(0, Number(raw.platformFee ?? DEFAULT_FINANCE_SETTINGS.platformFee) || 0),
  );
  const freeDeliveryThreshold = roundCurrency(
    Math.max(0, Number(raw.freeDeliveryThreshold ?? DEFAULT_FINANCE_SETTINGS.freeDeliveryThreshold) || 0),
  );

  return {
    deliveryPricingMode,
    pricingMode: deliveryPricingMode,
    customerBaseDeliveryFee,
    riderBasePayout,
    baseDeliveryCharge: customerBaseDeliveryFee,
    baseDistanceCapacityKm: Number.isFinite(baseDistanceCapacityKm)
      ? Math.max(baseDistanceCapacityKm, 0)
      : DEFAULT_FINANCE_SETTINGS.baseDistanceCapacityKm,
    incrementalKmSurcharge,
    deliveryPartnerRatePerKm,
    fleetCommissionRatePerKm: deliveryPartnerRatePerKm,
    fixedDeliveryFee,
    handlingFeeStrategy,
    codEnabled: raw.codEnabled ?? DEFAULT_FINANCE_SETTINGS.codEnabled,
    onlineEnabled: raw.onlineEnabled ?? DEFAULT_FINANCE_SETTINGS.onlineEnabled,
    customerSurchargeEnabled,
    customerSurchargeAmount: customerSurchargeEnabled ? customerSurchargeAmount : 0,
    customerSurchargeReason: customerSurchargeEnabled ? customerSurchargeReason : "",
    oddHourSurcharge,
    weatherSurcharge,
    bulkOrderQtyThreshold,
    bulkOrderValueThreshold,
    bulkOrderCommissionRate,
    platformFee,
    freeDeliveryThreshold,
  };
}

export async function getOrCreateFinanceSettings({ session } = {}) {
  const query = {};
  const options = session ? { session } : {};
  let settings = await Setting.findOne(query, null, options);

  if (!settings) {
    settings = await Setting.create(
      {
        ...DEFAULT_FINANCE_SETTINGS,
        pricingMode: DEFAULT_FINANCE_SETTINGS.deliveryPricingMode,
        baseDeliveryCharge: DEFAULT_FINANCE_SETTINGS.customerBaseDeliveryFee,
        fleetCommissionRatePerKm: DEFAULT_FINANCE_SETTINGS.deliveryPartnerRatePerKm,
      },
      options,
    );
  }

  return normalizeFinanceSettings(settings.toObject?.() || settings);
}

export async function updateDeliveryFinanceSettings(payload, { session } = {}) {
  const normalized = normalizeFinanceSettings(payload || {});
  const query = {};
  const options = { upsert: true, new: true };
  if (session) options.session = session;

  const updated = await Setting.findOneAndUpdate(query, { $set: normalized }, options);
  return normalizeFinanceSettings(updated.toObject?.() || updated);
}

export { DEFAULT_FINANCE_SETTINGS };

export async function getPlatformDeliveryProvider() {
  const settings = await Setting.findOne({
    $or: [{ tenantId: null }, { tenantId: { $exists: false } }],
  })
    .select("defaultDeliveryProvider")
    .lean();
  const provider = String(settings?.defaultDeliveryProvider || "zinto").toLowerCase();
  return provider === "external" ? "external" : "zinto";
}
