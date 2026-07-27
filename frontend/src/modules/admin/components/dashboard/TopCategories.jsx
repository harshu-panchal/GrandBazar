import React from "react";
import Card from "@shared/components/ui/Card";
import { inr } from "@shared/components/dashboard/common";

const TopCategories = ({ topCategories }) => {
  const list = topCategories || [];

  return (
    <Card title="Top Selling Categories" subtitle="This month" contentClassName="p-4" className="h-full">
      {list.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-8">No category data yet</p>
      ) : (
        <ul className="space-y-3">
          {list.map((cat, i) => (
            <li key={cat.id} className="flex items-center gap-3">
              <span className="h-7 w-7 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-black flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{cat.name}</p>
                <p className="text-xs text-slate-500">{cat.units} units sold</p>
              </div>
              <p className="text-sm font-bold text-slate-900 shrink-0">{inr(cat.revenue)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export default TopCategories;
