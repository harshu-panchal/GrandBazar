import React from "react";
import { Link } from "react-router-dom";
import Card from "@shared/components/ui/Card";
import { inr, TrendChip, Stars } from "@shared/components/dashboard/common";

const Row = ({ label, children }) => (
  <div className="flex items-center justify-between gap-2 py-1.5">
    <span className="text-xs text-slate-600">{label}</span>
    <div className="flex items-center gap-1.5">{children}</div>
  </div>
);

const CustomerOverview = ({ customerOverview }) => {
  if (!customerOverview) return null;
  const c = customerOverview;

  return (
    <Card title="Customer Overview" contentClassName="p-4" className="h-full">
      <div className="divide-y divide-slate-50">
        <Row label="Total Customers">
          <span className="text-sm font-bold text-slate-900">
            {Number(c.totalCustomers || 0).toLocaleString("en-IN")}
          </span>
        </Row>
        <Row label="New This Month">
          <span className="text-sm font-bold text-slate-900">
            {Number(c.newThisMonth?.value || 0).toLocaleString("en-IN")}
          </span>
          <TrendChip pct={c.newThisMonth?.trendPct} />
        </Row>
        <Row label="Active This Month">
          <span className="text-sm font-bold text-slate-900">
            {Number(c.activeThisMonth || 0).toLocaleString("en-IN")}
          </span>
        </Row>
        <Row label="Repeat Customers">
          <span className="text-sm font-bold text-slate-900">
            {Number(c.repeatCustomers || 0).toLocaleString("en-IN")}
          </span>
        </Row>
        <Row label="Retention Rate">
          <span className="text-sm font-bold text-slate-900">
            {c.retentionPct != null ? `${c.retentionPct}%` : "—"}
          </span>
        </Row>
        <Row label="Avg Order Value">
          <span className="text-sm font-bold text-slate-900">{inr(c.avgOrderValue)}</span>
        </Row>
        <Row label="Satisfaction">
          <Stars rating={c.satisfaction} />
          <span className="text-xs text-slate-500">
            {c.satisfaction != null ? `${c.satisfaction}/5` : ""}
          </span>
        </Row>
      </div>
      <Link
        to="/admin/customers"
        className="mt-4 block text-center text-xs font-bold text-primary hover:text-primary/80"
      >
        View Customer Analytics →
      </Link>
    </Card>
  );
};

export default CustomerOverview;
