import Order from "../../models/order.js";
import Wallet from "../../models/wallet.js";
import { OWNER_TYPE } from "../../constants/finance.js";
import { roundCurrency } from "../../utils/money.js";
import { normalizeCityKey } from "../cityCommissionService.js";

const DEFAULT_RANGE_DAYS = 90;
const MAX_LIMIT = 100;

function resolveDateRange({ from, to } = {}) {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from
    ? new Date(from)
    : new Date(toDate.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
  return { fromDate, toDate };
}

// Delivered, non-cancelled orders only — mirrors the same match shape
// walletService.getAdminFinanceSummary uses for its "Total Admin Earning"
// aggregate (status:"delivered", both status/orderStatus checked against
// "cancelled" since both fields exist on legacy vs newer order docs), so
// this breakdown stays consistent with the headline number it decomposes.
function baseMatch({ fromDate, toDate }) {
  return {
    status: "delivered",
    orderStatus: { $ne: "cancelled" },
    createdAt: { $gte: fromDate, $lte: toDate },
  };
}

async function getProductOrCategoryBreakdown({ dimension, fromDate, toDate, limit }) {
  const groupField =
    dimension === "category"
      ? "$paymentBreakdown.lineItems.appliedCommissionCategoryId"
      : "$paymentBreakdown.lineItems.productId";
  const nameField =
    dimension === "category"
      ? "$paymentBreakdown.lineItems.appliedCommissionCategoryName"
      : "$paymentBreakdown.lineItems.productName";

  const [result] = await Order.aggregate([
    { $match: baseMatch({ fromDate, toDate }) },
    { $unwind: "$paymentBreakdown.lineItems" },
    {
      $facet: {
        items: [
          {
            $group: {
              _id: groupField,
              name: { $first: nameField },
              commission: { $sum: { $ifNull: ["$paymentBreakdown.lineItems.adminProductCommission", 0] } },
              sellerPayout: { $sum: { $ifNull: ["$paymentBreakdown.lineItems.sellerPayout", 0] } },
              itemSubtotal: { $sum: { $ifNull: ["$paymentBreakdown.lineItems.itemSubtotal", 0] } },
              orderCount: { $addToSet: "$_id" },
            },
          },
          { $addFields: { orderCount: { $size: "$orderCount" } } },
          { $sort: { commission: -1 } },
          { $limit: limit },
        ],
        totals: [
          {
            $group: {
              _id: null,
              commission: { $sum: { $ifNull: ["$paymentBreakdown.lineItems.adminProductCommission", 0] } },
              sellerPayout: { $sum: { $ifNull: ["$paymentBreakdown.lineItems.sellerPayout", 0] } },
              itemSubtotal: { $sum: { $ifNull: ["$paymentBreakdown.lineItems.itemSubtotal", 0] } },
              lineCount: { $sum: 1 },
            },
          },
        ],
      },
    },
  ]);

  const items = (result?.items || []).map((row) => ({
    id: row._id ? String(row._id) : null,
    // A line's resolved commission can fall back to the shop/city level with
    // no specific category actually applying — surface that explicitly
    // rather than silently dropping the line from the breakdown.
    name: row.name || (dimension === "category" ? "No category-level commission (shop/city default)" : "Unknown product"),
    commission: roundCurrency(row.commission),
    sellerPayout: roundCurrency(row.sellerPayout),
    itemSubtotal: roundCurrency(row.itemSubtotal),
    orderCount: row.orderCount,
  }));

  const totalsRow = result?.totals?.[0] || {};
  return {
    dimension,
    items,
    totals: {
      commission: roundCurrency(totalsRow.commission || 0),
      sellerPayout: roundCurrency(totalsRow.sellerPayout || 0),
      itemSubtotal: roundCurrency(totalsRow.itemSubtotal || 0),
      lineCount: totalsRow.lineCount || 0,
    },
  };
}

async function getShopBreakdown({ fromDate, toDate, limit }) {
  const [result] = await Order.aggregate([
    { $match: baseMatch({ fromDate, toDate }) },
    {
      $facet: {
        items: [
          {
            $group: {
              _id: "$seller",
              commission: { $sum: { $ifNull: ["$paymentBreakdown.adminProductCommissionTotal", 0] } },
              sellerPayout: { $sum: { $ifNull: ["$paymentBreakdown.sellerPayoutTotal", 0] } },
              platformEarning: { $sum: { $ifNull: ["$paymentBreakdown.platformTotalEarning", 0] } },
              orderCount: { $sum: 1 },
            },
          },
          { $sort: { commission: -1 } },
          { $limit: limit },
          {
            $lookup: {
              from: "stores",
              localField: "_id",
              foreignField: "_id",
              as: "store",
            },
          },
          { $unwind: { path: "$store", preserveNullAndEmptyArrays: true } },
        ],
        totals: [
          {
            $group: {
              _id: null,
              commission: { $sum: { $ifNull: ["$paymentBreakdown.adminProductCommissionTotal", 0] } },
              sellerPayout: { $sum: { $ifNull: ["$paymentBreakdown.sellerPayoutTotal", 0] } },
              platformEarning: { $sum: { $ifNull: ["$paymentBreakdown.platformTotalEarning", 0] } },
              orderCount: { $sum: 1 },
            },
          },
        ],
      },
    },
  ]);

  const items = (result?.items || []).map((row) => ({
    id: row._id ? String(row._id) : null,
    name: row.store?.shopName || "Unknown shop",
    commission: roundCurrency(row.commission),
    sellerPayout: roundCurrency(row.sellerPayout),
    platformEarning: roundCurrency(row.platformEarning),
    orderCount: row.orderCount,
  }));

  const totalsRow = result?.totals?.[0] || {};
  return {
    dimension: "shop",
    items,
    totals: {
      commission: roundCurrency(totalsRow.commission || 0),
      sellerPayout: roundCurrency(totalsRow.sellerPayout || 0),
      platformEarning: roundCurrency(totalsRow.platformEarning || 0),
      orderCount: totalsRow.orderCount || 0,
    },
  };
}

async function getCityBreakdown({ fromDate, toDate, limit }) {
  // City-level commission config (CityCommission) is keyed by normalizeCityKey,
  // and pricingService resolves a seller's city commission the same way — so
  // this groups by the SELLER's store city, not the delivery address, to stay
  // consistent with what "city" means for commission purposes elsewhere.
  // normalizeCityKey does regex/casing normalization that isn't reproducible
  // as a Mongo aggregation expression, so raw city strings are grouped in the
  // pipeline and merged by normalized key afterward in JS.
  const rows = await Order.aggregate([
    { $match: baseMatch({ fromDate, toDate }) },
    {
      $lookup: {
        from: "stores",
        localField: "seller",
        foreignField: "_id",
        as: "storeInfo",
      },
    },
    { $unwind: { path: "$storeInfo", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { $ifNull: ["$storeInfo.city", ""] },
        commission: { $sum: { $ifNull: ["$paymentBreakdown.adminProductCommissionTotal", 0] } },
        sellerPayout: { $sum: { $ifNull: ["$paymentBreakdown.sellerPayoutTotal", 0] } },
        platformEarning: { $sum: { $ifNull: ["$paymentBreakdown.platformTotalEarning", 0] } },
        orderCount: { $sum: 1 },
      },
    },
  ]);

  const merged = new Map();
  for (const row of rows) {
    const rawCity = row._id || "";
    const key = normalizeCityKey(rawCity) || "unknown";
    const existing = merged.get(key) || {
      id: key,
      name: rawCity || "Unknown city",
      commission: 0,
      sellerPayout: 0,
      platformEarning: 0,
      orderCount: 0,
    };
    existing.commission += row.commission || 0;
    existing.sellerPayout += row.sellerPayout || 0;
    existing.platformEarning += row.platformEarning || 0;
    existing.orderCount += row.orderCount || 0;
    // Prefer a non-empty display name once merged (raw casing varies).
    if (rawCity && existing.name === "Unknown city") existing.name = rawCity;
    merged.set(key, existing);
  }

  const allItems = Array.from(merged.values())
    .map((row) => ({
      ...row,
      commission: roundCurrency(row.commission),
      sellerPayout: roundCurrency(row.sellerPayout),
      platformEarning: roundCurrency(row.platformEarning),
    }))
    .sort((a, b) => b.commission - a.commission);

  const totals = allItems.reduce(
    (acc, row) => ({
      commission: roundCurrency(acc.commission + row.commission),
      sellerPayout: roundCurrency(acc.sellerPayout + row.sellerPayout),
      platformEarning: roundCurrency(acc.platformEarning + row.platformEarning),
      orderCount: acc.orderCount + row.orderCount,
    }),
    { commission: 0, sellerPayout: 0, platformEarning: 0, orderCount: 0 },
  );

  return { dimension: "city", items: allItems.slice(0, limit), totals };
}

export async function getEarningsBreakdown({ dimension, from, to, limit = 20 } = {}) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), MAX_LIMIT);
  const { fromDate, toDate } = resolveDateRange({ from, to });

  if (dimension === "product" || dimension === "category") {
    return getProductOrCategoryBreakdown({ dimension, fromDate, toDate, limit: safeLimit });
  }
  if (dimension === "shop") {
    return getShopBreakdown({ fromDate, toDate, limit: safeLimit });
  }
  if (dimension === "city") {
    return getCityBreakdown({ fromDate, toDate, limit: safeLimit });
  }
  const err = new Error("dimension must be one of: product, category, shop, city");
  err.statusCode = 400;
  throw err;
}

