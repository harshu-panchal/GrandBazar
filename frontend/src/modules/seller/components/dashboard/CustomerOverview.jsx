import React from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus, Users, Repeat, ShoppingBasket, Crown } from "lucide-react";
import Card from "@shared/components/ui/Card";
import { inr, TrendChip, IconChip, ViewAllLink } from "@shared/components/dashboard/common";

const Row = ({ icon, chip, label, value, trendPct }) => (
  <div className="flex items-center gap-3">
    <IconChip icon={icon} className={chip} />
    <span className="text-xs text-slate-600 flex-1 min-w-0 truncate">{label}</span>
    <span className="text-sm font-bold text-slate-900">{value}</span>
    <span className="w-14 text-right">
      <TrendChip pct={trendPct} />
    </span>
  </div>
);

const CustomerOverview = ({ customerOverview }) => {
  const navigate = useNavigate();
  if (!customerOverview) return null;
  const c = customerOverview;

  return (
    <Card
      title="Customer Overview"
      subtitle="This Month"
      headerAction={<ViewAllLink onClick={() => navigate("/seller/orders")} />}
      contentClassName="p-4"
    >
      <div className="space-y-3.5">
        <Row
          icon={UserPlus}
          chip="bg-sky-50 text-sky-600"
          label="New Customers"
          value={c.newCustomers?.value ?? 0}
          trendPct={c.newCustomers?.trendPct}
        />
        <Row
          icon={Users}
          chip="bg-purple-50 text-purple-600"
          label="Repeat Customers"
          value={c.repeatCustomers?.value ?? 0}
          trendPct={c.repeatCustomers?.trendPct}
        />
        <Row
          icon={Repeat}
          chip="bg-emerald-50 text-emerald-600"
          label="Returning %"
          value={c.returningPct?.value === null || c.returningPct?.value === undefined ? "—" : `${c.returningPct.value}%`}
        />
        <Row
          icon={ShoppingBasket}
          chip="bg-orange-50 text-orange-600"
          label="Avg. Basket Size"
          value={inr(c.avgBasketSize?.value)}
        />
      </div>

      {c.topCustomer && (
        <div className="flex items-center gap-3 mt-4 pt-3.5 border-t border-slate-100">
          <IconChip icon={Crown} className="bg-violet-50 text-violet-600" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-slate-500">Highest Spending Customer</p>
            <p className="text-xs font-bold text-slate-900 truncate">{c.topCustomer.name}</p>
          </div>
          <span className="text-sm font-bold text-slate-900">{inr(c.topCustomer.spend)}</span>
        </div>
      )}
    </Card>
  );
};

export default CustomerOverview;
