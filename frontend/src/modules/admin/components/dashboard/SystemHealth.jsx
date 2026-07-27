import React from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import { cn } from "@/lib/utils";

const STATUS_VARIANT = {
  healthy: "success",
  configured: "success",
  disabled: "outline",
  not_configured: "warning",
  down: "error",
  degraded: "warning",
};

const STATUS_LABEL = {
  healthy: "Healthy",
  configured: "Configured",
  disabled: "Disabled",
  not_configured: "Not configured",
  down: "Down",
  degraded: "Degraded",
};

const SystemHealth = ({ systemHealth }) => {
  if (!systemHealth) return null;
  const services = systemHealth.services || [];
  const load = systemHealth.serverLoadPct;

  return (
    <Card title="System Health" subtitle={`Uptime ${systemHealth.uptime || "—"}`} contentClassName="p-4" className="h-full">
      <ul className="space-y-2.5">
        {services.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="text-xs text-slate-700 flex-1">{s.label}</span>
            {s.detail ? <span className="text-[10px] text-slate-400">{s.detail}</span> : null}
            <Badge variant={STATUS_VARIANT[s.status] || "outline"} className="text-[10px]">
              {STATUS_LABEL[s.status] || s.status}
            </Badge>
          </li>
        ))}
      </ul>
      <div className="mt-4 pt-3 border-t border-slate-100">
        <div className="flex justify-between text-[11px] mb-1">
          <span className="text-slate-500">Server Load</span>
          <span className="font-bold text-slate-700">{load == null ? "—" : `${load}%`}</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              load == null ? "bg-slate-300" : load > 80 ? "bg-red-500" : load > 60 ? "bg-amber-500" : "bg-emerald-500",
            )}
            style={{ width: load == null ? "0%" : `${Math.min(100, load)}%` }}
          />
        </div>
      </div>
    </Card>
  );
};

export default SystemHealth;
