import Store from "../models/store.js";
import Category from "../models/category.js";
import { distanceMeters } from "../utils/geoUtils.js";
import {
  BILLING_SOURCE,
  EXTRA_CHARGE_APPLIES_TO,
  EXTRA_CHARGE_REVENUE_TYPE,
  EXTRA_CHARGE_TYPE,
  HANDLING_FEE_STRATEGY,
} from "../constants/finance.js";
import {
  calculateHandlingFee,
  calculatePackingFee,
  generateOrderPaymentBreakdown,
  hydrateOrderItems,
} from "./finance/pricingService.js";
import { getOrCreateFinanceSettings } from "./finance/financeSettingsService.js";
import { isWithinOddHourWindow } from "./finance/pricingService.js";
import { resolveCityBillingConfig } from "./finance/cityBillingResolver.js";
import { FULFILLMENT_METHOD } from "../constants/deliveryPolicy.js";

function normalizeLocation(location = null) {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
}

export function groupHydratedItemsBySeller(hydratedItems = []) {
  const grouped = new Map();
  for (const item of hydratedItems) {
    const sellerId = String(item?.sellerId || "");
    if (!sellerId) {
      const err = new Error("Unable to resolve seller for one or more checkout items");
      err.statusCode = 400;
      throw err;
    }
    if (!grouped.has(sellerId)) {
      grouped.set(sellerId, []);
    }
    grouped.get(sellerId).push(item);
  }
  return grouped;
}

async function computeDistanceKmForSeller({
  sellerId,
  addressLocation,
  session = null,
  skipRadiusCheck = false,
}) {
  const normalizedLocation = normalizeLocation(addressLocation);
  if (!normalizedLocation) return 0;

  const query = Store.findById(sellerId).select("location serviceRadius shopName").lean();
  if (session) query.session(session);
  const seller = await query;
  if (!seller) {
    const err = new Error("Seller not found");
    err.statusCode = 404;
    throw err;
  }
  const coords = seller?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return 0;

  const [sellerLng, sellerLat] = coords;
  const distanceInMeters = distanceMeters(
    normalizedLocation.lat,
    normalizedLocation.lng,
    Number(sellerLat),
    Number(sellerLng),
  );
  const distanceKm = Number((distanceInMeters / 1000).toFixed(3));

  if (!skipRadiusCheck) {
    const radius = Number(seller.serviceRadius || 5);
    if (distanceKm > radius) {
      const err = new Error(`${seller.shopName || "Store"} does not deliver to your current location (Distance: ${distanceKm}km, Service Radius: ${radius}km)`);
      err.statusCode = 400;
      throw err;
    }
  }

  return distanceKm;
}

function sumField(rows, field) {
  return Number(
    rows.reduce((sum, row) => sum + Number(row?.[field] || 0), 0).toFixed(2),
  );
}

function round2(value) {
  return Number((Number(value || 0)).toFixed(2));
}

