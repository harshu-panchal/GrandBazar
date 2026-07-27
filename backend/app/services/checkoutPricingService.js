import Store from "../models/store.js";
import Category from "../models/category.js";
import { distanceMeters } from "../utils/geoUtils.js";
import { HANDLING_FEE_STRATEGY } from "../constants/finance.js";
import {
  calculateHandlingFee,
  calculatePackingFee,
  generateOrderPaymentBreakdown,
  hydrateOrderItems,
} from "./finance/pricingService.js";
import { getOrCreateFinanceSettings } from "./finance/financeSettingsService.js";
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
    customerSurchargeAmount: sumField(sellerBreakdowns, "customerSurchargeAmount"),
    customerSurchargeReason:
      sellerBreakdowns.find((row) => row?.customerSurchargeReason)?.customerSurchargeReason ||
      "",
    packagingChargeAmount: sumField(sellerBreakdowns, "packagingChargeAmount"),
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
    breakdown.platformLogisticsMargin = round2(
      deliveryFeeCharged + handlingFeeCharged + packingFeeCharged - riderPayoutTotal,
    );
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

export async function buildCheckoutPricingSnapshot({
  orderItems = [],
  address = {},
  tipAmount = 0,
  discountTotal = 0,
  freeDelivery = false,
  session = null,
  fulfillmentMethod = null,
  fulfillmentMethodBySeller = null,
}) {
  const hydratedItems = await hydrateOrderItems(orderItems, {
    session,
    enforceServerPricing: true,
  });
  if (!hydratedItems.length) {
    const err = new Error("Cannot checkout with empty cart");
    err.statusCode = 400;
    throw err;
  }

  const itemsBySeller = groupHydratedItemsBySeller(hydratedItems);
  const sellerIds = Array.from(itemsBySeller.keys()).sort((a, b) => a.localeCompare(b));
  const sellerBreakdownEntries = [];

  const [globalCategoryFees, financeSettings] = await Promise.all([
    computeGlobalCategoryFeesForCheckout(hydratedItems, { session }),
    getOrCreateFinanceSettings({ session }),
  ]);

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
      taxTotal: 0,
      session,
      skipDeliveryFee: isCustomerPickup || Boolean(freeDelivery),
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
  applyCustomerSurchargeToSellerBreakdowns(sellerBreakdownEntries, {
    amount:
      financeSettings.customerSurchargeEnabled
        ? Number(financeSettings.customerSurchargeAmount || 0)
        : 0,
    reason: financeSettings.customerSurchargeReason || "",
  });

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
