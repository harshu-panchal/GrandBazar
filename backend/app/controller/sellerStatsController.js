import Order from "../models/order.js";
import Transaction from "../models/transaction.js";
import Product from "../models/product.js";
import Setting from "../models/setting.js";
import handleResponse from "../utils/helper.js";
import mongoose from "mongoose";
import Wallet from "../models/wallet.js";
import { resolveOrderStatus } from "../services/orderStatusResolver.js";

const PERIOD_COMPARE_LABEL = {
    daily: "vs prev 7d",
    weekly: "vs prev 4w",
    monthly: "vs prev 6mo",
};

const resolveStatsPeriod = (rangeRaw = "daily") => {
    const range = String(rangeRaw || "daily").toLowerCase();
    const now = new Date();
    const periodEnd = now;
    const periodStart = new Date(now);
    let aggregationFormat = "%Y-%m-%d";
    let compareLabel = PERIOD_COMPARE_LABEL.daily;

    if (range === "monthly") {
        periodStart.setMonth(periodStart.getMonth() - 6);
        aggregationFormat = "%Y-%m";
        compareLabel = PERIOD_COMPARE_LABEL.monthly;
    } else if (range === "weekly") {
        periodStart.setDate(periodStart.getDate() - 28);
        aggregationFormat = "%Y-%U";
        compareLabel = PERIOD_COMPARE_LABEL.weekly;
    } else {
        periodStart.setDate(periodStart.getDate() - 7);
        aggregationFormat = "%Y-%m-%d";
        compareLabel = PERIOD_COMPARE_LABEL.daily;
    }

    const periodMs = Math.max(periodEnd.getTime() - periodStart.getTime(), 1);
    const prevPeriodEnd = new Date(periodStart);
    const prevPeriodStart = new Date(periodStart.getTime() - periodMs);

    return {
        range: range === "monthly" || range === "weekly" ? range : "daily",
        periodStart,
        periodEnd,
        prevPeriodStart,
        prevPeriodEnd,
        aggregationFormat,
        compareLabel,
    };
};

const pctChange = (current, previous) => {
    if (!previous) return current > 0 ? 100 : 0;
    return Number((((current - previous) / previous) * 100).toFixed(1));
};

