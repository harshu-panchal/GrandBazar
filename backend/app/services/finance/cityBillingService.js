import CityBillingConfig from "../../models/cityBillingConfig.js";
import { normalizeCityKey } from "../cityCommissionService.js";
import { recordAuditLog } from "../auditTrailService.js";
import { invalidateCityBillingCache } from "./cityBillingResolver.js";
import { FINANCE_AUDIT_ACTION } from "../../constants/finance.js";

export async function listCityBillingConfigs({ q = "" } = {}) {
  const query = q
    ? {
        $or: [
          { cityKey: { $regex: q, $options: "i" } },
          { cityName: { $regex: q, $options: "i" } },
        ],
      }
    : {};
  return CityBillingConfig.find(query).sort({ cityKey: 1 }).limit(500).lean();
}

export async function getCityBillingConfigByKey(cityKey) {
  const key = normalizeCityKey(cityKey);
  if (!key) return null;
  return CityBillingConfig.findOne({ cityKey: key }).lean();
}

/**
 * Create or update a city billing config with optimistic concurrency.
 * When the caller passes `payload.updatedAt` it must match the current
 * document's updatedAt or a 409 is thrown.
 */
export async function upsertCityBillingConfig({ payload, adminId }) {
  const cityKey = normalizeCityKey(payload.cityKey);
  if (!cityKey) {
    const err = new Error("cityKey is required");
    err.status = 400;
    throw err;
  }

  const existing = await CityBillingConfig.findOne({ cityKey });

  if (existing && payload.updatedAt) {
    const clientTs = new Date(payload.updatedAt).getTime();
    const serverTs = new Date(existing.updatedAt).getTime();
    if (clientTs !== serverTs) {
      const err = new Error(
        "This billing configuration was changed by another admin. Refresh before saving.",
      );
      err.status = 409;
      err.code = "BILLING_VERSION_CONFLICT";
      throw err;
    }
  }

  const before = existing ? existing.toObject() : null;
  const doc = existing || new CityBillingConfig({ cityKey });

  const {
    cityName,
    state,
    country,
    isActive,
    deliveryCharges,
    weatherCharges,
    extraCharges,
  } = payload;

  doc.cityKey = cityKey;
  doc.cityName = cityName;
  if (state !== undefined) doc.state = state;
  if (country !== undefined) doc.country = country;
  if (isActive !== undefined) doc.isActive = isActive;
  if (deliveryCharges) doc.deliveryCharges = deliveryCharges;
  if (weatherCharges) {
    // Preserve activation audit fields unless explicitly set.
    doc.weatherCharges = {
      ...doc.weatherCharges?.toObject?.() ?? doc.weatherCharges ?? {},
      ...weatherCharges,
    };
  }
  if (Array.isArray(extraCharges)) doc.extraCharges = extraCharges;
  if (!doc.createdBy && adminId) doc.createdBy = adminId;
  doc.updatedBy = adminId || null;

  await doc.save();
  await invalidateCityBillingCache(cityKey);

  void recordAuditLog({
    actorId: adminId,
    action: before
      ? FINANCE_AUDIT_ACTION.CITY_BILLING_UPDATED
      : FINANCE_AUDIT_ACTION.CITY_BILLING_CREATED,
    targetType: "CityBillingConfig",
    targetId: doc._id,
    before,
    after: doc.toObject(),
  });

  return doc.toObject();
}

export async function setCityBillingStatus({ cityKey, isActive, adminId }) {
  const key = normalizeCityKey(cityKey);
  const before = await CityBillingConfig.findOne({ cityKey: key });
  if (!before) {
    const err = new Error("City billing config not found");
    err.status = 404;
    err.code = "CITY_BILLING_NOT_FOUND";
    throw err;
  }
  before.isActive = Boolean(isActive);
  before.updatedBy = adminId || null;
  await before.save();
  await invalidateCityBillingCache(key);
  void recordAuditLog({
    actorId: adminId,
    action: FINANCE_AUDIT_ACTION.CITY_BILLING_STATUS_CHANGED,
    targetType: "CityBillingConfig",
    targetId: before._id,
    before: { isActive: !isActive },
    after: { isActive: Boolean(isActive) },
  });
  return before.toObject();
}