function buildAggregateBreakdown(sellerBreakdowns = []) {
  const aggregate = {
    currency: sellerBreakdowns[0]?.currency || "INR",
    productSubtotal: sumField(sellerBreakdowns, "productSubtotal"),
    deliveryFeeCharged: sumField(sellerBreakdowns, "deliveryFeeCharged"),
    handlingFeeCharged: sumField(sellerBreakdowns, "handlingFeeCharged"),
    packingFeeCharged: sumField(sellerBreakdowns, "packingFeeCharged"),
    tipTotal: sumField(sellerBreakdowns, "tipTotal"),
    discountTotal: sumField(sellerBreakdowns, "discountTotal"),
    taxTotal: sumField(sellerBreakdowns, "taxTotal"),
    cgstTotal: sumField(sellerBreakdowns, "cgstTotal"),
    sgstTotal: sumField(sellerBreakdowns, "sgstTotal"),
    igstTotal: sumField(sellerBreakdowns, "igstTotal"),
    taxJurisdiction: sellerBreakdowns[0]?.taxJurisdiction || null,
    customerSurchargeAmount: sumField(sellerBreakdowns, "customerSurchargeAmount"),
    customerSurchargeReason:
      sellerBreakdowns.find((row) => row?.customerSurchargeReason)?.customerSurchargeReason ||
      "",
    oddHourSurchargeAmount: sumField(sellerBreakdowns, "oddHourSurchargeAmount"),
    weatherSurchargeAmount: sumField(sellerBreakdowns, "weatherSurchargeAmount"),
    packagingChargeAmount: sumField(sellerBreakdowns, "packagingChargeAmount"),
    extraChargesTotal: sumField(sellerBreakdowns, "extraChargesTotal"),
    extraCharges: sellerBreakdowns.flatMap((row) =>
      Array.isArray(row.extraCharges) ? row.extraCharges : [],
    ),
    billingSource: sellerBreakdowns[0]?.billingSource || null,
    billingCityKey: sellerBreakdowns[0]?.billingCityKey || "",
    billingCityName: sellerBreakdowns[0]?.billingCityName || "",
    grandTotal: sumField(sellerBreakdowns, "grandTotal"),
    sellerPayoutTotal: sumField(sellerBreakdowns, "sellerPayoutTotal"),
    adminProductCommissionTotal: sumField(sellerBreakdowns, "adminProductCommissionTotal"),
    riderPayoutBase: sumField(sellerBreakdowns, "riderPayoutBase"),
    riderPayoutDistance: sumField(sellerBreakdowns, "riderPayoutDistance"),
    riderPayoutBonus: sumField(sellerBreakdowns, "riderPayoutBonus"),
    riderTipAmount: sumField(sellerBreakdowns, "riderTipAmount"),
    riderPayoutTotal: sumField(sellerBreakdowns, "riderPayoutTotal"),
    platformLogisticsMargin: sumField(sellerBreakdowns, "platformLogisticsMargin"),
    platformTotalEarning: sumField(sellerBreakdowns, "platformTotalEarning"),
    codCollectedAmount: sumField(sellerBreakdowns, "codCollectedAmount"),
    codRemittedAmount: sumField(sellerBreakdowns, "codRemittedAmount"),
    codPendingAmount: sumField(sellerBreakdowns, "codPendingAmount"),
    distanceKmActual: sumField(sellerBreakdowns, "distanceKmActual"),
    distanceKmRounded: sumField(sellerBreakdowns, "distanceKmRounded"),
    snapshots: {
      perSeller: sellerBreakdowns.map((row, index) => ({
        index,
        sellerId: row.sellerId,
        snapshots: row.snapshots || {},
      })),
      customerSurcharge: (() => {
        const amount = sumField(sellerBreakdowns, "customerSurchargeAmount");
        if (amount <= 0) return null;
        return {
          amount,
          reason:
            sellerBreakdowns.find((row) => row?.customerSurchargeReason)
              ?.customerSurchargeReason || "Additional charge",
        };
      })(),
    },
    lineItems: sellerBreakdowns.flatMap((row) =>
      (Array.isArray(row.lineItems) ? row.lineItems : []).map((lineItem) => ({
        ...lineItem,
        sellerId: row.sellerId,
      })),
    ),
  };
  return aggregate;
}

function allocateCheckoutTipToSellerBreakdowns(
  sellerBreakdownEntries = [],
  totalTipAmount = 0,
) {
  const normalizedTip = round2(totalTipAmount);
  if (!Number.isFinite(normalizedTip) || normalizedTip <= 0 || sellerBreakdownEntries.length === 0) {
    return;
  }

  const totalBase = sellerBreakdownEntries.reduce(
    (sum, entry) => sum + Number(entry?.breakdown?.grandTotal || 0),
    0,
  );

  let allocatedSoFar = 0;
  sellerBreakdownEntries.forEach((entry, index) => {
    const breakdown = entry?.breakdown;
    if (!breakdown) return;

    let allocatedTip = 0;
    if (index === sellerBreakdownEntries.length - 1) {
      allocatedTip = round2(normalizedTip - allocatedSoFar);
    } else if (totalBase > 0) {
      allocatedTip = round2(
        (Number(breakdown.grandTotal || 0) / totalBase) * normalizedTip,
      );
      allocatedSoFar = round2(allocatedSoFar + allocatedTip);
    }

    breakdown.tipTotal = round2(Number(breakdown.tipTotal || 0) + allocatedTip);
    breakdown.riderTipAmount = round2(
      Number(breakdown.riderTipAmount || 0) + allocatedTip,
    );
    breakdown.riderPayoutTotal = round2(
      Number(breakdown.riderPayoutTotal || 0) + allocatedTip,
    );
    breakdown.grandTotal = round2(Number(breakdown.grandTotal || 0) + allocatedTip);
  });
}

