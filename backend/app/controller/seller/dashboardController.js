import mongoose from "mongoose";
import Order from "../../models/order.js";
import Product from "../../models/product.js";
import Review from "../../models/review.js";
import Wallet from "../../models/wallet.js";
import Store from "../../models/store.js";
import Seller from "../../models/seller.js";
import User from "../../models/customer.js";
import RewardGrant from "../../modules/rewards/models/rewardGrant.model.js";
import handleResponse from "../../utils/helper.js";
import {
  WORKFLOW_STATUS,
  workflowFromLegacyStatus,
} from "../../constants/orderWorkflow.js";

/* ---------------------------------------------------------------
   Helpers
---------------------------------------------------------------- */

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const addDays = (d, days) => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

const startOfMonth = (d = new Date()) => {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
};

const round1 = (n) => Math.round(Number(n || 0) * 10) / 10;

/** % change between current and previous, null when both are 0 */
const pctChange = (current, prev) => {
  const c = Number(current || 0);
  const p = Number(prev || 0);
  if (p === 0) return c > 0 ? 100 : null;
  return round1(((c - p) / p) * 100);
};

const NON_CANCELLED = { status: { $ne: "cancelled" } };

const PRICING_TOTAL = { $ifNull: ["$pricing.total", 0] };
const SELLER_PAYOUT = { $ifNull: ["$paymentBreakdown.sellerPayoutTotal", 0] };
/** Revenue expression: prefer finance snapshot grandTotal, fall back to pricing.total */
const REVENUE_EXPR = {
  $cond: [
    { $gt: [{ $ifNull: ["$paymentBreakdown.grandTotal", 0] }, 0] },
    "$paymentBreakdown.grandTotal",
    PRICING_TOTAL,
  ],
};

const PENDING_MATCH = {
  $or: [
    { workflowStatus: { $in: [WORKFLOW_STATUS.CREATED, WORKFLOW_STATUS.SELLER_PENDING] } },
    { workflowStatus: { $in: [null] }, status: "pending" },
  ],
};

/** Map a workflow status to one of the six dashboard buckets */
const bucketForWorkflow = (ws) => {
  switch (ws) {
    case WORKFLOW_STATUS.CREATED:
    case WORKFLOW_STATUS.SELLER_PENDING:
    case WORKFLOW_STATUS.PREORDER_HOLD:
      return "new";
    case WORKFLOW_STATUS.SELLER_ACCEPTED:
    case WORKFLOW_STATUS.SCHEDULED_HOLD:
    case WORKFLOW_STATUS.AWAITING_EXTRA_PAYMENT:
      return "accepted";
    case WORKFLOW_STATUS.DELIVERY_SEARCH:
    case WORKFLOW_STATUS.EXTERNAL_LOGISTICS_PENDING:
    case WORKFLOW_STATUS.DELIVERY_ASSIGNED:
    case WORKFLOW_STATUS.PICKUP_READY:
    case WORKFLOW_STATUS.CUSTOMER_PICKUP_READY:
      return "preparing";
    case WORKFLOW_STATUS.OUT_FOR_DELIVERY:
      return "outForDelivery";
    case WORKFLOW_STATUS.DELIVERED:
      return "delivered";
    case WORKFLOW_STATUS.CANCELLED:
    case WORKFLOW_STATUS.DISPUTED:
      return "cancelled";
    default:
      return "new";
  }
};

const dayLabel = (d) =>
  d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Build a zero-filled daily series between from (inclusive) and to (inclusive) */
const buildDailySeries = (from, to, rows, fields) => {
  const byDate = new Map(rows.map((r) => [r._id, r]));
  const series = [];
  for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const row = byDate.get(key) || {};
    const point = {
      name: dayLabel(d),
      day: DAY_NAMES[d.getDay()],
      date: key,
    };
    for (const f of fields) point[f] = Number(row[f] || 0);
    series.push(point);
  }
  return series;
};

/** Group-by-local-day expression (server timezone consistent with rest of codebase) */
const DAY_KEY = {
  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
};

/* ---------------------------------------------------------------
   Section builders
---------------------------------------------------------------- */

