import mongoose from "mongoose";
import Seller from "../models/seller.js";
import Store from "../models/store.js";
import Category from "../models/category.js";
import {
  COMMISSION_FIXED_RULE,
  COMMISSION_TYPE,
} from "../constants/finance.js";
import { calculateCategoryCommission } from "./finance/pricingService.js";

// ---------------------------------------------------------------------------
// Business model (commission vs subscription) lives on the STORE, not the
// seller's owner account — a seller with several shops can run each
// independently (shop A on commission, shop B on its own subscription plan).
// Formerly account-level (Seller.businessModel) — see models/seller.js and
// models/store.js for the deprecation note and field shapes.
// ---------------------------------------------------------------------------

/**
 * Admin screens historically addressed a shop by either its STORE id or the
 * owner's SELLER id. Business model now lives on the Store, so this resolves
 * either to the relevant Store id:
 *  - a Store id is returned as-is;
 *  - a Seller (owner) id is a legacy shape — returns that owner's single
 *    store if they have exactly one, otherwise null (ambiguous: admin UI
 *    should pass a storeId directly once on the new per-store screens).
 */
export async function resolveStoreIdFromSellerOrStoreId(id) {
  const raw = String(id || "").trim();
  if (!mongoose.Types.ObjectId.isValid(raw)) return null;

  const store = await Store.findById(raw).select("_id").lean();
  if (store) return store._id;

  const seller = await Seller.findById(raw).select("_id accountType").lean();
  if (!seller) return null;
  const stores = await Store.find({ ownerId: seller._id }).select("_id").limit(2).lean();
  return stores.length === 1 ? stores[0]._id : null;
}

export const BUSINESS_MODEL = {
  COMMISSION: "commission",
  SUBSCRIPTION: "subscription",
};

export const COMMISSION_SCOPE = {
  CATEGORY: "category",
  SELLER: "seller",
};

const ZERO_COMMISSION_CONFIG = {
  adminCommissionType: COMMISSION_TYPE.PERCENTAGE,
  adminCommissionValue: 0,
  adminCommissionFixedRule: COMMISSION_FIXED_RULE.PER_QTY,
};

function toCommissionConfigShape({ type, value, fixedRule }) {
  return {
    adminCommissionType: type || COMMISSION_TYPE.PERCENTAGE,
    adminCommissionValue: Number(value ?? 0),
    adminCommissionFixedRule: fixedRule || COMMISSION_FIXED_RULE.PER_QTY,
  };
}

/** `store` is a Store doc/lean-object carrying businessModel (own or synced). */
export function isBusinessModelChosen(store) {
  return store?.businessModel === BUSINESS_MODEL.COMMISSION
    || store?.businessModel === BUSINESS_MODEL.SUBSCRIPTION;
}

export function isStoreOperationalForCustomers(store) {
  if (!store) return false;
  if (store.businessModel === BUSINESS_MODEL.COMMISSION) return true;
  return false;
}

export async function isStoreOperationalForCustomersAsync(storeId) {
  const { isStoreSubscriptionOperational } = await import("./subscriptionService.js");
  return isStoreSubscriptionOperational(storeId);
}

export function resolveStoreCommissionConfig(store, categoryId, category = null) {
  if (!store || store.businessModel === BUSINESS_MODEL.SUBSCRIPTION) {
    return {
      config: ZERO_COMMISSION_CONFIG,
      source: store?.businessModel === BUSINESS_MODEL.SUBSCRIPTION
        ? "subscription"
        : "none",
    };
  }

  if (store.businessModel !== BUSINESS_MODEL.COMMISSION) {
    return { config: null, source: "none" };
  }

  const commissionConfig = store.commissionConfig || {};
  if (commissionConfig.scope === COMMISSION_SCOPE.SELLER) {
    const overrides = Array.isArray(commissionConfig.categoryOverrides)
      ? commissionConfig.categoryOverrides
      : [];
    const override = overrides.find(
      (entry) => String(entry?.categoryId || "") === String(categoryId || ""),
    );
    if (override) {
      return {
        config: toCommissionConfigShape(override),
        source: "seller",
      };
    }
    return {
      config: toCommissionConfigShape(commissionConfig),
      source: "seller",
    };
  }

  return {
    config: category,
    source: "category",
  };
}

/**
 * Resolves the business model that applies to a store. Returns `{ store,
 * owner }` where `owner` is the SAME object pricingService.js/
 * orderActivationService.js already expect (businessModel, commissionConfig,
 * businessModelChosenAt, businessModelSwitch, _id) — just sourced from the
 * Store now instead of the Seller account, so those call sites barely change.
 * `owner._id` is the STORE id going forward (it's what callers pass on to
 * subscriptionService's per-store functions).
 */
export async function loadStoreOwnerBusinessModel(storeId, { session = null } = {}) {
  if (!mongoose.Types.ObjectId.isValid(String(storeId || ""))) {
    return { store: null, owner: null };
  }

  const storeQuery = Store.findById(storeId)
    .select("ownerId businessModel businessModelChosenAt commissionConfig businessModelSwitch");
  if (session) storeQuery.session(session);
  const store = await storeQuery.lean();
  if (!store) {
    return { store: null, owner: null };
  }

  const owner = {
    _id: store._id,
    ownerId: store.ownerId,
    businessModel: store.businessModel,
    businessModelChosenAt: store.businessModelChosenAt,
    commissionConfig: store.commissionConfig,
    businessModelSwitch: store.businessModelSwitch,
  };
  return { store, owner };
}

