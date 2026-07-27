import React, { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@shared/components/ui/PageHeader";
import { Skeleton } from "@shared/components/dashboard/common";
import { exportToCSV } from "@/lib/exportUtils";
import { adminApi } from "../services/adminApi";
import KpiStrip from "../components/dashboard/KpiStrip";
import CityWiseSales from "../components/dashboard/CityWiseSales";
import BusinessGrowthChart from "../components/dashboard/BusinessGrowthChart";
import SellerShopOverview from "../components/dashboard/SellerShopOverview";
import ApprovalCenter from "../components/dashboard/ApprovalCenter";
import RecentAlerts from "../components/dashboard/RecentAlerts";
import OrderStatusDonut from "../components/dashboard/OrderStatusDonut";
import LogisticsOverview from "../components/dashboard/LogisticsOverview";
import TopShops from "../components/dashboard/TopShops";
import TopCategories from "../components/dashboard/TopCategories";
import SystemHealth from "../components/dashboard/SystemHealth";
import FinancialSummary from "../components/dashboard/FinancialSummary";
import SettlementOverview from "../components/dashboard/SettlementOverview";
import CustomerOverview from "../components/dashboard/CustomerOverview";
import AiInsights from "../components/dashboard/AiInsights";
import ActivityFeed from "../components/dashboard/ActivityFeed";
import NewSellerRequests from "../components/dashboard/NewSellerRequests";

const DashboardSkeleton = () => (
  <div className="ds-section-spacing">
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
      {Array.from({ length: 10 }, (_, i) => (
        <Skeleton key={i} className="h-32" />
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr] gap-6">
      <Skeleton className="h-96" />
      <Skeleton className="h-96" />
      <Skeleton className="h-96" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-80" />
      ))}
    </div>
  </div>
);

const buildReportRows = (data) => {
  if (!data) return [];
  const rows = [];
  const push = (section, metric, value) => rows.push({ Section: section, Metric: metric, Value: value });

  const k = data.kpis || {};
  push("KPIs", "GMV Today (₹)", k.gmvToday?.value ?? 0);
  push("KPIs", "Platform Revenue Today (₹)", k.revenueToday?.value ?? 0);
  push("KPIs", "Orders Today", k.ordersToday?.value ?? 0);
  push("KPIs", "Active Sellers", k.activeSellers?.value ?? 0);
  push("KPIs", "Active Shops", k.activeShops?.value ?? 0);
  push("KPIs", "New Customers Today", k.newCustomersToday?.value ?? 0);
  push("KPIs", "Delivery Partners", k.deliveryPartners?.value ?? 0);
  push("KPIs", "Pending Approvals", k.pendingApprovals?.value ?? 0);
  push("KPIs", "Open Disputes", k.openDisputes?.value ?? 0);
  push("KPIs", "Business Health", k.businessHealth?.value ?? "—");

  (data.cityWiseSales?.rows || []).forEach((c) => {
    push("City Sales", `${c.city} - Sales (₹)`, c.sales);
    push("City Sales", `${c.city} - Orders`, c.orders);
  });

  const g = data.businessGrowth?.summary || {};
  push("Growth", "GMV WoW %", g.gmvGrowthPct ?? "—");
  push("Growth", "Orders WoW %", g.orderGrowthPct ?? "—");
  push("Growth", "Sellers WoW %", g.sellerGrowthPct ?? "—");
  push("Growth", "Customers WoW %", g.customerGrowthPct ?? "—");

  (data.orderStatus?.breakdown || []).forEach((b) => push("Order Status", b.label, b.count));

  const f = data.financialSummary || {};
  push("Finance", "Platform Revenue (₹)", f.platformRevenue ?? 0);
  push("Finance", "Subscription Revenue (₹)", f.subscriptionRevenue ?? 0);
  push("Finance", "Commission Revenue (₹)", f.commissionRevenue ?? 0);
  push("Finance", "Total Revenue (₹)", f.totalRevenue ?? 0);

  const s = data.settlements || {};
  push("Settlements", "Total (₹)", s.totalAmount ?? 0);
  push("Settlements", "Completed (₹)", s.completedAmount ?? 0);
  push("Settlements", "Pending (₹)", s.pendingAmount ?? 0);

  return rows;
};

const AdminDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState("");

  const fetchDashboard = useCallback(async (params = {}, { silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const res = await adminApi.getDashboardOverview(params);
      if (res.data.success) setData(res.data.result);
    } catch (error) {
      console.error("Admin dashboard fetch error:", error);
      toast.error(error.response?.data?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard({});
  }, [fetchDashboard]);

  const handleCityChange = (value) => {
    setCity(value);
    fetchDashboard(value ? { city: value } : {}, { silent: true });
  };

  const handleDownloadReport = () => {
    const rows = buildReportRows(data);
    if (!rows.length) {
      toast.error("No data to export yet");
      return;
    }
    exportToCSV(rows, "admin-platform-overview");
    toast.success("Report downloaded");
  };

  if (loading && !data) {
    return (
      <div className="ds-section-spacing">
        <PageHeader title="Platform Overview" description="Complete business intelligence at a glance" />
        <DashboardSkeleton />
      </div>
    );
  }

  const cities = data?.cities || [];

  return (
    <div className="ds-section-spacing">
      <PageHeader
        title="Platform Overview"
        description="Complete business intelligence at a glance"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={city}
              onChange={(e) => handleCityChange(e.target.value)}
              className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none cursor-pointer hover:border-slate-300 focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All Cities</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleDownloadReport}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:border-primary hover:text-primary transition-colors shadow-sm"
            >
              <Download className="h-3.5 w-3.5" />
              Download Report
            </button>
          </div>
        }
      />

      <KpiStrip kpis={data?.kpis} />

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6">
        <CityWiseSales cityWiseSales={data?.cityWiseSales} />
        <BusinessGrowthChart businessGrowth={data?.businessGrowth} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SellerShopOverview sellerShopOverview={data?.sellerShopOverview} />
        <ApprovalCenter approvalCenter={data?.approvalCenter} />
        <RecentAlerts alerts={data?.alerts} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <OrderStatusDonut orderStatus={data?.orderStatus} />
        <LogisticsOverview logistics={data?.logistics} />
        <TopShops topShops={data?.topShops} />
        <TopCategories topCategories={data?.topCategories} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <FinancialSummary financialSummary={data?.financialSummary} />
        <SettlementOverview settlements={data?.settlements} />
        <CustomerOverview customerOverview={data?.customerOverview} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SystemHealth systemHealth={data?.systemHealth} />
        <AiInsights aiInsights={data?.aiInsights} />
        <ActivityFeed activityFeed={data?.activityFeed} />
      </div>

      <NewSellerRequests />
    </div>
  );
};

export default AdminDashboard;
