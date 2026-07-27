import React from "react";
import { Sparkles, AlertOctagon, AlertTriangle, Lightbulb } from "lucide-react";
import Card from "@shared/components/ui/Card";
import { cn } from "@/lib/utils";

const SEVERITY_STYLES = {
  critical: { icon: AlertOctagon, chip: "bg-red-50 text-red-500" },
  warning: { icon: AlertTriangle, chip: "bg-amber-50 text-amber-600" },
  info: { icon: Lightbulb, chip: "bg-emerald-50 text-emerald-600" },
};

const AiRecommendations = ({ recommendations }) => {
  const recs = recommendations || [];

  return (
    <Card title="AI Recommendations" subtitle="Based on your store data" contentClassName="p-4">
      {recs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Sparkles className="h-8 w-8 text-slate-300" />
          <p className="text-xs text-slate-500 mt-2">
            All good! No recommendations right now.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {recs.map((rec, idx) => {
            const style = SEVERITY_STYLES[rec.severity] || SEVERITY_STYLES.info;
            const Icon = style.icon;
            return (
              <div key={idx} className="flex items-start gap-3">
                <div
                  className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                    style.chip,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-xs text-slate-700 leading-relaxed pt-1.5">{rec.message}</p>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default AiRecommendations;
