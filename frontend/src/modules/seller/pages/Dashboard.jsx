import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Download, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@shared/components/ui/PageHeader";
import { exportToCSV } from "@/lib/exportUtils";
import { sellerApi } from "../services/sellerApi";
import { Skeleton } from "@shared/components/dashboard/common";
import KpiCards from "../components/dashboard/KpiCards";
import ShopPerformance from "../components/dashboard/ShopPerformance";
import SalesOverviewChart from "../components/dashboard/SalesOverviewChart";
import OrderStatusDonut from "../components/dashboard/OrderStatusDonut";
import TopSellingProducts from "../components/dashboard/TopSellingProducts";
import RevenueVsProfitChart from "../components/dashboard/RevenueVsProfitChart";
import CustomerOverview from "../components/dashboard/CustomerOverview";
import InventoryOverview from "../components/dashboard/InventoryOverview";
import FinancialSummary from "../components/dashboard/FinancialSummary";
import MarketingRewards from "../components/dashboard/MarketingRewards";
import AssistantPerformance from "../components/dashboard/AssistantPerformance";
import BusinessHealthScore from "../components/dashboard/BusinessHealthScore";
import AiRecommendations from "../components/dashboard/AiRecommendations";
import RecentNotifications from "../components/dashboard/RecentNotifications";

const DashboardSkeleton = () => (
  <div className="ds-section-spacing">
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-32" />
      ))}
    </div>
    <Skeleton className="h-56" />
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Skeleton className="h-80" />
      <Skeleton className="h-80" />
      <Skeleton className="h-80" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Skeleton className="h-72" />
      <Skeleton className="h-72" />
      <Skeleton className="h-72" />
    </div>
  </div>
);

