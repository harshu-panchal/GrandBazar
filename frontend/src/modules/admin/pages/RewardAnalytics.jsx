import React, { useEffect, useMemo, useState } from "react";
import Card from "@shared/components/ui/Card";
import StatCard from "@shared/components/ui/StatCard";
import PageHeader from "@shared/components/ui/PageHeader";
import Badge from "@shared/components/ui/Badge";
import Button from "@shared/components/ui/Button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  HiOutlineChartBar,
  HiOutlineGift,
  HiOutlineTicket,
  HiOutlineUsers,
  HiOutlineBanknotes,
  HiOutlineArrowPath,
} from "react-icons/hi2";
import { adminApi } from "../services/adminApi";

const PIE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];

const RewardAnalytics = () => {
  const [data, setData] = useState(null);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;
      const [analyticsRes, settlementsRes] = await Promise.all([
        adminApi.getRewardAnalytics(params),
        adminApi.getRewardSettlements(params),
      ]);
      setData(analyticsRes.data?.result ?? null);
      setSettlements(settlementsRes.data?.result ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const chartData = useMemo(
    () =>
      (data?.grantStats ?? []).map((row) => ({
        name: (row._id || "unknown").replace(/_/g, " "),
        count: row.count,
        amount: row.totalAmount,
      })),
    [data],
  );

  const totalIssued = chartData.reduce((s, r) => s + (r.amount || 0), 0);
  const totalGrants = chartData.reduce((s, r) => s + (r.count || 0), 0);
  const totalSettlement = settlements.reduce((s, r) => s + (r.totalRewardCost || 0), 0);

  const inputCls =
    "px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/30";

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Reward Analytics"
        description="Track campaign ROI, cashback issued, coupon redemptions, referral conversions and seller settlement costs."
        badge={<Badge variant="info">Analytics</Badge>}
        actions={
          <Button variant="outline" onClick={load} className="flex items-center gap-2">
            <HiOutlineArrowPath className="w-4 h-4" /> Refresh
          </Button>
        }
      />

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} />
          </div>
          <Button onClick={load}>Apply Filter</Button>
          <Button variant="outline" onClick={() => { setFromDate(""); setToDate(""); setTimeout(load, 0); }}>
            Clear
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Active Campaigns" value={data?.activeCampaigns ?? 0} icon={HiOutlineGift} color="text-primary-600" bg="bg-primary-50" />
        <StatCard label="Total Grants" value={totalGrants} icon={HiOutlineUsers} color="text-violet-600" bg="bg-violet-50" />
        <StatCard label="Cashback Issued" value={`₹${totalIssued.toLocaleString("en-IN")}`} icon={HiOutlineBanknotes} color="text-green-600" bg="bg-green-50" />
        <StatCard label="Coupon Redemptions" value={data?.couponRedemptions ?? 0} icon={HiOutlineTicket} color="text-amber-600" bg="bg-amber-50" />
        <StatCard label="Referrals Rewarded" value={data?.successfulReferrals ?? 0} icon={HiOutlineUsers} color="text-pink-600" bg="bg-pink-50" />
      </div>

      {loading ? (
        <Card className="p-12 text-center text-slate-500">Loading analytics...</Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-5">
              <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2">
                <HiOutlineChartBar className="w-5 h-5 text-primary-600" />
                Rewards by Campaign Type
              </h3>
              <p className="text-xs text-slate-500 mb-4">Amount issued vs grant count per reward type</p>
              {chartData.length === 0 ? (
                <p className="text-slate-500 text-sm py-12 text-center">No grant data in selected period</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v, name) => [name === "amount" ? `₹${v}` : v, name === "amount" ? "Amount" : "Count"]} />
                    <Legend />
                    <Bar dataKey="amount" fill="#6366f1" name="Amount (₹)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="count" fill="#22c55e" name="Grants" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="font-bold text-slate-800 mb-1">Distribution by Type</h3>
              <p className="text-xs text-slate-500 mb-4">Share of total reward amount</p>
              {chartData.length === 0 ? (
                <p className="text-slate-500 text-sm py-12 text-center">No data</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={chartData} dataKey="amount" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `₹${v}`} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-800">Seller Settlement — Reward Costs</h3>
                <p className="text-xs text-slate-500">Seller-funded cashback deducted from payouts</p>
              </div>
              <Badge variant="warning">Total: ₹{totalSettlement.toLocaleString("en-IN")}</Badge>
            </div>
            {settlements.length === 0 ? (
              <p className="text-slate-500 text-sm py-8 text-center">No seller-funded reward costs yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[10px] font-black uppercase tracking-wider text-slate-400">
                      <th className="py-3 pr-4">Seller ID</th>
                      <th className="py-3 pr-4 text-right">Orders with Rewards</th>
                      <th className="py-3 pr-4 text-right">Total Reward Cost</th>
                      <th className="py-3 text-right">Avg per Order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlements.map((row) => (
                      <tr key={row._id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-3 pr-4 font-mono text-xs">{String(row._id)}</td>
                        <td className="py-3 pr-4 text-right font-medium">{row.orderCount}</td>
                        <td className="py-3 pr-4 text-right font-bold text-amber-700">₹{row.totalRewardCost?.toLocaleString("en-IN")}</td>
                        <td className="py-3 text-right text-slate-500">
                          ₹{row.orderCount ? Math.round(row.totalRewardCost / row.orderCount) : 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="p-5 bg-gradient-to-br from-primary-50 to-violet-50 dark:from-gray-800 dark:to-gray-800 border-primary-100">
            <h3 className="font-bold text-slate-800 mb-2">Platform Health Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-slate-500 text-xs">Grant types active</p>
                <p className="text-xl font-bold">{chartData.length}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Avg reward value</p>
                <p className="text-xl font-bold">₹{totalGrants ? Math.round(totalIssued / totalGrants) : 0}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Referral conversion</p>
                <p className="text-xl font-bold">{data?.successfulReferrals ?? 0}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Coupon usage</p>
                <p className="text-xl font-bold">{data?.couponRedemptions ?? 0}</p>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default RewardAnalytics;
