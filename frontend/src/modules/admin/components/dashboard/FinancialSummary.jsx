import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import Card from "@shared/components/ui/Card";
import { inr } from "@shared/components/dashboard/common";

const BREAKDOWN_COLORS = {
  subscription: "#8b5cf6",
  commission: "#3b82f6",
  delivery: "#10b981",
  tax: "#f59e0b",
};

const Row = ({ label, value }) => (
  <div className="flex items-center justify-between">
    <span className="text-xs text-slate-600">{label}</span>
    <span className="text-sm font-semibold text-slate-900">{inr(value)}</span>
  </div>
);

const FinancialSummary = ({ financialSummary }) => {
  if (!financialSummary) return null;
  const f = financialSummary;
  const breakdown = (f.breakdown || []).filter((b) => b.value > 0);
  const hasBreakdown = breakdown.length > 0;

  return (
    <Card title="Financial Summary" subtitle="This month" contentClassName="p-4" className="h-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-3">
          <Row label="Platform Revenue" value={f.platformRevenue} />
          <Row label="Subscription Revenue" value={f.subscriptionRevenue} />
          <Row label="Commission Revenue" value={f.commissionRevenue} />
          <Row label="Other Income" value={f.otherIncome} />
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <span className="text-sm font-bold text-slate-900">Total Revenue</span>
            <span className="text-base font-extrabold text-emerald-600">{inr(f.totalRevenue)}</span>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Revenue Breakdown</p>
          <div className="relative h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={hasBreakdown ? breakdown : [{ key: "empty", label: "None", value: 1 }]}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={hasBreakdown ? 2 : 0}
                  strokeWidth={0}
                >
                  {(hasBreakdown ? breakdown : [{ key: "empty" }]).map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={hasBreakdown ? BREAKDOWN_COLORS[entry.key] || "#94a3b8" : "#e2e8f0"}
                    />
                  ))}
                </Pie>
                {hasBreakdown && (
                  <Tooltip
                    formatter={(value) => inr(value)}
                    contentStyle={{ borderRadius: 8, fontSize: 11 }}
                  />
                )}
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1 mt-1">
            {(f.breakdown || []).map((b) => (
              <div key={b.key} className="flex items-center gap-2 text-[11px]">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: BREAKDOWN_COLORS[b.key] || "#94a3b8" }}
                />
                <span className="text-slate-600 flex-1">{b.label}</span>
                <span className="font-semibold text-slate-800">{inr(b.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default FinancialSummary;