async function computeGlobalCategoryFeesForCheckout(hydratedItems = [], { session = null } = {}) {
  const categoryIds = Array.from(
    new Set(
      hydratedItems
        .flatMap((item) => [
          item?.headerCategoryId,
          item?.categoryId,
          item?.subcategoryId,
        ])
        .map((id) => String(id || ""))
        .filter(Boolean),
    ),
  );
  if (categoryIds.length === 0) {
    return {
      handlingFeeCharged: 0,
      handlingCategoryUsed: null,
      packingFeeCharged: 0,
      packingCategoryUsed: null,
    };
  }

  const categoryQuery = Category.find({ _id: { $in: categoryIds } })
    .select(
      "_id name type handlingFees handlingFeeType handlingFeeValue packingFees packingFeeType packingFeeValue",
    )
    .lean();
  if (session) categoryQuery.session(session);
  const categories = await categoryQuery;
  const categoryById = new Map(categories.map((category) => [String(category._id), category]));

  const handling = calculateHandlingFee(hydratedItems, {
    handlingFeeStrategy: HANDLING_FEE_STRATEGY.HIGHEST_CATEGORY_FEE,
    categoryById,
  });
  const packing = calculatePackingFee(hydratedItems, {
    packingFeeStrategy: HANDLING_FEE_STRATEGY.HIGHEST_CATEGORY_FEE,
    categoryById,
  });

  return {
    handlingFeeCharged: Number(handling.handlingFeeCharged || 0),
    handlingCategoryUsed: handling.handlingCategoryUsed || null,
    packingFeeCharged: Number(packing.packingFeeCharged || 0),
    packingCategoryUsed: packing.packingCategoryUsed || null,
  };
}

function pickSellerForCategoryFee(sellerBreakdownEntries = [], usedCategoryId = "") {
  const feeCategoryId = String(usedCategoryId || "");
  if (feeCategoryId) {
    for (const entry of sellerBreakdownEntries) {
      const entryItems = Array.isArray(entry?.items) ? entry.items : [];
      if (
        entryItems.some((item) => {
          const ids = [
            item?.resolvedHandlingCategoryId,
            item?.resolvedPackingCategoryId,
            item?.headerCategoryId,
            item?.categoryId,
            item?.subcategoryId,
          ].map((id) => String(id || ""));
          return ids.includes(feeCategoryId);
        })
      ) {
        return entry.sellerId;
      }
    }
  }
  return sellerBreakdownEntries[0]?.sellerId || null;
}

