import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import Card from "@shared/components/ui/Card";

const STATUS_COLORS = {
  new: "#8b5cf6",
  accepted: "#3b82f6",
  preparing: "#f59e0b",
  outForDelivery: "#6366f1",
  delivered: "#10b981",
  cancelled: "#ef4444",
};

const OrderStatusDonut = ({ orderStatus }) => {
  const total = orderStatus?.total || 0;
  const breakdown = orderStatus?.breakdown || [];
  const chartData = breakdown.filter((b) => b.count > 0);
  const hasData = chartData.length > 0;

  return (
    <Card title="Order Status" subtitle="Today" contentClassName="p-4">
      <div className="relative h-[170px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={hasData ? chartData : [{ key: "empty", label: "No orders", count: 1 }]}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={hasData ? 2 : 0}
              strokeWidth={0}
            >
              {(hasData ? chartData : [{ key: "empty" }]).map((entry) => (
                <Cell
                  key={entry.key}
                  fill={hasData ? STATUS_COLORS[entry.key] : "#e2e8f0"}
                />
              ))}
            </Pie>
            {hasData && (
              <Tooltip
                formatter={(value, name) => [`${value} orders`, name]}
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-[10px] font-semibold text-slate-500">Total Orders</p>
          <p className="text-2xl font-bold text-slate-900">{total}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4">
        {breakdown.map((b) => {
          const pct = total > 0 ? Math.round((b.count / total) * 100) : 0;
          return (
            <div key={b.key} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: STATUS_COLORS[b.key] }}
              />
              <span className="text-xs text-slate-600 truncate flex-1">{b.label}</span>
              <span className="text-xs font-bold text-slate-900">
                {b.count} <span className="font-medium text-slate-400">({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default OrderStatusDonut;
