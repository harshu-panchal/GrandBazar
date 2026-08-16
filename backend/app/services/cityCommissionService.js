import CityCommission from "../models/cityCommission.js";
import {
  COMMISSION_FIXED_RULE,
  COMMISSION_TYPE,
} from "../constants/finance.js";
import { recordAuditLog } from "./auditTrailService.js";

export function normalizeCityKey(raw = "") {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/--+/g, "-");
}

export function normalizeCommissionPayload(payload = {}) {
  const type = payload.adminCommissionType === COMMISSION_TYPE.FIXED
    ? COMMISSION_TYPE.FIXED
    : COMMISSION_TYPE.PERCENTAGE;
  const fixedRule = payload.adminCommissionFixedRule === COMMISSION_FIXED_RULE.PER_ITEM
    ? COMMISSION_FIXED_RULE.PER_ITEM
    : COMMISSION_FIXED_RULE.PER_QTY;
  const value = Math.max(0, Number(payload.adminCommissionValue ?? payload.adminCommission ?? 0) || 0);
  const applyCommission = payload.applyCommission === true || payload.applyCommission === "true";
  const enabled = payload.enabled !== false && payload.enabled !== "false";
  return {
    adminCommissionType: type,
    adminCommissionFixedRule: fixedRule,
    adminCommissionValue: value,
    adminCommission: type === COMMISSION_TYPE.PERCENTAGE ? value : 0,
    applyCommission,
    enabled,
  };
}

export async function upsertCityCommission({ cityKey, cityName = "", payload = {}, adminId = null }) {
  const normalizedCityKey = normalizeCityKey(cityKey);
  const normalized = normalizeCommissionPayload(payload);
  const before = await CityCommission.findOne({ cityKey: normalizedCityKey }).lean();
  const updated = await CityCommission.findOneAndUpdate(
    { cityKey: normalizedCityKey },
    {
      $set: {
        cityKey: normalizedCityKey,
        cityName: String(cityName || "").trim(),
        ...normalized,
        updatedBy: adminId || null,
      },
    },
    { upsert: true, new: true },
  );

  void recordAuditLog({
    actorId: adminId,
    action: before ? "CITY_COMMISSION_UPDATED" : "CITY_COMMISSION_CREATED",
    targetType: "CityCommission",
    targetId: updated._id,
    before,
    after: normalized,
  });

  return updated;
}

export async function getCityCommissionByKey(cityKey) {
  return CityCommission.findOne({ cityKey: normalizeCityKey(cityKey) }).lean();
}
