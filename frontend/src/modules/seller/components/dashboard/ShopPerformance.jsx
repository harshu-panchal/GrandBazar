import React from "react";
import { useNavigate } from "react-router-dom";
import { Trophy, TrendingUp, TrendingDown } from "lucide-react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import { cn } from "@/lib/utils";
import { inr, TrendChip, Stars, ViewAllLink } from "@shared/components/dashboard/common";

const StatCell = ({ label, children }) => (
  <div>
    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    <div className="text-sm font-bold text-slate-900 mt-0.5">{children}</div>
  </div>
);

const StoreCard = ({ store }) => (
  <div
    className={cn(
      "rounded-xl border p-4 bg-white transition-all hover:shadow-md",
      store.isCurrent ? "border-primary/40 ring-1 ring-primary/20" : "border-slate-200",
    )}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-900 truncate">{store.name}</p>
        {store.locality && (
          <p className="text-[11px] text-slate-500 truncate">{store.locality}</p>
        )}
      </div>
      <Badge variant={store.isActive ? "success" : "secondary"} className="text-[10px] shrink-0">
        {store.isActive ? "Active" : "Inactive"}
      </Badge>
    </div>

    <div className="grid grid-cols-3 gap-3 mt-4">
      <StatCell label="Sales (Today)">{inr(store.salesToday)}</StatCell>
      <StatCell label="Orders">{store.ordersToday}</StatCell>
      <StatCell label="Pending">
        <span className={cn(store.pending > 0 && "text-amber-600")}>{store.pending}</span>
      </StatCell>
    </div>
    <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-slate-100">
      <StatCell label="Rating">
        {store.rating !== null ? (
          <span className="inline-flex items-center gap-1">
            {store.rating}
            <Stars rating={store.rating} size="h-3 w-3" />
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </StatCell>
      <StatCell label="Growth">
        {store.growthPct !== null ? <TrendChip pct={store.growthPct} /> : <span className="text-slate-400">—</span>}
      </StatCell>
      <StatCell label="Profit">{inr(store.profitToday)}</StatCell>
    </div>
  </div>
);

const HighlightRow = ({ icon: Icon, iconClass, label, value }) => (
  <div className="flex items-start gap-2.5">
    <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0", iconClass)}>
      <Icon className="h-3.5 w-3.5" />
    </div>
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-slate-600">{label}</p>
      <p className="text-xs font-bold text-slate-900 truncate">{value || "—"}</p>
    </div>
  </div>
);

const ShopPerformance = ({ shopPerformance }) => {
  const navigate = useNavigate();
  if (!shopPerformance || !shopPerformance.stores?.length) return null;

  const { stores, highlights } = shopPerformance;

  return (
    <Card
      title={`Shop Performance ${stores.length > 1 ? "(All Stores)" : ""}`}
      headerAction={<ViewAllLink label="View All Stores" onClick={() => navigate("/seller/stores")} />}
      contentClassName="p-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {stores.slice(0, 3).map((store) => (
          <StoreCard key={store.id} store={store} />
        ))}
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
          <HighlightRow
            icon={Trophy}
            iconClass="bg-amber-100 text-amber-600"
            label="Best Performing Store"
            value={highlights?.bestPerforming}
          />
          <HighlightRow
            icon={TrendingUp}
            iconClass="bg-emerald-100 text-emerald-600"
            label="Highest Growth"
            value={highlights?.highestGrowth}
          />
          <HighlightRow
            icon={TrendingDown}
            iconClass="bg-red-100 text-red-500"
            label="Lowest Performing"
            value={highlights?.lowestPerforming}
          />
        </div>
      </div>
    </Card>
  );
};

export default ShopPerformance;