async function fetchOrderFacets(storeOid, { todayStart, yesterdayStart, weekAgo, twoWeeksAgo, monthStart, prevMonthStart, salesStart, revenueStart }) {
  const [result] = await Order.aggregate([
    { $match: { seller: storeOid } },
    {
      $facet: {
        todayMoney: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: todayStart } } },
          {
            $group: {
              _id: null,
              sales: { $sum: PRICING_TOTAL },
              orders: { $sum: 1 },
              profit: { $sum: SELLER_PAYOUT },
            },
          },
        ],
        yesterdayMoney: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: yesterdayStart, $lt: todayStart } } },
          {
            $group: {
              _id: null,
              sales: { $sum: PRICING_TOTAL },
              orders: { $sum: 1 },
              profit: { $sum: SELLER_PAYOUT },
            },
          },
        ],
        pendingNow: [{ $match: PENDING_MATCH }, { $count: "count" }],
        pendingCreatedToday: [
          { $match: { createdAt: { $gte: todayStart }, ...PENDING_MATCH } },
          { $count: "count" },
        ],
        statusToday: [
          { $match: { createdAt: { $gte: todayStart } } },
          {
            $group: {
              _id: { ws: "$workflowStatus", legacy: "$status" },
              count: { $sum: 1 },
            },
          },
        ],
        salesTrend: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: salesStart } } },
          {
            $group: {
              _id: DAY_KEY,
              sales: { $sum: PRICING_TOTAL },
              orders: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
        revenueProfitTrend: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: revenueStart } } },
          {
            $group: {
              _id: DAY_KEY,
              revenue: { $sum: PRICING_TOTAL },
              profit: { $sum: SELLER_PAYOUT },
            },
          },
          { $sort: { _id: 1 } },
        ],
        monthFinance: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: monthStart } } },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: REVENUE_EXPR },
              platformCommission: { $sum: { $ifNull: ["$paymentBreakdown.adminProductCommissionTotal", 0] } },
              deliveryCharges: { $sum: { $ifNull: ["$paymentBreakdown.deliveryFeeCharged", 0] } },
              taxes: { $sum: { $ifNull: ["$paymentBreakdown.taxTotal", 0] } },
              otherCharges: { $sum: { $ifNull: ["$paymentBreakdown.handlingFeeCharged", 0] } },
              netProfit: { $sum: SELLER_PAYOUT },
              orders: { $sum: 1 },
              couponDiscount: {
                $sum: {
                  $cond: [{ $ne: [{ $ifNull: ["$couponId", null] }, null] }, { $ifNull: ["$pricing.discount", 0] }, 0],
                },
              },
              couponOrders: {
                $sum: { $cond: [{ $ne: [{ $ifNull: ["$couponId", null] }, null] }, 1, 0] },
              },
              campaignSales: {
                $sum: {
                  $cond: [{ $ne: [{ $ifNull: ["$preOrderCampaign", null] }, null] }, PRICING_TOTAL, 0],
                },
              },
            },
          },
        ],
        monthCustomers: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: monthStart } } },
          { $group: { _id: "$customer", orders: { $sum: 1 }, spend: { $sum: PRICING_TOTAL } } },
        ],
        prevMonthCustomers: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: prevMonthStart, $lt: monthStart } } },
          { $group: { _id: "$customer", orders: { $sum: 1 } } },
        ],
        lifetimeCustomers: [
          { $match: NON_CANCELLED },
          {
            $group: {
              _id: "$customer",
              firstOrderAt: { $min: "$createdAt" },
              orders: { $sum: 1 },
              spend: { $sum: PRICING_TOTAL },
            },
          },
        ],
        topProductsMonth: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: monthStart } } },
          { $unwind: "$items" },
          {
            $group: {
              _id: "$items.product",
              name: { $first: "$items.name" },
              units: { $sum: { $ifNull: ["$items.quantity", 0] } },
              revenue: { $sum: { $multiply: [{ $ifNull: ["$items.price", 0] }, { $ifNull: ["$items.quantity", 0] }] } },
            },
          },
          { $sort: { revenue: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: "products",
              localField: "_id",
              foreignField: "_id",
              as: "product",
            },
          },
          {
            $project: {
              name: 1,
              units: 1,
              revenue: 1,
              image: { $arrayElemAt: ["$product.mainImage", 0] },
            },
          },
        ],
        productUnitsWeek: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: weekAgo } } },
          { $unwind: "$items" },
          {
            $group: {
              _id: "$items.product",
              name: { $first: "$items.name" },
              units: { $sum: { $ifNull: ["$items.quantity", 0] } },
            },
          },
        ],
        productUnitsPrevWeek: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: twoWeeksAgo, $lt: weekAgo } } },
          { $unwind: "$items" },
          { $group: { _id: "$items.product", units: { $sum: { $ifNull: ["$items.quantity", 0] } } } },
        ],
        weekMoney: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: weekAgo } } },
          { $group: { _id: null, sales: { $sum: PRICING_TOTAL } } },
        ],
        prevWeekMoney: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: twoWeeksAgo, $lt: weekAgo } } },
          { $group: { _id: null, sales: { $sum: PRICING_TOTAL } } },
        ],
        acceptanceMonth: [
          { $match: { createdAt: { $gte: monthStart } } },
          {
            $group: {
              _id: null,
              accepted: {
                $sum: { $cond: [{ $ne: [{ $ifNull: ["$sellerAcceptedAt", null] }, null] }, 1, 0] },
              },
              cancelledNotAccepted: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$status", "cancelled"] },
                        { $eq: [{ $ifNull: ["$sellerAcceptedAt", null] }, null] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ],
        responseTimeMonth: [
          {
            $match: {
              createdAt: { $gte: monthStart },
              sellerAcceptedAt: { $ne: null },
            },
          },
          {
            $group: {
              _id: null,
              avgMs: { $avg: { $subtract: ["$sellerAcceptedAt", "$createdAt"] } },
            },
          },
        ],
        deliverySlaMonth: [
          { $match: { createdAt: { $gte: monthStart }, status: "delivered" } },
          {
            $group: {
              _id: null,
              delivered: { $sum: 1 },
              problematic: {
                $sum: {
                  $cond: [
                    {
                      $or: [
                        { $eq: ["$workflowStatus", WORKFLOW_STATUS.DISPUTED] },
                        {
                          $and: [
                            { $ne: [{ $ifNull: ["$returnStatus", null] }, null] },
                            { $not: [{ $in: ["$returnStatus", ["none", "rejected", "cancelled"]] }] },
                          ],
                        },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ],
      },
    },
  ]);
  return result;
}

async function fetchInventory(storeOid, now) {
  const in30d = addDays(now, 30);
  const [row] = await Product.aggregate([
    { $match: { sellerId: storeOid } },
    {
      $group: {
        _id: null,
        totalProducts: { $sum: 1 },
        inStock: {
          $sum: { $cond: [{ $gt: ["$stock", { $ifNull: ["$lowStockAlert", 5] }] }, 1, 0] },
        },
        lowStock: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gt: ["$stock", 0] },
                  { $lte: ["$stock", { $ifNull: ["$lowStockAlert", 5] }] },
                ],
              },
              1,
              0,
            ],
          },
        },
        outOfStock: { $sum: { $cond: [{ $lte: [{ $ifNull: ["$stock", 0] }, 0] }, 1, 0] } },
        expiringSoon: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: [{ $ifNull: ["$expiryDate", null] }, null] },
                  { $gte: ["$expiryDate", now] },
                  { $lte: ["$expiryDate", in30d] },
                ],
              },
              1,
              0,
            ],
          },
        },
        inventoryValue: {
          $sum: {
            $multiply: [
              { $max: [{ $ifNull: ["$stock", 0] }, 0] },
              {
                $cond: [
                  { $gt: [{ $ifNull: ["$salePrice", 0] }, 0] },
                  "$salePrice",
                  { $ifNull: ["$price", 0] },
                ],
              },
            ],
          },
        },
      },
    },
  ]);
  return {
    totalProducts: row?.totalProducts || 0,
    inStock: row?.inStock || 0,
    lowStock: row?.lowStock || 0,
    outOfStock: row?.outOfStock || 0,
    expiringSoon: row?.expiringSoon || 0,
    inventoryValue: Math.round(row?.inventoryValue || 0),
  };
}

