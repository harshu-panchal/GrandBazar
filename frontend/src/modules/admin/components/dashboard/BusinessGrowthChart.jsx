import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import Card from "@shared/components/ui/Card";
import { TrendChip } from "@shared/components/dashboard/common";
import { formatInr } from "@/shared/utils/sellerOrderMoney";

const formatAxis = (v) => {
  const n = Number(v || 0);
  if (n >= 100000) return `₹${(n / 100000).toFixed(1).replace(/\.0$/, "")}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `₹${n}`;
};

const Chip = ({ label, pct }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
    <p className="text-[10px] font-semibold text-slate-500 uppercase">{label}</p>
    <TrendChip pct={pct} suffix="WoW" />
  </div>
);

const BusinessGrowthChart = ({ businessGrowth }) => {
  const series = businessGrowth?.series || [];
  const summary = businessGrowth?.summary || {};

  return (
    <Card title="Business Growth" subtitle="Last 7 days" contentClassName="p-4" className="h-full">
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Chip label="GMV Growth" pct={summary.gmvGrowthPct} />
        <Chip label="Order Growth" pct={summary.orderGrowthPct} />
        <Chip label="Seller Growth" pct={summary.sellerGrowthPct} />
        <Chip label="Customer Growth" pct={summary.customerGrowthPct} />
      </div>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis
              yAxisId="money"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatAxis}
            />
            <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value, name) => {
                if (name === "Orders") return [value, name];
                return [`₹${formatInr(Math.round(value))}`, name];
              }}
              contentStyle={{ borderRadius: 8, fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="money" type="monotone" dataKey="gmv" name="GMV" stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line yAxisId="count" type="monotone" dataKey="orders" name="Orders" stroke="#10b981" strokeWidth={2} dot={false} />
            <Line yAxisId="money" type="monotone" dataKey="revenue" name="Revenue" stroke="#ef4444" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

export default BusinessGrowthChart;
