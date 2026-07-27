import os from "os";
import Order from "../../models/order.js";
import Product from "../../models/product.js";
import Store from "../../models/store.js";
import Seller from "../../models/seller.js";
import User from "../../models/customer.js";
import Delivery from "../../models/delivery.js";
import Payout from "../../models/payout.js";
import Review from "../../models/review.js";
import Dispute from "../../models/dispute.js";
import Transaction from "../../models/transaction.js";
import Notification from "../../models/notification.js";
import SellerSubscription from "../../models/sellerSubscription.js";
import SellerSubscriptionPayment from "../../models/sellerSubscriptionPayment.js";
import SubscriptionPaymentRequest from "../../models/subscriptionPaymentRequest.js";
import {
  WORKFLOW_STATUS,
  workflowFromLegacyStatus,
} from "../../constants/orderWorkflow.js";
import { PAYOUT_STATUS } from "../../constants/finance.js";
import { PAYMENT_STATUS } from "../../constants/payment.js";
import {
  SUBSCRIPTION_STATUS,
  PAYMENT_REQUEST_STATUS,
} from "../../constants/subscription.js";
import {
  checkMongoHealth,
  checkRedisHealth,
  checkQueueHealth,
} from "../healthCheck.js";
import { escapeRegExp } from "./shared/sellerAdminUtils.js";

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
const PLATFORM_EARNING = { $ifNull: ["$paymentBreakdown.platformTotalEarning", 0] };

const titleCase = (raw = "") =>
  String(raw)
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** Normalized (lowercased, trimmed) city key expression for grouping */
const CITY_KEY = {
  $toLower: { $trim: { input: { $ifNull: ["$address.city", ""] } } },
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
    for (const f of fields) point[f] = Math.round(Number(row[f] || 0));
    series.push(point);
  }
  return series;
};

const DAY_KEY = {
  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
};

/** Map a workflow status to one of the eight dashboard buckets */
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
      return "preparing";
    case WORKFLOW_STATUS.PICKUP_READY:
    case WORKFLOW_STATUS.CUSTOMER_PICKUP_READY:
      return "packed";
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

/** Optional sections must not take down the whole dashboard */
const safe = (promise, fallback = null) =>
  Promise.resolve(promise).catch((err) => {
    console.error("Admin dashboard section failed:", err.message);
    return fallback;
  });

const relTimeSort = (a, b) => new Date(b.at || 0) - new Date(a.at || 0);

/* ---------------------------------------------------------------
   Order $facet — everything derived from orders in one round-trip
---------------------------------------------------------------- */