function applyGlobalCategoryFeesToSellerBreakdowns(
  sellerBreakdownEntries = [],
  globalFees = {
    handlingFeeCharged: 0,
    handlingCategoryUsed: null,
    packingFeeCharged: 0,
    packingCategoryUsed: null,
  },
) {
  if (!sellerBreakdownEntries.length) return;

  const handlingFee = Number(globalFees?.handlingFeeCharged || 0);
  const packingFee = Number(globalFees?.packingFeeCharged || 0);
  const hasHandling = Number.isFinite(handlingFee) && handlingFee > 0;
  const hasPacking = Number.isFinite(packingFee) && packingFee > 0;
  if (!hasHandling && !hasPacking) return;

  const handlingSellerId = hasHandling
    ? pickSellerForCategoryFee(
        sellerBreakdownEntries,
        globalFees?.handlingCategoryUsed?.categoryId ||
          globalFees?.handlingCategoryUsed?.headerCategoryId,
      )
    : null;
  const packingSellerId = hasPacking
    ? pickSellerForCategoryFee(
        sellerBreakdownEntries,
        globalFees?.packingCategoryUsed?.categoryId ||
          globalFees?.packingCategoryUsed?.headerCategoryId,
      )
    : null;

  for (const entry of sellerBreakdownEntries) {
    const breakdown = entry?.breakdown;
    if (!breakdown) continue;

    const handlingFeeCharged =
      hasHandling && handlingSellerId && entry.sellerId === handlingSellerId
        ? handlingFee
        : 0;
    const packingFeeCharged =
      hasPacking && packingSellerId && entry.sellerId === packingSellerId
        ? packingFee
        : 0;

    breakdown.handlingFeeCharged = handlingFeeCharged;
    breakdown.packingFeeCharged = packingFeeCharged;
    breakdown.snapshots =
      breakdown.snapshots && typeof breakdown.snapshots === "object"
        ? breakdown.snapshots
        : {};
    breakdown.snapshots.handlingFeeStrategy = HANDLING_FEE_STRATEGY.HIGHEST_CATEGORY_FEE;
    breakdown.snapshots.packingFeeStrategy = HANDLING_FEE_STRATEGY.HIGHEST_CATEGORY_FEE;
    breakdown.snapshots.handlingCategoryUsed =
      handlingFeeCharged > 0 ? globalFees.handlingCategoryUsed || {} : {};
    breakdown.snapshots.packingCategoryUsed =
      packingFeeCharged > 0 ? globalFees.packingCategoryUsed || {} : {};

    const productSubtotal = Number(breakdown.productSubtotal || 0);
    const deliveryFeeCharged = Number(breakdown.deliveryFeeCharged || 0);
    const discountTotal = Number(breakdown.discountTotal || 0);
    const taxTotal = Number(breakdown.taxTotal || 0);
    const packagingChargeAmount = Number(breakdown.packagingChargeAmount || 0);
    const riderPayoutTotal = Number(breakdown.riderPayoutTotal || 0);
    const adminProductCommissionTotal = Number(breakdown.adminProductCommissionTotal || 0);
    const tipTotal = Number(breakdown.tipTotal || 0);
    const customerSurchargeAmount = Number(breakdown.customerSurchargeAmount || 0);

    breakdown.grandTotal = round2(
      productSubtotal +
        deliveryFeeCharged +
        handlingFeeCharged +
        packingFeeCharged +
        packagingChargeAmount +
        tipTotal +
        customerSurchargeAmount -
        discountTotal +
        taxTotal,
    );
    if (entry.fulfillmentMethod === "seller_delivery") {
      // Seller self-delivers: delivery fee charged to customer belongs to seller
      breakdown.sellerPayoutTotal = round2(
        Number(breakdown.sellerPayoutTotal || 0) + deliveryFeeCharged,
      );
      breakdown.platformLogisticsMargin = round2(
        handlingFeeCharged + packingFeeCharged - riderPayoutTotal,
      );
    } else {
      breakdown.platformLogisticsMargin = round2(
        deliveryFeeCharged + handlingFeeCharged + packingFeeCharged - riderPayoutTotal,
      );
    }
    breakdown.platformTotalEarning = round2(
      adminProductCommissionTotal +
        breakdown.platformLogisticsMargin +
        customerSurchargeAmount,
    );
  }
}

function applyCustomerSurchargeToSellerBreakdowns(
  sellerBreakdownEntries = [],
  surcharge = { amount: 0, reason: "" },
) {
  const amount = round2(surcharge?.amount || 0);
  const reason = String(surcharge?.reason || "").trim();
  if (!Number.isFinite(amount) || amount <= 0 || sellerBreakdownEntries.length === 0) {
    for (const entry of sellerBreakdownEntries) {
      if (!entry?.breakdown) continue;
      entry.breakdown.customerSurchargeAmount = 0;
      entry.breakdown.customerSurchargeReason = "";
    }
    return;
  }

  // Charge once on the primary (first) seller order — customer pays once
  sellerBreakdownEntries.forEach((entry, index) => {
    const breakdown = entry?.breakdown;
    if (!breakdown) return;

    if (index === 0) {
      breakdown.customerSurchargeAmount = amount;
      breakdown.customerSurchargeReason = reason || "Additional charge";
      breakdown.grandTotal = round2(Number(breakdown.grandTotal || 0) + amount);
      breakdown.platformTotalEarning = round2(
        Number(breakdown.platformTotalEarning || 0) + amount,
      );
      breakdown.snapshots = {
        ...(breakdown.snapshots || {}),
        customerSurcharge: { amount, reason: breakdown.customerSurchargeReason },
      };
    } else {
      breakdown.customerSurchargeAmount = 0;
      breakdown.customerSurchargeReason = "";
    }
  });
}