/* ===============================
   GET SELLER DASHBOARD STATS
================================ */
export const getSellerStats = async (req, res) => {
    try {
        const sellerId = req.user.id;
        const sellerOid = new mongoose.Types.ObjectId(sellerId);
        const {
            range,
            periodStart,
            prevPeriodStart,
            prevPeriodEnd,
            aggregationFormat,
            compareLabel,
        } = resolveStatsPeriod(req.query.range);

        // Single aggregation pipeline with $facet
        const [statsResult] = await Order.aggregate([
            {
                $match: {
                    seller: sellerOid,
                    status: { $ne: "cancelled" },
                },
            },
            {
                $facet: {
                    // Period overview (sales + orders + unique customers)
                    overview: [
                        { $match: { createdAt: { $gte: periodStart } } },
                        {
                            $group: {
                                _id: null,
                                totalSales: { $sum: { $ifNull: ["$pricing.total", 0] } },
                                totalOrders: { $sum: 1 },
                                customers: { $addToSet: "$customer" },
                            },
                        },
                        {
                            $project: {
                                totalSales: 1,
                                totalOrders: 1,
                                uniqueCustomers: { $size: "$customers" },
                            },
                        },
                    ],
                    prevPeriod: [
                        {
                            $match: {
                                createdAt: { $gte: prevPeriodStart, $lt: prevPeriodEnd },
                            },
                        },
                        {
                            $group: {
                                _id: null,
                                sales: { $sum: { $ifNull: ["$pricing.total", 0] } },
                                count: { $sum: 1 },
                                customers: { $addToSet: "$customer" },
                            },
                        },
                        {
                            $project: {
                                sales: 1,
                                count: 1,
                                uniqueCustomers: { $size: "$customers" },
                            },
                        },
                    ],
                    // Customers who ordered before this period (to split new vs returning)
                    priorCustomers: [
                        { $match: { createdAt: { $lt: periodStart } } },
                        { $group: { _id: "$customer" } },
                    ],
                    periodCustomers: [
                        { $match: { createdAt: { $gte: periodStart } } },
                        { $group: { _id: "$customer", orders: { $sum: 1 } } },
                    ],
                    // Sales + customer trend chart data
                    salesTrend: [
                        { $match: { createdAt: { $gte: periodStart } } },
                        {
                            $group: {
                                _id: {
                                    $dateToString: {
                                        format: aggregationFormat,
                                        date: "$createdAt",
                                    },
                                },
                                sales: { $sum: { $ifNull: ["$pricing.total", 0] } },
                                orders: { $sum: 1 },
                                customers: { $addToSet: "$customer" },
                            },
                        },
                        {
                            $project: {
                                sales: 1,
                                orders: 1,
                                customers: { $size: "$customers" },
                            },
                        },
                        { $sort: { _id: 1 } },
                    ],
                    // Insights scoped to selected period
                    topCities: [
                        { $match: { createdAt: { $gte: periodStart } } },
                        { $group: { _id: "$address.city", count: { $sum: 1 } } },
                        { $sort: { count: -1 } },
                        { $limit: 1 },
                    ],
                    peakHours: [
                        { $match: { createdAt: { $gte: periodStart } } },
                        { $project: { hour: { $hour: "$createdAt" } } },
                        { $group: { _id: "$hour", count: { $sum: 1 } } },
                        { $sort: { count: -1 } },
                        { $limit: 1 },
                    ],
                    topProductsCurrent: [
                        { $match: { createdAt: { $gte: periodStart } } },
                        { $unwind: "$items" },
                        {
                            $group: {
                                _id: "$items.product",
                                name: { $first: "$items.name" },
                                sales: { $sum: "$items.quantity" },
                                revenue: {
                                    $sum: { $multiply: ["$items.price", "$items.quantity"] },
                                },
                            },
                        },
                        { $sort: { sales: -1 } },
                        { $limit: 10 },
                    ],
                    topProductsPrev: [
                        {
                            $match: {
                                createdAt: { $gte: prevPeriodStart, $lt: prevPeriodEnd },
                            },
                        },
                        { $unwind: "$items" },
                        {
                            $group: {
                                _id: "$items.product",
                                sales: { $sum: "$items.quantity" },
                            },
                        },
                    ],
                    trafficSources: [
                        { $match: { createdAt: { $gte: periodStart } } },
                        { $group: { _id: "$trafficSource", value: { $sum: 1 } } },
                        { $project: { name: "$_id", value: 1, _id: 0 } },
                    ],
                    devices: [
                        { $match: { createdAt: { $gte: periodStart } } },
                        { $group: { _id: "$deviceType", count: { $sum: 1 } } },
                        { $sort: { count: -1 } },
                    ],
                },
            },
        ]);

        const overviewRaw = statsResult.overview[0] || {
            totalSales: 0,
            totalOrders: 0,
            uniqueCustomers: 0,
        };
        const totalSales = overviewRaw.totalSales || 0;
        const totalOrders = overviewRaw.totalOrders || 0;
        const uniqueCustomers = overviewRaw.uniqueCustomers || 0;
        const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

        const prev = statsResult.prevPeriod[0] || {
            sales: 0,
            count: 0,
            uniqueCustomers: 0,
        };
        const salesTrendPerc = pctChange(totalSales, prev.sales || 0);
        const ordersTrendPerc = pctChange(totalOrders, prev.count || 0);
        const customersTrendPerc = pctChange(uniqueCustomers, prev.uniqueCustomers || 0);

        const priorCustomerIds = new Set(
            (statsResult.priorCustomers || []).map((c) => String(c._id)),
        );
        let newCustomers = 0;
        let returningCustomers = 0;
        for (const row of statsResult.periodCustomers || []) {
            if (priorCustomerIds.has(String(row._id))) returningCustomers += 1;
            else newCustomers += 1;
        }

        // Format chart data
        const salesTrend = statsResult.salesTrend || [];
        let chartData = [];
        if (range === "monthly") {
            const monthNames = [
                "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
            ];
            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const dateStr = d.toISOString().slice(0, 7);
                const data = salesTrend.find((item) => item._id === dateStr);
                chartData.push({
                    name: monthNames[d.getMonth()],
                    sales: data ? data.sales : 0,
                    orders: data ? data.orders : 0,
                    customers: data ? data.customers : 0,
                    traffic: data ? data.customers : 0,
                });
            }
        } else if (range === "weekly") {
            const weeks = salesTrend.slice(-4);
            chartData = Array.from({ length: 4 }, (_, i) => {
                const item = weeks[i];
                return {
                    name: `Week ${i + 1}`,
                    sales: item?.sales || 0,
                    orders: item?.orders || 0,
                    customers: item?.customers || 0,
                    traffic: item?.customers || 0,
                };
            });
        } else {
            const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateStr = d.toISOString().split("T")[0];
                const data = salesTrend.find((item) => item._id === dateStr);
                chartData.push({
                    name: dayNames[d.getDay()],
                    sales: data ? data.sales : 0,
                    orders: data ? data.orders : 0,
                    customers: data ? data.customers : 0,
                    traffic: data ? data.customers : 0,
                });
            }
        }

        // Category distribution (inventory mix — not period-bound)
        const categoryData = await Product.aggregate([
            { $match: { sellerId: sellerOid } },
            {
                $lookup: {
                    from: "categories",
                    localField: "categoryId",
                    foreignField: "_id",
                    as: "category",
                },
            },
            { $unwind: "$category" },
            {
                $group: {
                    _id: "$category.name",
                    count: { $sum: 1 },
                },
            },
            {
                $project: {
                    subject: "$_id",
                    A: "$count",
                    fullMark: 100,
                },
            },
        ]);

        const topCity = statsResult.topCities[0]?._id || "N/A";
        const peakHour = statsResult.peakHours[0]?._id;
        const peakTime =
            peakHour !== undefined ? `${peakHour}:00 - ${peakHour + 2}:00` : "N/A";

        const currentItems = statsResult.topProductsCurrent || [];
        const prevItems = statsResult.topProductsPrev || [];

        const formattedTopProducts = currentItems
            .map((item) => {
                const prevItem = prevItems.find(
                    (p) => String(p._id) === String(item._id),
                );
                const currSales = item.sales;
                const pSales = prevItem ? prevItem.sales : 0;
                let trend = 0;
                if (pSales === 0) trend = currSales > 0 ? 100 : 0;
                else trend = Math.round(((currSales - pSales) / pSales) * 100);

                return {
                    name: item.name,
                    sales: currSales,
                    revenue: `₹${item.revenue.toLocaleString()}`,
                    trend,
                };
            })
            .slice(0, 5);

        const sourceColors = {
            Direct: "#3b82f6",
            Search: "#10b981",
            Social: "#f59e0b",
            Referral: "#8b5cf6",
        };

        const finalTrafficSources = (statsResult.trafficSources || []).map((s) => ({
            ...s,
            name: s.name || "Direct",
            color: sourceColors[s.name] || "#CBD5E1",
        }));

        if (finalTrafficSources.length === 0 && totalOrders > 0) {
            finalTrafficSources.push({
                name: "Direct",
                value: totalOrders,
                color: "#3b82f6",
            });
        }

        const topDeviceType = statsResult.devices[0]?._id || "Mobile";
        const topDeviceCount = statsResult.devices[0]?.count || 0;
        const devicePerc =
            totalOrders > 0 ? Math.round((topDeviceCount / totalOrders) * 100) : 0;

        return handleResponse(res, 200, "Stats fetched successfully", {
            range,
            compareLabel,
            overview: {
                totalSales: `₹${totalSales.toLocaleString()}`,
                totalOrders: totalOrders.toLocaleString(),
                avgOrderValue: `₹${Math.round(avgOrderValue).toLocaleString()}`,
                conversionRate: totalOrders > 0 ? "4.2%" : "0%",
                salesTrend: `${salesTrendPerc > 0 ? "+" : ""}${salesTrendPerc}%`,
                ordersTrend: `${ordersTrendPerc > 0 ? "+" : ""}${ordersTrendPerc}%`,
                uniqueCustomers: uniqueCustomers.toLocaleString(),
                customersTrend: `${customersTrendPerc > 0 ? "+" : ""}${customersTrendPerc}%`,
                newCustomers: newCustomers.toLocaleString(),
                returningCustomers: returningCustomers.toLocaleString(),
            },
            salesTrend: chartData,
            customerTrend: chartData.map((d) => ({
                name: d.name,
                customers: d.customers || 0,
                orders: d.orders || 0,
            })),
            categoryMix: categoryData,
            topProducts: formattedTopProducts,
            trafficSources: finalTrafficSources,
            insights: {
                topCity,
                peakTime,
                topDevice: totalOrders > 0 ? `${devicePerc}% ${topDeviceType}` : "N/A",
            },
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   GET SELLER EARNINGS / TRANSACTIONS
================================ */
export const getSellerEarnings = async (req, res) => {
    try {
        const sellerId = req.user.id;
        const sellerOid = new mongoose.Types.ObjectId(sellerId);

        const platformSettings = await Setting.findOne({}).select("sellerSettlementModuleEnabled").lean();
        const moduleEnabled = platformSettings?.sellerSettlementModuleEnabled !== false;
        if (!moduleEnabled) {
            return handleResponse(res, 200, "Settlement module disabled by admin", {
                moduleEnabled: false,
                balances: null,
                monthlyChart: [],
                ledger: [],
            });
        }

        // Withdrawal-request Transactions are stored with userModel: "Store"
        // (sellerController.js's requestWithdrawal), not "Seller" — querying
        // "Seller" alone silently excludes every withdrawal this seller has
        // ever made or has pending, so pendingPayouts/totalWithdrawn below
        // always computed as 0 and "available balance" never reflected money
        // already tied up or paid out. requestWithdrawal's own balance check
        // already queries both models; mirror that here so what the seller
        // sees matches what withdrawal submission actually enforces.
        const transactions = await Transaction.find({ user: sellerId, userModel: { $in: ['Seller', 'Store'] } })
            .sort({ createdAt: -1 })
            .populate({
                path: "order",
                select:
                    "orderId status workflowStatus workflowVersion returnStatus disputeRef cancellationRequest pricing payment address paymentBreakdown items createdAt customer settlementStatus financeFlags",
                populate: {
                    path: "customer",
                    select: "name phone email",
                },
            });

        const settledBalance = transactions
            .filter(t => t.status === 'Settled')
            .reduce((acc, t) => acc + t.amount, 0);

        const pendingPayouts = transactions
            .filter(t => t.type === 'Withdrawal' && (t.status === 'Pending' || t.status === 'Processing'))
            .reduce((acc, t) => acc + Math.abs(t.amount), 0);

        // Fetch wallet for live pending balance (money on hold due to return window)
        const wallet = await Wallet.findOne({ ownerType: 'SELLER', ownerId: sellerId });
        const onHoldBalance = wallet ? wallet.pendingBalance : 0;
        // Net of pending/processing withdrawal requests, matching what requestWithdrawal
        // actually allows a seller to withdraw right now.
        const liveAvailableBalance = Math.max(
            0,
            (wallet ? Number(wallet.availableBalance || 0) : settledBalance) - pendingPayouts,
        );

        // "Total Revenue" here means the seller's own item revenue — the value of
        // what they sold — not `pricing.total`, which is the customer's full grand
        // total including delivery fee, platform fee, tax and tip (most of which
        // never belongs to the seller).
        const [orderRevenueAgg] = await Order.aggregate([
            {
                $match: {
                    seller: sellerOid,
                    status: { $ne: 'cancelled' },
                },
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: {
                        $sum: {
                            $ifNull: [
                                "$paymentBreakdown.productSubtotal",
                                { $ifNull: ["$pricing.subtotal", 0] },
                            ],
                        },
                    },
                },
            },
        ]);
        const totalRevenue = Number(orderRevenueAgg?.totalRevenue || 0);

        const totalWithdrawn = transactions
            .filter(t => t.type === 'Withdrawal' && t.status === 'Settled')
            .reduce((acc, t) => acc + Math.abs(t.amount), 0);

        // Monthly Revenue Aggregation (Last 6 Months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyAggregation = await Transaction.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(sellerId),
                    userModel: 'Seller',
                    type: 'Order Payment',
                    createdAt: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                    revenue: { $sum: "$amount" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const chartData = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const dateStr = d.toISOString().slice(0, 7);
            const data = monthlyAggregation.find(m => m._id === dateStr);
            chartData.push({
                name: monthNames[d.getMonth()],
                revenue: data ? data.revenue : 0
            });
        }

        return handleResponse(res, 200, "Earnings fetched successfully", {
            moduleEnabled: true,
            balances: {
                settledBalance: settledBalance,
                pendingPayouts: pendingPayouts,
                onHoldBalance: onHoldBalance, // New field
                availableBalance: liveAvailableBalance, // New field for clarity
                totalRevenue: totalRevenue,
                totalWithdrawn: totalWithdrawn
            },
            monthlyChart: chartData,
            ledger: transactions.map((t) => {
                const order = t.order || null;
                const customerDoc = order?.customer || null;
                const customerName =
                    order?.address?.name ||
                    customerDoc?.name ||
                    (t.type === "Withdrawal" ? "Bank Transfer" : "Customer");
                const customerPhone =
                    order?.address?.phone || customerDoc?.phone || "";
                const customerEmail = customerDoc?.email || "";
                const orderTotal = Number(
                    order?.paymentBreakdown?.grandTotal ??
                        order?.pricing?.total ??
                        0,
                );
                const sellerPayout = Number(
                    order?.paymentBreakdown?.sellerPayoutTotal ?? 0,
                );
                const itemCount = Array.isArray(order?.items)
                    ? order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
                    : 0;
                const itemsSummary = Array.isArray(order?.items)
                    ? order.items
                          .map((item) => `${item.name || "Item"} × ${item.quantity || 1}`)
                          .join(", ")
                    : "";
                const commissionAmount = Number(order?.paymentBreakdown?.adminProductCommissionTotal ?? 0);
                // Sum both packaging components that actually belong to the seller: the
                // store's flat per-order packaging fee, and any product-level packaging
                // override — the admin-configured category packing fee is platform
                // revenue and is intentionally excluded here.
                const packagingAmount =
                    Number(order?.paymentBreakdown?.packagingChargeAmount ?? 0) +
                    Number(order?.paymentBreakdown?.productPackagingChargeAmount ?? 0);
                const taxAmount = Number(order?.paymentBreakdown?.taxTotal ?? 0);
                const isBulkOrder = Boolean(order?.isBulkOrder || order?.paymentBreakdown?.isBulkOrder);

                // orderSettlement.js flips this Transaction to "Settled" the
                // instant an order is delivered, even when the seller payout
                // itself is actually on hold (return window / dispute /
                // manual admin hold) — Order.settlementStatus.sellerPayout is
                // the real source of truth for payout state. Surface it
                // separately rather than overwrite `status`, since other
                // consumers of this ledger (CSV export, filters) key off the
                // legacy Transaction status.
                const isPayoutHeld = Boolean(
                    order?.financeFlags?.sellerPayoutHeld || order?.financeFlags?.manualSettlementHold,
                );
                const sellerPayoutStatus =
                    order && t.type === "Order Payment" ? order.settlementStatus?.sellerPayout || null : null;

                return {
                    id: (t.reference || t._id).toString(),
                    type: t.type,
                    amount: t.amount,
                    status: t.status,
                    sellerPayoutStatus,
                    isPayoutHeld,
                    date: t.createdAt.toISOString().split("T")[0],
                    time: t.createdAt.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                    }),
                    createdAt: t.createdAt,
                    customer: customerName,
                    customerName,
                    customerPhone,
                    customerEmail,
                    orderId: order?.orderId || null,
                    orderMongoId: order?._id ? String(order._id) : null,
                    orderStatus: order?.status || null,
                    // Additive — was previously the only status signal here,
                    // showing the raw legacy field verbatim (no return/dispute
                    // overlay, no consistent label). Same resolver every other
                    // module's order list/detail view now reads.
                    displayStatus: order ? resolveOrderStatus(order) : null,
                    orderTotal,
                    sellerPayout,
                    commissionAmount,
                    packagingAmount,
                    taxAmount,
                    isBulkOrder,
                    paymentMethod: order?.payment?.method || null,
                    paymentStatus: order?.payment?.status || null,
                    itemCount,
                    itemsSummary,
                    ref: order?.orderId
                        ? `#${order.orderId}`
                        : t.reference || String(t._id),
                };
            }),
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
