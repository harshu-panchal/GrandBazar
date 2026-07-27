import React from "react";
import { useNavigate } from "react-router-dom";
import { Package } from "lucide-react";
import Card from "@shared/components/ui/Card";
import { inr, ViewAllLink } from "./common";

const TopSellingProducts = ({ topProducts }) => {
  const navigate = useNavigate();
  const products = topProducts || [];

  return (
    <Card
      title="Top Selling Products"
      headerAction={<ViewAllLink onClick={() => navigate("/seller/products")} />}
      contentClassName="p-4"
    >
      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Package className="h-8 w-8 text-slate-300" />
          <p className="text-xs text-slate-500 mt-2">No sales yet this month</p>
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((p) => (
            <div key={p.id || p.name} className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg overflow-hidden bg-slate-50 ring-1 ring-slate-100 shrink-0 flex items-center justify-center">
                {p.image ? (
                  <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <Package className="h-4 w-4 text-slate-300" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">{p.name}</p>
                <p className="text-[11px] text-slate-500">{p.units} units</p>
              </div>
              <p className="text-xs font-bold text-slate-900 shrink-0">{inr(p.revenue)}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export default TopSellingProducts;