async function fetchOrderFacets(cityMatch, windows) {
  const {
    todayStart,
    yesterdayStart,
    weekAgo,
    twoWeeksAgo,
    monthStart,
  } = windows;

  const [result] = await Order.aggregate([
    ...(cityMatch ? [{ $match: cityMatch }] : []),
    {
      $facet: {
        todayMoney: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: todayStart } } },
          {
            $group: {
              _id: null,
              gmv: { $sum: PRICING_TOTAL },
              orders: { $sum: 1 },
              revenue: { $sum: PLATFORM_EARNING },
            },
          },
        ],
        yesterdayMoney: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: yesterdayStart, $lt: todayStart } } },
          {
            $group: {
              _id: null,
              gmv: { $sum: PRICING_TOTAL },
              orders: { $sum: 1 },
              revenue: { $sum: PLATFORM_EARNING },
            },
          },
        ],
        cityToday: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: todayStart } } },
          {
            $group: {
              _id: CITY_KEY,
              sales: { $sum: PRICING_TOTAL },
              orders: { $sum: 1 },
              lat: { $avg: "$address.location.lat" },
              lng: { $avg: "$address.location.lng" },
            },
          },
          { $sort: { sales: -1 } },
        ],
        cityWeek: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: weekAgo } } },
          {
            $group: {
              _id: CITY_KEY,
              sales: { $sum: PRICING_TOTAL },
              lat: { $avg: "$address.location.lat" },
              lng: { $avg: "$address.location.lng" },
            },
          },
        ],
        cityPrevWeek: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: twoWeeksAgo, $lt: weekAgo } } },
          { $group: { _id: CITY_KEY, sales: { $sum: PRICING_TOTAL } } },
        ],
        growthTrend: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: weekAgo } } },
          {
            $group: {
              _id: DAY_KEY,
              gmv: { $sum: PRICING_TOTAL },
              orders: { $sum: 1 },
              revenue: { $sum: PLATFORM_EARNING },
            },
          },
          { $sort: { _id: 1 } },
        ],
        weekMoney: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: weekAgo } } },
          { $group: { _id: null, gmv: { $sum: PRICING_TOTAL }, orders: { $sum: 1 } } },
        ],
        prevWeekMoney: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: twoWeeksAgo, $lt: weekAgo } } },
          { $group: { _id: null, gmv: { $sum: PRICING_TOTAL }, orders: { $sum: 1 } } },
        ],
        statusToday: [
          { $match: { createdAt: { $gte: todayStart } } },
          {
            $group: {
              _id: { ws: "$workflowStatus", legacy: "$status", ret: "$returnStatus" },
              count: { $sum: 1 },
            },
          },
        ],
        logisticsMonth: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: monthStart } } },
          { $group: { _id: "$fulfillmentMethod", count: { $sum: 1 } } },
        ],
        deliveryStatsMonth: [
          { $match: { createdAt: { $gte: monthStart } } },
          {
            $group: {
              _id: null,
              delivered: { $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] } },
              cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
              avgDeliveryMs: {
                $avg: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$status", "delivered"] },
                        { $ne: [{ $ifNull: ["$deliveredAt", null] }, null] },
                      ],
                    },
                    { $subtract: ["$deliveredAt", "$createdAt"] },
                    null,
                  ],
                },
              },
              delayed: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$status", "delivered"] },
                        { $ne: [{ $ifNull: ["$deliveredAt", null] }, null] },
                        { $gt: [{ $subtract: ["$deliveredAt", "$createdAt"] }, 60 * 60 * 1000] },
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
        topShopsMonth: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: monthStart } } },
          {
            $group: {
              _id: "$seller",
              revenue: { $sum: PRICING_TOTAL },
              orders: { $sum: 1 },
            },
          },
          { $sort: { revenue: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: "stores",
              localField: "_id",
              foreignField: "_id",
              as: "store",
            },
          },
          {
            $project: {
              revenue: 1,
              orders: 1,
              name: { $arrayElemAt: ["$store.shopName", 0] },
              city: { $arrayElemAt: ["$store.city", 0] },
            },
          },
        ],
        shopWeek: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: weekAgo } } },
          { $group: { _id: "$seller", sales: { $sum: PRICING_TOTAL } } },
        ],
        shopPrevWeek: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: twoWeeksAgo, $lt: weekAgo } } },
          { $group: { _id: "$seller", sales: { $sum: PRICING_TOTAL } } },
        ],
        topCategoriesMonth: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: monthStart } } },
          { $unwind: "$items" },
          {
            $group: {
              _id: "$items.product",
              revenue: {
                $sum: {
                  $multiply: [
                    { $ifNull: ["$items.price", 0] },
                    { $ifNull: ["$items.quantity", 0] },
                  ],
                },
              },
              units: { $sum: { $ifNull: ["$items.quantity", 0] } },
            },
          },
          {
            $lookup: {
              from: "products",
              localField: "_id",
              foreignField: "_id",
              as: "product",
            },
          },
          { $unwind: "$product" },
          {
            $group: {
              _id: "$product.headerId",
              revenue: { $sum: "$revenue" },
              units: { $sum: "$units" },
            },
          },
          { $sort: { revenue: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: "categories",
              localField: "_id",
              foreignField: "_id",
              as: "category",
            },
          },
          {
            $project: {
              revenue: 1,
              units: 1,
              name: { $arrayElemAt: ["$category.name", 0] },
            },
          },
        ],
        financeMonth: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: monthStart } } },
          {
            $group: {
              _id: null,
              gmv: { $sum: PRICING_TOTAL },
              orders: { $sum: 1 },
              platformRevenue: { $sum: PLATFORM_EARNING },
              commissionRevenue: { $sum: { $ifNull: ["$paymentBreakdown.adminProductCommissionTotal", 0] } },
              logisticsMargin: { $sum: { $ifNull: ["$paymentBreakdown.platformLogisticsMargin", 0] } },
              handlingFees: { $sum: { $ifNull: ["$paymentBreakdown.handlingFeeCharged", 0] } },
              deliveryCharges: { $sum: { $ifNull: ["$paymentBreakdown.deliveryFeeCharged", 0] } },
              taxCollected: { $sum: { $ifNull: ["$paymentBreakdown.taxTotal", 0] } },
            },
          },
        ],
        monthCustomers: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: monthStart } } },
          { $group: { _id: "$customer", orders: { $sum: 1 }, spend: { $sum: PRICING_TOTAL } } },
        ],
        lifetimeCustomerOrders: [
          { $match: NON_CANCELLED },
          { $group: { _id: "$customer", orders: { $sum: 1 } } },
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
        activeSellers14d: [
          { $match: { ...NON_CANCELLED, createdAt: { $gte: addDays(todayStart, -13) } } },
          { $group: { _id: "$seller" } },
        ],
      },
    },
  ]);
  return result;
}

/* ---------------------------------------------------------------
   Entity / money counts (non-order collections)
---------------------------------------------------------------- */

