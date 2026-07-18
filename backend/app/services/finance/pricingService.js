import Product from "../../models/product.js";
import Category from "../../models/category.js";
import Store from "../../models/store.js";
import {
  PRODUCT_APPROVAL_STATUS,
  resolveProductApprovalStatus,
} from "../productModerationService.js";
import {
  loadStoreOwnerBusinessModel,
  resolveSellerCommissionConfig,
} from "../sellerBusinessModelService.js";
import {
  COMMISSION_FIXED_RULE,
  COMMISSION_TYPE,
  DELIVERY_PRICING_MODE,
  HANDLING_FEE_STRATEGY,
  HANDLING_FEE_TYPE,
} from "../../constants/finance.js";
import {
  addMoney,
  ceilKm,
  clampMoney,
  percentOf,
  roundCurrency,
} from "../../utils/money.js";
import { getOrCreateFinanceSettings } from "./financeSettingsService.js";

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

/**
 * Whether this category level should supply commission.
 * Prefer explicit `applyCommission`; legacy docs without the flag count as
 * applied when their commission value is > 0.
 */
export function categoryAppliesCommission(category) {
  if (!category) return false;
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

  const categorySubtotalMap = new Map();
  for (const item of cartItems) {
    const headerId = toObjectIdString(item.headerCategoryId);
    const itemSubtotal = roundCurrency(normalizeLinePrice(item.price) * normalizeLineQuantity(item.quantity));
    categorySubtotalMap.set(headerId, addMoney(categorySubtotalMap.get(headerId) || 0, itemSubtotal));
  }

  const categoryFees = [];
  for (const [headerId, subtotal] of categorySubtotalMap.entries()) {
    const category = categoryById.get(headerId);
    const handling = resolveHandlingConfig(category);
    const fee = calculateHandlingForCategory(handling, subtotal);
    categoryFees.push({
      headerCategoryId: headerId || null,
      categoryName: category?.name || "Unknown",
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
    totalHandlingFee = cartItems.reduce((sum, item) => {
      const headerId = toObjectIdString(item.headerCategoryId);
      const category = categoryById.get(headerId);
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
      "_id name salePrice price mainImage headerId categoryId subcategoryId sellerId status approvalStatus variants applyCommission adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule",
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
      applyCommission: product.applyCommission === true,
      adminCommissionType: product.adminCommissionType || COMMISSION_TYPE.PERCENTAGE,
      adminCommissionValue: Number(
        product.adminCommissionValue ?? product.adminCommission ?? 0,
      ),
      adminCommissionFixedRule:
        product.adminCommissionFixedRule || COMMISSION_FIXED_RULE.PER_QTY,
    };
  });
}

export async function generateOrderPaymentBreakdown({
  items = [],
  preHydratedItems = null,
  distanceKm = 0,
  discountTotal = 0,
  taxTotal = 0,
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
    .select("packagingCharge packagingChargeEnabled shopName")
    .lean();
  if (session) storePackagingQuery.session(session);
  const storeDoc = await storePackagingQuery;
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
      "_id name type applyCommission adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule handlingFees handlingFeeType handlingFeeValue",
    )
    .lean();
  if (session) categoryQuery.session(session);
  const categories = await categoryQuery;
  const categoryById = new Map(categories.map((category) => [String(category._id), category]));

  const effectiveSettings =
    deliverySettings || (await getOrCreateFinanceSettings());
  const effectiveHandlingStrategy =
    handlingFeeStrategy || effectiveSettings.handlingFeeStrategy;

  let productSubtotal = 0;
  let sellerPayoutTotal = 0;
  let adminProductCommissionTotal = 0;

  const lineItems = normalizedItems.map((item) => {
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
    const hierarchy = resolveCategoryHierarchyCommission({
      productCategory,
      headerCategory,
      level2Category,
      subcategory,
    });
    const { config, source } = resolveSellerCommissionConfig(
      effectiveOwner,
      item.headerCategoryId,
      hierarchy.category,
    );
    if (!config) {
      const err = new Error("Seller business model is not configured for checkout");
      err.statusCode = 403;
      throw err;
    }
    const commission = calculateCategoryCommission(item, config);
    productSubtotal = addMoney(productSubtotal, commission.itemSubtotal);
    sellerPayoutTotal = addMoney(sellerPayoutTotal, commission.sellerPayout);
    adminProductCommissionTotal = addMoney(
      adminProductCommissionTotal,
      commission.adminCommission,
    );

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
      appliedCommissionCategoryId: hierarchy.categoryId,
      appliedCommissionCategoryLevel: hierarchy.level,
      appliedCommissionCategoryName: hierarchy.category?.name || null,
      appliedCommissionType: commission.appliedCommissionType,
      appliedCommissionValue: commission.appliedCommissionValue,
      appliedCommissionFixedRule: commission.appliedFixedRule,
      appliedCommissionSource: source,
    };
  });

  // Handling fees still use header categories only.
  const headerCategoryById = new Map(
    categories
      .filter((category) => category.type === "header" || !category.type)
      .map((category) => [String(category._id), category]),
  );
  for (const item of normalizedItems) {
    const headerId = String(item.headerCategoryId || "");
    if (headerId && !headerCategoryById.has(headerId) && categoryById.has(headerId)) {
      headerCategoryById.set(headerId, categoryById.get(headerId));
    }
  }

  const handling = calculateHandlingFee(normalizedItems, {
    handlingFeeStrategy: effectiveHandlingStrategy,
    categoryById: headerCategoryById,
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
  const normalizedTax = roundCurrency(taxTotal || 0);
  const normalizedTip = roundCurrency(tipTotal || 0);

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

  const grandTotal = roundCurrency(
    productSubtotal +
      delivery.deliveryFeeCharged +
      handling.handlingFeeCharged -
      normalizedDiscount +
      normalizedTax +
      normalizedTip +
      customerSurchargeAmount +
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

  const platformLogisticsMargin = roundCurrency(
    delivery.deliveryFeeCharged +
      handling.handlingFeeCharged -
      (rider.riderPayoutBase + rider.riderPayoutDistance + rider.riderPayoutBonus),
  );
  // Customer surcharge goes to platform only — not seller or rider
  const platformTotalEarning = roundCurrency(
    adminProductCommissionTotal + platformLogisticsMargin + customerSurchargeAmount,
  );

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
    })),
    handlingFeeStrategy: effectiveHandlingStrategy,
    handlingCategoryUsed: handling.handlingCategoryUsed,
    sellerBusinessModel: effectiveOwner.businessModel,
    sellerOwnerId: owner?._id ? String(owner._id) : null,
    customerSurcharge: customerSurchargeAmount > 0
      ? { amount: customerSurchargeAmount, reason: customerSurchargeReason }
      : null,
    packagingCharge: packagingChargeAmount > 0
      ? { amount: packagingChargeAmount, storeId: String(storeId) }
      : null,
  };

  return {
    sellerId: storeId,
    lineItems,
    currency: "INR",
    productSubtotal,
    deliveryFeeCharged: delivery.deliveryFeeCharged,
    handlingFeeCharged: handling.handlingFeeCharged,
    tipTotal: normalizedTip,
    discountTotal: normalizedDiscount,
    taxTotal: normalizedTax,
    customerSurchargeAmount,
    customerSurchargeReason,
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
