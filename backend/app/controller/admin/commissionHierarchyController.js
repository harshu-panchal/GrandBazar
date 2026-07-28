import mongoose from "mongoose";
import Store from "../../models/store.js";
import CityCommission from "../../models/cityCommission.js";
import handleResponse from "../../utils/helper.js";
import {
  normalizeCityKey,
  normalizeCommissionPayload,
  upsertCityCommission,
} from "../../services/cityCommissionService.js";

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
    return handleResponse(res, 200, "City commission upserted", item);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
}
