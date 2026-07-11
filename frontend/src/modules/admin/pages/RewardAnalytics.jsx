import React, { useEffect, useState } from "react";
import Card from "@shared/components/ui/Card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { HiOutlineChartBar } from "react-icons/hi2";
import { adminApi } from "../services/adminApi";

const RewardAnalytics = () => {
  const [data, setData] = useState(null);
  const [settlements, setSettlements] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [analyticsRes, settlementsRes] = await Promise.all([
          adminApi.getRewardAnalytics(),
          adminApi.getRewardSettlements(),
        ]);
        setData(analyticsRes.data?.result ?? null);
        setSettlements(settlementsRes.data?.result ?? []);
      } catch (err) {
        console.error(err);
      }
    };
    load();
  }, []);

  const chartData = (data?.grantStats ?? []).map((row) => ({
    name: row._id || "unknown",
    count: row.count,
    amount: row.totalAmount,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HiOutlineChartBar className="w-8 h-8 text-primary-600" />
          Reward Analytics
        </h1>
        <p className="text-gray-500 mt-1">Campaign performance, ROI & settlement overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          { label: "Active Campaigns", value: data?.activeCampaigns ?? 0 },
          { label: "Coupon Redemptions", value: data?.couponRedemptions ?? 0 },
          { label: "Successful Referrals", value: data?.successfulReferrals ?? 0 },
          { label: "Grant Types", value: chartData.length },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className="text-2xl font-bold mt-1">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h3 className="font-semibold mb-4">Rewards by Type</h3>
        {chartData.length === 0 ? (
          <p className="text-gray-500 text-sm">No grant data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="amount" fill="#6366f1" name="Amount (₹)" />
              <Bar dataKey="count" fill="#22c55e" name="Count" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold mb-4">Seller Settlement (Reward Costs)</h3>
        {settlements.length === 0 ? (
          <p className="text-gray-500 text-sm">No settlement data</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="text-left py-2">Seller</th>
                <th className="text-right py-2">Orders</th>
                <th className="text-right py-2">Reward Cost</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((row) => (
                <tr key={row._id} className="border-b">
                  <td className="py-2 font-mono text-xs">{String(row._id).slice(-8)}</td>
                  <td className="py-2 text-right">{row.orderCount}</td>
                  <td className="py-2 text-right font-medium">₹{row.totalRewardCost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

export default RewardAnalytics;
