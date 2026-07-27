import React from "react";
import { Link } from "react-router-dom";
import { Truck, Package, MapPin } from "lucide-react";
import Card from "@shared/components/ui/Card";
import { IconChip } from "@shared/components/dashboard/common";

const MethodChip = ({ label, count, sharePct, icon: Icon, chip }) => (
  <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/80 border border-slate-100">
    <IconChip icon={Icon} className={chip} />
    <div className="flex-1 min-w-0">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-sm font-bold text-slate-900">
        {count} <span className="text-xs font-semibold text-slate-400">({sharePct}%)</span>
      </p>
    </div>
  </div>
);

const LogisticsOverview = ({ logistics }) => {
  if (!logistics) return null;
  const m = logistics.methods || {};

  return (
    <Card
      title="Logistics Overview"
      subtitle="This month · delayed = delivery > 60 min (heuristic)"
      contentClassName="p-4"
      className="h-full"
    >
      <div className="space-y-2">
        <MethodChip
          label="Platform Logistics"
          count={m.platformLogistics?.count ?? 0}
          sharePct={m.platformLogistics?.sharePct ?? 0}
          icon={Truck}
          chip="bg-indigo-50 text-indigo-600"
        />
        <MethodChip
          label="Seller Self Delivery"
          count={m.sellerDelivery?.count ?? 0}
          sharePct={m.sellerDelivery?.sharePct ?? 0}
          icon={Package}
          chip="bg-amber-50 text-amber-600"
        />
        <MethodChip
          label="Customer Pickup"
          count={m.customerPickup?.count ?? 0}
          sharePct={m.customerPickup?.sharePct ?? 0}
          icon={MapPin}
          chip="bg-teal-50 text-teal-600"
        />
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-100">
        <div>
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Success Rate</p>
          <p className="text-lg font-bold text-emerald-600">
            {logistics.successRatePct != null ? `${logistics.successRatePct}%` : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Avg Time</p>
          <p className="text-lg font-bold text-slate-900">
            {logistics.avgDeliveryMinutes != null ? `${logistics.avgDeliveryMinutes}m` : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Delayed</p>
          <p className="text-lg font-bold text-red-500">{logistics.delayedDeliveries ?? 0}</p>
        </div>
      </div>
      <Link
        to="/admin/tracking"
        className="mt-4 block text-center text-xs font-bold text-primary hover:text-primary/80"
      >
        Live Logistics Map →
      </Link>
    </Card>
  );
};

export default LogisticsOverview;