async function fetchEntityCounts(windows) {
  const { todayStart, yesterdayStart, weekAgo, twoWeeksAgo, monthStart, prevMonthStart, now } = windows;
  const in30d = addDays(now, 30);
  const in7d = addDays(now, 7);

  const [
    activeSellers,
    totalSellers,
    approvedSellers,
    rejectedSellers,
    pendingOwnerSellers,
    newSellersWeek,
    newSellersPrevWeek,
    activeShops,
    pendingShops,
    suspendedShops,
    approvedShops,
    deliveryPartners,
    onlineRiders,
    pendingRiders,
    newCustomersToday,
    newCustomersYesterday,
    totalCustomers,
    newCustomersMonth,
    newCustomersPrevMonth,
    newCustomersWeek,
    newCustomersPrevWeek,
    pendingSubscriptionRequests,
    expiringSubscriptions30d,
    expiringSubscriptions7d,
    openDisputes,
    pendingWithdrawals,
    lowStockProducts,
    avgRatingRow,
  ] = await Promise.all([
    Seller.countDocuments({ accountType: "owner", applicationStatus: "approved", isActive: true }),
    Seller.countDocuments({ accountType: "owner" }),
    Seller.countDocuments({ accountType: "owner", applicationStatus: "approved" }),
    Seller.countDocuments({ accountType: "owner", applicationStatus: "rejected" }),
    Seller.countDocuments({ accountType: "owner", applicationStatus: "pending" }),
    Seller.countDocuments({ accountType: "owner", createdAt: { $gte: weekAgo } }),
    Seller.countDocuments({ accountType: "owner", createdAt: { $gte: twoWeeksAgo, $lt: weekAgo } }),
    Store.countDocuments({ isVerified: true, isActive: true }),
    Store.countDocuments({ applicationStatus: "pending" }),
    Store.countDocuments({ applicationStatus: "approved", isActive: false }),
    Store.countDocuments({ applicationStatus: "approved" }),
    Delivery.countDocuments({ isVerified: true }),
    Delivery.countDocuments({ isVerified: true, isOnline: true }),
    Delivery.countDocuments({ isVerified: false }),
    User.countDocuments({ role: "user", createdAt: { $gte: todayStart } }),
    User.countDocuments({ role: "user", createdAt: { $gte: yesterdayStart, $lt: todayStart } }),
    User.countDocuments({ role: "user" }),
    User.countDocuments({ role: "user", createdAt: { $gte: monthStart } }),
    User.countDocuments({ role: "user", createdAt: { $gte: prevMonthStart, $lt: monthStart } }),
    User.countDocuments({ role: "user", createdAt: { $gte: weekAgo } }),
    User.countDocuments({ role: "user", createdAt: { $gte: twoWeeksAgo, $lt: weekAgo } }),
    SubscriptionPaymentRequest.countDocuments({ status: PAYMENT_REQUEST_STATUS.PENDING }),
    SellerSubscription.countDocuments({
      status: SUBSCRIPTION_STATUS.ACTIVE,
      currentPeriodEnd: { $gte: now, $lte: in30d },
    }),
    SellerSubscription.countDocuments({
      status: SUBSCRIPTION_STATUS.ACTIVE,
      currentPeriodEnd: { $gte: now, $lte: in7d },
    }),
    Dispute.countDocuments({ status: { $in: ["open", "under_review"] } }),
    Transaction.countDocuments({ type: "Withdrawal", status: "Pending" }),
    Product.countDocuments({
      stock: { $gt: 0 },
      $expr: { $lte: ["$stock", { $ifNull: ["$lowStockAlert", 5] }] },
    }),
    Review.aggregate([
      { $match: { status: "approved" } },
      { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]).then((rows) => rows[0] || null),
  ]);

  return {
    activeSellers,
    totalSellers,
    approvedSellers,
    rejectedSellers,
    pendingOwnerSellers,
    newSellersWeek,
    newSellersPrevWeek,
    activeShops,
    pendingShops,
    suspendedShops,
    approvedShops,
    deliveryPartners,
    onlineRiders,
    pendingRiders,
    newCustomersToday,
    newCustomersYesterday,
    totalCustomers,
    newCustomersMonth,
    newCustomersPrevMonth,
    newCustomersWeek,
    newCustomersPrevWeek,
    pendingSubscriptionRequests,
    expiringSubscriptions30d,
    expiringSubscriptions7d,
    openDisputes,
    pendingWithdrawals,
    lowStockProducts,
    avgRating: avgRatingRow ? round1(avgRatingRow.avg) : null,
    ratingCount: avgRatingRow?.count || 0,
  };
}

async function fetchPayoutOverview() {
  const rows = await Payout.aggregate([
    { $group: { _id: "$status", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);
  const byStatus = new Map(rows.map((r) => [r._id, r]));
  const get = (s) => byStatus.get(s) || { amount: 0, count: 0 };
  const completed = get(PAYOUT_STATUS.COMPLETED);
  const pending = get(PAYOUT_STATUS.PENDING);
  const processing = get(PAYOUT_STATUS.PROCESSING);
  const failed = get(PAYOUT_STATUS.FAILED);
  const totalAmount = rows.reduce((a, r) => a + r.amount, 0);
  const totalCount = rows.reduce((a, r) => a + r.count, 0);
  return {
    totalAmount: Math.round(totalAmount),
    completedAmount: Math.round(completed.amount),
    pendingAmount: Math.round(pending.amount + processing.amount),
    completedPct: totalAmount > 0 ? Math.round((completed.amount / totalAmount) * 100) : 0,
    counts: {
      total: totalCount,
      completed: completed.count,
      pending: pending.count + processing.count,
      failed: failed.count,
    },
  };
}

async function fetchSubscriptionRevenue(monthStart) {
  const [gateway, manual] = await Promise.all([
    SellerSubscriptionPayment.aggregate([
      {
        $match: {
          status: PAYMENT_STATUS.CAPTURED,
          createdAt: { $gte: monthStart },
        },
      },
      { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]).then((r) => r[0] || { amount: 0, count: 0 }),
    SubscriptionPaymentRequest.aggregate([
      {
        $match: {
          status: PAYMENT_REQUEST_STATUS.APPROVED,
          reviewedAt: { $gte: monthStart },
        },
      },
      { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]).then((r) => r[0] || { amount: 0, count: 0 }),
  ]);
  return {
    amount: Math.round(gateway.amount + manual.amount),
    count: gateway.count + manual.count,
  };
}

/* ---------------------------------------------------------------
   System health (real probes + honest config presence)
---------------------------------------------------------------- */

const formatUptime = (seconds) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

async function fetchSystemHealth() {
  const [mongo, redis, queue] = await Promise.all([
    safe(checkMongoHealth(), { status: "DOWN", error: "probe failed" }),
    safe(checkRedisHealth(), { status: "DOWN", error: "probe failed" }),
    safe(checkQueueHealth(), { status: "DOWN", error: "probe failed" }),
  ]);

  const mapStatus = (s) => {
    if (s === "UP") return "healthy";
    if (s === "DISABLED") return "disabled";
    return "down";
  };

  const paymentConfigured = Boolean(
    process.env.PHONEPE_CLIENT_ID && process.env.PHONEPE_CLIENT_SECRET,
  );
  const notificationsConfigured = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);

  // os.loadavg() is always [0,0,0] on Windows — report null (rendered "—")
  const load = os.loadavg()[0];
  const cpuCount = os.cpus().length || 1;
  const serverLoadPct =
    process.platform === "win32" && load === 0
      ? null
      : Math.min(100, Math.round((load / cpuCount) * 100));

  return {
    services: [
      { key: "mongodb", label: "MongoDB Database", status: mapStatus(mongo.status), detail: mongo.responseTime != null ? `${mongo.responseTime}ms` : mongo.error || "" },
      { key: "redis", label: "Redis Cache", status: mapStatus(redis.status), detail: redis.responseTime != null && redis.status === "UP" ? `${redis.responseTime}ms` : redis.error || "" },
      { key: "queue", label: "Job Queue", status: mapStatus(queue.status), detail: queue.error || "" },
      { key: "payments", label: "Payment Gateway", status: paymentConfigured ? "configured" : "not_configured", detail: "PhonePe" },
      { key: "notifications", label: "Notification Service", status: notificationsConfigured ? "configured" : "not_configured", detail: "Firebase" },
    ],
    serverLoadPct,
    uptime: formatUptime(process.uptime()),
  };
}

/* ---------------------------------------------------------------
   Business health composite (heuristic on real sub-metrics)
---------------------------------------------------------------- */

const scoreGrowth = (pct) => {
  if (pct === null) return null;
  if (pct >= 20) return 100;
  if (pct >= 10) return 85;
  if (pct >= 0) return 70;
  if (pct >= -10) return 50;
  return 30;
};

const healthLabel = (score) => {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Average";
  return "Needs Attention";
};

function buildBusinessHealth({ gmvGrowthPct, fulfillmentPct, sellerActivityPct, retentionPct, avgRating, systemOk }) {
  const metrics = [
    { key: "gmvGrowth", label: "GMV Growth", display: gmvGrowthPct === null ? "—" : `${gmvGrowthPct > 0 ? "+" : ""}${gmvGrowthPct}%`, score: scoreGrowth(gmvGrowthPct) },
    { key: "fulfillment", label: "Order Fulfillment", display: fulfillmentPct === null ? "—" : `${fulfillmentPct}%`, score: fulfillmentPct },
    { key: "sellerActivity", label: "Seller Activity", display: sellerActivityPct === null ? "—" : `${sellerActivityPct}%`, score: sellerActivityPct },
    { key: "retention", label: "Customer Retention", display: retentionPct === null ? "—" : `${retentionPct}%`, score: retentionPct },
    { key: "satisfaction", label: "Customer Satisfaction", display: avgRating === null ? "—" : `${avgRating} ★`, score: avgRating === null ? null : Math.round((avgRating / 5) * 100) },
    { key: "system", label: "System Status", display: systemOk ? "Operational" : "Degraded", score: systemOk ? 100 : 40 },
  ];
  const scored = metrics.filter((m) => m.score !== null);
  const score = scored.length
    ? Math.round(scored.reduce((a, m) => a + m.score, 0) / scored.length)
    : null;
  return {
    score,
    label: score === null ? "No Data" : healthLabel(score),
    metrics,
  };
}

/* ---------------------------------------------------------------
   Rule-based AI insights (no LLM)
---------------------------------------------------------------- */

function buildAiInsights({ cityRows, risingProduct, lowStockProducts, churnRiskSellers, renewalsDue, decliningCity }) {
  const insights = [];

  const topCity = cityRows.find((c) => c.growthPct !== null && c.growthPct > 0);
  if (topCity) {
    insights.push({
      severity: "info",
      message: `${topCity.city} is your fastest growing market (+${topCity.growthPct}% WoW). Consider onboarding more sellers there.`,
    });
  }
  if (risingProduct) {
    insights.push({
      severity: "info",
      message: `Demand for ${risingProduct.name} is up ${risingProduct.trend}% this week across the platform.`,
    });
  }
  if (lowStockProducts > 0) {
    insights.push({
      severity: "warning",
      message: `${lowStockProducts} product${lowStockProducts === 1 ? " is" : "s are"} running low on stock across shops. Nudge sellers to restock.`,
    });
  }
  if (churnRiskSellers > 0) {
    insights.push({
      severity: "warning",
      message: `${churnRiskSellers} active shop${churnRiskSellers === 1 ? " has" : "s have"} no orders in the last 14 days — churn risk. Consider outreach or promotions.`,
    });
  }
  if (renewalsDue > 0) {
    insights.push({
      severity: "warning",
      message: `${renewalsDue} seller subscription${renewalsDue === 1 ? "" : "s"} due for renewal within 30 days. Follow up to protect subscription revenue.`,
    });
  }
  if (decliningCity) {
    insights.push({
      severity: "critical",
      message: `Sales in ${decliningCity.city} declined ${Math.abs(decliningCity.growthPct)}% WoW. Consider a cashback campaign there.`,
    });
  }

  const order = { critical: 0, warning: 1, info: 2 };
  return insights.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 6);
}

/* ---------------------------------------------------------------
   Alerts + activity feed
---------------------------------------------------------------- */

async function fetchAlerts(counts) {
  const computed = [];
  if (counts.expiringSubscriptions7d > 0) {
    computed.push({
      severity: "warning",
      message: `${counts.expiringSubscriptions7d} seller subscription${counts.expiringSubscriptions7d === 1 ? "" : "s"} expiring within 7 days`,
      at: new Date(),
    });
  }
  if (counts.pendingWithdrawals > 0) {
    computed.push({
      severity: "warning",
      message: `${counts.pendingWithdrawals} withdrawal request${counts.pendingWithdrawals === 1 ? "" : "s"} awaiting review`,
      at: new Date(),
    });
  }
  if (counts.openDisputes > 0) {
    computed.push({
      severity: "critical",
      message: `${counts.openDisputes} dispute${counts.openDisputes === 1 ? " is" : "s are"} open and need attention`,
      at: new Date(),
    });
  }
  if (counts.pendingRiders > 0) {
    computed.push({
      severity: "info",
      message: `${counts.pendingRiders} delivery partner${counts.pendingRiders === 1 ? "" : "s"} awaiting verification`,
      at: new Date(),
    });
  }

  const notifications = await safe(
    Notification.find({ recipientModel: "Admin" })
      .sort({ createdAt: -1 })
      .limit(3)
      .select("title message createdAt type")
      .lean(),
    [],
  );

  const fromNotifications = (notifications || []).map((n) => ({
    severity: "info",
    message: n.title || n.message,
    at: n.createdAt,
  }));

  return [...computed, ...fromNotifications]
    .slice(0, 6)
    .map((a) => ({ severity: a.severity, message: a.message, at: a.at }));
}

async function fetchActivityFeed() {
  const [reviewedStores, payouts, subPayments, newSellers, resolvedDisputes] = await Promise.all([
    safe(
      Store.find({ applicationStatus: { $in: ["approved", "rejected"] }, reviewedAt: { $ne: null } })
        .sort({ reviewedAt: -1 })
        .limit(4)
        .select("shopName applicationStatus reviewedAt")
        .lean(),
      [],
    ),
    safe(
      Payout.find({ status: PAYOUT_STATUS.COMPLETED, processedAt: { $ne: null } })
        .sort({ processedAt: -1 })
        .limit(4)
        .select("amount payoutType processedAt")
        .lean(),
      [],
    ),
    safe(
      SellerSubscriptionPayment.find({ status: PAYMENT_STATUS.CAPTURED })
        .sort({ createdAt: -1 })
        .limit(4)
        .select("amount planSnapshot createdAt")
        .lean(),
      [],
    ),
    safe(
      Seller.find({ accountType: "owner" })
        .sort({ createdAt: -1 })
        .limit(4)
        .select("name createdAt applicationStatus")
        .lean(),
      [],
    ),
    safe(
      Dispute.find({ status: "resolved", resolvedAt: { $ne: null } })
        .sort({ resolvedAt: -1 })
        .limit(4)
        .select("resolvedAt")
        .lean(),
      [],
    ),
  ]);

  const events = [
    ...(reviewedStores || []).map((s) => ({
      type: s.applicationStatus === "approved" ? "approval" : "rejection",
      message: `Shop "${s.shopName}" ${s.applicationStatus}`,
      at: s.reviewedAt,
    })),
    ...(payouts || []).map((p) => ({
      type: "payout",
      message: `Payout of ₹${Math.round(p.amount).toLocaleString("en-IN")} completed (${p.payoutType === "SELLER" ? "seller" : "delivery partner"})`,
      at: p.processedAt,
    })),
    ...(subPayments || []).map((p) => ({
      type: "subscription",
      message: `Subscription payment of ₹${Math.round(p.amount).toLocaleString("en-IN")} received${p.planSnapshot?.name ? ` (${p.planSnapshot.name})` : ""}`,
      at: p.createdAt,
    })),
    ...(newSellers || []).map((s) => ({
      type: "registration",
      message: `New seller "${s.name}" registered${s.applicationStatus === "pending" ? " (pending approval)" : ""}`,
      at: s.createdAt,
    })),
    ...(resolvedDisputes || []).map((d) => ({
      type: "dispute",
      message: "A customer dispute was resolved",
      at: d.resolvedAt,
    })),
  ];

  return events.sort(relTimeSort).slice(0, 8);
}

/* ---------------------------------------------------------------
   Main entry
---------------------------------------------------------------- */

export async function getAdminDashboardOverview({ city = "" } = {}) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = addDays(todayStart, -1);
  const weekAgo = addDays(todayStart, -6); // 7 calendar days incl. today
  const twoWeeksAgo = addDays(todayStart, -13);
  const monthStart = startOfMonth(now);
  const prevMonthStart = startOfMonth(addDays(monthStart, -1));

  const windows = { now, todayStart, yesterdayStart, weekAgo, twoWeeksAgo, monthStart, prevMonthStart };

  const normalizedCity = String(city || "").trim();
  const cityMatch = normalizedCity
    ? { "address.city": { $regex: `^\\s*${escapeRegExp(normalizedCity)}\\s*$`, $options: "i" } }
    : null;

  const [facets, counts, payouts, subscriptionRevenue, systemHealth, activityFeed, allCitiesRaw] =
    await Promise.all([
      fetchOrderFacets(cityMatch, windows),
      fetchEntityCounts(windows),
      safe(fetchPayoutOverview(), {
        totalAmount: 0, completedAmount: 0, pendingAmount: 0, completedPct: 0,
        counts: { total: 0, completed: 0, pending: 0, failed: 0 },
      }),
      safe(fetchSubscriptionRevenue(monthStart), { amount: 0, count: 0 }),
      safe(fetchSystemHealth(), { services: [], serverLoadPct: null, uptime: "—" }),
      safe(fetchActivityFeed(), []),
      safe(Order.distinct("address.city"), []),
    ]);

  /* ---------- KPIs ---------- */
  const today = facets.todayMoney[0] || { gmv: 0, orders: 0, revenue: 0 };
  const yesterday = facets.yesterdayMoney[0] || { gmv: 0, orders: 0, revenue: 0 };

  const pendingApprovals =
    counts.pendingOwnerSellers +
    counts.pendingShops +
    counts.pendingSubscriptionRequests +
    counts.pendingRiders;

  /* ---------- City-wise sales ---------- */
  const weekByCity = new Map((facets.cityWeek || []).map((c) => [c._id, c]));
  const prevWeekByCity = new Map((facets.cityPrevWeek || []).map((c) => [c._id, c.sales]));

  // Merge today's rows with week rows so cities with zero sales today still show
  const cityKeys = new Set([
    ...(facets.cityToday || []).map((c) => c._id),
    ...(facets.cityWeek || []).map((c) => c._id),
  ]);
  const todayByCity = new Map((facets.cityToday || []).map((c) => [c._id, c]));

  const cityRows = [...cityKeys]
    .map((key) => {
      const t = todayByCity.get(key) || {};
      const w = weekByCity.get(key) || {};
      const growthPct = pctChange(w.sales || 0, prevWeekByCity.get(key) || 0);
      const lat = t.lat ?? w.lat ?? null;
      const lng = t.lng ?? w.lng ?? null;
      return {
        city: key ? titleCase(key) : "Others",
        sales: Math.round(t.sales || 0),
        orders: t.orders || 0,
        weekSales: Math.round(w.sales || 0),
        growthPct,
        lat: typeof lat === "number" ? round1(lat * 10000) / 10000 : null,
        lng: typeof lng === "number" ? round1(lng * 10000) / 10000 : null,
      };
    })
    .sort((a, b) => b.sales - a.sales || b.weekSales - a.weekSales);

  const cityWiseSales = {
    rows: cityRows,
    totals: {
      sales: cityRows.reduce((a, c) => a + c.sales, 0),
      orders: cityRows.reduce((a, c) => a + c.orders, 0),
    },
  };

  /* ---------- Business growth ---------- */
  const week = facets.weekMoney[0] || { gmv: 0, orders: 0 };
  const prevWeek = facets.prevWeekMoney[0] || { gmv: 0, orders: 0 };
  const businessGrowth = {
    series: buildDailySeries(weekAgo, todayStart, facets.growthTrend || [], ["gmv", "orders", "revenue"]),
    summary: {
      gmvGrowthPct: pctChange(week.gmv, prevWeek.gmv),
      orderGrowthPct: pctChange(week.orders, prevWeek.orders),
      sellerGrowthPct: pctChange(counts.newSellersWeek, counts.newSellersPrevWeek),
      customerGrowthPct: pctChange(counts.newCustomersWeek, counts.newCustomersPrevWeek),
    },
  };

  /* ---------- Order status donut (today, 8 buckets) ---------- */
  const buckets = {
    new: 0, accepted: 0, preparing: 0, packed: 0,
    outForDelivery: 0, delivered: 0, cancelled: 0, returned: 0,
  };
  let statusTotal = 0;
  for (const row of facets.statusToday || []) {
    const ret = row._id.ret;
    const isReturned = ret && !["none", "rejected", "cancelled"].includes(ret);
    if (isReturned) {
      buckets.returned += row.count;
    } else {
      const ws = row._id.ws || workflowFromLegacyStatus(row._id.legacy);
      buckets[bucketForWorkflow(ws)] += row.count;
    }
    statusTotal += row.count;
  }
  const orderStatus = {
    total: statusTotal,
    breakdown: [
      { key: "new", label: "New", count: buckets.new },
      { key: "accepted", label: "Accepted", count: buckets.accepted },
      { key: "preparing", label: "Preparing", count: buckets.preparing },
      { key: "packed", label: "Packed", count: buckets.packed },
      { key: "outForDelivery", label: "Out for Delivery", count: buckets.outForDelivery },
      { key: "delivered", label: "Delivered", count: buckets.delivered },
      { key: "cancelled", label: "Cancelled", count: buckets.cancelled },
      { key: "returned", label: "Returned", count: buckets.returned },
    ],
  };

  /* ---------- Logistics (this month) ---------- */
  const methodMap = new Map((facets.logisticsMonth || []).map((r) => [r._id, r.count]));
  const methodTotal = [...methodMap.values()].reduce((a, c) => a + c, 0);
  const methodShare = (key) => {
    const count = methodMap.get(key) || 0;
    return { count, sharePct: methodTotal > 0 ? Math.round((count / methodTotal) * 100) : 0 };
  };
  const ds = facets.deliveryStatsMonth?.[0] || {};
  const finished = (ds.delivered || 0) + (ds.cancelled || 0);
  const logistics = {
    methods: {
      platformLogistics: methodShare("platform_logistics"),
      sellerDelivery: methodShare("seller_delivery"),
      customerPickup: methodShare("customer_pickup"),
    },
    successRatePct: finished > 0 ? Math.round(((ds.delivered || 0) / finished) * 100) : null,
    avgDeliveryMinutes: ds.avgDeliveryMs ? Math.round(ds.avgDeliveryMs / 60000) : null,
    delayedDeliveries: ds.delayed || 0,
  };

  /* ---------- Top shops / categories ---------- */
  const shopWeekMap = new Map((facets.shopWeek || []).map((r) => [String(r._id), r.sales]));
  const shopPrevWeekMap = new Map((facets.shopPrevWeek || []).map((r) => [String(r._id), r.sales]));
  const topShops = (facets.topShopsMonth || []).map((s) => ({
    id: String(s._id),
    name: s.name || "Unknown Shop",
    city: s.city ? titleCase(s.city) : "",
    revenue: Math.round(s.revenue),
    orders: s.orders,
    growthPct: pctChange(shopWeekMap.get(String(s._id)) || 0, shopPrevWeekMap.get(String(s._id)) || 0),
  }));

  const topCategories = (facets.topCategoriesMonth || []).map((c) => ({
    id: String(c._id),
    name: c.name || "Uncategorized",
    revenue: Math.round(c.revenue),
    units: c.units,
  }));

  /* ---------- Financial summary (this month) ---------- */
  const fin = facets.financeMonth?.[0] || {};
  const commissionRevenue = Math.round(fin.commissionRevenue || 0);
  const deliveryMargin = Math.round(fin.logisticsMargin || 0);
  const otherIncome = Math.round((fin.handlingFees || 0));
  const financialSummary = {
    gmv: Math.round(fin.gmv || 0),
    orders: fin.orders || 0,
    platformRevenue: Math.round(fin.platformRevenue || 0),
    subscriptionRevenue: subscriptionRevenue.amount,
    subscriptionPayments: subscriptionRevenue.count,
    commissionRevenue,
    otherIncome,
    totalRevenue: Math.round((fin.platformRevenue || 0)) + subscriptionRevenue.amount,
    breakdown: [
      { key: "subscription", label: "Subscription", value: subscriptionRevenue.amount },
      { key: "commission", label: "Commission", value: commissionRevenue },
      { key: "delivery", label: "Delivery Charges", value: deliveryMargin },
      { key: "tax", label: "Tax Collected", value: Math.round(fin.taxCollected || 0) },
    ],
  };

  /* ---------- Customers ---------- */
  const monthCustomers = facets.monthCustomers || [];
  const lifetime = facets.lifetimeCustomerOrders || [];
  const lifetimeById = new Map(lifetime.map((c) => [String(c._id), c.orders]));
  const activeCustomers = monthCustomers.length;
  let repeatCustomers = 0;
  for (const c of monthCustomers) {
    if ((lifetimeById.get(String(c._id)) || 0) > 1) repeatCustomers += 1;
  }
  const monthSales = monthCustomers.reduce((a, c) => a + c.spend, 0);
  const monthOrders = monthCustomers.reduce((a, c) => a + c.orders, 0);
  const retentionPct = activeCustomers > 0 ? Math.round((repeatCustomers / activeCustomers) * 100) : null;

  const customerOverview = {
    totalCustomers: counts.totalCustomers,
    newThisMonth: {
      value: counts.newCustomersMonth,
      trendPct: pctChange(counts.newCustomersMonth, counts.newCustomersPrevMonth),
    },
    activeThisMonth: activeCustomers,
    repeatCustomers,
    retentionPct,
    avgOrderValue: monthOrders > 0 ? Math.round(monthSales / monthOrders) : 0,
    satisfaction: counts.avgRating,
    ratingCount: counts.ratingCount,
  };

  /* ---------- Seller & shop overview ---------- */
  const sellerShopOverview = {
    totalSellers: counts.totalSellers,
    approvedSellers: counts.approvedSellers,
    rejectedSellers: counts.rejectedSellers,
    kycPending: counts.pendingShops,
    shopsPendingApproval: counts.pendingShops,
    activeShops: counts.activeShops,
    suspendedShops: counts.suspendedShops,
    expiringSubscriptions: counts.expiringSubscriptions30d,
  };

  /* ---------- Approval center ---------- */
  const approvalCenter = [
    { key: "sellerRegistrations", label: "Seller Registrations", count: counts.pendingOwnerSellers, link: "/admin/sellers/pending" },
    { key: "shopApprovals", label: "Shop Approvals", count: counts.pendingShops, link: "/admin/sellers/pending" },
    { key: "kycVerifications", label: "KYC / Document Verifications", count: counts.pendingShops, link: "/admin/sellers/pending" },
    { key: "subscriptionRequests", label: "Subscription Requests", count: counts.pendingSubscriptionRequests, link: "/admin/subscriptions" },
    { key: "deliveryPartners", label: "Delivery Partner Requests", count: counts.pendingRiders, link: "/admin/delivery-boys/pending" },
    { key: "withdrawals", label: "Withdrawal Requests", count: counts.pendingWithdrawals, link: "/admin/withdrawals" },
  ];

  /* ---------- Rising product + churn risk (for insights) ---------- */
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

  const activeSellerIds = new Set((facets.activeSellers14d || []).map((r) => String(r._id)));
  const churnRiskSellers = Math.max(0, counts.activeShops - activeSellerIds.size);

  const decliningCity = cityRows
    .filter((c) => c.growthPct !== null && c.growthPct < 0 && c.weekSales > 0)
    .sort((a, b) => a.growthPct - b.growthPct)[0] || null;

  const aiInsights = buildAiInsights({
    cityRows,
    risingProduct,
    lowStockProducts: counts.lowStockProducts,
    churnRiskSellers,
    renewalsDue: counts.expiringSubscriptions30d,
    decliningCity,
  });

  /* ---------- Business health ---------- */
  const fulfillmentPct = finished > 0 ? Math.round(((ds.delivered || 0) / finished) * 100) : null;
  const sellerActivityPct = counts.approvedShops > 0
    ? Math.round((Math.min(activeSellerIds.size, counts.approvedShops) / counts.approvedShops) * 100)
    : null;
  const systemOk = (systemHealth.services || []).every(
    (s) => s.status !== "down",
  );
  const businessHealth = buildBusinessHealth({
    gmvGrowthPct: businessGrowth.summary.gmvGrowthPct,
    fulfillmentPct,
    sellerActivityPct,
    retentionPct,
    avgRating: counts.avgRating,
    systemOk,
  });

  /* ---------- KPI strip ---------- */
  const kpis = {
    gmvToday: { value: Math.round(today.gmv), trendPct: pctChange(today.gmv, yesterday.gmv) },
    revenueToday: { value: Math.round(today.revenue), trendPct: pctChange(today.revenue, yesterday.revenue) },
    ordersToday: { value: today.orders, trendPct: pctChange(today.orders, yesterday.orders) },
    activeSellers: { value: counts.activeSellers },
    activeShops: { value: counts.activeShops },
    newCustomersToday: { value: counts.newCustomersToday, trendPct: pctChange(counts.newCustomersToday, counts.newCustomersYesterday) },
    deliveryPartners: { value: counts.deliveryPartners, online: counts.onlineRiders },
    pendingApprovals: { value: pendingApprovals },
    openDisputes: { value: counts.openDisputes },
    businessHealth: { value: businessHealth.score, label: businessHealth.label },
  };

  /* ---------- Alerts (needs counts, so built here) ---------- */
  const alerts = await safe(fetchAlerts(counts), []);

  /* ---------- City list for the header dropdown (unfiltered) ---------- */
  const cities = [...new Set(
    (allCitiesRaw || [])
      .map((c) => titleCase(c || ""))
      .filter(Boolean),
  )].sort();

  return {
    city: normalizedCity || null,
    cities,
    kpis,
    cityWiseSales,
    businessGrowth,
    orderStatus,
    logistics,
    topShops,
    topCategories,
    sellerShopOverview,
    approvalCenter,
    financialSummary,
    settlements: payouts,
    customerOverview,
    systemHealth,
    businessHealth,
    alerts,
    aiInsights,
    activityFeed,
    generatedAt: now.toISOString(),
  };
}
