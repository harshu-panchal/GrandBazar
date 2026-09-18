import Seller from "../../models/seller.js";
import Store from "../../models/store.js";
import handleResponse from "../../utils/helper.js";
import {
  BUSINESS_MODEL,
  COMMISSION_SCOPE,
  formatBusinessModelPayload,
} from "../../services/sellerBusinessModelService.js";
import { getActiveSubscriptionForSeller } from "../../services/subscriptionService.js";

async function resolveOwnerFromParam(id) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) return null;

  const seller = await Seller.findById(normalizedId)
    .select("_id accountType")
    .lean();
  if (seller?.accountType === "owner" || !seller?.accountType) {
    return Seller.findById(normalizedId);
  }

  const store = await Store.findById(normalizedId).select("ownerId").lean();
  if (!store?.ownerId) return null;
  return Seller.findById(store.ownerId);
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
    const seller = await resolveOwnerFromParam(req.params.id);
    if (!seller) {
      return handleResponse(res, 404, "Seller owner not found");
    }

    return handleResponse(res, 200, "Seller business model fetched", {
      ownerId: seller._id,
      ...formatBusinessModelPayload(seller),
      name: seller.name,
      email: seller.email,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function updateAdminSellerBusinessModel(req, res) {
  try {
    const seller = await resolveOwnerFromParam(req.params.id);
    if (!seller) {
      return handleResponse(res, 404, "Seller owner not found");
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
      seller.businessModel = businessModel;
      seller.businessModelChosenAt = seller.businessModelChosenAt || new Date();
    }

    await seller.save();

    return handleResponse(res, 200, "Seller business model updated", {
      ownerId: seller._id,
      ...formatBusinessModelPayload(seller),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function updateAdminSellerCommission(req, res) {
  try {
    const seller = await resolveOwnerFromParam(req.params.id);
    if (!seller) {
      return handleResponse(res, 404, "Seller owner not found");
    }

    seller.commissionConfig = normalizeCommissionConfig(req.body || {});
    if (!seller.businessModel) {
      seller.businessModel = BUSINESS_MODEL.COMMISSION;
      seller.businessModelChosenAt = new Date();
    }

    await seller.save();

    return handleResponse(res, 200, "Seller commission settings updated", {
      ownerId: seller._id,
      ...formatBusinessModelPayload(seller),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function listModelSwitchRequests(req, res) {
  try {
    const status = req.query.status || "pending";
    const filter = { "businessModelSwitch.status": status };
    const sellers = await Seller.find(filter)
      .select("name email phone businessModel businessModelSwitch createdAt")
      .sort({ "businessModelSwitch.requestedAt": -1 })
      .limit(200)
      .lean();
    return handleResponse(res, 200, "Model switch requests fetched", sellers);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function approveModelSwitchRequest(req, res) {
  try {
    const seller = await resolveOwnerFromParam(req.params.id);
    if (!seller) {
      return handleResponse(res, 404, "Seller owner not found");
    }
    if (seller.businessModelSwitch?.status !== "pending") {
      return handleResponse(res, 400, "No pending model switch request");
    }

    const requested = seller.businessModelSwitch.requestedModel;
    if (requested === BUSINESS_MODEL.SUBSCRIPTION) {
      seller.businessModel = BUSINESS_MODEL.SUBSCRIPTION;
      seller.businessModelChosenAt = seller.businessModelChosenAt || new Date();
    } else if (requested === BUSINESS_MODEL.COMMISSION) {
      const active = await getActiveSubscriptionForSeller(seller._id);
      if (active) {
        return handleResponse(res, 400, "Cannot switch to commission while subscription is active");
      }
      seller.businessModel = BUSINESS_MODEL.COMMISSION;
      if (!seller.commissionConfig?.scope) {
        seller.commissionConfig = {
          scope: COMMISSION_SCOPE.CATEGORY,
          type: "percentage",
          value: 0,
          fixedRule: "per_qty",
          categoryOverrides: [],
        };
      }
    }

    seller.businessModelSwitch = {
      requestedModel: requested,
      requestedAt: seller.businessModelSwitch.requestedAt,
      effectiveAt: new Date(),
      status: "approved",
      rejectionReason: "",
    };
    await seller.save();

    return handleResponse(res, 200, "Model switch approved", formatBusinessModelPayload(seller));
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function rejectModelSwitchRequest(req, res) {
  try {
    const seller = await resolveOwnerFromParam(req.params.id);
    if (!seller) {
      return handleResponse(res, 404, "Seller owner not found");
    }
    if (seller.businessModelSwitch?.status !== "pending") {
      return handleResponse(res, 400, "No pending model switch request");
    }

    seller.businessModelSwitch = {
      ...(seller.businessModelSwitch?.toObject?.() || seller.businessModelSwitch || {}),
      status: "rejected",
      effectiveAt: new Date(),
      rejectionReason: String(req.body?.rejectionReason || "").trim(),
    };
    await seller.save();

    return handleResponse(res, 200, "Model switch rejected", formatBusinessModelPayload(seller));
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}
