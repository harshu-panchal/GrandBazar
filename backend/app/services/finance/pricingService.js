import Product from "../../models/product.js";
import Category from "../../models/category.js";
import Store from "../../models/store.js";
import CityCommission from "../../models/cityCommission.js";
import {
  PRODUCT_APPROVAL_STATUS,
  resolveProductApprovalStatus,
} from "../productModerationService.js";
import {
  loadStoreOwnerBusinessModel,
} from "../sellerBusinessModelService.js";
import { normalizeCityKey } from "../cityCommissionService.js";
import {
  COMMISSION_FIXED_RULE,
  COMMISSION_TYPE,
  DELIVERY_PRICING_MODE,
  HANDLING_FEE_STRATEGY,
  HANDLING_FEE_TYPE,
  TAX_JURISDICTION,
} from "../../constants/finance.js";
import {
  addMoney,
  ceilKm,
  clampMoney,
  percentOf,
  roundCurrency,
} from "../../utils/money.js";
import { getOrCreateFinanceSettings } from "./financeSettingsService.js";
const ENABLE_HIERARCHICAL_COMMISSION =
  process.env.ENABLE_HIERARCHICAL_COMMISSION !== "false";

function toObjectIdString(value) {
  if (!value) return "";
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

function normalizeLineQuantity(quantity) {
  const q = Number(quantity || 0);
  if (!Number.isFinite(q) || q <= 0) return 1;
  return Math.floor(q);
}

function normalizeLinePrice(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? clampMoney(amount, 0) : 0;
}

function resolveCommissionConfig(category) {
  if (!category) {
    return {
      type: COMMISSION_TYPE.PERCENTAGE,
      value: 0,
      fixedRule: COMMISSION_FIXED_RULE.PER_QTY,
    };
  }

  const type = category.adminCommissionType || COMMISSION_TYPE.PERCENTAGE;

  // Backward-compat: admin UI still writes legacy `adminCommission` while newer
  // pricing reads `adminCommissionValue`. Because `adminCommissionValue` has a
  // schema default of 0 and updates can bypass save hooks, we treat a zero
  // `adminCommissionValue` as "unset" when legacy is non-zero.
  const legacyAdminCommission = Number(category.adminCommission ?? 0);
  const primaryAdminCommission = Number(category.adminCommissionValue);
  const resolvedRaw =
    category.adminCommissionValue == null ||
    (!Number.isFinite(primaryAdminCommission) ||
      (primaryAdminCommission === 0 && legacyAdminCommission > 0))
      ? legacyAdminCommission
      : primaryAdminCommission;
  const value = Number(resolvedRaw ?? 0);
  const fixedRule =
    category.adminCommissionFixedRule || COMMISSION_FIXED_RULE.PER_QTY;

  return {
    type,
    value: Number.isFinite(value) ? Math.max(value, 0) : 0,
    fixedRule,
  };
}

function normalizeCommissionEntity(entity = null) {
  if (!entity) return null;
  return {
    _id: entity._id || null,
    name: entity.name || entity.shopName || entity.cityName || "",
    applyCommission: entity.applyCommission === true,
    enabled: entity.enabled !== false,
    adminCommissionType: entity.adminCommissionType || COMMISSION_TYPE.PERCENTAGE,
    adminCommissionValue: Number(entity.adminCommissionValue ?? entity.adminCommission ?? 0),
    adminCommission: Number(entity.adminCommission ?? entity.adminCommissionValue ?? 0),
    adminCommissionFixedRule: entity.adminCommissionFixedRule || COMMISSION_FIXED_RULE.PER_QTY,
    cityKey: entity.cityKey || null,
  };
}

/**
 * Whether this category level should supply commission.
 * Prefer explicit `applyCommission`; legacy docs without the flag count as
 * applied when their commission value is > 0.
 */
export function categoryAppliesCommission(category) {
  if (!category) return false;
  if (category.enabled === false) return false;
  if (category.applyCommission === true || category.applyCommission === "true") {
    return true;
  }
  if (category.applyCommission === false || category.applyCommission === "false") {
    return false;
  }
  return resolveCommissionConfig(category).value > 0;
}

/**
 * Resolve commission from hierarchy: product → subcategory → level2 → header.
 * Last (deepest) level with applyCommission wins (product overrides category levels).
 */
export function resolveCategoryHierarchyCommission({
  productCategory = null,
  headerCategory = null,
  level2Category = null,
  subcategory = null,
} = {}) {
  const chain = [
    { level: "product", category: productCategory },
    { level: "subcategory", category: subcategory },
    { level: "category", category: level2Category },
    { level: "header", category: headerCategory },
  ];

  for (const entry of chain) {
    if (categoryAppliesCommission(entry.category)) {
      return {
        category: entry.category,
        level: entry.level,
        categoryId: entry.category?._id ? String(entry.category._id) : null,
      };
    }
  }

  const fallback =
    productCategory || subcategory || level2Category || headerCategory || null;
  return {
    category: fallback,
    level: null,
    categoryId: fallback?._id ? String(fallback._id) : null,
  };
}

export function resolveEffectiveCommissionForLineItem({
  addonProduct = null,
  productCategory = null,
  subcategory = null,
  shopCommission = null,
  cityCommission = null,
} = {}) {
  const chain = [
    { level: "addon", category: normalizeCommissionEntity(addonProduct) },
    { level: "product", category: normalizeCommissionEntity(productCategory) },
    { level: "subcategory", category: normalizeCommissionEntity(subcategory) },
    { level: "shop", category: normalizeCommissionEntity(shopCommission) },
    { level: "city", category: normalizeCommissionEntity(cityCommission) },
  ];

  const fallbackTrail = [];
  for (const entry of chain) {
    if (!entry.category) {
      fallbackTrail.push({ level: entry.level, reason: "missing" });
      continue;
    }
    if (entry.category.enabled === false) {
      fallbackTrail.push({ level: entry.level, reason: "disabled" });
      continue;
    }
    if (categoryAppliesCommission(entry.category)) {
      const value = Number(entry.category.adminCommissionValue ?? 0);
      if (value > 0) {
        return {
          category: entry.category,
          level: entry.level,
          categoryId: entry.category?._id ? String(entry.category._id) : null,
          cityKey: entry.category?.cityKey || null,
          fallbackTrail,
        };
      }
      fallbackTrail.push({ level: entry.level, reason: "zero_value" });
      continue;
    }
    fallbackTrail.push({ level: entry.level, reason: "apply_false" });
  }

  return {
    category: null,
    level: null,
    categoryId: null,
    cityKey: null,
    fallbackTrail,
  };
}

function resolveHandlingConfig(category) {
  if (!category) {
    return { type: HANDLING_FEE_TYPE.NONE, value: 0 };
  }

  const type =
    category.handlingFeeType ||
    (Number(category.handlingFees || 0) > 0
      ? HANDLING_FEE_TYPE.FIXED
      : HANDLING_FEE_TYPE.NONE);

  // Backward-compat: admin UI writes legacy `handlingFees` while pricing reads
  // `handlingFeeValue`. Since `handlingFeeValue` defaults to 0, treat it as
  // unset when legacy is non-zero.
  const legacyHandlingFees = Number(category.handlingFees ?? 0);
  const primaryHandlingValue = Number(category.handlingFeeValue);
  const resolvedRaw =
    category.handlingFeeValue == null ||
    (!Number.isFinite(primaryHandlingValue) ||
      (primaryHandlingValue === 0 && legacyHandlingFees > 0))
      ? legacyHandlingFees
      : primaryHandlingValue;
  const value = Number(resolvedRaw ?? 0);

  return {
    type,
    value: Number.isFinite(value) ? Math.max(value, 0) : 0,
  };
}

function resolvePackingConfig(category) {
  if (!category) {
    return { type: HANDLING_FEE_TYPE.NONE, value: 0 };
  }

  const type =
    category.packingFeeType ||
    (Number(category.packingFees || 0) > 0
      ? HANDLING_FEE_TYPE.FIXED
      : HANDLING_FEE_TYPE.NONE);

  const legacyPackingFees = Number(category.packingFees ?? 0);
  const primaryPackingValue = Number(category.packingFeeValue);
  const resolvedRaw =
    category.packingFeeValue == null ||
    (!Number.isFinite(primaryPackingValue) ||
      (primaryPackingValue === 0 && legacyPackingFees > 0))
      ? legacyPackingFees
      : primaryPackingValue;
  const value = Number(resolvedRaw ?? 0);

  return {
    type,
    value: Number.isFinite(value) ? Math.max(value, 0) : 0,
  };
}

function categoryAppliesHandling(category) {
  if (!category) return false;
  const cfg = resolveHandlingConfig(category);
  return cfg.type !== HANDLING_FEE_TYPE.NONE && cfg.value > 0;
}

function categoryAppliesPacking(category) {
  if (!category) return false;
  const cfg = resolvePackingConfig(category);
  return cfg.type !== HANDLING_FEE_TYPE.NONE && cfg.value > 0;
}

/**
 * Deepest category with handling fee wins: subcategory → L2 → header.
 */
export function resolveCategoryHierarchyHandling({
  headerCategory = null,
  level2Category = null,
  subcategory = null,
} = {}) {
  const chain = [
    { level: "subcategory", category: subcategory },
    { level: "category", category: level2Category },
    { level: "header", category: headerCategory },
  ];
  for (const entry of chain) {
    if (categoryAppliesHandling(entry.category)) {
      return {
        category: entry.category,
        level: entry.level,
        categoryId: entry.category?._id ? String(entry.category._id) : null,
      };
    }
  }
  return { category: null, level: null, categoryId: null };
}

/**
 * Deepest category with packing fee wins: subcategory → L2 → header.
 */
export function resolveCategoryHierarchyPacking({
  headerCategory = null,
  level2Category = null,
  subcategory = null,
} = {}) {
  const chain = [
    { level: "subcategory", category: subcategory },
    { level: "category", category: level2Category },
    { level: "header", category: headerCategory },
  ];
  for (const entry of chain) {
    if (categoryAppliesPacking(entry.category)) {
      return {
        category: entry.category,
        level: entry.level,
        categoryId: entry.category?._id ? String(entry.category._id) : null,
      };
    }
  }
  return { category: null, level: null, categoryId: null };
}

/**
 * Resolve the GST slab (%) for a line item: product-level override wins,
 * otherwise the most specific category in the hierarchy (subcategory ->
 * category -> header) supplies the rate. Unlike commission/handling there is
 * no "off" state — 0% (exempt) is itself a valid real rate.
 */
export function resolveGstSlabForLineItem({
  productGstSlabOverride = null,
  headerCategory = null,
  level2Category = null,
  subcategory = null,
} = {}) {
  if (productGstSlabOverride !== null && productGstSlabOverride !== undefined) {
    const override = Number(productGstSlabOverride);
    if (Number.isFinite(override)) {
      return { gstSlab: override, source: "product" };
    }
  }
  const chain = [
    { level: "subcategory", category: subcategory },
    { level: "category", category: level2Category },
    { level: "header", category: headerCategory },
  ];
  for (const entry of chain) {
    if (entry.category && entry.category.gstSlab !== undefined && entry.category.gstSlab !== null) {
      return { gstSlab: Number(entry.category.gstSlab) || 0, source: entry.level };
    }
  }
  return { gstSlab: 0, source: "default" };
}

/**
 * CGST+SGST (same state) vs IGST (different states), per Indian GST rules.
 */
export function resolveTaxJurisdiction(sellerState = "", customerState = "") {
  const normalize = (s) => String(s || "").trim().toLowerCase();
  const seller = normalize(sellerState);
  const customer = normalize(customerState);
  if (!seller || !customer) {
    // Can't determine -> default to intra-state (CGST+SGST) so tax is never silently dropped.
    return TAX_JURISDICTION.INTRA_STATE;
  }
  return seller === customer ? TAX_JURISDICTION.INTRA_STATE : TAX_JURISDICTION.INTER_STATE;
}

export function calculateLineItemGst(itemSubtotal, gstSlab, jurisdiction) {
  const totalGst = percentOf(itemSubtotal, gstSlab);
  if (jurisdiction === TAX_JURISDICTION.INTER_STATE) {
    return { cgst: 0, sgst: 0, igst: totalGst, totalGst };
  }
  const half = roundCurrency(totalGst / 2);
  const otherHalf = roundCurrency(totalGst - half);
  return { cgst: half, sgst: otherHalf, igst: 0, totalGst };
}

/**
 * True when `atDate`'s local time-of-day falls inside [windowStart, windowEnd),
 * both "HH:mm" strings. Handles windows that wrap past midnight (e.g. 22:00-06:00).
 */
export function isWithinOddHourWindow(atDate, windowStart = "22:00", windowEnd = "06:00") {
  if (!windowStart || !windowEnd) return false;
  const date = atDate instanceof Date ? atDate : new Date(atDate);
  if (Number.isNaN(date.getTime())) return false;
  const minutesNow = date.getHours() * 60 + date.getMinutes();
  const toMinutes = (hhmm) => {
    const [h, m] = String(hhmm).split(":").map((n) => Number(n) || 0);
    return h * 60 + m;
  };
  const start = toMinutes(windowStart);
  const end = toMinutes(windowEnd);
  if (start === end) return false;
  if (start < end) {
    return minutesNow >= start && minutesNow < end;
  }
  // Wraps past midnight, e.g. 22:00 -> 06:00
  return minutesNow >= start || minutesNow < end;
}

function attachResolvedFeeCategories(cartItems = [], categoryById = new Map()) {
  return cartItems.map((item) => {
    const headerCategory = categoryById.get(String(item.headerCategoryId || "")) || null;
    const level2Category = categoryById.get(String(item.categoryId || "")) || null;
    const subcategory = categoryById.get(String(item.subcategoryId || "")) || null;
    const handling = resolveCategoryHierarchyHandling({
      headerCategory,
      level2Category,
      subcategory,
    });
    const packing = resolveCategoryHierarchyPacking({
      headerCategory,
      level2Category,
      subcategory,
    });
    return {
      ...item,
      resolvedHandlingCategoryId: handling.categoryId,
      resolvedPackingCategoryId: packing.categoryId,
    };
  });
}

export function calculateProductSubtotal(items = []) {
  return roundCurrency(
    items.reduce((sum, item) => {
      const quantity = normalizeLineQuantity(item.quantity);
      const unitPrice = normalizeLinePrice(item.price);
      return sum + unitPrice * quantity;
    }, 0),
  );
}

export function calculateCategoryCommission(item, categoryConfig) {
  const quantity = normalizeLineQuantity(item.quantity);
  const itemSubtotal = roundCurrency(normalizeLinePrice(item.price) * quantity);
  const { type, value, fixedRule } = resolveCommissionConfig(categoryConfig);

  let adminCommission = 0;
  if (type === COMMISSION_TYPE.PERCENTAGE) {
    adminCommission = percentOf(itemSubtotal, value);
  } else {
    const fixedBase =
      fixedRule === COMMISSION_FIXED_RULE.PER_ITEM ? value : value * quantity;
    adminCommission = roundCurrency(fixedBase);
  }

  adminCommission = clampMoney(adminCommission, 0, itemSubtotal);
  const sellerPayout = roundCurrency(itemSubtotal - adminCommission);

  return {
    itemSubtotal,
    adminCommission,
    sellerPayout,
    appliedCommissionType: type,
    appliedCommissionValue: value,
    appliedFixedRule: fixedRule,
  };
}

function calculateHandlingForCategory({ type, value }, categorySubtotal) {
  if (type === HANDLING_FEE_TYPE.NONE) return 0;
  if (type === HANDLING_FEE_TYPE.PERCENTAGE) {
    return percentOf(categorySubtotal, value);
  }
  return roundCurrency(value);
}

export function calculateHandlingFee(cartItems, options = {}) {
  const {
    handlingFeeStrategy = HANDLING_FEE_STRATEGY.HIGHEST_CATEGORY_FEE,
    categoryById = new Map(),
  } = options;

  const enrichedItems = attachResolvedFeeCategories(cartItems, categoryById);

  const categorySubtotalMap = new Map();
  for (const item of enrichedItems) {
    const feeCategoryId = toObjectIdString(item.resolvedHandlingCategoryId);
    if (!feeCategoryId) continue;
    const itemSubtotal = roundCurrency(
      normalizeLinePrice(item.price) * normalizeLineQuantity(item.quantity),
    );
    categorySubtotalMap.set(
      feeCategoryId,
      addMoney(categorySubtotalMap.get(feeCategoryId) || 0, itemSubtotal),
    );
  }

  const categoryFees = [];
  for (const [feeCategoryId, subtotal] of categorySubtotalMap.entries()) {
    const category = categoryById.get(feeCategoryId);
    const handling = resolveHandlingConfig(category);
    const fee = calculateHandlingForCategory(handling, subtotal);
    categoryFees.push({
      headerCategoryId: feeCategoryId || null,
      categoryId: feeCategoryId || null,
      categoryName: category?.name || "Unknown",
      categoryType: category?.type || null,
      subtotal,
      handlingFeeType: handling.type,
      handlingFeeValue: handling.value,
      computedFee: roundCurrency(fee),
    });
  }

  let totalHandlingFee = 0;
  let handlingCategoryUsed = null;

  if (categoryFees.length === 0) {
    totalHandlingFee = 0;
  } else if (handlingFeeStrategy === HANDLING_FEE_STRATEGY.SUM_OF_CATEGORY_FEES) {
    totalHandlingFee = categoryFees.reduce((sum, row) => addMoney(sum, row.computedFee), 0);
  } else if (handlingFeeStrategy === HANDLING_FEE_STRATEGY.PER_ITEM_FEE) {
    totalHandlingFee = enrichedItems.reduce((sum, item) => {
      const feeCategoryId = toObjectIdString(item.resolvedHandlingCategoryId);
      if (!feeCategoryId) return sum;
      const category = categoryById.get(feeCategoryId);
      const handling = resolveHandlingConfig(category);
      const quantity = normalizeLineQuantity(item.quantity);
      const itemSubtotal = roundCurrency(normalizeLinePrice(item.price) * quantity);
      const perLine =
        handling.type === HANDLING_FEE_TYPE.FIXED
          ? roundCurrency(handling.value * quantity)
          : calculateHandlingForCategory(handling, itemSubtotal);
      return addMoney(sum, perLine);
    }, 0);
  } else {
    const maxCategory = categoryFees.reduce((best, row) =>
      row.computedFee > (best?.computedFee || 0) ? row : best,
    );
    totalHandlingFee = roundCurrency(maxCategory?.computedFee || 0);
    handlingCategoryUsed = maxCategory || null;
  }

  if (!handlingCategoryUsed && categoryFees.length > 0) {
    handlingCategoryUsed = categoryFees
      .slice()
      .sort((a, b) => b.computedFee - a.computedFee)[0];
  }

  return {
    handlingFeeCharged: roundCurrency(totalHandlingFee),
    handlingFeeStrategy,
    handlingCategoryUsed,
    categoryFees,
  };
}

function hasProductPackagingOverride(item) {
  const value = item?.productPackagingCharge;
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

/**
 * Per-product packaging charge (optional, seller-set) wins over the
 * category-hierarchy packing fee for that line — it's charged per unit,
 * once per line item, and the line is excluded from the category grouping
 * below so it isn't double-counted.
 */
function calculateProductPackagingOverrides(cartItems = []) {
  const overrideItems = cartItems.filter(hasProductPackagingOverride);
  const productOverrides = overrideItems.map((item) => {
    const quantity = normalizeLineQuantity(item.quantity);
    const packagingChargePerUnit = Math.max(Number(item.productPackagingCharge) || 0, 0);
    return {
      productId: item.productId,
      productName: item.productName,
      packagingChargePerUnit,
      quantity,
      computedFee: roundCurrency(packagingChargePerUnit * quantity),
    };
  });
  const productPackagingFeeCharged = roundCurrency(
    productOverrides.reduce((sum, row) => addMoney(sum, row.computedFee), 0),
  );
  return { productOverrides, productPackagingFeeCharged };
}

export function calculatePackingFee(cartItems, options = {}) {
  const {
    packingFeeStrategy = HANDLING_FEE_STRATEGY.HIGHEST_CATEGORY_FEE,
    categoryById = new Map(),
  } = options;

  const { productOverrides, productPackagingFeeCharged } =
    calculateProductPackagingOverrides(cartItems);
  const categoryCartItems = cartItems.filter((item) => !hasProductPackagingOverride(item));

  const enrichedItems = attachResolvedFeeCategories(categoryCartItems, categoryById);

  const categorySubtotalMap = new Map();
  for (const item of enrichedItems) {
    const feeCategoryId = toObjectIdString(item.resolvedPackingCategoryId);
    if (!feeCategoryId) continue;
    const itemSubtotal = roundCurrency(
      normalizeLinePrice(item.price) * normalizeLineQuantity(item.quantity),
    );
    categorySubtotalMap.set(
      feeCategoryId,
      addMoney(categorySubtotalMap.get(feeCategoryId) || 0, itemSubtotal),
    );
  }

  const categoryFees = [];
  for (const [feeCategoryId, subtotal] of categorySubtotalMap.entries()) {
    const category = categoryById.get(feeCategoryId);
    const packing = resolvePackingConfig(category);
    const fee = calculateHandlingForCategory(packing, subtotal);
    categoryFees.push({
      headerCategoryId: feeCategoryId || null,
      categoryId: feeCategoryId || null,
      categoryName: category?.name || "Unknown",
      categoryType: category?.type || null,
      subtotal,
      packingFeeType: packing.type,
      packingFeeValue: packing.value,
      computedFee: roundCurrency(fee),
    });
  }

  let totalPackingFee = 0;
  let packingCategoryUsed = null;

  if (categoryFees.length === 0) {
    totalPackingFee = 0;
  } else if (packingFeeStrategy === HANDLING_FEE_STRATEGY.SUM_OF_CATEGORY_FEES) {
    totalPackingFee = categoryFees.reduce((sum, row) => addMoney(sum, row.computedFee), 0);
  } else if (packingFeeStrategy === HANDLING_FEE_STRATEGY.PER_ITEM_FEE) {
    totalPackingFee = enrichedItems.reduce((sum, item) => {
      const feeCategoryId = toObjectIdString(item.resolvedPackingCategoryId);
      if (!feeCategoryId) return sum;
      const category = categoryById.get(feeCategoryId);
      const packing = resolvePackingConfig(category);
      const quantity = normalizeLineQuantity(item.quantity);
      const itemSubtotal = roundCurrency(normalizeLinePrice(item.price) * quantity);
      const perLine =
        packing.type === HANDLING_FEE_TYPE.FIXED
          ? roundCurrency(packing.value * quantity)
          : calculateHandlingForCategory(packing, itemSubtotal);
      return addMoney(sum, perLine);
    }, 0);
  } else {
    const maxCategory = categoryFees.reduce((best, row) =>
      row.computedFee > (best?.computedFee || 0) ? row : best,
    );
    totalPackingFee = roundCurrency(maxCategory?.computedFee || 0);
    packingCategoryUsed = maxCategory || null;
  }

  if (!packingCategoryUsed && categoryFees.length > 0) {
    packingCategoryUsed = categoryFees
      .slice()
      .sort((a, b) => b.computedFee - a.computedFee)[0];
  }

  return {
    packingFeeCharged: roundCurrency(addMoney(totalPackingFee, productPackagingFeeCharged)),
    packingFeeStrategy,
    packingCategoryUsed,
    categoryFees,
    productOverrides,
    productPackagingFeeCharged,
  };
}

export function calculateCustomerDeliveryFee(distanceKm, deliverySettings) {
  const mode =
    deliverySettings.deliveryPricingMode || DELIVERY_PRICING_MODE.DISTANCE_BASED;
  const actualDistance = Number(distanceKm || 0);
  const normalizedDistance = Number.isFinite(actualDistance)
    ? Math.max(actualDistance, 0)
    : 0;

  if (mode === DELIVERY_PRICING_MODE.FIXED_PRICE) {
    const fixedFee = roundCurrency(
      deliverySettings.fixedDeliveryFee ?? deliverySettings.customerBaseDeliveryFee ?? 0,
    );
    return {
      deliveryFeeCharged: fixedFee,
      distanceKmActual: normalizedDistance,
      distanceKmRounded: roundCurrency(normalizedDistance),
      roundedExtraKm: 0,
      mode,
      baseFee: fixedFee,
      extraFee: 0,
    };
  }

  const baseFee = roundCurrency(deliverySettings.customerBaseDeliveryFee ?? 0);
  const baseDistance = Math.max(Number(deliverySettings.baseDistanceCapacityKm || 0), 0);
  const surcharge = roundCurrency(deliverySettings.incrementalKmSurcharge ?? 0);

  if (normalizedDistance <= baseDistance) {
    return {
      deliveryFeeCharged: baseFee,
      distanceKmActual: normalizedDistance,
      distanceKmRounded: roundCurrency(baseDistance),
      roundedExtraKm: 0,
      mode,
      baseFee,
      extraFee: 0,
    };
  }

  const extraKm = normalizedDistance - baseDistance;
  const roundedExtraKm = ceilKm(extraKm);
  const extraFee = roundCurrency(roundedExtraKm * surcharge);
  const total = addMoney(baseFee, extraFee);

  return {
    deliveryFeeCharged: total,
    distanceKmActual: normalizedDistance,
    distanceKmRounded: roundCurrency(baseDistance + roundedExtraKm),
    roundedExtraKm,
    mode,
    baseFee,
    extraFee,
  };
}

export function calculateRiderPayout(distanceKm, deliverySettings) {
  const mode =
    deliverySettings.deliveryPricingMode || DELIVERY_PRICING_MODE.DISTANCE_BASED;
  const actualDistance = Number(distanceKm || 0);
  const normalizedDistance = Number.isFinite(actualDistance)
    ? Math.max(actualDistance, 0)
    : 0;

  const riderBase = roundCurrency(deliverySettings.riderBasePayout ?? deliverySettings.customerBaseDeliveryFee ?? 0);
  const baseDistance = Math.max(Number(deliverySettings.baseDistanceCapacityKm || 0), 0);
  const perExtraKm = roundCurrency(deliverySettings.deliveryPartnerRatePerKm ?? 0);

  if (mode === DELIVERY_PRICING_MODE.FIXED_PRICE || normalizedDistance <= baseDistance) {
    return {
      riderPayoutBase: riderBase,
      riderPayoutDistance: 0,
      riderPayoutBonus: 0,
      riderPayoutTotal: riderBase,
      roundedExtraKm: 0,
    };
  }

  const extraKm = normalizedDistance - baseDistance;
  const roundedExtraKm = ceilKm(extraKm);
  const riderDistance = roundCurrency(roundedExtraKm * perExtraKm);
  const riderTotal = addMoney(riderBase, riderDistance);

  return {
    riderPayoutBase: riderBase,
    riderPayoutDistance: riderDistance,
    riderPayoutBonus: 0,
    riderPayoutTotal: riderTotal,
    roundedExtraKm,
  };
}

export async function hydrateOrderItems(
  orderItems = [],
  { session = null, enforceServerPricing = true } = {},
) {
  if (!Array.isArray(orderItems) || orderItems.length === 0) {
    return [];
  }

  const productIds = orderItems
    .map((item) => item.product || item.productId || item._id || item.id)
    .filter(Boolean);

  const productQuery = Product.find({ _id: { $in: productIds } })
    .select(
      "_id name salePrice price mainImage headerId categoryId subcategoryId sellerId status approvalStatus variants addons applyCommission adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule gstSlabOverride packagingCharge isPreorderEligible",
    )
    .lean();
  if (session) productQuery.session(session);
  const products = await productQuery;

  const productMap = new Map(products.map((product) => [String(product._id), product]));

  return orderItems.map((item) => {
    const productId = String(item.product || item.productId || item._id || item.id);
    const product = productMap.get(productId);
    if (!product) {
      throw new Error(`Product not found for line item: ${productId}`);
    }
    if (product.status !== "active") {
      throw new Error(`Product is not available for purchase: ${product.name}`);
    }
    if (resolveProductApprovalStatus(product) !== PRODUCT_APPROVAL_STATUS.APPROVED) {
      throw new Error(`Product is not approved for purchase: ${product.name}`);
    }

    const rawVariantSku = String(item.variantSku || item.variantSlot || "").trim();
    let resolvedVariant = null;
    if (rawVariantSku) {
      const variants = Array.isArray(product.variants) ? product.variants : [];
      resolvedVariant =
        variants.find((v) => String(v?.sku || "").trim() === rawVariantSku) ||
        variants.find((v) => String(v?.name || "").trim() === rawVariantSku) ||
        null;
      if (!resolvedVariant) {
        const err = new Error(`Invalid variant for product: ${product.name}`);
        err.statusCode = 400;
        throw err;
      }
    }

    const quantity = normalizeLineQuantity(item.quantity);
    const serverUnitPrice = normalizeLinePrice(
      resolvedVariant
        ? resolvedVariant.salePrice || resolvedVariant.price || product.salePrice || product.price
        : product.salePrice || product.price,
    );
    const inferredUnitPrice = enforceServerPricing
      ? serverUnitPrice
      : normalizeLinePrice(item.price) || serverUnitPrice;

    const parentProductId = String(
      item.parentProductId ||
      item.parentId ||
      item.baseProductId ||
      item.meta?.parentProductId ||
      "",
    ).trim();
    const explicitAddonFlag = item.isAddon === true || item.isAddOn === true || item.addon === true;
    const isAddonLine = explicitAddonFlag || Boolean(parentProductId);

    return {
      productId,
      productName: item.name || product.name,
      quantity,
      price: inferredUnitPrice,
      image: item.image || product.mainImage,
      headerCategoryId: String(product.headerId),
      categoryId: product.categoryId ? String(product.categoryId) : null,
      subcategoryId: product.subcategoryId ? String(product.subcategoryId) : null,
      sellerId: String(product.sellerId),
      variantSku: rawVariantSku || "",
      variantName: resolvedVariant ? String(resolvedVariant?.name || "").trim() : "",
      applyCommission: resolvedVariant?.applyCommission === true
        ? true
        : product.applyCommission === true,
      adminCommissionType:
        resolvedVariant?.applyCommission === true
          ? resolvedVariant.adminCommissionType || COMMISSION_TYPE.PERCENTAGE
          : product.adminCommissionType || COMMISSION_TYPE.PERCENTAGE,
      adminCommissionValue:
        resolvedVariant?.applyCommission === true
          ? Number(resolvedVariant.adminCommissionValue ?? 0)
          : Number(product.adminCommissionValue ?? product.adminCommission ?? 0),
      adminCommissionFixedRule:
        resolvedVariant?.applyCommission === true
          ? resolvedVariant.adminCommissionFixedRule || COMMISSION_FIXED_RULE.PER_QTY
          : product.adminCommissionFixedRule || COMMISSION_FIXED_RULE.PER_QTY,
      commissionSourceIsVariant: resolvedVariant?.applyCommission === true,
      gstSlabOverride:
        product.gstSlabOverride === null || product.gstSlabOverride === undefined
          ? null
          : Number(product.gstSlabOverride),
      // Optional seller-set packaging charge for this specific product. null
      // = not set, falls back to the category-hierarchy packing fee (see
      // calculatePackingFee) instead of being treated as "free packaging".
      productPackagingCharge:
        product.packagingCharge === null || product.packagingCharge === undefined
          ? null
          : Number(product.packagingCharge),
      isAddonLine,
      parentProductId: parentProductId || null,
    };
  });
}

export async function generateOrderPaymentBreakdown({
  items = [],
  preHydratedItems = null,
  distanceKm = 0,
  discountTotal = 0,
  taxTotal = 0,
  customerState = "",
  orderPlacedAt = null,
  tipTotal = 0,
  deliverySettings,
  handlingFeeStrategy,
  session = null,
  skipDeliveryFee = false,
  includeCustomerSurcharge = true,
}) {
  const normalizedItems = Array.isArray(preHydratedItems) && preHydratedItems.length > 0
    ? preHydratedItems
    : await hydrateOrderItems(items, { session, enforceServerPricing: true });
  if (normalizedItems.length === 0) {
    throw new Error("Cart is empty");
  }

  const sellerIds = Array.from(new Set(normalizedItems.map((item) => item.sellerId)));
  if (sellerIds.length > 1) {
    throw new Error("Multi-seller checkout is not supported in current flow");
  }

  const storeId = sellerIds[0];
  const { owner } = await loadStoreOwnerBusinessModel(storeId, { session });
  const storePackagingQuery = Store.findById(storeId)
    .select("packagingCharge packagingChargeEnabled shopName city state applyCommission adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule")
    .lean();
  if (session) storePackagingQuery.session(session);
  const storeDoc = await storePackagingQuery;
  const cityKey = normalizeCityKey(storeDoc?.city || "");
  const cityCommissionQuery = cityKey
    ? CityCommission.findOne({ cityKey })
        .select("cityKey cityName enabled applyCommission adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule")
        .lean()
    : null;
  if (session && cityCommissionQuery) cityCommissionQuery.session(session);
  const cityCommission = cityCommissionQuery ? await cityCommissionQuery : null;
  const packagingChargeAmount =
    storeDoc?.packagingChargeEnabled && Number(storeDoc.packagingCharge || 0) > 0
      ? roundCurrency(storeDoc.packagingCharge)
      : 0;
  if (owner && !owner.businessModel) {
    const err = new Error("Seller has not activated a business model yet");
    err.statusCode = 403;
    throw err;
  }
  if (owner?.businessModel === "subscription") {
    const { getActiveSubscriptionForSeller } = await import("../subscriptionService.js");
    const active = await getActiveSubscriptionForSeller(owner._id);
    if (!active) {
      const err = new Error("Active subscription required for checkout");
      err.statusCode = 403;
      throw err;
    }
  }
  const effectiveOwner = owner || {
    businessModel: "commission",
    commissionConfig: { scope: "category" },
  };

  // Free-tier product cap (checklist 92-94): commission-model sellers past
  // the configured published-product limit pay a commission surcharge —
  // a soft nudge toward subscribing, not a publish block.
  let freeTierStatus = { applicable: false, isOverLimit: false, surchargePercent: 0 };
  if (effectiveOwner.businessModel === "commission") {
    const { resolveFreeTierStatus } = await import("../subscriptionService.js");
    freeTierStatus = await resolveFreeTierStatus(storeId);
  }

  const categoryIds = Array.from(
    new Set(
      normalizedItems
        .flatMap((item) => [
          item.headerCategoryId,
          item.categoryId,
          item.subcategoryId,
        ])
        .filter(Boolean),
    ),
  );

  const categoryQuery = Category.find({ _id: { $in: categoryIds } })
    .select(
      "_id name type applyCommission adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule handlingFees handlingFeeType handlingFeeValue packingFees packingFeeType packingFeeValue gstSlab returnEligible refundWindowHours restockFeePercent",
    )
    .lean();
  if (session) categoryQuery.session(session);
  const categories = await categoryQuery;
  const categoryById = new Map(categories.map((category) => [String(category._id), category]));
  const commissionProductIds = Array.from(
    new Set(
      normalizedItems
        .flatMap((item) => [item.productId, item.parentProductId])
        .filter(Boolean),
    ),
  );
  const commissionProductDocs = commissionProductIds.length
    ? await Product.find({ _id: { $in: commissionProductIds } })
        .select("_id name addons applyCommission adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule")
        .lean()
    : [];
  const commissionProductById = new Map(
    commissionProductDocs.map((doc) => [String(doc._id), doc]),
  );

  const effectiveSettings =
    deliverySettings || (await getOrCreateFinanceSettings());
  const effectiveHandlingStrategy =
    handlingFeeStrategy || effectiveSettings.handlingFeeStrategy;
  const effectivePackingStrategy = effectiveHandlingStrategy;

  let productSubtotal = 0;
  let sellerPayoutTotal = 0;
  let adminProductCommissionTotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;

  const taxJurisdiction = resolveTaxJurisdiction(storeDoc?.state, customerState);

  // Bulk order detection (checklist 335-339): a pre-pass subtotal, since
  // the value-threshold check needs the whole order's total, which isn't
  // known until every line is processed otherwise.
  const preOrderSubtotal = normalizedItems.reduce(
    (sum, item) => addMoney(sum, roundCurrency(normalizeLinePrice(item.price) * normalizeLineQuantity(item.quantity))),
    0,
  );
  const bulkOrderMeetsValueThreshold =
    Number(effectiveSettings.bulkOrderValueThreshold || 0) > 0 &&
    preOrderSubtotal >= Number(effectiveSettings.bulkOrderValueThreshold);
  const bulkOrderQtyThreshold = Number(effectiveSettings.bulkOrderQtyThreshold || 0);
  const bulkOrderCommissionRate = Number(effectiveSettings.bulkOrderCommissionRate || 0);
  let isBulkOrder = bulkOrderMeetsValueThreshold;
  const bulkOrderLineIndexes = [];

  const lineItems = normalizedItems.map((item, itemIndex) => {
    const headerCategory = categoryById.get(String(item.headerCategoryId));
    const level2Category = item.categoryId
      ? categoryById.get(String(item.categoryId))
      : null;
    const subcategory = item.subcategoryId
      ? categoryById.get(String(item.subcategoryId))
      : null;
    const productCategory =
      item.applyCommission === true
        ? {
            _id: item.productId,
            name: item.productName || "Product",
            applyCommission: true,
            adminCommissionType:
              item.adminCommissionType || COMMISSION_TYPE.PERCENTAGE,
            adminCommissionValue: Number(item.adminCommissionValue || 0),
            adminCommission: Number(item.adminCommissionValue || 0),
            adminCommissionFixedRule:
              item.adminCommissionFixedRule || COMMISSION_FIXED_RULE.PER_QTY,
          }
        : null;

    const parentProduct = item.parentProductId
      ? commissionProductById.get(String(item.parentProductId))
      : null;
    const addonProduct = item.isAddonLine && productCategory
      ? {
          ...productCategory,
          _id: item.productId,
          name: item.productName || "Add-on Product",
        }
      : null;
    const addonAllowed = Boolean(
      item.isAddonLine &&
      parentProduct &&
      Array.isArray(parentProduct.addons) &&
      parentProduct.addons.some((id) => String(id) === String(item.productId)),
    ) || Boolean(item.isAddonLine && item.parentProductId);

    const resolved = ENABLE_HIERARCHICAL_COMMISSION
      ? resolveEffectiveCommissionForLineItem({
          addonProduct: addonAllowed ? addonProduct : null,
          productCategory,
          subcategory,
          shopCommission: storeDoc,
          cityCommission,
        })
      : (() => {
          const legacy = resolveCategoryHierarchyCommission({
            productCategory,
            headerCategory,
            level2Category,
            subcategory,
          });
          return {
            category: legacy.category,
            level: legacy.level,
            categoryId: legacy.categoryId,
            cityKey: null,
            fallbackTrail: [{ level: "legacy", reason: "feature_flag_disabled" }],
          };
        })();
    const baseConfig = resolved.category || {
      adminCommissionType: COMMISSION_TYPE.PERCENTAGE,
      adminCommissionValue: 0,
      adminCommissionFixedRule: COMMISSION_FIXED_RULE.PER_QTY,
    };

    const lineMeetsQtyThreshold =
      bulkOrderQtyThreshold > 0 && normalizeLineQuantity(item.quantity) >= bulkOrderQtyThreshold;
    const lineIsBulk = bulkOrderMeetsValueThreshold || lineMeetsQtyThreshold;
    if (lineIsBulk) {
      isBulkOrder = true;
      bulkOrderLineIndexes.push(itemIndex);
    }
    const bulkOverrideApplies =
      lineIsBulk && bulkOrderCommissionRate > 0 && baseConfig.adminCommissionType === COMMISSION_TYPE.PERCENTAGE;

    // Free-tier surcharge only makes sense as a percentage bump; fixed-amount
    // commission configs are left alone rather than guessing an equivalent.
    const applyFreeTierSurcharge =
      freeTierStatus.isOverLimit && baseConfig.adminCommissionType === COMMISSION_TYPE.PERCENTAGE;

    let effectiveConfig = baseConfig;
    if (bulkOverrideApplies || applyFreeTierSurcharge) {
      const startingValue = bulkOverrideApplies
        ? bulkOrderCommissionRate
        : Number(baseConfig.adminCommissionValue || 0);
      effectiveConfig = {
        ...baseConfig,
        adminCommissionValue: startingValue + (applyFreeTierSurcharge ? freeTierStatus.surchargePercent : 0),
      };
    }
    const commission = calculateCategoryCommission(item, effectiveConfig);
    productSubtotal = addMoney(productSubtotal, commission.itemSubtotal);
    sellerPayoutTotal = addMoney(sellerPayoutTotal, commission.sellerPayout);
    adminProductCommissionTotal = addMoney(
      adminProductCommissionTotal,
      commission.adminCommission,
    );

    const gstResolution = resolveGstSlabForLineItem({
      productGstSlabOverride: item.gstSlabOverride,
      headerCategory,
      level2Category,
      subcategory,
    });
    const lineGst = calculateLineItemGst(
      commission.itemSubtotal,
      gstResolution.gstSlab,
      taxJurisdiction,
    );
    cgstTotal = addMoney(cgstTotal, lineGst.cgst);
    sgstTotal = addMoney(sgstTotal, lineGst.sgst);
    igstTotal = addMoney(igstTotal, lineGst.igst);

    return {
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.price,
      itemSubtotal: commission.itemSubtotal,
      sellerPayout: commission.sellerPayout,
      adminProductCommission: commission.adminCommission,
      headerCategoryId: item.headerCategoryId,
      categoryId: item.categoryId || null,
      subcategoryId: item.subcategoryId || null,
      headerCategoryName: headerCategory?.name || "Unknown",
      appliedCommissionCategoryId: resolved.categoryId,
      appliedCommissionCategoryLevel: resolved.level,
      appliedCommissionCategoryName: resolved.category?.name || null,
      appliedCommissionType: commission.appliedCommissionType,
      appliedCommissionValue: commission.appliedCommissionValue,
      appliedCommissionFixedRule: commission.appliedFixedRule,
      appliedCommissionSource:
        item.commissionSourceIsVariant && resolved.level === "product" ? "variant" : (resolved.level || "none"),
      appliedCommissionSourceLevel:
        item.commissionSourceIsVariant && resolved.level === "product" ? "variant" : (resolved.level || "none"),
      appliedCommissionSourceId: resolved.level === "city"
        ? resolved.cityKey
        : (resolved.categoryId || null),
      commissionFallbackTrail: resolved.fallbackTrail || [],
      isAddonLine: item.isAddonLine === true,
      parentProductId: item.parentProductId || null,
      gstSlab: gstResolution.gstSlab,
      gstSlabSource: gstResolution.source,
      cgst: lineGst.cgst,
      sgst: lineGst.sgst,
      igst: lineGst.igst,
      lineTax: lineGst.totalGst,
      freeTierSurchargeApplied: applyFreeTierSurcharge,
      freeTierSurchargePercent: applyFreeTierSurcharge ? freeTierStatus.surchargePercent : 0,
      isBulkLine: lineIsBulk,
      bulkCommissionRateApplied: bulkOverrideApplies ? bulkOrderCommissionRate : null,
    };
  });

  const bulkOrderReason = bulkOrderMeetsValueThreshold
    ? "value_threshold"
    : bulkOrderLineIndexes.length > 0
      ? "qty_threshold"
      : null;

  const handling = calculateHandlingFee(normalizedItems, {
    handlingFeeStrategy: effectiveHandlingStrategy,
    categoryById,
  });
  const packing = calculatePackingFee(normalizedItems, {
    packingFeeStrategy: effectivePackingStrategy,
    categoryById,
  });
  const delivery = skipDeliveryFee
    ? { deliveryFeeCharged: 0, distanceKmActual: 0, distanceKmRounded: 0 }
    : calculateCustomerDeliveryFee(distanceKm, effectiveSettings);
  const rider = skipDeliveryFee
    ? {
        riderPayoutBase: 0,
        riderPayoutDistance: 0,
        riderPayoutBonus: 0,
        riderPayoutTotal: 0,
        riderTipAmount: 0,
      }
    : calculateRiderPayout(distanceKm, effectiveSettings);

  const normalizedDiscount = roundCurrency(discountTotal || 0);
  // Real GST computed per line item above is authoritative; the legacy `taxTotal`
  // param is kept only as a manual override escape hatch for callers that don't
  // go through category/product GST slabs (none exist in-repo today).
  const computedTax = addMoney(cgstTotal, sgstTotal, igstTotal);
  const normalizedTax = taxTotal ? roundCurrency(taxTotal) : computedTax;
  const normalizedTip = roundCurrency(tipTotal || 0);

  const oddHourWindow = effectiveSettings.oddHourSurcharge || {};
  const oddHourActive =
    includeCustomerSurcharge &&
    oddHourWindow.enabled &&
    Number(oddHourWindow.amount || 0) > 0 &&
    isWithinOddHourWindow(orderPlacedAt || new Date(), oddHourWindow.windowStart, oddHourWindow.windowEnd);
  const oddHourSurchargeAmount = oddHourActive ? roundCurrency(oddHourWindow.amount) : 0;

  const weatherSurchargeConfig = effectiveSettings.weatherSurcharge || {};
  const weatherSurchargeAmount =
    includeCustomerSurcharge &&
    weatherSurchargeConfig.enabled &&
    Number(weatherSurchargeConfig.amount || 0) > 0
      ? roundCurrency(weatherSurchargeConfig.amount)
      : 0;

  // Legacy single generic surcharge — kept for settings that haven't migrated yet.
  const customerSurchargeAmount =
    includeCustomerSurcharge &&
    effectiveSettings.customerSurchargeEnabled &&
    Number(effectiveSettings.customerSurchargeAmount || 0) > 0
      ? roundCurrency(effectiveSettings.customerSurchargeAmount)
      : 0;
  const customerSurchargeReason =
    customerSurchargeAmount > 0
      ? String(effectiveSettings.customerSurchargeReason || "Additional charge").trim()
      : "";

  const totalSurcharges = addMoney(
    oddHourSurchargeAmount,
    weatherSurchargeAmount,
    customerSurchargeAmount,
  );

  const grandTotal = roundCurrency(
    productSubtotal +
      delivery.deliveryFeeCharged +
      handling.handlingFeeCharged +
      packing.packingFeeCharged -
      normalizedDiscount +
      normalizedTax +
      normalizedTip +
      totalSurcharges +
      packagingChargeAmount,
  );

  const riderTipAmount = normalizedTip;
  const riderPayoutTotal = roundCurrency(
    rider.riderPayoutBase +
      rider.riderPayoutDistance +
      rider.riderPayoutBonus +
      riderTipAmount,
  );

  // Packaging charge is paid to the seller
  sellerPayoutTotal = addMoney(sellerPayoutTotal, packagingChargeAmount);
  // Same for the optional per-product packaging charge — the seller set it
  // and incurs the actual packaging cost, unlike the admin-configured
  // category-hierarchy packing fee below, which is a platform line-item fee.
  sellerPayoutTotal = addMoney(sellerPayoutTotal, packing.productPackagingFeeCharged);

  // Odd-hour / weather surcharges use a configurable platform/seller revenue
  // split (default 100% platform, matching the legacy single-surcharge behavior).
  const oddHourSellerShare = oddHourActive
    ? percentOf(oddHourSurchargeAmount, Number(oddHourWindow.revenueSplit?.seller ?? 0))
    : 0;
  const weatherSellerShare = weatherSurchargeAmount > 0
    ? percentOf(weatherSurchargeAmount, Number(weatherSurchargeConfig.revenueSplit?.seller ?? 0))
    : 0;
  const surchargeSellerShare = addMoney(oddHourSellerShare, weatherSellerShare);
  const surchargePlatformShare = roundCurrency(totalSurcharges - surchargeSellerShare);
  sellerPayoutTotal = addMoney(sellerPayoutTotal, surchargeSellerShare);

  // Category packing + handling go to platform (same as logistics margin).
  // The optional per-product packaging charge is excluded here — it's
  // already routed to the seller above, not platform margin.
  const platformLogisticsMargin = roundCurrency(
    delivery.deliveryFeeCharged +
      handling.handlingFeeCharged +
      (packing.packingFeeCharged - packing.productPackagingFeeCharged) -
      (rider.riderPayoutBase + rider.riderPayoutDistance + rider.riderPayoutBonus),
  );
  // Surcharges go to platform except for whatever share is configured to the seller.
  const platformTotalEarning = roundCurrency(
    adminProductCommissionTotal + platformLogisticsMargin + surchargePlatformShare,
  );
  const rolloutVerification = {
    hierarchicalCommissionEnabled: ENABLE_HIERARCHICAL_COMMISSION,
    linesWithoutCommissionSource: lineItems.filter(
      (line) => !line.appliedCommissionSourceLevel || line.appliedCommissionSourceLevel === "none",
    ).map((line) => line.productId),
    verifiedAt: new Date().toISOString(),
  };

  const snapshots = {
    deliverySettings: {
      ...effectiveSettings,
    },
    categoryCommissionSettings: categories.map((category) => ({
      categoryId: String(category._id),
      categoryName: category.name,
      categoryType: category.type || null,
      applyCommission: categoryAppliesCommission(category),
      // Keep legacy header keys for older consumers reading header-only snapshots.
      headerCategoryId: String(category._id),
      headerCategoryName: category.name,
      adminCommissionType:
        category.adminCommissionType || COMMISSION_TYPE.PERCENTAGE,
      adminCommissionValue: resolveCommissionConfig(category).value,
      adminCommissionFixedRule:
        category.adminCommissionFixedRule || COMMISSION_FIXED_RULE.PER_QTY,
      handlingFeeType:
        category.handlingFeeType || HANDLING_FEE_TYPE.FIXED,
      handlingFeeValue: resolveHandlingConfig(category).value,
      packingFeeType:
        category.packingFeeType || HANDLING_FEE_TYPE.FIXED,
      packingFeeValue: resolvePackingConfig(category).value,
    })),
    handlingFeeStrategy: effectiveHandlingStrategy,
    handlingCategoryUsed: handling.handlingCategoryUsed,
    packingFeeStrategy: effectivePackingStrategy,
    packingCategoryUsed: packing.packingCategoryUsed,
    sellerBusinessModel: effectiveOwner.businessModel,
    sellerOwnerId: owner?._id ? String(owner._id) : null,
    freeTierStatus,
    bulkOrder: isBulkOrder
      ? { isBulkOrder: true, reason: bulkOrderReason, lineIndexes: bulkOrderLineIndexes, commissionRateApplied: bulkOrderCommissionRate > 0 ? bulkOrderCommissionRate : null }
      : { isBulkOrder: false },
    commissionResolutionOrder: [
      "variant", // substituted transparently for "product" in hydrateOrderItems when set
      "addon",
      "product",
      "subcategory",
      "shop",
      "city",
    ],
    featureFlags: {
      hierarchicalCommission: ENABLE_HIERARCHICAL_COMMISSION,
    },
    rolloutVerification,
    shopCommission: {
      storeId: String(storeId),
      shopName: storeDoc?.shopName || "",
      city: storeDoc?.city || "",
      applyCommission: storeDoc?.applyCommission === true,
      adminCommissionType: storeDoc?.adminCommissionType || COMMISSION_TYPE.PERCENTAGE,
      adminCommissionValue: Number(storeDoc?.adminCommissionValue ?? storeDoc?.adminCommission ?? 0),
      adminCommissionFixedRule: storeDoc?.adminCommissionFixedRule || COMMISSION_FIXED_RULE.PER_QTY,
    },
    cityCommission: cityCommission
      ? {
          cityKey: cityCommission.cityKey,
          cityName: cityCommission.cityName || "",
          enabled: cityCommission.enabled !== false,
          applyCommission: cityCommission.applyCommission === true,
          adminCommissionType: cityCommission.adminCommissionType || COMMISSION_TYPE.PERCENTAGE,
          adminCommissionValue: Number(cityCommission.adminCommissionValue ?? cityCommission.adminCommission ?? 0),
          adminCommissionFixedRule: cityCommission.adminCommissionFixedRule || COMMISSION_FIXED_RULE.PER_QTY,
        }
      : null,
    appliedCommissionSources: lineItems.map((line) => ({
      productId: line.productId,
      sourceLevel: line.appliedCommissionSourceLevel,
      sourceId: line.appliedCommissionSourceId,
      fallbackTrail: line.commissionFallbackTrail || [],
    })),
    customerSurcharge: customerSurchargeAmount > 0
      ? { amount: customerSurchargeAmount, reason: customerSurchargeReason }
      : null,
    oddHourSurcharge: oddHourSurchargeAmount > 0
      ? { amount: oddHourSurchargeAmount, windowStart: oddHourWindow.windowStart, windowEnd: oddHourWindow.windowEnd }
      : null,
    weatherSurcharge: weatherSurchargeAmount > 0
      ? { amount: weatherSurchargeAmount }
      : null,
    packagingCharge: packagingChargeAmount > 0
      ? { amount: packagingChargeAmount, storeId: String(storeId) }
      : null,
    productPackagingCharges: packing.productOverrides.length > 0 ? packing.productOverrides : null,
    taxJurisdiction,
    sellerState: storeDoc?.state || "",
    customerState: customerState || "",
  };

  return {
    sellerId: storeId,
    lineItems,
    isBulkOrder,
    bulkOrderReason,
    bulkOrderLineIndexes,
    currency: "INR",
    productSubtotal,
    deliveryFeeCharged: delivery.deliveryFeeCharged,
    handlingFeeCharged: handling.handlingFeeCharged,
    packingFeeCharged: packing.packingFeeCharged,
    productPackagingChargeAmount: packing.productPackagingFeeCharged,
    tipTotal: normalizedTip,
    discountTotal: normalizedDiscount,
    taxTotal: normalizedTax,
    cgstTotal,
    sgstTotal,
    igstTotal,
    taxJurisdiction,
    customerSurchargeAmount,
    customerSurchargeReason,
    oddHourSurchargeAmount,
    weatherSurchargeAmount,
    packagingChargeAmount,
    grandTotal,
    sellerPayoutTotal,
    adminProductCommissionTotal,
    riderPayoutBase: rider.riderPayoutBase,
    riderPayoutDistance: rider.riderPayoutDistance,
    riderPayoutBonus: rider.riderPayoutBonus,
    riderTipAmount,
    riderPayoutTotal,
    platformLogisticsMargin,
    platformTotalEarning,
    codCollectedAmount: 0,
    codRemittedAmount: 0,
    codPendingAmount: 0,
    distanceKmActual: delivery.distanceKmActual,
    distanceKmRounded: delivery.distanceKmRounded,
    snapshots,
  };
}
