import React from "react";
import { Sparkles, AlertTriangle, AlertCircle, Info } from "lucide-react";
import Card from "@shared/components/ui/Card";
import { cn } from "@/lib/utils";

const SEVERITY_ICON = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_BORDER = {
  critical: "border-l-red-500",
  warning: "border-l-amber-500",
  info: "border-l-sky-500",
};

const AiInsights = ({ aiInsights }) => {
  const list = aiInsights || [];

  return (
    <Card
      title="AI Insights & Recommendations"
      subtitle="Rule-based suggestions"
      headerAction={<Sparkles className="h-4 w-4 text-primary" />}
      contentClassName="p-4"
      className="h-full"
    >
      {list.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6">No insights yet — keep trading!</p>
      ) : (
        <ul className="space-y-2.5">
          {list.map((item, i) => {
            const Icon = SEVERITY_ICON[item.severity] || Info;
            return (
              <li
                key={`${item.message}-${i}`}
                className={cn(
                  "flex items-start gap-2.5 pl-3 py-2 border-l-4 rounded-r-lg bg-slate-50/80",
                  SEVERITY_BORDER[item.severity] || SEVERITY_BORDER.info,
                )}
              >
                <Icon className="h-4 w-4 mt-0.5 shrink-0 text-slate-500" />
                <p className="text-xs text-slate-700 leading-snug">{item.message}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};

export default AiInsights;
