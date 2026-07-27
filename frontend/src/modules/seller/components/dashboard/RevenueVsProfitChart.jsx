import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import Card from "@shared/components/ui/Card";
import { formatInr } from "@/shared/utils/sellerOrderMoney";
import { inr, RangeSelect } from "./common";

const RevenueVsProfitChart = ({ revenueVsProfit, range, onRangeChange }) => {
  const data = revenueVsProfit?.data || [];

  return (
    <Card
      title="Revenue vs Profit"
      headerAction={
        <RangeSelect
          value={range}
          onChange={onRangeChange}
          options={[
            { value: "month", label: "This Month" },
            { value: "week", label: "This Week" },
          ]}
        />
      }
      contentClassName="p-4"
    >
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="h-[240px] flex-1 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={1}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                tick={{ fill: "#64748b", fontSize: 10, fontWeight: 600 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={52}
                tick={{ fill: "#64748b", fontSize: 11, fontWeight: 600 }}
                tickFormatter={(v) =>
                  v >= 1000 ? `₹${(v / 1000).toFixed(1).replace(/\.0$/, "")}K` : `₹${v}`
                }
              />
              <Tooltip
                formatter={(value, name) => [`₹${formatInr(value)}`, name === "revenue" ? "Revenue" : "Profit"]}
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Legend
                formatter={(value) => (
                  <span className="text-xs font-semibold text-slate-600">
                    {value === "revenue" ? "Revenue" : "Profit"}
                  </span>
                )}
                iconType="circle"
                iconSize={8}
              />
              <Bar dataKey="revenue" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={14} />
              <Bar dataKey="profit" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex lg:flex-col gap-3 lg:w-40 shrink-0">
          <div className="flex-1 lg:flex-none rounded-xl bg-red-50 border border-red-100 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-400">
              Total Revenue
            </p>
            <p className="text-lg font-bold text-slate-900 mt-0.5">
              {inr(revenueVsProfit?.totalRevenue)}
            </p>
          </div>
          <div className="flex-1 lg:flex-none rounded-xl bg-emerald-50 border border-emerald-100 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500">
              Total Profit
            </p>
            <p className="text-lg font-bold text-emerald-600 mt-0.5">
              {inr(revenueVsProfit?.totalProfit)}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default RevenueVsProfitChart;
