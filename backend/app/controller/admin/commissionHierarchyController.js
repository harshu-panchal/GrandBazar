import mongoose from "mongoose";
import Store from "../../models/store.js";
import CityCommission from "../../models/cityCommission.js";
import handleResponse from "../../utils/helper.js";
import {
  normalizeCityKey,
  normalizeCommissionPayload,
  upsertCityCommission,
} from "../../services/cityCommissionService.js";
import { recordAuditLog } from "../../services/auditTrailService.js";
import {
  enqueueRecalcBySeller,
  enqueueRecalcByCity,
} from "../../queues/pricingQueueProcessors.js";

function toStoreCommissionPayload(store) {
  return {
    storeId: store._id,
    shopName: store.shopName || "",
    city: store.city || "",
    applyCommission: store.applyCommission === true,
    adminCommissionType: store.adminCommissionType || "percentage",
    adminCommissionValue: Number(store.adminCommissionValue ?? store.adminCommission ?? 0),
    adminCommissionFixedRule: store.adminCommissionFixedRule || "per_qty",
  };
}

export async function getStoreCommission(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(id || ""))) {
      return handleResponse(res, 400, "Invalid store id");
    }
    const store = await Store.findById(id)
      .select("shopName city applyCommission adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule")
      .lean();
    if (!store) return handleResponse(res, 404, "Store not found");
    return handleResponse(res, 200, "Store commission fetched", toStoreCommissionPayload(store));
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
}

export async function updateStoreCommission(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(id || ""))) {
      return handleResponse(res, 400, "Invalid store id");
    }
    const normalized = normalizeCommissionPayload(req.body || {});
    const before = await Store.findById(id)
      .select("applyCommission adminCommissionType adminCommissionValue adminCommission adminCommissionFixedRule")
      .lean();
    if (!before) return handleResponse(res, 404, "Store not found");
    const updated = await Store.findByIdAndUpdate(
      id,
      {
        $set: {
          applyCommission: normalized.applyCommission,
          adminCommissionType: normalized.adminCommissionType,
          adminCommissionValue: normalized.adminCommissionValue,
          adminCommission: normalized.adminCommission,
          adminCommissionFixedRule: normalized.adminCommissionFixedRule,
        },
      },
      { new: true },
    )
      .select("shopName city applyCommission adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule");
    if (!updated) return handleResponse(res, 404, "Store not found");
    void recordAuditLog({
      actorId: req.user?.id || null,
      action: "STORE_COMMISSION_UPDATED",
      targetType: "Store",
      targetId: id,
      before,
      after: normalized,
    });
    enqueueRecalcBySeller(id);
    return handleResponse(res, 200, "Store commission updated", toStoreCommissionPayload(updated));
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
}

export async function listCityCommissions(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    const query = q
      ? {
          $or: [
            { cityKey: { $regex: q, $options: "i" } },
            { cityName: { $regex: q, $options: "i" } },
          ],
        }
      : {};
    const items = await CityCommission.find(query)
      .sort({ cityKey: 1 })
      .limit(500)
      .lean();
    return handleResponse(res, 200, "City commissions fetched", items);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
}

/**
 * Cities that shops actually have, with how many shops each covers, plus
 * whether a commission rate is already configured for it. Feeds the city
 * dropdown on the admin City Commissions page so a rate can only be created
 * for a key that real shops will match (shop.city is matched by cityKey).
 */
export async function listCityCommissionOptions(req, res) {
  try {
    const [grouped, shopsWithoutCity, rates] = await Promise.all([
      Store.aggregate([
        { $match: { city: { $type: "string", $ne: "" } } },
        { $group: { _id: "$city", count: { $sum: 1 } } },
      ]),
      Store.countDocuments({
        $or: [{ city: null }, { city: "" }, { city: { $exists: false } }],
      }),
      CityCommission.find({}).select("cityKey").lean(),
    ]);

    // "Indore", "indore" and " Indore " all normalise to one key: merge them and
    // label the city with its most common spelling.
    const byKey = new Map();
    for (const row of grouped) {
      const raw = String(row._id || "").trim();
      const cityKey = normalizeCityKey(raw);
      if (!cityKey) continue;
      const entry = byKey.get(cityKey) || { cityKey, shopCount: 0, spellings: new Map() };
      entry.shopCount += row.count;
      entry.spellings.set(raw, (entry.spellings.get(raw) || 0) + row.count);
      byKey.set(cityKey, entry);
    }

    const configured = new Set(rates.map((rate) => rate.cityKey));
    const cities = [...byKey.values()]
      .map((entry) => ({
        cityKey: entry.cityKey,
        cityName: [...entry.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0],
        shopCount: entry.shopCount,
        hasRate: configured.has(entry.cityKey),
      }))
      .sort((a, b) => a.cityName.localeCompare(b.cityName));

    return handleResponse(res, 200, "City options fetched", { cities, shopsWithoutCity });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
}

export async function deleteCityCommission(req, res) {
  try {
    const cityKey = normalizeCityKey(req.params.cityKey || "");
    if (!cityKey) return handleResponse(res, 400, "cityKey is required");
    const before = await CityCommission.findOne({ cityKey }).lean();
    if (!before) return handleResponse(res, 404, "City commission not found");
    await CityCommission.deleteOne({ cityKey });
    void recordAuditLog({
      actorId: req.user?.id || null,
      action: "CITY_COMMISSION_DELETED",
      targetType: "CityCommission",
      targetId: before._id,
      before,
      after: null,
    });
    // Shops in this city fall back to shop / category / header rates.
    enqueueRecalcByCity(cityKey);
    return handleResponse(res, 200, "City commission deleted", { cityKey });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
}

export async function getCityCommission(req, res) {
  try {
    const cityKey = normalizeCityKey(req.params.cityKey || "");
    if (!cityKey) return handleResponse(res, 400, "cityKey is required");
    const item = await CityCommission.findOne({ cityKey }).lean();
    if (!item) return handleResponse(res, 404, "City commission not found");
    return handleResponse(res, 200, "City commission fetched", item);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
}

export async function upsertCityCommissionController(req, res) {
  try {
    const cityKey = normalizeCityKey(req.params.cityKey || "");
    if (!cityKey) return handleResponse(res, 400, "cityKey is required");
    const item = await upsertCityCommission({
      cityKey,
      cityName: req.body?.cityName || cityKey,
      payload: req.body || {},
      adminId: req.user?.id || null,
    });
    enqueueRecalcByCity(cityKey);
    return handleResponse(res, 200, "City commission upserted", item);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
}
