import Order from "../../models/order.js";

function pctChange(current, prev) {
  if (!prev) return current > 0 ? 100 : 0;
  return Math.round(((current - prev) / prev) * 100 * 10) / 10;
}

const NON_CANCELLED = { status: { $ne: "cancelled" } };
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const startOfDay = (d = new Date()) => {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
};
const addDays = (d, days) => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
};
const dateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function buildDailySeries(from, to, rows) {
  const byDate = new Map(rows.map((r) => [r._id, r]));
  const series = [];
  for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) {
    const row = byDate.get(dateKey(d)) || {};
    series.push({
      name: DAY_NAMES[d.getDay()],
      date: dateKey(d),
      revenue: Math.round(Number(row.revenue || 0)),
      orders: Number(row.orders || 0),
    });
  }
  return series;
}

const CATEGORY_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#f43f5e", "#0ea5e9", "#a855f7", "#84cc16", "#ec4899"];

// Replaces AdvancedAnalytics.jsx's 100%-fabricated static mock arrays
// (salesData/categoryData were hardcoded, date-range selector did nothing,
// "Download Report" was a fake setTimeout toast) with real aggregations —
// deliberately its own small, self-contained pipeline rather than
// extending the shared getAdminDashboardOverview aggregation, so this
// change carries zero risk to the main (already-correct) admin dashboard.
export async function getAnalyticsReport({ days = 7 } = {}) {
  const normalizedDays = [1, 7, 30, 90].includes(Number(days)) ? Number(days) : 7;
  const now = new Date();
  const todayStart = startOfDay(now);
  const rangeStart = addDays(todayStart, -(normalizedDays - 1));
  const prevRangeStart = addDays(rangeStart, -normalizedDays);

  const [dailyRows, categoryRows, hourlyRows, totals, prevTotals, activeSellerIds] = await Promise.all([
    Order.aggregate([
      { $match: { ...NON_CANCELLED, createdAt: { $gte: rangeStart } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
          orders: { $sum: 1 },
        },
      },
    ]),
    Order.aggregate([
      { $match: { ...NON_CANCELLED, createdAt: { $gte: rangeStart } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          revenue: {
            $sum: {
              $multiply: [{ $ifNull: ["$items.price", 0] }, { $ifNull: ["$items.quantity", 0] }],
            },
          },
        },
      },
      {
        $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "product" },
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: "$product.headerId",
          revenue: { $sum: "$revenue" },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 8 },
      {
        $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "category" },
      },
      {
        $project: {
          revenue: 1,
          name: { $arrayElemAt: ["$category.name", 0] },
        },
      },
    ]),
    // Hour-of-day order load across the selected window — a genuine
    // aggregate (not per-day granular like the chart above), used only for
    // the load heatmap.
    Order.aggregate([
      { $match: { ...NON_CANCELLED, createdAt: { $gte: rangeStart } } },
      {
        $group: {
          _id: { $hour: "$createdAt" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: { ...NON_CANCELLED, createdAt: { $gte: rangeStart } } },
      {
        $group: {
          _id: null,
          revenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
          orders: { $sum: 1 },
        },
      },
    ]),
    Order.aggregate([
      { $match: { ...NON_CANCELLED, createdAt: { $gte: prevRangeStart, $lt: rangeStart } } },
      {
        $group: {
          _id: null,
          revenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
          orders: { $sum: 1 },
        },
      },
    ]),
    Order.distinct("seller", { ...NON_CANCELLED, createdAt: { $gte: rangeStart } }),
  ]);

  const salesData = buildDailySeries(rangeStart, todayStart, dailyRows);

  const categoryTotal = categoryRows.reduce((sum, c) => sum + Number(c.revenue || 0), 0);
  const categoryData = categoryRows.map((c, i) => ({
    name: c.name || "Uncategorized",
    value: categoryTotal > 0 ? Math.round((Number(c.revenue || 0) / categoryTotal) * 100) : 0,
    revenue: Math.round(Number(c.revenue || 0)),
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }));

  const maxHourly = Math.max(1, ...hourlyRows.map((h) => h.orders || 0));
  const hourlyHeatmap = hourlyRows.map((h) => ({
    hour: `${String(h._id).padStart(2, "0")}:00`,
    load: Math.round((Number(h.orders || 0) / maxHourly) * 100),
    orders: h.orders || 0,
  }));

  const summary = totals[0] || { revenue: 0, orders: 0 };
  const prevSummary = prevTotals[0] || { revenue: 0, orders: 0 };
  const totalOrders = summary.orders || 0;
  const totalRevenue = Math.round(summary.revenue || 0);
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
  const prevAvgOrderValue = prevSummary.orders > 0 ? Math.round((prevSummary.revenue || 0) / prevSummary.orders) : 0;

  return {
    days: normalizedDays,
    salesData,
    categoryData,
    hourlyHeatmap,
    summary: {
      totalRevenue,
      totalOrders,
      activeSellers: activeSellerIds.length,
      avgOrderValue,
      revenueGrowthPct: pctChange(totalRevenue, prevSummary.revenue || 0),
      orderGrowthPct: pctChange(totalOrders, prevSummary.orders || 0),
      avgOrderValueGrowthPct: pctChange(avgOrderValue, prevAvgOrderValue),
    },
    generatedAt: now.toISOString(),
  };
}
