import mongoose from "mongoose";
import Seller from "../models/seller.js";
import Store from "../models/store.js";
import Category from "../models/category.js";
import {
  COMMISSION_FIXED_RULE,
  COMMISSION_TYPE,
} from "../constants/finance.js";
import { calculateCategoryCommission } from "./finance/pricingService.js";

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

export function isBusinessModelChosen(seller) {
  return seller?.businessModel === BUSINESS_MODEL.COMMISSION
    || seller?.businessModel === BUSINESS_MODEL.SUBSCRIPTION;
}

export function isSellerOperationalForCustomers(seller) {
  if (!seller) return false;
  if (seller.businessModel === BUSINESS_MODEL.COMMISSION) return true;
  return false;
}

export async function isSellerOperationalForCustomersAsync(sellerId) {
  const { isSellerSubscriptionOperational } = await import("./subscriptionService.js");
  return isSellerSubscriptionOperational(sellerId);
}

export function resolveSellerCommissionConfig(seller, categoryId, category = null) {
  if (!seller || seller.businessModel === BUSINESS_MODEL.SUBSCRIPTION) {
    return {
      config: ZERO_COMMISSION_CONFIG,
      source: seller?.businessModel === BUSINESS_MODEL.SUBSCRIPTION
        ? "subscription"
        : "none",
    };
  }

  if (seller.businessModel !== BUSINESS_MODEL.COMMISSION) {
    return { config: null, source: "none" };
  }

  const commissionConfig = seller.commissionConfig || {};
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

export async function loadStoreOwnerBusinessModel(storeId, { session = null } = {}) {
  if (!mongoose.Types.ObjectId.isValid(String(storeId || ""))) {
    return { store: null, owner: null };
  }

  const storeQuery = Store.findById(storeId).select("ownerId").lean();
  if (session) storeQuery.session(session);
  const store = await storeQuery;
  if (!store?.ownerId) {
    return { store: null, owner: null };
  }

  const ownerQuery = Seller.findById(store.ownerId)
    .select("businessModel businessModelChosenAt commissionConfig businessModelSwitch accountType")
    .lean();
  if (session) ownerQuery.session(session);
  const owner = await ownerQuery;
  return { store, owner };
}

export async function getOwnerIdsWithOperationalBusinessModel(ownerIds = []) {
  const { getSubscriptionOperationalOwnerIds } = await import("./subscriptionService.js");
  return getSubscriptionOperationalOwnerIds(ownerIds);
}

export async function filterStoreIdsByOwnerBusinessModel(storeIds = []) {
  const normalized = Array.from(
    new Set(storeIds.map((id) => String(id || "")).filter(Boolean)),
  );
  if (!normalized.length) return [];

  const stores = await Store.find({ _id: { $in: normalized } })
    .select("_id ownerId")
    .lean();
  if (!stores.length) return [];

  const operationalOwnerIds = await getOwnerIdsWithOperationalBusinessModel(
    stores.map((store) => store.ownerId),
  );

  return stores
    .filter((store) => operationalOwnerIds.has(String(store.ownerId)))
    .map((store) => String(store._id));
}

export async function previewCommissionForSeller({
  seller,
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

  const { config, source } = resolveSellerCommissionConfig(
    seller,
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
    businessModel: seller?.businessModel || null,
    categoryName: category?.name || null,
  };
}

export function formatBusinessModelPayload(seller) {
  if (!seller) return null;
  const switchState = seller.businessModelSwitch || {};
  return {
    businessModel: seller.businessModel || null,
    businessModelChosenAt: seller.businessModelChosenAt || null,
    businessModelSwitch: {
      requestedModel: switchState.requestedModel ?? null,
      requestedAt: switchState.requestedAt || null,
      effectiveAt: switchState.effectiveAt || null,
      status: switchState.status || "none",
      rejectionReason: switchState.rejectionReason || "",
    },
    commissionConfig: seller.commissionConfig || {
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

export async function buildSellerCommissionSummary(seller) {
  if (!seller || seller.businessModel !== BUSINESS_MODEL.COMMISSION) {
    return null;
  }

  const config = seller.commissionConfig || {};
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
