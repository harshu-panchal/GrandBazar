import React from "react";
import { useNavigate } from "react-router-dom";
import {
  BadgeIndianRupee,
  ShoppingBag,
  BarChart3,
  TrendingUp,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import Card from "@shared/components/ui/Card";
import { cn } from "@/lib/utils";
import { inr, TrendChip, IconChip } from "@shared/components/dashboard/common";

const CARDS = [
  {
    key: "todaySales",
    label: "Today's Sales",
    money: true,
    icon: BadgeIndianRupee,
    chip: "bg-emerald-50 text-emerald-600",
    path: "/seller/earnings",
    footnote: "vs yesterday",
  },
  {
    key: "todayOrders",
    label: "Total Orders",
    money: false,
    icon: ShoppingBag,
    chip: "bg-purple-50 text-purple-600",
    path: "/seller/orders",
    footnote: "vs yesterday",
  },
  {
    key: "avgOrderValue",
    label: "Avg. Order Value",
    money: true,
    icon: BarChart3,
    chip: "bg-sky-50 text-sky-600",
    path: "/seller/analytics",
    footnote: "vs yesterday",
  },
  {
    key: "netProfit",
    label: "Net Profit",
    money: true,
    icon: TrendingUp,
    chip: "bg-orange-50 text-orange-600",
    path: "/seller/earnings",
    footnote: "vs yesterday",
  },
  {
    key: "pendingOrders",
    label: "Pending Orders",
    money: false,
    icon: ShoppingCart,
    chip: "bg-red-50 text-red-500",
    path: "/seller/orders",
    footnote: "need attention",
  },
  {
    key: "walletBalance",
    label: "Wallet Balance",
    money: true,
    icon: Wallet,
    chip: "bg-blue-50 text-blue-600",
    path: "/seller/withdrawals",
    footnote: "Available Balance",
  },
];

const KpiCards = ({ kpis }) => {
  const navigate = useNavigate();
  if (!kpis) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {CARDS.map((card) => {
        const kpi = kpis[card.key] || {};
        const value = card.money ? inr(kpi.value) : Number(kpi.value || 0).toLocaleString("en-IN");
        return (
          <Card
            key={card.key}
            role="button"
            tabIndex={0}
            onClick={() => navigate(card.path)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate(card.path);
              }
            }}
            contentClassName="p-4"
            className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <IconChip icon={card.icon} className={card.chip} />
            <p className="text-xs font-medium text-slate-500 mt-3">{card.label}</p>
            <p className="text-xl font-bold text-slate-900 mt-0.5">{value}</p>
            <div className="flex items-center gap-1.5 mt-1.5 min-h-4 flex-wrap">
              <TrendChip pct={kpi.trendPct} />
              <span
                className={cn(
                  "text-[11px] text-slate-500",
                  card.key === "pendingOrders" && Number(kpi.value) > 0 && "text-red-500 font-medium",
                )}
              >
                {card.footnote}
              </span>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default KpiCards;