export async function getStoreIdsWithOperationalBusinessModel(storeIds = []) {
  const { getSubscriptionOperationalStoreIds } = await import("./subscriptionService.js");
  return getSubscriptionOperationalStoreIds(storeIds);
}

export async function filterStoreIdsByOwnerBusinessModel(storeIds = []) {
  return getStoreIdsWithOperationalBusinessModel(storeIds).then((set) =>
    storeIds.map((id) => String(id)).filter((id) => set.has(id)),
  );
}

export async function previewCommissionForStore({
  store,
  price,
  quantity = 1,
  categoryId,
}) {
  let category = null;
  if (categoryId) {
    category = await Category.findById(categoryId)
      .select(
        "_id name adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule",
      )
      .lean();
  }

  const { config, source } = resolveStoreCommissionConfig(
    store,
    categoryId,
    category,
  );

  if (!config) {
    const err = new Error("Business model must be chosen before pricing products");
    err.statusCode = 403;
    throw err;
  }

  const commission = calculateCategoryCommission(
    { price: Number(price || 0), quantity: Number(quantity || 1) },
    config,
  );

  return {
    customerPrice: commission.itemSubtotal,
    platformCommission: commission.adminCommission,
    sellerReceives: commission.sellerPayout,
    appliedCommissionType: commission.appliedCommissionType,
    appliedCommissionValue: commission.appliedCommissionValue,
    appliedCommissionFixedRule: commission.appliedFixedRule,
    commissionSource: source,
    businessModel: store?.businessModel || null,
    categoryName: category?.name || null,
  };
}

export function formatBusinessModelPayload(store) {
  if (!store) return null;
  const switchState = store.businessModelSwitch || {};
  return {
    storeId: store._id,
    businessModel: store.businessModel || null,
    businessModelChosenAt: store.businessModelChosenAt || null,
    businessModelSwitch: {
      requestedModel: switchState.requestedModel ?? null,
      requestedAt: switchState.requestedAt || null,
      effectiveAt: switchState.effectiveAt || null,
      status: switchState.status || "none",
      rejectionReason: switchState.rejectionReason || "",
    },
    commissionConfig: store.commissionConfig || {
      scope: COMMISSION_SCOPE.CATEGORY,
      type: COMMISSION_TYPE.PERCENTAGE,
      value: 0,
      fixedRule: COMMISSION_FIXED_RULE.PER_QTY,
      categoryOverrides: [],
    },
  };
}

function formatCommissionRateLabel({
  type,
  value,
  fixedRule,
  adminCommissionType,
  adminCommissionValue,
  adminCommissionFixedRule,
}) {
  const rateType = type || adminCommissionType || COMMISSION_TYPE.PERCENTAGE;
  const rateValue = Number(value ?? adminCommissionValue ?? 0);
  if (rateType === COMMISSION_TYPE.PERCENTAGE) {
    return `${rateValue}%`;
  }
  const rule = fixedRule || adminCommissionFixedRule || COMMISSION_FIXED_RULE.PER_QTY;
  return rule === COMMISSION_FIXED_RULE.PER_ITEM
    ? `₹${rateValue} per item`
    : `₹${rateValue} per qty`;
}

export async function buildStoreCommissionSummary(store) {
  if (!store || store.businessModel !== BUSINESS_MODEL.COMMISSION) {
    return null;
  }

  const config = store.commissionConfig || {};
  const scope = config.scope || COMMISSION_SCOPE.CATEGORY;

  if (scope === COMMISSION_SCOPE.SELLER) {
    const overrides = Array.isArray(config.categoryOverrides)
      ? config.categoryOverrides
      : [];
    let categoryRates = [];

    if (overrides.length) {
      const ids = overrides.map((entry) => entry.categoryId).filter(Boolean);
      const categories = ids.length
        ? await Category.find({ _id: { $in: ids } }).select("name").lean()
        : [];
      const nameById = new Map(categories.map((cat) => [String(cat._id), cat.name]));

      categoryRates = overrides.map((entry) => ({
        categoryId: entry.categoryId,
        categoryName: nameById.get(String(entry.categoryId)) || "Category",
        type: entry.type || COMMISSION_TYPE.PERCENTAGE,
        value: Number(entry.value ?? 0),
        label: formatCommissionRateLabel(entry),
      }));
    }

    return {
      scope: COMMISSION_SCOPE.SELLER,
      type: config.type || COMMISSION_TYPE.PERCENTAGE,
      value: Number(config.value ?? 0),
      fixedRule: config.fixedRule || COMMISSION_FIXED_RULE.PER_QTY,
      label: formatCommissionRateLabel(config),
      categoryOverrides: categoryRates,
      description: categoryRates.length
        ? "Seller-wise commission with category-specific overrides below."
        : "This rate applies to all your products.",
    };
  }

  const categories = await Category.find({
    type: "header",
    status: "active",
  })
    .select("name adminCommissionType adminCommissionValue adminCommission adminCommissionFixedRule")
    .sort({ name: 1 })
    .lean();

  return {
    scope: COMMISSION_SCOPE.CATEGORY,
    description: "Commission is deducted per category when you set customer prices.",
    categoryRates: categories.map((cat) => ({
      categoryId: cat._id,
      categoryName: cat.name,
      type: cat.adminCommissionType || COMMISSION_TYPE.PERCENTAGE,
      value: Number(cat.adminCommissionValue ?? cat.adminCommission ?? 0),
      fixedRule: cat.adminCommissionFixedRule || COMMISSION_FIXED_RULE.PER_QTY,
      label: formatCommissionRateLabel(cat),
    })),
  };
}
