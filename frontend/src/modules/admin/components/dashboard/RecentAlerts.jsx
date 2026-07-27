import React from "react";
import { AlertTriangle, Info, AlertCircle } from "lucide-react";
import Card from "@shared/components/ui/Card";
import { timeAgo } from "@shared/components/dashboard/common";
import { cn } from "@/lib/utils";

const SEVERITY_ICON = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_CLASS = {
  critical: "bg-red-50 text-red-500",
  warning: "bg-amber-50 text-amber-600",
  info: "bg-sky-50 text-sky-600",
};

const RecentAlerts = ({ alerts }) => {
  const list = alerts || [];

  return (
    <Card title="Recent Alerts" contentClassName="p-4" className="h-full">
      {list.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6">No alerts right now</p>
      ) : (
        <ul className="space-y-3">
          {list.map((alert, i) => {
            const Icon = SEVERITY_ICON[alert.severity] || Info;
            return (
              <li key={`${alert.message}-${i}`} className="flex items-start gap-2.5">
                <div
                  className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                    SEVERITY_CLASS[alert.severity] || SEVERITY_CLASS.info,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-700 leading-snug">{alert.message}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(alert.at)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};

export default RecentAlerts;