/**
 * Odd-hour (time-window) and weather surcharges — like the legacy generic
 * surcharge, charged once across a multi-seller checkout (on the first
 * seller order), each with its own configurable platform/seller revenue split.
 */
function applyDistinctSurchargesToSellerBreakdowns(
  sellerBreakdownEntries = [],
  { oddHour, weather } = {},
) {
  const oddHourAmount = round2(oddHour?.amount || 0);
  const weatherAmount = round2(weather?.amount || 0);
  const oddHourSellerShare = oddHourAmount > 0
    ? round2((oddHourAmount * Number(oddHour?.revenueSplit?.seller ?? 0)) / 100)
    : 0;
  const weatherSellerShare = weatherAmount > 0
    ? round2((weatherAmount * Number(weather?.revenueSplit?.seller ?? 0)) / 100)
    : 0;
  const total = round2(oddHourAmount + weatherAmount);

  sellerBreakdownEntries.forEach((entry, index) => {
    const breakdown = entry?.breakdown;
    if (!breakdown) return;

    if (index === 0 && total > 0) {
      breakdown.oddHourSurchargeAmount = oddHourAmount;
      breakdown.weatherSurchargeAmount = weatherAmount;
      breakdown.grandTotal = round2(Number(breakdown.grandTotal || 0) + total);
      const sellerShare = round2(oddHourSellerShare + weatherSellerShare);
      const platformShare = round2(total - sellerShare);
      breakdown.sellerPayoutTotal = round2(Number(breakdown.sellerPayoutTotal || 0) + sellerShare);
      breakdown.platformTotalEarning = round2(
        Number(breakdown.platformTotalEarning || 0) + platformShare,
      );
      breakdown.snapshots = {
        ...(breakdown.snapshots || {}),
        oddHourSurcharge: oddHourAmount > 0 ? { amount: oddHourAmount, windowStart: oddHour.windowStart, windowEnd: oddHour.windowEnd } : null,
        weatherSurcharge: weatherAmount > 0 ? { amount: weatherAmount } : null,
      };
    } else {
      breakdown.oddHourSurchargeAmount = 0;
      breakdown.weatherSurchargeAmount = 0;
    }
  });
}

/**
 * City-billing extra charges. Each charge is evaluated against the
 * aggregate order (subtotal, payment method, fulfillment), then the
 * total sum lands on the primary (first) seller order alongside the
 * existing weather/odd-hour surcharge lines. Revenue is split per
 * charge.revenueType (platform/seller/rider/split).
 */
function evaluateExtraCharge(charge, ctx) {
  if (!charge || charge.enabled === false) return null;
  const {
    subtotalTotal,
    paymentMethod,
    hasDelivery,
  } = ctx;

  switch (charge.appliesTo) {
    case EXTRA_CHARGE_APPLIES_TO.COD:
      if (String(paymentMethod || "").toUpperCase() !== "COD") return null;
      break;
    case EXTRA_CHARGE_APPLIES_TO.ONLINE:
      if (String(paymentMethod || "").toUpperCase() !== "ONLINE") return null;
      break;
    case EXTRA_CHARGE_APPLIES_TO.DELIVERY:
      if (!hasDelivery) return null;
      break;
    case EXTRA_CHARGE_APPLIES_TO.MINIMUM_ORDER_VALUE:
      if (subtotalTotal < Number(charge.minimumOrderValue || 0)) return null;
      break;
    case EXTRA_CHARGE_APPLIES_TO.ALL_ORDERS:
    default:
      break;
  }
  if (
    charge.minimumOrderValue &&
    subtotalTotal < Number(charge.minimumOrderValue)
  ) {
    return null;
  }
  if (
    charge.maximumOrderValue &&
    subtotalTotal > Number(charge.maximumOrderValue)
  ) {
    return null;
  }

  const amount =
    charge.type === EXTRA_CHARGE_TYPE.PERCENTAGE
      ? round2((subtotalTotal * Number(charge.amount || 0)) / 100)
      : round2(charge.amount || 0);
  if (amount <= 0) return null;

  let platformShare = 0;
  let sellerShare = 0;
  let riderShare = 0;
  switch (charge.revenueType) {
    case EXTRA_CHARGE_REVENUE_TYPE.SELLER:
      sellerShare = amount;
      break;
    case EXTRA_CHARGE_REVENUE_TYPE.RIDER:
      riderShare = amount;
      break;
    case EXTRA_CHARGE_REVENUE_TYPE.SPLIT:
      platformShare = round2((amount * Number(charge.platformPercentage || 0)) / 100);
      sellerShare = round2((amount * Number(charge.sellerPercentage || 0)) / 100);
      riderShare = round2(amount - platformShare - sellerShare);
      break;
    case EXTRA_CHARGE_REVENUE_TYPE.PLATFORM:
    default:
      platformShare = amount;
      break;
  }

  return {
    name: charge.name,
    type: charge.type,
    amount,
    appliesTo: charge.appliesTo,
    revenueType: charge.revenueType,
    platformShare,
    sellerShare,
    riderShare,
  };
}

