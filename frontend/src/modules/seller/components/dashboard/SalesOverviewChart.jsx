import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Card from "@shared/components/ui/Card";
import { formatInr } from "@/shared/utils/sellerOrderMoney";
import { RangeSelect } from "@shared/components/dashboard/common";

const SalesTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="bg-slate-900 text-white rounded-lg px-3 py-2 shadow-xl">
      <p className="text-[10px] font-semibold text-slate-300">{point.name}</p>
      <p className="text-sm font-bold">Sales: ₹{formatInr(point.sales)}</p>
    </div>
  );
};

const SalesOverviewChart = ({ salesOverview, range, onRangeChange }) => {
  const data = salesOverview?.data || [];
  const isWeek = range === "week";
  const chartData = data.map((d) => ({ ...d, label: isWeek ? d.name : d.name }));

  return (
    <Card
      title="Sales Overview"
      headerAction={
        <RangeSelect
          value={range}
          onChange={onRangeChange}
          options={[
            { value: "week", label: "This Week" },
            { value: "month", label: "This Month" },
          ]}
        />
      }
      contentClassName="p-4"
    >
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="salesOverviewGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              tick={{ fill: "#64748b", fontSize: 11, fontWeight: 600 }}
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
            <Tooltip content={<SalesTooltip />} cursor={{ stroke: "#fca5a5", strokeDasharray: "4 4" }} />
            <Area
              type="monotone"
              dataKey="sales"
              stroke="#ef4444"
              strokeWidth={2.5}
              fill="url(#salesOverviewGradient)"
              dot={{ r: 3, fill: "#ef4444", strokeWidth: 2, stroke: "#fff" }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

export default SalesOverviewChart;