const buildReportRows = (data) => {
  if (!data) return [];
  const rows = [];
  const push = (section, metric, value) => rows.push({ Section: section, Metric: metric, Value: value });

  const k = data.kpis || {};
  push("KPIs", "Today's Sales (₹)", k.todaySales?.value ?? 0);
  push("KPIs", "Total Orders (Today)", k.todayOrders?.value ?? 0);
  push("KPIs", "Avg. Order Value (₹)", k.avgOrderValue?.value ?? 0);
  push("KPIs", "Net Profit (₹)", k.netProfit?.value ?? 0);
  push("KPIs", "Pending Orders", k.pendingOrders?.value ?? 0);
  push("KPIs", "Wallet Balance (₹)", k.walletBalance?.value ?? 0);

  (data.shopPerformance?.stores || []).forEach((s) => {
    push("Shop Performance", `${s.name} - Sales Today (₹)`, s.salesToday);
    push("Shop Performance", `${s.name} - Orders Today`, s.ordersToday);
    push("Shop Performance", `${s.name} - Pending`, s.pending);
    push("Shop Performance", `${s.name} - Profit Today (₹)`, s.profitToday);
  });

  (data.orderStatus?.breakdown || []).forEach((b) =>
    push("Order Status (Today)", b.label, b.count),
  );

  (data.topProducts || []).forEach((p) =>
    push("Top Selling Products", `${p.name} (${p.units} units)`, p.revenue),
  );

  const f = data.financialSummary || {};
  push("Financial Summary (Month)", "Total Revenue (₹)", f.totalRevenue ?? 0);
  push("Financial Summary (Month)", "Platform Commission (₹)", f.platformCommission ?? 0);
  push("Financial Summary (Month)", "Delivery Charges (₹)", f.deliveryCharges ?? 0);
  push("Financial Summary (Month)", "Taxes (₹)", f.taxes ?? 0);
  push("Financial Summary (Month)", "Other Charges (₹)", f.otherCharges ?? 0);
  push("Financial Summary (Month)", "Net Profit (₹)", f.netProfit ?? 0);

  const c = data.customerOverview || {};
  push("Customers (Month)", "New Customers", c.newCustomers?.value ?? 0);
  push("Customers (Month)", "Repeat Customers", c.repeatCustomers?.value ?? 0);
  push("Customers (Month)", "Returning %", c.returningPct?.value ?? "—");
  push("Customers (Month)", "Avg. Basket Size (₹)", c.avgBasketSize?.value ?? 0);

  const inv = data.inventory || {};
  push("Inventory", "Total Products", inv.totalProducts ?? 0);
  push("Inventory", "In Stock", inv.inStock ?? 0);
  push("Inventory", "Low Stock", inv.lowStock ?? 0);
  push("Inventory", "Out of Stock", inv.outOfStock ?? 0);
  push("Inventory", "Expiring Soon", inv.expiringSoon ?? 0);
  push("Inventory", "Inventory Value (₹)", inv.inventoryValue ?? 0);

  const m = data.marketing || {};
  push("Marketing (Month)", "Cashback Issued (₹)", m.cashbackIssued ?? 0);
  push("Marketing (Month)", "Coupons Redeemed (₹)", m.couponsRedeemed ?? 0);
  push("Marketing (Month)", "Referral Success", m.referralSuccess ?? 0);
  push("Marketing (Month)", "Campaign Sales (₹)", m.campaignSales ?? 0);
  push("Marketing (Month)", "ROI", m.roi ?? "—");

  push("Business Health", "Score", data.healthScore?.score ?? "—");
  (data.healthScore?.metrics || []).forEach((metric) =>
    push("Business Health", metric.label, metric.display),
  );

  return rows;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [salesRange, setSalesRange] = useState("week");
  const [revenueRange, setRevenueRange] = useState("month");

  const fetchDashboard = useCallback(async (params, { silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const res = await sellerApi.getDashboard(params);
      if (res.data.success) setData(res.data.result);
    } catch (error) {
      if (error.response?.status === 403) {
        setForbidden(true);
      } else {
        console.error("Dashboard fetch error:", error);
        toast.error("Failed to load dashboard data");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard({ salesRange: "week", revenueRange: "month" });
  }, [fetchDashboard]);

  const handleSalesRangeChange = (value) => {
    setSalesRange(value);
    fetchDashboard({ salesRange: value, revenueRange }, { silent: true });
  };

  const handleRevenueRangeChange = (value) => {
    setRevenueRange(value);
    fetchDashboard({ salesRange, revenueRange: value }, { silent: true });
  };

  const handleDownloadReport = () => {
    const rows = buildReportRows(data);
    if (!rows.length) {
      toast.error("No data to export yet");
      return;
    }
    exportToCSV(rows, "dashboard-report");
    toast.success("Report downloaded");
  };

  if (forbidden) {
    return (
      <div className="ds-section-spacing">
        <PageHeader title="Dashboard" description="Overview of your business performance" />
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <p className="text-sm font-semibold text-slate-700">
            You don't have permission to view analytics.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Ask the store owner to grant you the Analytics permission.
          </p>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="ds-section-spacing">
      <PageHeader
        title="Dashboard"
        description="Overview of your business performance"
        actions={
          <button
            onClick={handleDownloadReport}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:border-primary hover:text-primary transition-colors shadow-sm"
          >
            <Download className="h-3.5 w-3.5" />
            Download Report
          </button>
        }
      />

      {/* Free-tier product limit banner (commission-model sellers only) */}
      {data?.freeTierStatus?.isOverLimit && (
        <div
          className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border px-5 py-4 ${
            data.freeTierStatus.enforcementMode === "hard"
              ? "border-rose-200 bg-rose-50"
              : "border-amber-200 bg-amber-50"
          }`}
        >
          <AlertTriangle
            className={`h-5 w-5 shrink-0 ${
              data.freeTierStatus.enforcementMode === "hard" ? "text-rose-600" : "text-amber-600"
            }`}
          />
          {data.freeTierStatus.enforcementMode === "hard" ? (
            <p className="text-sm font-medium text-rose-900 flex-1">
              You've reached your free product limit ({data.freeTierStatus.limit} products). New
              products can't be published until you choose a subscription plan.
            </p>
          ) : (
            <p className="text-sm font-medium text-amber-900 flex-1">
              You have <strong>{data.freeTierStatus.publishedCount}</strong> products published
              (free-plan limit: <strong>{data.freeTierStatus.limit}</strong>). Orders on products
              above this limit incur an additional{" "}
              <strong>{data.freeTierStatus.surchargePercent}%</strong> commission.
            </p>
          )}
          <button
            onClick={() => navigate("/seller/choose-model")}
            className={`shrink-0 px-4 py-2 rounded-xl text-white text-xs font-bold transition-colors ${
              data.freeTierStatus.enforcementMode === "hard"
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-amber-600 hover:bg-amber-700"
            }`}
          >
            {data.freeTierStatus.enforcementMode === "hard"
              ? "Choose a plan"
              : "Upgrade to a subscription plan"}
          </button>
        </div>
      )}

      {/* KPI cards */}
      <KpiCards kpis={data?.kpis} />

      {/* Shop performance (owners with stores) */}
      <ShopPerformance shopPerformance={data?.shopPerformance} />

      {/* Sales overview / order status / top products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SalesOverviewChart
          salesOverview={data?.salesOverview}
          range={salesRange}
          onRangeChange={handleSalesRangeChange}
        />
        <OrderStatusDonut orderStatus={data?.orderStatus} />
        <TopSellingProducts topProducts={data?.topProducts} />
      </div>

      {/* Revenue vs profit / customers / inventory */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <RevenueVsProfitChart
          revenueVsProfit={data?.revenueVsProfit}
          range={revenueRange}
          onRangeChange={handleRevenueRangeChange}
        />
        <CustomerOverview customerOverview={data?.customerOverview} />
        <InventoryOverview inventory={data?.inventory} />
      </div>

      {/* Financials / marketing / assistants */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <FinancialSummary financialSummary={data?.financialSummary} />
        <MarketingRewards marketing={data?.marketing} />
        <AssistantPerformance assistants={data?.assistants} />
      </div>

      {/* Health score / recommendations / notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <BusinessHealthScore healthScore={data?.healthScore} />
        <AiRecommendations recommendations={data?.recommendations} />
        <RecentNotifications />
      </div>
    </div>
  );
};

export default Dashboard;