function applyExtraChargesToSellerBreakdowns(
  sellerBreakdownEntries = [],
  extraCharges = [],
  ctx = {},
) {
  for (const entry of sellerBreakdownEntries) {
    if (!entry?.breakdown) continue;
    entry.breakdown.extraCharges = [];
    entry.breakdown.extraChargesTotal = 0;
  }
  if (!Array.isArray(extraCharges) || extraCharges.length === 0) return;
  if (sellerBreakdownEntries.length === 0) return;

  const evaluated = extraCharges
    .map((charge) => evaluateExtraCharge(charge, ctx))
    .filter(Boolean);
  if (evaluated.length === 0) return;

  const totalAmount = round2(
    evaluated.reduce((sum, c) => sum + c.amount, 0),
  );
  const totalSellerShare = round2(
    evaluated.reduce((sum, c) => sum + c.sellerShare, 0),
  );
  const totalPlatformShare = round2(
    evaluated.reduce((sum, c) => sum + c.platformShare, 0),
  );
  const totalRiderShare = round2(
    evaluated.reduce((sum, c) => sum + c.riderShare, 0),
  );

  const primary = sellerBreakdownEntries[0].breakdown;
  primary.extraCharges = evaluated;
  primary.extraChargesTotal = totalAmount;
  primary.grandTotal = round2(Number(primary.grandTotal || 0) + totalAmount);
  if (totalSellerShare > 0) {
    primary.sellerPayoutTotal = round2(
      Number(primary.sellerPayoutTotal || 0) + totalSellerShare,
    );
  }
  if (totalRiderShare > 0) {
    primary.riderPayoutBonus = round2(
      Number(primary.riderPayoutBonus || 0) + totalRiderShare,
    );
    primary.riderPayoutTotal = round2(
      Number(primary.riderPayoutTotal || 0) + totalRiderShare,
    );
  }
  if (totalPlatformShare > 0) {
    primary.platformTotalEarning = round2(
      Number(primary.platformTotalEarning || 0) + totalPlatformShare,
    );
  }
  primary.snapshots = {
    ...(primary.snapshots || {}),
    extraCharges: evaluated,
  };
}

function stampCityBillingOnPrimarySeller(sellerBreakdownEntries, cityMeta, cityConfigSnapshot) {
  if (sellerBreakdownEntries.length === 0) return;
  const primary = sellerBreakdownEntries[0].breakdown;
  primary.billingSource = cityMeta.source;
  primary.billingCityKey = cityMeta.cityKey;
  primary.billingCityName = cityMeta.cityName;
  primary.snapshots = {
    ...(primary.snapshots || {}),
    cityBillingConfig: cityConfigSnapshot,
  };
  for (let i = 1; i < sellerBreakdownEntries.length; i += 1) {
    const b = sellerBreakdownEntries[i].breakdown;
    if (!b) continue;
    b.billingSource = cityMeta.source;
    b.billingCityKey = cityMeta.cityKey;
    b.billingCityName = cityMeta.cityName;
  }
}