/** Average approved product review rating per store */
async function fetchStoreRatings(storeOids) {
  if (!storeOids.length) return new Map();
  const rows = await Review.aggregate([
    { $match: { status: "approved" } },
    {
      $lookup: {
        from: "products",
        localField: "productId",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
    { $match: { "product.sellerId": { $in: storeOids } } },
    {
      $group: {
        _id: "$product.sellerId",
        avgRating: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), { rating: round1(r.avgRating), count: r.count }]));
}

async function fetchMarketing(storeOid, monthStart) {
  const [grants] = await RewardGrant.aggregate([
    {
      $match: {
        sellerId: storeOid,
        createdAt: { $gte: monthStart },
        status: { $nin: ["cancelled", "reversed", "expired"] },
      },
    },
    {
      $group: {
        _id: null,
        cashbackIssued: {
          $sum: { $cond: [{ $eq: ["$campaignType", "cashback"] }, { $ifNull: ["$amount", 0] }, 0] },
        },
        referralSuccess: {
          $sum: { $cond: [{ $eq: ["$campaignType", "referral"] }, 1, 0] },
        },
      },
    },
  ]);
  return {
    cashbackIssued: Math.round(grants?.cashbackIssued || 0),
    referralSuccess: grants?.referralSuccess || 0,
  };
}

async function fetchShopPerformance(ownerId, activeStoreId, windows) {
  const stores = await Store.find({ ownerId })
    .select("shopName isActive isVerified applicationStatus city locality")
    .lean();
  if (!stores.length) return null;

  const storeOids = stores.map((s) => s._id);
  const { todayStart, weekAgo, twoWeeksAgo } = windows;

  const [facets] = await Order.aggregate([
    { $match: { seller: { $in: storeOids } } },
    {
      $facet: {
        todayByStore: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: todayStart } } },
          {
            $group: {
              _id: "$seller",
              sales: { $sum: PRICING_TOTAL },
              orders: { $sum: 1 },
              profit: { $sum: SELLER_PAYOUT },
            },
          },
        ],
        pendingByStore: [
          { $match: PENDING_MATCH },
          { $group: { _id: "$seller", pending: { $sum: 1 } } },
        ],
        weekByStore: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: weekAgo } } },
          { $group: { _id: "$seller", sales: { $sum: PRICING_TOTAL } } },
        ],
        prevWeekByStore: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: twoWeeksAgo, $lt: weekAgo } } },
          { $group: { _id: "$seller", sales: { $sum: PRICING_TOTAL } } },
        ],
      },
    },
  ]);

  const ratings = await fetchStoreRatings(storeOids);
  const byId = (rows) => new Map((rows || []).map((r) => [String(r._id), r]));
  const todayMap = byId(facets?.todayByStore);
  const pendingMap = byId(facets?.pendingByStore);
  const weekMap = byId(facets?.weekByStore);
  const prevWeekMap = byId(facets?.prevWeekByStore);

  const storeCards = stores.map((s) => {
    const key = String(s._id);
    const today = todayMap.get(key) || {};
    const growth = pctChange(weekMap.get(key)?.sales || 0, prevWeekMap.get(key)?.sales || 0);
    return {
      id: key,
      name: s.shopName,
      locality: s.locality || s.city || "",
      isActive: Boolean(s.isActive) && s.applicationStatus === "approved",
      isCurrent: key === String(activeStoreId),
      salesToday: Math.round(today.sales || 0),
      ordersToday: today.orders || 0,
      pending: pendingMap.get(key)?.pending || 0,
      rating: ratings.get(key)?.rating ?? null,
      growthPct: growth,
      profitToday: Math.round(today.profit || 0),
    };
  });

  const withSales = [...storeCards].sort((a, b) => b.salesToday - a.salesToday);
  const withGrowth = [...storeCards]
    .filter((s) => s.growthPct !== null)
    .sort((a, b) => b.growthPct - a.growthPct);

  const highlights = {
    bestPerforming: withSales[0]?.name || null,
    highestGrowth: withGrowth[0]?.name || null,
    lowestPerforming: withSales.length > 1 ? withSales[withSales.length - 1].name : null,
  };

  return { stores: storeCards, highlights };
}

