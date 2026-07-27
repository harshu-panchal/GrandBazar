import React from "react";
import {
  Users,
  Store,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  FileWarning,
  CalendarClock,
} from "lucide-react";
import Card from "@shared/components/ui/Card";
import { IconChip } from "@shared/components/dashboard/common";

const Row = ({ icon: Icon, chip, label, value, accent }) => (
  <div className="flex items-center gap-3">
    <IconChip icon={Icon} className={chip} />
    <span className="text-xs text-slate-600 flex-1">{label}</span>
    <span className={`text-sm font-bold ${accent || "text-slate-900"}`}>
      {Number(value || 0).toLocaleString("en-IN")}
    </span>
  </div>
);

const SellerShopOverview = ({ sellerShopOverview }) => {
  if (!sellerShopOverview) return null;
  const s = sellerShopOverview;

  return (
    <Card title="Seller & Shop Overview" contentClassName="p-4" className="h-full">
      <div className="space-y-3">
        <Row icon={Users} chip="bg-sky-50 text-sky-600" label="Total Sellers" value={s.totalSellers} />
        <Row icon={CheckCircle2} chip="bg-emerald-50 text-emerald-600" label="Approved Sellers" value={s.approvedSellers} accent="text-emerald-600" />
        <Row icon={XCircle} chip="bg-red-50 text-red-500" label="Rejected Sellers" value={s.rejectedSellers} accent="text-red-500" />
        <Row icon={FileWarning} chip="bg-amber-50 text-amber-600" label="KYC Pending" value={s.kycPending} accent="text-amber-600" />
        <Row icon={Clock} chip="bg-orange-50 text-orange-600" label="Shops Pending Approval" value={s.shopsPendingApproval} />
        <Row icon={Store} chip="bg-indigo-50 text-indigo-600" label="Active Shops" value={s.activeShops} accent="text-indigo-600" />
        <Row icon={Ban} chip="bg-slate-100 text-slate-600" label="Suspended Shops" value={s.suspendedShops} />
        <Row icon={CalendarClock} chip="bg-purple-50 text-purple-600" label="Expiring Subscriptions (30d)" value={s.expiringSubscriptions} accent="text-purple-600" />
      </div>
    </Card>
  );
};

export default SellerShopOverview;
