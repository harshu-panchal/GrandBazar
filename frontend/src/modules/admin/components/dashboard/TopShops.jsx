import React from "react";
import Card from "@shared/components/ui/Card";
import { inr, TrendChip } from "@shared/components/dashboard/common";

const TopShops = ({ topShops }) => {
  const list = topShops || [];

  return (
    <Card title="Top Performing Shops" subtitle="This month" contentClassName="p-4" className="h-full">
      {list.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-8">No shop sales yet</p>
      ) : (
        <ul className="space-y-3">
          {list.map((shop, i) => (
            <li key={shop.id} className="flex items-start gap-3">
              <span className="h-7 w-7 rounded-lg bg-primary/10 text-primary text-xs font-black flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{shop.name}</p>
                {shop.city ? <p className="text-[10px] text-slate-400">{shop.city}</p> : null}
                <p className="text-xs text-slate-500 mt-0.5">{shop.orders} orders</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-slate-900">{inr(shop.revenue)}</p>
                <TrendChip pct={shop.growthPct} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export default TopShops;