/* ---------------------------------------------------------------
   Business Health Score (heuristic composite of real sub-metrics)
---------------------------------------------------------------- */

const scoreSalesGrowth = (pct) => {
  if (pct === null) return null;
  if (pct >= 20) return 100;
  if (pct >= 10) return 85;
  if (pct >= 0) return 70;
  if (pct >= -10) return 50;
  return 30;
};

const scoreResponseTime = (minutes) => {
  if (minutes === null) return null;
  if (minutes <= 2) return 100;
  if (minutes <= 5) return 85;
  if (minutes <= 15) return 70;
  if (minutes <= 60) return 50;
  return 30;
};

const healthLabel = (score) => {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Average";
  return "Needs Attention";
};

function buildHealthScore({ salesGrowthPct, avgRating, deliverySlaPct, stockAvailabilityPct, acceptancePct, responseMinutes }) {
  const metrics = [
    {
      key: "salesGrowth",
      label: "Sales Growth",
      display: salesGrowthPct === null ? "—" : `${salesGrowthPct > 0 ? "+" : ""}${salesGrowthPct}%`,
      score: scoreSalesGrowth(salesGrowthPct),
    },
    {
      key: "customerSatisfaction",
      label: "Customer Satisfaction",
      display: avgRating === null ? "—" : `${avgRating} ★`,
      score: avgRating === null ? null : Math.round((avgRating / 5) * 100),
    },
    {
      key: "deliverySla",
      label: "Delivery SLA",
      display: deliverySlaPct === null ? "—" : `${deliverySlaPct}%`,
      score: deliverySlaPct,
    },
    {
      key: "stockAvailability",
      label: "Stock Availability",
      display: stockAvailabilityPct === null ? "—" : `${stockAvailabilityPct}%`,
      score: stockAvailabilityPct,
    },
    {
      key: "orderAcceptance",
      label: "Order Acceptance",
      display: acceptancePct === null ? "—" : `${acceptancePct}%`,
      score: acceptancePct,
    },
    {
      key: "responseTime",
      label: "Response Time",
      display: responseMinutes === null ? "—" : `${responseMinutes} min`,
      score: scoreResponseTime(responseMinutes),
    },
  ];

  const scored = metrics.filter((m) => m.score !== null);
  const score = scored.length
    ? Math.round(scored.reduce((acc, m) => acc + m.score, 0) / scored.length)
    : null;

  return {
    score,
    label: score === null ? "No Data" : healthLabel(score),
    stars: score === null ? 0 : Math.max(1, Math.round(score / 20)),
    metrics,
  };
}