export async function deleteCityBillingConfig({ cityKey, adminId }) {
  const key = normalizeCityKey(cityKey);
  const before = await CityBillingConfig.findOne({ cityKey: key }).lean();
  if (!before) {
    const err = new Error("City billing config not found");
    err.status = 404;
    err.code = "CITY_BILLING_NOT_FOUND";
    throw err;
  }
  await CityBillingConfig.deleteOne({ cityKey: key });
  await invalidateCityBillingCache(key);
  void recordAuditLog({
    actorId: adminId,
    action: FINANCE_AUDIT_ACTION.CITY_BILLING_DELETED,
    targetType: "CityBillingConfig",
    targetId: before._id,
    before,
    after: null,
  });
  return before;
}

export async function duplicateCityBillingConfig({
  sourceCityKey,
  targetCityKey,
  targetCityName,
  adminId,
}) {
  const source = await CityBillingConfig.findOne({
    cityKey: normalizeCityKey(sourceCityKey),
  }).lean();
  if (!source) {
    const err = new Error("Source city billing config not found");
    err.status = 404;
    throw err;
  }
  const targetKey = normalizeCityKey(targetCityKey);
  const existing = await CityBillingConfig.findOne({ cityKey: targetKey });
  if (existing) {
    const err = new Error("Target city billing config already exists");
    err.status = 409;
    err.code = "CITY_BILLING_ALREADY_EXISTS";
    throw err;
  }
  const copy = new CityBillingConfig({
    cityKey: targetKey,
    cityName: targetCityName || targetKey,
    state: source.state,
    country: source.country,
    isActive: true,
    deliveryCharges: source.deliveryCharges,
    weatherCharges: {
      ...source.weatherCharges,
      active: false, // never auto-activate weather on duplicate
      activatedAt: null,
      activatedBy: null,
    },
    extraCharges: source.extraCharges,
    createdBy: adminId,
    updatedBy: adminId,
  });
  await copy.save();
  await invalidateCityBillingCache(targetKey);
  void recordAuditLog({
    actorId: adminId,
    action: FINANCE_AUDIT_ACTION.CITY_BILLING_DUPLICATED,
    targetType: "CityBillingConfig",
    targetId: copy._id,
    before: { sourceCityKey: source.cityKey },
    after: copy.toObject(),
  });
  return copy.toObject();
}

export async function activateWeatherCharge({
  cityKey,
  amount,
  reason,
  revenueSplit,
  adminId,
}) {
  const key = normalizeCityKey(cityKey);
  const doc = await CityBillingConfig.findOne({ cityKey: key });
  if (!doc) {
    const err = new Error("City billing config not found");
    err.status = 404;
    throw err;
  }
  const before = doc.toObject().weatherCharges;
  doc.weatherCharges = {
    ...doc.weatherCharges?.toObject?.() ?? doc.weatherCharges ?? {},
    enabled: true,
    active: true,
    amount: Number(amount || 0),
    reason: String(reason || ""),
    revenueSplit: revenueSplit ||
      doc.weatherCharges?.revenueSplit || { platform: 100, seller: 0 },
    activatedBy: adminId || null,
    activatedAt: new Date(),
  };
  doc.updatedBy = adminId || null;
  await doc.save();
  await invalidateCityBillingCache(key);
  void recordAuditLog({
    actorId: adminId,
    action: FINANCE_AUDIT_ACTION.CITY_WEATHER_ACTIVATED,
    targetType: "CityBillingConfig",
    targetId: doc._id,
    before,
    after: doc.weatherCharges,
  });
  return doc.toObject();
}

export async function deactivateWeatherCharge({ cityKey, adminId }) {
  const key = normalizeCityKey(cityKey);
  const doc = await CityBillingConfig.findOne({ cityKey: key });
  if (!doc) {
    const err = new Error("City billing config not found");
    err.status = 404;
    throw err;
  }
  const before = doc.toObject().weatherCharges;
  doc.weatherCharges = {
    ...doc.weatherCharges?.toObject?.() ?? doc.weatherCharges ?? {},
    active: false,
  };
  doc.updatedBy = adminId || null;
  await doc.save();
  await invalidateCityBillingCache(key);
  void recordAuditLog({
    actorId: adminId,
    action: FINANCE_AUDIT_ACTION.CITY_WEATHER_DEACTIVATED,
    targetType: "CityBillingConfig",
    targetId: doc._id,
    before,
    after: doc.weatherCharges,
  });
  return doc.toObject();
}
