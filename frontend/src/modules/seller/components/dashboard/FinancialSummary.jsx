import React from "react";
import Card from "@shared/components/ui/Card";
import { cn } from "@/lib/utils";
import { inr } from "@shared/components/dashboard/common";

const Row = ({ label, value, negative }) => (
  <div className="flex items-center justify-between">
    <span className="text-xs text-slate-600">{label}</span>
    <span className={cn("text-sm font-semibold", negative ? "text-red-500" : "text-slate-900")}>
      {negative ? `- ${inr(value)}` : inr(value)}
    </span>
  </div>
);

const FinancialSummary = ({ financialSummary }) => {
  if (!financialSummary) return null;
  const f = financialSummary;

  return (
    <Card title="Financial Summary" subtitle="This Month" contentClassName="p-4">
      <div className="space-y-3.5">
        <Row label="Total Revenue" value={f.totalRevenue} />
        <Row label="Platform Commission" value={f.platformCommission} negative />
        <Row label="Delivery Charges" value={f.deliveryCharges} negative />
        <Row label="Taxes" value={f.taxes} negative />
        <Row label="Other Charges" value={f.otherCharges} negative />
        <div className="flex items-center justify-between pt-3.5 border-t border-slate-200">
          <span className="text-sm font-bold text-slate-900">Net Profit</span>
          <span className="text-base font-extrabold text-emerald-600">{inr(f.netProfit)}</span>
        </div>
      </div>
    </Card>
  );
};

export default FinancialSummary;