// "Platform's cut of delivery earnings" — the one target-list item with no
// existing view anywhere: DeliveryFunds/CashCollection track rider payouts
// and cash-in-hand, but nothing shows what the platform keeps from delivery
// fees (paymentBreakdown.platformLogisticsMargin = delivery fee + handling
// fee + non-product-attributed packing fee, minus rider base/distance/bonus
// pay — already computed per-order by pricingService, just never aggregated
// or surfaced before).
export async function getDeliveryEarningsSummary({ from, to } = {}) {
  const { fromDate, toDate } = resolveDateRange({ from, to });

  const [orderTotals, walletTotals] = await Promise.all([
    Order.aggregate([
      { $match: baseMatch({ fromDate, toDate }) },
      {
        $group: {
          _id: "$paymentMode",
          riderEarnings: { $sum: { $ifNull: ["$paymentBreakdown.riderPayoutTotal", 0] } },
          platformLogisticsMargin: { $sum: { $ifNull: ["$paymentBreakdown.platformLogisticsMargin", 0] } },
          deliveryFeeCollected: { $sum: { $ifNull: ["$paymentBreakdown.deliveryFeeCharged", 0] } },
          orderCount: { $sum: 1 },
        },
      },
    ]),
    Wallet.aggregate([
      { $match: { ownerType: OWNER_TYPE.DELIVERY_PARTNER } },
      {
        $group: {
          _id: null,
          totalAvailable: { $sum: { $ifNull: ["$availableBalance", 0] } },
          totalPending: { $sum: { $ifNull: ["$pendingBalance", 0] } },
          totalCashInHand: { $sum: { $ifNull: ["$cashInHand", 0] } },
          riderCount: { $sum: 1 },
        },
      },
    ]),
  ]);

  const byMode = { ONLINE: {}, COD: {} };
  let riderEarnings = 0;
  let platformLogisticsMargin = 0;
  let deliveryFeeCollected = 0;
  let orderCount = 0;
  for (const row of orderTotals) {
    const mode = row._id === "ONLINE" ? "ONLINE" : "COD";
    byMode[mode] = {
      riderEarnings: roundCurrency(row.riderEarnings),
      platformLogisticsMargin: roundCurrency(row.platformLogisticsMargin),
      deliveryFeeCollected: roundCurrency(row.deliveryFeeCollected),
      orderCount: row.orderCount,
    };
    riderEarnings += row.riderEarnings || 0;
    platformLogisticsMargin += row.platformLogisticsMargin || 0;
    deliveryFeeCollected += row.deliveryFeeCollected || 0;
    orderCount += row.orderCount || 0;
  }

  const wallet = walletTotals[0] || {};
  return {
    range: { from: fromDate, to: toDate },
    riderEarnings: roundCurrency(riderEarnings),
    platformLogisticsMargin: roundCurrency(platformLogisticsMargin),
    deliveryFeeCollected: roundCurrency(deliveryFeeCollected),
    orderCount,
    byPaymentMode: byMode,
    riderWallets: {
      totalAvailable: roundCurrency(wallet.totalAvailable || 0),
      totalPending: roundCurrency(wallet.totalPending || 0),
      totalCashInHand: roundCurrency(wallet.totalCashInHand || 0),
      riderCount: wallet.riderCount || 0,
    },
  };
}

export async function getSellerEarningsSummary({ from, to, limit = 20 } = {}) {
  const [shopBreakdown, walletTotals] = await Promise.all([
    getEarningsBreakdown({ dimension: "shop", from, to, limit }),
    Wallet.aggregate([
      { $match: { ownerType: OWNER_TYPE.SELLER } },
      {
        $group: {
          _id: null,
          totalAvailable: { $sum: { $ifNull: ["$availableBalance", 0] } },
          totalPending: { $sum: { $ifNull: ["$pendingBalance", 0] } },
          sellerCount: { $sum: 1 },
        },
      },
    ]),
  ]);

  const wallet = walletTotals[0] || {};
  return {
    topSellers: shopBreakdown.items,
    totals: shopBreakdown.totals,
    sellerWallets: {
      totalAvailable: roundCurrency(wallet.totalAvailable || 0),
      totalPending: roundCurrency(wallet.totalPending || 0),
      sellerCount: wallet.sellerCount || 0,
    },
  };
}
