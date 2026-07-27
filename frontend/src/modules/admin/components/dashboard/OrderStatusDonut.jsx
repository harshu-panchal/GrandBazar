import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import Card from "@shared/components/ui/Card";

const STATUS_COLORS = {
  new: "#8b5cf6",
  accepted: "#3b82f6",
  preparing: "#f59e0b",
  packed: "#14b8a6",
  outForDelivery: "#6366f1",
  delivered: "#10b981",
  cancelled: "#ef4444",
  returned: "#f97316",
};

const OrderStatusDonut = ({ orderStatus }) => {
  const total = orderStatus?.total || 0;
  const breakdown = orderStatus?.breakdown || [];
  const chartData = breakdown.filter((b) => b.count > 0);
  const hasData = chartData.length > 0;

  return (
    <Card title="Order Status" subtitle="Today" contentClassName="p-4" className="h-full">
      <div className="relative h-[160px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={hasData ? chartData : [{ key: "empty", label: "No orders", count: 1 }]}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={72}
              paddingAngle={hasData ? 2 : 0}
              strokeWidth={0}
            >
              {(hasData ? chartData : [{ key: "empty" }]).map((entry) => (
                <Cell key={entry.key} fill={hasData ? STATUS_COLORS[entry.key] : "#e2e8f0"} />
              ))}
            </Pie>
            {hasData && (
              <Tooltip
                formatter={(value, name) => [`${value} orders`, name]}
                contentStyle={{ borderRadius: 8, fontSize: 11 }}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-[10px] font-semibold text-slate-500">Total</p>
          <p className="text-xl font-bold text-slate-900">{total}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3 max-h-[140px] overflow-y-auto">
        {breakdown.map((b) => {
          const pct = total > 0 ? Math.round((b.count / total) * 100) : 0;
          return (
            <div key={b.key} className="flex items-center gap-1.5 min-w-0">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[b.key] }} />
              <span className="text-[11px] text-slate-600 truncate flex-1">{b.label}</span>
              <span className="text-[11px] font-bold text-slate-900">
                {b.count} <span className="text-slate-400 font-medium">({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default OrderStatusDonut;
