import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import Card from "@shared/components/ui/Card";
import { cn } from "@/lib/utils";
import { Stars } from "@shared/components/dashboard/common";

const scoreColor = (score) => {
  if (score === null) return "#e2e8f0";
  if (score >= 85) return "#10b981";
  if (score >= 70) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
};

const metricValueClass = (score) => {
  if (score === null) return "text-slate-400";
  if (score >= 85) return "text-emerald-600";
  if (score >= 70) return "text-green-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-500";
};

const BusinessHealthScore = ({ healthScore }) => {
  if (!healthScore) return null;
  const { score, label, stars, metrics = [] } = healthScore;
  const color = scoreColor(score);
  const gaugeData = [
    { name: "score", value: score ?? 0 },
    { name: "rest", value: 100 - (score ?? 0) },
  ];

  return (
    <Card title="Business Health Score" contentClassName="p-4">
      <div className="flex items-center gap-5">
        <div className="relative h-[140px] w-[140px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={gaugeData}
                dataKey="value"
                cx="50%"
                cy="50%"
                startAngle={225}
                endAngle={-45}
                innerRadius={52}
                outerRadius={64}
                strokeWidth={0}
                cornerRadius={8}
              >
                <Cell fill={color} />
                <Cell fill="#f1f5f9" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-2xl font-extrabold" style={{ color }}>
              {score === null ? "—" : `${score}%`}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {label}
            </p>
            <div className="mt-0.5">
              <Stars rating={stars} size="h-2.5 w-2.5" />
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          {metrics.map((m) => (
            <div key={m.key} className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-600 truncate">{m.label}</span>
              <span className={cn("text-xs font-bold shrink-0", metricValueClass(m.score))}>
                {m.display}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};

export default BusinessHealthScore;