/* ---------------------------------------------------------------
   Rule-based recommendations (no LLM)
---------------------------------------------------------------- */

function buildRecommendations({ inventory, lowStockNames, risingProduct, returningPct, activeCustomers, pendingNow, subscriptionDaysRemaining }) {
  const recs = [];

  if (inventory.outOfStock > 0) {
    recs.push({
      severity: "critical",
      message: `${inventory.outOfStock} product${inventory.outOfStock === 1 ? " is" : "s are"} out of stock. Restock to avoid missed sales.`,
    });
  }
  if (risingProduct) {
    recs.push({
      severity: "info",
      message: `Increase stock for ${risingProduct.name}. Demand is up ${risingProduct.trend}% this week.`,
    });
  }
  if (inventory.lowStock > 0) {
    const names = lowStockNames.length ? ` (${lowStockNames.join(", ")})` : "";
    recs.push({
      severity: "warning",
      message: `You have ${inventory.lowStock} low stock product${inventory.lowStock === 1 ? "" : "s"}${names}. Please restock.`,
    });
  }
  if (pendingNow > 5) {
    recs.push({
      severity: "warning",
      message: `${pendingNow} orders are awaiting acceptance. Respond quickly to protect your acceptance rate.`,
    });
  }
  if (returningPct !== null && returningPct < 40 && activeCustomers >= 10) {
    recs.push({
      severity: "info",
      message: "Offer a 10% coupon or cashback to increase repeat orders.",
    });
  }
  if (subscriptionDaysRemaining !== null && subscriptionDaysRemaining <= 30) {
    recs.push({
      severity: subscriptionDaysRemaining <= 7 ? "critical" : "warning",
      message: `Renew your subscription in ${subscriptionDaysRemaining} day${subscriptionDaysRemaining === 1 ? "" : "s"} to avoid interruption.`,
    });
  }

  const order = { critical: 0, warning: 1, info: 2 };
  return recs.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 5);
}

/* ---------------------------------------------------------------
   GET /api/seller/dashboard
---------------------------------------------------------------- */

