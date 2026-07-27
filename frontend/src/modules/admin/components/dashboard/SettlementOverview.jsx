import React from "react";
import Card from "@shared/components/ui/Card";
import { inr } from "@shared/components/dashboard/common";

const SettlementOverview = ({ settlements }) => {
  if (!settlements) return null;
  const pct = settlements.completedPct ?? 0;
  const counts = settlements.counts || {};

  return (
    <Card
      title="Settlement Overview"
      subtitle="Payouts (no invoice model — counts shown)"
      contentClassName="p-4"
      className="h-full"
    >
      <div className="space-y-4">
        <div>
          <p className="text-xs text-slate-500">Total Settlement Amount</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{inr(settlements.totalAmount)}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-emerald-50/80 p-3">
            <p className="text-[10px] font-semibold uppercase text-emerald-700">Completed</p>
            <p className="text-lg font-bold text-emerald-700">{inr(settlements.completedAmount)}</p>
          </div>
          <div className="rounded-xl bg-amber-50/80 p-3">
            <p className="text-[10px] font-semibold uppercase text-amber-700">Pending</p>
            <p className="text-lg font-bold text-amber-700">{inr(settlements.pendingAmount)}</p>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-slate-500">Completion</span>
            <span className="font-bold text-slate-700">{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
          <div>
            <p className="text-[10px] text-slate-400 uppercase font-semibold">Total</p>
            <p className="text-sm font-bold text-slate-800">{counts.total ?? 0}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase font-semibold">Paid</p>
            <p className="text-sm font-bold text-emerald-600">{counts.completed ?? 0}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase font-semibold">Pending</p>
            <p className="text-sm font-bold text-amber-600">{counts.pending ?? 0}</p>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default SettlementOverview;
