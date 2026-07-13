import React, { useEffect, useMemo, useState } from "react";
import {
  HiOutlineChartBar,
  HiOutlineGift,
  HiOutlineBanknotes,
  HiOutlineUsers,
  HiOutlineArrowTrendingUp,
  HiOutlineInformationCircle,
} from "react-icons/hi2";
import { Loader2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import Card from "@shared/components/ui/Card";
import StatCard from "@shared/components/ui/StatCard";
import PageHeader from "@shared/components/ui/PageHeader";
import Badge from "@shared/components/ui/Badge";
import Button from "@shared/components/ui/Button";
import { sellerApi } from "../services/sellerApi";
import { useNavigate } from "react-router-dom";

const SellerRewards = () => {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [analyticsRes, campaignsRes] = await Promise.all([
          sellerApi.getRewardAnalytics(),
          sellerApi.getRewardCampaigns(),
        ]);
        setAnalytics(analyticsRes.data?.result ?? null);
        setCampaigns(campaignsRes.data?.result ?? []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const grantStats = analytics?.grants ?? [];
  const chartData = grantStats.map((row) => ({
    name: (row._id || "unknown").replace(/_/g, " "),
    count: row.count,
    amount: row.totalAmount,
  }));

  const totals = useMemo(() => {
    const issued = grantStats.reduce((s, r) => s + (r.totalAmount || 0), 0);
    const grants = grantStats.reduce((s, r) => s + (r.count || 0), 0);
    const settlement = (analytics?.settlements ?? []).reduce((s, r) => s + (r.totalRewardCost || 0), 0);
    const activeCampaigns = campaigns.filter((c) => c.status === "active").length;
    return { issued, grants, settlement, activeCampaigns };
  }, [grantStats, analytics, campaigns]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Rewards Dashboard"
        description="Monitor campaign performance, cashback issued to customers, and reward costs deducted from your settlements."
        actions={
          <Button variant="outline" onClick={() => navigate("/seller/reward-campaigns")}>
            Manage Campaigns
          </Button>
        }
      />

      <Card className="p-4 bg-violet-50 dark:bg-violet-900/20 border-violet-100">
        <div className="flex gap-3 text-sm text-violet-900 dark:text-violet-100">
          <HiOutlineInformationCircle className="w-5 h-5 shrink-0" />
          <p>
            Seller-funded rewards are automatically credited to customer wallets when orders are delivered.
            The reward cost is tracked and reflected in your settlement reports.
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Campaigns" value={totals.activeCampaigns} icon={HiOutlineGift} color="text-primary-600" bg="bg-primary-50" />
        <StatCard label="Customers Rewarded" value={totals.grants} icon={HiOutlineUsers} color="text-violet-600" bg="bg-violet-50" />
        <StatCard label="Cashback Issued" value={`₹${totals.issued.toLocaleString("en-IN")}`} icon={HiOutlineBanknotes} color="text-green-600" bg="bg-green-50" />
        <StatCard label="Your Reward Cost" value={`₹${totals.settlement.toLocaleString("en-IN")}`} icon={HiOutlineArrowTrendingUp} color="text-amber-600" bg="bg-amber-50" description="Deducted from earnings" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <HiOutlineChartBar className="w-5 h-5 text-primary-600" />
            Rewards by Status
          </h3>
          {chartData.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              <HiOutlineGift className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              No reward data yet. Create a campaign to start rewarding customers.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="amount" fill="#6366f1" name="Amount (₹)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="count" fill="#22c55e" name="Count" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-bold text-slate-800 mb-4">Campaign Performance</h3>
          {campaigns.length === 0 ? (
            <p className="text-slate-500 text-sm py-8 text-center">No campaigns created</p>
          ) : (
            <div className="space-y-3 max-h-[260px] overflow-y-auto">
              {campaigns.map((c) => (
                <div key={c._id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-gray-800 rounded-xl">
                  <div>
                    <p className="font-semibold text-sm">{c.name}</p>
                    <p className="text-xs text-slate-500">
                      {c.stats?.totalGrants || 0} grants · ₹{c.stats?.totalAmount || 0} issued
                    </p>
                  </div>
                  <Badge variant={c.status === "active" ? "success" : "gray"}>{c.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {analytics?.settlements?.length > 0 && (
        <Card className="p-5">
          <h3 className="font-bold text-slate-800 mb-4">Settlement Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[10px] font-black uppercase text-slate-400">
                  <th className="py-2 pr-4">Metric</th>
                  <th className="py-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {analytics.settlements.map((row, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="py-3 pr-4">Orders with seller-funded rewards</td>
                    <td className="py-3 text-right font-medium">{row.orderCount}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-3 pr-4 font-bold">Total reward cost</td>
                  <td className="py-3 text-right font-bold text-amber-700">₹{totals.settlement.toLocaleString("en-IN")}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <h3 className="font-bold text-slate-800 mb-3">ROI Tips</h3>
        <ul className="text-sm text-slate-600 space-y-2 list-disc list-inside">
          <li>Target repeat customers with 3–5% cashback on orders above ₹300</li>
          <li>Set a budget cap to control monthly reward spend</li>
          <li>Pause campaigns during low-margin periods</li>
          <li>Combine with store coupons for higher conversion</li>
        </ul>
      </Card>
    </div>
  );
};

export default SellerRewards;
