import React from "react";
import { useNavigate } from "react-router-dom";
import { Gift, TicketPercent, UserPlus2, Megaphone, Gauge } from "lucide-react";
import Card from "@shared/components/ui/Card";
import { inr, IconChip, ViewAllLink } from "./common";

const Row = ({ icon, chip, label, value }) => (
  <div className="flex items-center gap-3">
    <IconChip icon={icon} className={chip} />
    <span className="text-xs text-slate-600 flex-1 min-w-0 truncate">{label}</span>
    <span className="text-sm font-bold text-slate-900">{value}</span>
  </div>
);

const MarketingRewards = ({ marketing }) => {
  const navigate = useNavigate();
  if (!marketing) return null;
  const m = marketing;

  return (
    <Card
      title="Marketing & Rewards"
      subtitle="This Month"
      headerAction={<ViewAllLink onClick={() => navigate("/seller/coupons")} />}
      contentClassName="p-4"
    >
      <div className="space-y-3.5">
        <Row
          icon={Gift}
          chip="bg-rose-50 text-rose-500"
          label="Cashback Issued"
          value={inr(m.cashbackIssued)}
        />
        <Row
          icon={TicketPercent}
          chip="bg-purple-50 text-purple-600"
          label="Coupons Redeemed"
          value={inr(m.couponsRedeemed)}
        />
        <Row
          icon={UserPlus2}
          chip="bg-emerald-50 text-emerald-600"
          label="Referral Success"
          value={m.referralSuccess}
        />
        <Row
          icon={Megaphone}
          chip="bg-sky-50 text-sky-600"
          label="Campaign Sales"
          value={inr(m.campaignSales)}
        />
        <div className="pt-3 border-t border-slate-100">
          <Row
            icon={Gauge}
            chip="bg-violet-50 text-violet-600"
            label="ROI"
            value={m.roi === null || m.roi === undefined ? "—" : `${m.roi}x`}
          />
        </div>
      </div>
    </Card>
  );
};

export default MarketingRewards;
