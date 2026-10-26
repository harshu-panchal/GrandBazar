import Store from "../../models/store.js";
import handleResponse from "../../utils/helper.js";
import {
  BUSINESS_MODEL,
  COMMISSION_SCOPE,
  formatBusinessModelPayload,
  resolveStoreIdFromSellerOrStoreId,
} from "../../services/sellerBusinessModelService.js";
import { getActiveSubscriptionForStore } from "../../services/subscriptionService.js";

// Business model lives on the STORE now. :id in these admin routes may still
// be a sellerId from an older link — resolveStoreIdFromSellerOrStoreId
// accepts either and resolves to a concrete storeId.
async function resolveStoreFromParam(id) {
  const storeId = await resolveStoreIdFromSellerOrStoreId(id);
  return storeId ? Store.findById(storeId) : null;
}

function normalizeCommissionConfig(input = {}) {
  const scope = input.scope === COMMISSION_SCOPE.SELLER
    ? COMMISSION_SCOPE.SELLER
    : COMMISSION_SCOPE.CATEGORY;
  const type = input.type === "fixed" ? "fixed" : "percentage";
  const fixedRule = input.fixedRule === "per_item" ? "per_item" : "per_qty";
  const value = Math.max(Number(input.value ?? 0), 0);
  const categoryOverrides = Array.isArray(input.categoryOverrides)
    ? input.categoryOverrides
        .filter((entry) => entry?.categoryId)
        .map((entry) => ({
          categoryId: entry.categoryId,
          type: entry.type === "fixed" ? "fixed" : "percentage",
          value: Math.max(Number(entry.value ?? 0), 0),
          fixedRule: entry.fixedRule === "per_item" ? "per_item" : "per_qty",
        }))
    : [];

  return {
    scope,
    type,
    value,
    fixedRule,
    categoryOverrides,
  };
}

export async function getAdminSellerBusinessModel(req, res) {
  try {
    const store = await resolveStoreFromParam(req.params.id);
    if (!store) {
      return handleResponse(res, 404, "Shop not found");
    }

    return handleResponse(res, 200, "Shop business model fetched", {
      storeId: store._id,
      shopName: store.shopName,
      ownerId: store.ownerId,
      ...formatBusinessModelPayload(store),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function updateAdminSellerBusinessModel(req, res) {
  try {
    const store = await resolveStoreFromParam(req.params.id);
    if (!store) {
      return handleResponse(res, 404, "Shop not found");
    }

    const { businessModel } = req.body || {};
    if (
      businessModel !== BUSINESS_MODEL.COMMISSION
      && businessModel !== BUSINESS_MODEL.SUBSCRIPTION
      && businessModel !== null
    ) {
      return handleResponse(res, 400, "Invalid business model");
    }

    if (businessModel) {
      store.businessModel = businessModel;
      store.businessModelChosenAt = store.businessModelChosenAt || new Date();
    }

    await store.save();

    return handleResponse(res, 200, "Shop business model updated", {
      storeId: store._id,
      ...formatBusinessModelPayload(store),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function updateAdminSellerCommission(req, res) {
  try {
    const store = await resolveStoreFromParam(req.params.id);
    if (!store) {
      return handleResponse(res, 404, "Shop not found");
    }

    store.commissionConfig = normalizeCommissionConfig(req.body || {});
    if (!store.businessModel) {
      store.businessModel = BUSINESS_MODEL.COMMISSION;
      store.businessModelChosenAt = new Date();
    }

    await store.save();

    return handleResponse(res, 200, "Shop commission settings updated", {
      storeId: store._id,
      ...formatBusinessModelPayload(store),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function listModelSwitchRequests(req, res) {
  try {
    const status = req.query.status || "pending";
    const filter = { "businessModelSwitch.status": status };
    const stores = await Store.find(filter)
      .select("shopName ownerId businessModel businessModelSwitch createdAt")
      .sort({ "businessModelSwitch.requestedAt": -1 })
      .limit(200)
      .lean();
    return handleResponse(res, 200, "Model switch requests fetched", stores);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function approveModelSwitchRequest(req, res) {
  try {
    const store = await resolveStoreFromParam(req.params.id);
    if (!store) {
      return handleResponse(res, 404, "Shop not found");
    }
    if (store.businessModelSwitch?.status !== "pending") {
      return handleResponse(res, 400, "No pending model switch request");
    }

    const requested = store.businessModelSwitch.requestedModel;
    if (requested === BUSINESS_MODEL.SUBSCRIPTION) {
      store.businessModel = BUSINESS_MODEL.SUBSCRIPTION;
      store.businessModelChosenAt = store.businessModelChosenAt || new Date();
    } else if (requested === BUSINESS_MODEL.COMMISSION) {
      const active = await getActiveSubscriptionForStore(store._id);
      if (active) {
        return handleResponse(res, 400, "Cannot switch to commission while this shop's subscription is active");
      }
      store.businessModel = BUSINESS_MODEL.COMMISSION;
      if (!store.commissionConfig?.scope) {
        store.commissionConfig = {
          scope: COMMISSION_SCOPE.CATEGORY,
          type: "percentage",
          value: 0,
          fixedRule: "per_qty",
          categoryOverrides: [],
        };
      }
    }

    store.businessModelSwitch = {
      requestedModel: requested,
      requestedAt: store.businessModelSwitch.requestedAt,
      effectiveAt: new Date(),
      status: "approved",
      rejectionReason: "",
    };
    await store.save();

    return handleResponse(res, 200, "Model switch approved", formatBusinessModelPayload(store));
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function rejectModelSwitchRequest(req, res) {
  try {
    const store = await resolveStoreFromParam(req.params.id);
    if (!store) {
      return handleResponse(res, 404, "Shop not found");
    }
    if (store.businessModelSwitch?.status !== "pending") {
      return handleResponse(res, 400, "No pending model switch request");
    }

    store.businessModelSwitch = {
      ...(store.businessModelSwitch?.toObject?.() || store.businessModelSwitch || {}),
      status: "rejected",
      effectiveAt: new Date(),
      rejectionReason: String(req.body?.rejectionReason || "").trim(),
    };
    await store.save();

    return handleResponse(res, 200, "Model switch rejected", formatBusinessModelPayload(store));
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}