export async function buildCheckoutPricingSnapshot({
  orderItems = [],
  address = {},
  tipAmount = 0,
  discountTotal = 0,
  freeDelivery = false,
  session = null,
  fulfillmentMethod = null,
  fulfillmentMethodBySeller = null,
  orderPlacedAt = new Date(),
  // Payment method drives per-city extra-charge applicability
  // (appliesTo: cod/online). Optional — omitted callers get no
  // cod/online-conditional charges applied.
  paymentMethod = null,
  // Real customer checkout must always keep this true — it forces every line
  // to price off the live product record, ignoring any price the caller
  // supplied. Only a privileged, already-authorized flow (e.g. a seller's own
  // manual order-price adjustment) should ever pass false, since that's what
  // lets a caller-supplied item.price through.
  enforceServerPricing = true,
}) {
  const hydratedItems = await hydrateOrderItems(orderItems, {
    session,
    enforceServerPricing,
  });
  if (!hydratedItems.length) {
    const err = new Error("Cannot checkout with empty cart");
    err.statusCode = 400;
    throw err;
  }

  const itemsBySeller = groupHydratedItemsBySeller(hydratedItems);
  const sellerIds = Array.from(itemsBySeller.keys()).sort((a, b) => a.localeCompare(b));
  const sellerBreakdownEntries = [];

  const [globalCategoryFees, financeSettings, cityBilling] = await Promise.all([
    computeGlobalCategoryFeesForCheckout(hydratedItems, { session }),
    getOrCreateFinanceSettings({ session }),
    resolveCityBillingConfig({ address, session }),
  ]);

  // effectiveSettings merges the customer's city overrides on top of the
  // global Setting doc. Every downstream reader (delivery calc, weather
  // /odd-hour applier, free-delivery threshold) reads from this so a
  // city configuration for Indore actually reshapes Indore checkouts,
  // while cities with no config keep the global defaults verbatim.
  const effectiveSettings = cityBilling.deliverySettings;

  // Pre-compute each seller's subtotal for proportional discount distribution
  const sellerSubtotals = new Map();
  let totalSubtotal = 0;
  for (const sellerId of sellerIds) {
    const items = itemsBySeller.get(sellerId) || [];
    const subtotal = items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
    sellerSubtotals.set(sellerId, subtotal);
    totalSubtotal += subtotal;
  }

  for (const sellerId of sellerIds) {
    const sellerItems = itemsBySeller.get(sellerId) || [];
    const sellerFulfillmentEntry =
      fulfillmentMethodBySeller?.[sellerId] ||
      fulfillmentMethodBySeller?.[String(sellerId)] ||
      null;
    const sellerFulfillmentMethod =
      (typeof sellerFulfillmentEntry === "object" && sellerFulfillmentEntry
        ? sellerFulfillmentEntry.fulfillmentMethod
        : sellerFulfillmentEntry) ||
      fulfillmentMethod ||
      FULFILLMENT_METHOD.PLATFORM_LOGISTICS;
    const isCustomerPickup =
      sellerFulfillmentMethod === FULFILLMENT_METHOD.CUSTOMER_PICKUP;

    const distanceKm = isCustomerPickup
      ? 0
      : await computeDistanceKmForSeller({
          sellerId,
          addressLocation: address?.location,
          session,
          skipRadiusCheck: isCustomerPickup,
        });
    // Distribute discount proportionally by seller subtotal
    const sellerRatio = totalSubtotal > 0 ? (sellerSubtotals.get(sellerId) || 0) / totalSubtotal : 1 / sellerIds.length;
    const sellerDiscount = round2(discountTotal * sellerRatio);
    const breakdown = await generateOrderPaymentBreakdown({
      preHydratedItems: sellerItems,
      distanceKm: isCustomerPickup ? 0 : distanceKm,
      discountTotal: sellerDiscount,
      customerState: address?.state || "",
      orderPlacedAt,
      session,
      deliverySettings: effectiveSettings,
      skipDeliveryFee:
        isCustomerPickup ||
        Boolean(freeDelivery) ||
        (Number(effectiveSettings.freeDeliveryThreshold) > 0 &&
          totalSubtotal >= Number(effectiveSettings.freeDeliveryThreshold)),
      includeCustomerSurcharge: false,
    });
    sellerBreakdownEntries.push({
      sellerId,
      distanceKm,
      fulfillmentMethod: sellerFulfillmentMethod,
      items: sellerItems,
      breakdown: {
        ...breakdown,
        sellerId,
      },
    });
  }

  applyGlobalCategoryFeesToSellerBreakdowns(sellerBreakdownEntries, globalCategoryFees);
  allocateCheckoutTipToSellerBreakdowns(sellerBreakdownEntries, tipAmount);
  {
    // The admin-configured flat platform fee (always-on) and the optional
    // toggled customer surcharge both land on the customer as one combined,
    // non-seller-paid line — they share the same breakdown fields/reason so
    // invoices and order screens don't need a second charge type to display.
    // Platform fee stays global (not city-scoped in this slice); the legacy
    // customerSurcharge is untouched here so migrated cities keep working.
    const flatPlatformFee = Number(financeSettings.platformFee || 0);
    const toggledSurcharge = financeSettings.customerSurchargeEnabled
      ? Number(financeSettings.customerSurchargeAmount || 0)
      : 0;
    const reasonParts = [];
    if (flatPlatformFee > 0) reasonParts.push("Platform fee");
    if (toggledSurcharge > 0 && financeSettings.customerSurchargeReason) {
      reasonParts.push(financeSettings.customerSurchargeReason);
    }
    applyCustomerSurchargeToSellerBreakdowns(sellerBreakdownEntries, {
      amount: flatPlatformFee + toggledSurcharge,
      reason: reasonParts.join(" + "),
    });
  }
  // Odd-hour + weather now read from `effectiveSettings`, so a city with
  // its own weather charge activated overrides the global weather block,
  // while cities without one still see the global value.
  const oddHourActive =
    effectiveSettings.oddHourSurcharge?.enabled &&
    Number(effectiveSettings.oddHourSurcharge?.amount || 0) > 0 &&
    isWithinOddHourWindow(
      orderPlacedAt,
      effectiveSettings.oddHourSurcharge?.windowStart,
      effectiveSettings.oddHourSurcharge?.windowEnd,
    );
  applyDistinctSurchargesToSellerBreakdowns(sellerBreakdownEntries, {
    oddHour: {
      amount: oddHourActive ? effectiveSettings.oddHourSurcharge.amount : 0,
      windowStart: effectiveSettings.oddHourSurcharge?.windowStart,
      windowEnd: effectiveSettings.oddHourSurcharge?.windowEnd,
      revenueSplit: effectiveSettings.oddHourSurcharge?.revenueSplit,
    },
    weather: {
      amount: effectiveSettings.weatherSurcharge?.enabled
        ? Number(effectiveSettings.weatherSurcharge?.amount || 0)
        : 0,
      revenueSplit: effectiveSettings.weatherSurcharge?.revenueSplit,
    },
  });

  // Per-city extra charges (city-level rules only; the global Setting has
  // no equivalent). Filtered by paymentMethod / fulfillment / subtotal.
  const subtotalTotal = sellerBreakdownEntries.reduce(
    (sum, e) => sum + Number(e?.breakdown?.productSubtotal || 0),
    0,
  );
  const hasDelivery = sellerBreakdownEntries.some(
    (e) => Number(e?.breakdown?.deliveryFeeCharged || 0) > 0,
  );
  applyExtraChargesToSellerBreakdowns(
    sellerBreakdownEntries,
    cityBilling.extraCharges,
    { subtotalTotal, paymentMethod, hasDelivery },
  );

  // Freeze the city billing snapshot onto the primary seller's breakdown
  // so orderPlacementService's later save persists it into paymentBreakdown
  // + pricingSnapshot.snapshots.cityBillingConfig verbatim.
  stampCityBillingOnPrimarySeller(
    sellerBreakdownEntries,
    cityBilling.meta,
    cityBilling.meta.source === BILLING_SOURCE.CITY
      ? {
          cityKey: cityBilling.meta.cityKey,
          cityName: cityBilling.meta.cityName,
          state: cityBilling.meta.state,
          cityConfigId: cityBilling.meta.cityConfigId,
          deliverySettings: effectiveSettings,
          extraChargesConfigured: cityBilling.extraCharges,
        }
      : null,
  );

  const aggregateBreakdown = buildAggregateBreakdown(
    sellerBreakdownEntries.map((entry) => entry.breakdown),
  );

  return {
    hydratedItems,
    sellerBreakdownEntries,
    aggregateBreakdown,
    sellerCount: sellerBreakdownEntries.length,
    itemCount: hydratedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
  };
}

export default {
  buildCheckoutPricingSnapshot,
  groupHydratedItemsBySeller,
};