export const getSellerDashboard = async (req, res) => {
  try {
    const storeId = req.user.id;
    const storeOid = new mongoose.Types.ObjectId(String(storeId));
    const isOwner = !req.user.subSellerId;
    const ownerId = req.user.accountId || null;

    const salesRange = req.query.salesRange === "month" ? "month" : "week";
    const revenueRange = req.query.revenueRange === "week" ? "week" : "month";

    const now = new Date();
    const todayStart = startOfDay(now);
    const yesterdayStart = addDays(todayStart, -1);
    const weekAgo = addDays(todayStart, -6); // 7 calendar days incl. today
    const twoWeeksAgo = addDays(todayStart, -13);
    const monthStart = startOfMonth(now);
    const prevMonthStart = startOfMonth(addDays(monthStart, -1));
    const salesStart = salesRange === "month" ? addDays(todayStart, -29) : weekAgo;
    const revenueStart = revenueRange === "week" ? weekAgo : monthStart;

    const windows = { todayStart, yesterdayStart, weekAgo, twoWeeksAgo, monthStart, prevMonthStart, salesStart, revenueStart };

    // Optional sections must not take down the whole dashboard
    const safe = (promise, fallback = null) =>
      Promise.resolve(promise).catch((err) => {
        console.error("Seller dashboard section failed:", err.message);
        return fallback;
      });

    const [
      facets,
      inventory,
      ratingsMap,
      marketing,
      wallet,
      shopPerformance,
      staff,
      lowStockProducts,
      ownerDoc,
    ] = await Promise.all([
      fetchOrderFacets(storeOid, windows),
      safe(fetchInventory(storeOid, now), {
        totalProducts: 0, inStock: 0, lowStock: 0, outOfStock: 0, expiringSoon: 0, inventoryValue: 0,
      }),
      safe(fetchStoreRatings([storeOid]), new Map()),
      safe(fetchMarketing(storeOid, monthStart), { cashbackIssued: 0, referralSuccess: 0 }),
      safe(Wallet.findOne({ ownerType: "SELLER", ownerId: storeId }).lean()),
      isOwner && ownerId ? safe(fetchShopPerformance(ownerId, storeId, windows)) : Promise.resolve(null),
      isOwner
        ? safe(
            Seller.find({ accountType: "staff", parentId: storeOid })
              .select("name isActive createdAt")
              .lean(),
            [],
          )
        : Promise.resolve(null),
      safe(
        Product.find({
          sellerId: storeOid,
          stock: { $gt: 0 },
          $expr: { $lte: ["$stock", { $ifNull: ["$lowStockAlert", 5] }] },
        })
          .select("name")
          .limit(3)
          .lean(),
        [],
      ),
      isOwner && ownerId
        ? safe(Seller.findById(ownerId).select("businessModel").lean())
        : Promise.resolve(null),
    ]);

    /* ---------- KPIs ---------- */
    const today = facets.todayMoney[0] || { sales: 0, orders: 0, profit: 0 };
    const yesterday = facets.yesterdayMoney[0] || { sales: 0, orders: 0, profit: 0 };
    const todayAov = today.orders > 0 ? today.sales / today.orders : 0;
    const yesterdayAov = yesterday.orders > 0 ? yesterday.sales / yesterday.orders : 0;
    const pendingNow = facets.pendingNow[0]?.count || 0;

    const kpis = {
      todaySales: { value: Math.round(today.sales), trendPct: pctChange(today.sales, yesterday.sales) },
      todayOrders: { value: today.orders, trendPct: pctChange(today.orders, yesterday.orders) },
      avgOrderValue: { value: Math.round(todayAov), trendPct: pctChange(todayAov, yesterdayAov) },
      netProfit: { value: Math.round(today.profit), trendPct: pctChange(today.profit, yesterday.profit) },
      pendingOrders: { value: pendingNow, trendPct: null },
      walletBalance: { value: Math.round(wallet?.availableBalance || 0), pending: Math.round(wallet?.pendingBalance || 0) },
    };

    /* ---------- Order status donut (today) ---------- */
    const buckets = { new: 0, accepted: 0, preparing: 0, outForDelivery: 0, delivered: 0, cancelled: 0 };
    let statusTotal = 0;
    for (const row of facets.statusToday) {
      const ws = row._id.ws || workflowFromLegacyStatus(row._id.legacy);
      buckets[bucketForWorkflow(ws)] += row.count;
      statusTotal += row.count;
    }
    const orderStatus = {
      total: statusTotal,
      breakdown: [
        { key: "new", label: "New", count: buckets.new },
        { key: "accepted", label: "Accepted", count: buckets.accepted },
        { key: "preparing", label: "Preparing", count: buckets.preparing },
        { key: "outForDelivery", label: "Out for Delivery", count: buckets.outForDelivery },
        { key: "delivered", label: "Delivered", count: buckets.delivered },
        { key: "cancelled", label: "Cancelled", count: buckets.cancelled },
      ],
    };

    /* ---------- Charts ---------- */
    const salesOverview = {
      range: salesRange,
      data: buildDailySeries(salesStart, todayStart, facets.salesTrend, ["sales", "orders"]),
    };

    const revProfitSeries = buildDailySeries(revenueStart, todayStart, facets.revenueProfitTrend, ["revenue", "profit"]);
    const revenueVsProfit = {
      range: revenueRange,
      data: revProfitSeries,
      totalRevenue: Math.round(revProfitSeries.reduce((a, p) => a + p.revenue, 0)),
      totalProfit: Math.round(revProfitSeries.reduce((a, p) => a + p.profit, 0)),
    };

    /* ---------- Customers ---------- */
    const monthCustomers = facets.monthCustomers || [];
    const prevMonthCustomers = facets.prevMonthCustomers || [];
    const lifetime = facets.lifetimeCustomers || [];
    const lifetimeById = new Map(lifetime.map((c) => [String(c._id), c]));

    const activeCustomers = monthCustomers.length;
    let newCustomers = 0;
    let repeatCustomers = 0;
    for (const c of monthCustomers) {
      const life = lifetimeById.get(String(c._id));
      if (life && life.firstOrderAt >= monthStart) newCustomers += 1;
      if (life && life.orders > 1) repeatCustomers += 1;
    }
    let prevNewCustomers = 0;
    let prevRepeatCustomers = 0;
    for (const c of prevMonthCustomers) {
      const life = lifetimeById.get(String(c._id));
      if (life && life.firstOrderAt >= prevMonthStart && life.firstOrderAt < monthStart) prevNewCustomers += 1;
      if (life && life.orders > 1) prevRepeatCustomers += 1;
    }

    const returningPct = activeCustomers > 0 ? Math.round((repeatCustomers / activeCustomers) * 100) : null;
    const monthFinance = facets.monthFinance[0] || {};
    const monthOrders = monthFinance.orders || 0;
    const monthSales = monthCustomers.reduce((a, c) => a + c.spend, 0);
    const avgBasketSize = monthOrders > 0 ? Math.round(monthSales / monthOrders) : 0;

    let topCustomer = null;
    const topSpender = [...lifetime].sort((a, b) => b.spend - a.spend)[0];
    if (topSpender && topSpender._id) {
      const userDoc = await safe(User.findById(topSpender._id).select("name").lean());
      topCustomer = {
        name: userDoc?.name || "Customer",
        spend: Math.round(topSpender.spend),
      };
    }

    const customerOverview = {
      newCustomers: { value: newCustomers, trendPct: pctChange(newCustomers, prevNewCustomers) },
      repeatCustomers: { value: repeatCustomers, trendPct: pctChange(repeatCustomers, prevRepeatCustomers) },
      returningPct: { value: returningPct },
      avgBasketSize: { value: avgBasketSize },
      topCustomer,
    };

    /* ---------- Financial summary (this month) ---------- */
    const financialSummary = {
      totalRevenue: Math.round(monthFinance.totalRevenue || 0),
      platformCommission: Math.round(monthFinance.platformCommission || 0),
      deliveryCharges: Math.round(monthFinance.deliveryCharges || 0),
      taxes: Math.round(monthFinance.taxes || 0),
      otherCharges: Math.round(monthFinance.otherCharges || 0),
      netProfit: Math.round(monthFinance.netProfit || 0),
    };

    /* ---------- Marketing & rewards (this month) ---------- */
    const couponsRedeemed = Math.round(monthFinance.couponDiscount || 0);
    const campaignSales = Math.round(monthFinance.campaignSales || 0);
    const marketingSpend = (marketing?.cashbackIssued || 0) + couponsRedeemed;
    const marketingSection = {
      cashbackIssued: marketing?.cashbackIssued || 0,
      couponsRedeemed,
      couponOrders: monthFinance.couponOrders || 0,
      referralSuccess: marketing?.referralSuccess || 0,
      campaignSales,
      roi: marketingSpend > 0 ? round1(campaignSales / marketingSpend) : null,
    };

    /* ---------- Top products + rising product ---------- */
    const topProducts = (facets.topProductsMonth || []).map((p) => ({
      id: p._id,
      name: p.name,
      image: p.image || null,
      units: p.units,
      revenue: Math.round(p.revenue),
    }));

    const prevUnits = new Map((facets.productUnitsPrevWeek || []).map((p) => [String(p._id), p.units]));
    let risingProduct = null;
    for (const p of facets.productUnitsWeek || []) {
      if (p.units < 5) continue;
      const prev = prevUnits.get(String(p._id)) || 0;
      const trend = prev === 0 ? 100 : Math.round(((p.units - prev) / prev) * 100);
      if (trend > 0 && (!risingProduct || trend > risingProduct.trend)) {
        risingProduct = { name: p.name, trend };
      }
    }

    /* ---------- Health score ---------- */
    const weekSales = facets.weekMoney[0]?.sales || 0;
    const prevWeekSales = facets.prevWeekMoney[0]?.sales || 0;
    const salesGrowthPct = pctChange(weekSales, prevWeekSales);

    const acceptanceRow = facets.acceptanceMonth[0];
    const acceptanceDenominator = (acceptanceRow?.accepted || 0) + (acceptanceRow?.cancelledNotAccepted || 0);
    const acceptancePct = acceptanceDenominator > 0
      ? Math.round(((acceptanceRow?.accepted || 0) / acceptanceDenominator) * 100)
      : null;

    const avgMs = facets.responseTimeMonth[0]?.avgMs ?? null;
    const responseMinutes = avgMs === null ? null : round1(avgMs / 60000);

    const slaRow = facets.deliverySlaMonth[0];
    const deliverySlaPct = slaRow?.delivered
      ? Math.round(((slaRow.delivered - slaRow.problematic) / slaRow.delivered) * 100)
      : null;

    const stockAvailabilityPct = inventory.totalProducts > 0
      ? Math.round(((inventory.inStock + inventory.lowStock) / inventory.totalProducts) * 100)
      : null;

    const activeStoreRating = ratingsMap instanceof Map ? ratingsMap.get(String(storeId))?.rating ?? null : null;

    const healthScore = buildHealthScore({
      salesGrowthPct,
      avgRating: activeStoreRating,
      deliverySlaPct,
      stockAvailabilityPct,
      acceptancePct,
      responseMinutes,
    });

    /* ---------- Subscription days remaining (for recommendations) ---------- */
    let subscriptionDaysRemaining = null;
    if (isOwner && ownerId && ownerDoc?.businessModel === "subscription") {
      const { getActiveSubscriptionForSeller } = await import("../../services/subscriptionService.js");
      const active = await safe(getActiveSubscriptionForSeller(ownerId));
      if (active?.currentPeriodEnd) {
        subscriptionDaysRemaining = Math.max(
          0,
          Math.ceil((new Date(active.currentPeriodEnd) - now) / 86400000),
        );
      }
    }

    /* ---------- Recommendations ---------- */
    const recommendations = buildRecommendations({
      inventory,
      lowStockNames: (lowStockProducts || []).map((p) => p.name),
      risingProduct,
      returningPct,
      activeCustomers,
      pendingNow,
      subscriptionDaysRemaining,
    });

    /* ---------- Assistants (owner only; per-staff order metrics have no data source yet) ---------- */
    const assistants = staff === null
      ? null
      : (staff || []).map((s) => ({
          id: s._id,
          name: s.name,
          isActive: s.isActive !== false,
          since: s.createdAt,
          orders: null,
          acceptancePct: null,
          rating: null,
        }));

    return handleResponse(res, 200, "Dashboard fetched successfully", {
      kpis,
      shopPerformance,
      salesOverview,
      orderStatus,
      topProducts,
      revenueVsProfit,
      customerOverview,
      inventory,
      financialSummary,
      marketing: marketingSection,
      assistants,
      healthScore,
      recommendations,
      subscriptionDaysRemaining,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("getSellerDashboard error:", error);
    return handleResponse(res, 500, error.message);
  }
};
