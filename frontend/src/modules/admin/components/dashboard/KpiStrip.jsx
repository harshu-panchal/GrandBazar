import React from "react";
import { useNavigate } from "react-router-dom";
import {
  BadgeIndianRupee,
  TrendingUp,
  ShoppingBag,
  Users,
  Store,
  UserPlus,
  Bike,
  ClipboardCheck,
  AlertTriangle,
  HeartPulse,
} from "lucide-react";
import Card from "@shared/components/ui/Card";
import { cn } from "@/lib/utils";
import { inr, TrendChip, IconChip } from "@shared/components/dashboard/common";
import { useAuth } from "@core/context/AuthContext";

const CARDS = [
  {
    key: "gmvToday",
    label: "GMV (Today)",
    money: true,
    icon: BadgeIndianRupee,
    chip: "bg-emerald-50 text-emerald-600",
    path: "/admin/billing",
    permission: "billing",
    footnote: "vs yesterday",
  },
  {
    key: "revenueToday",
    label: "Platform Revenue",
    money: true,
    icon: TrendingUp,
    chip: "bg-blue-50 text-blue-600",
    path: "/admin/billing",
    permission: "billing",
    footnote: "vs yesterday",
  },
  {
    key: "ordersToday",
    label: "Total Orders (Today)",
    money: false,
    icon: ShoppingBag,
    chip: "bg-purple-50 text-purple-600",
    path: "/admin/orders/all",
    permission: "orders",
    footnote: "vs yesterday",
  },
  {
    key: "activeSellers",
    label: "Active Sellers",
    money: false,
    icon: Users,
    chip: "bg-sky-50 text-sky-600",
    path: "/admin/sellers/active",
    permission: "sellers",
    footnote: "approved & active",
  },
  {
    key: "activeShops",
    label: "Active Shops",
    money: false,
    icon: Store,
    chip: "bg-indigo-50 text-indigo-600",
    path: "/admin/sellers/active",
    permission: "sellers",
    footnote: "verified & open",
  },
  {
    key: "newCustomersToday",
    label: "New Customers",
    money: false,
    icon: UserPlus,
    chip: "bg-teal-50 text-teal-600",
    path: "/admin/customers",
    permission: "customers",
    footnote: "vs yesterday",
  },
  {
    key: "deliveryPartners",
    label: "Delivery Partners",
    money: false,
    icon: Bike,
    chip: "bg-orange-50 text-orange-600",
    path: "/admin/delivery-boys/active",
    permission: "delivery",
    footnote: "", // dynamic: online count
  },
  {
    key: "pendingApprovals",
    label: "Pending Approvals",
    money: false,
    icon: ClipboardCheck,
    chip: "bg-amber-50 text-amber-600",
    path: "/admin/sellers/pending",
    permission: "sellers",
    footnote: "need attention",
    warnWhenPositive: true,
  },
  {
    key: "openDisputes",
    label: "Open Disputes",
    money: false,
    icon: AlertTriangle,
    chip: "bg-red-50 text-red-500",
    path: "/admin/disputes",
    permission: "orders",
    footnote: "need resolution",
    warnWhenPositive: true,
  },
  {
    key: "businessHealth",
    label: "Business Health",
    money: false,
    icon: HeartPulse,
    chip: "bg-rose-50 text-rose-500",
    path: null,
    footnote: "", // dynamic: label
  },
];

const KpiStrip = ({ kpis }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  if (!kpis) return null;

  const isSuperAdminOrAdmin = user?.role === "superadmin" || user?.role === "admin" || !user?.role;
  const canAccess = (perm) => {
    if (!perm) return true;
    if (isSuperAdminOrAdmin) return true;
    return user?.allowedPermissions?.includes(perm);
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
      {CARDS.map((card) => {
        const kpi = kpis[card.key] || {};
        let value;
        if (card.key === "businessHealth") {
          value = kpi.value === null || kpi.value === undefined ? "—" : `${kpi.value}%`;
        } else if (card.money) {
          value = inr(kpi.value);
        } else {
          value = Number(kpi.value || 0).toLocaleString("en-IN");
        }

        let footnote = card.footnote;
        if (card.key === "deliveryPartners") {
          footnote = `${Number(kpi.online || 0).toLocaleString("en-IN")} online now`;
        }
        if (card.key === "businessHealth") {
          footnote = kpi.label || "";
        }

        const allowed = Boolean(card.path && canAccess(card.permission));
        const handleCardClick = () => {
          if (allowed) {
            navigate(card.path);
          }
        };

        return (
          <Card
            key={card.key}
            role={allowed ? "button" : "region"}
            tabIndex={allowed ? 0 : -1}
            onClick={handleCardClick}
            onKeyDown={(e) => {
              if (allowed && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                handleCardClick();
              }
            }}
            contentClassName="p-4"
            className={cn(
              "transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
              allowed ? "cursor-pointer hover:shadow-lg hover:-translate-y-0.5" : "cursor-default opacity-95"
            )}
          >
            <IconChip icon={card.icon} className={card.chip} />
            <p className="text-xs font-medium text-slate-500 mt-3">{card.label}</p>
            <p className="text-xl font-bold text-slate-900 mt-0.5">{value}</p>
            <div className="flex items-center gap-1.5 mt-1.5 min-h-4 flex-wrap">
              <TrendChip pct={kpi.trendPct} />
              <span
                className={cn(
                  "text-[11px] text-slate-500",
                  card.warnWhenPositive && Number(kpi.value) > 0 && "text-red-500 font-medium",
                )}
              >
                {footnote}
              </span>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default KpiStrip;
