import React from "react";
import { useNavigate } from "react-router-dom";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import PageHeader from "@shared/components/ui/PageHeader";
import { HiOutlineBanknotes, HiOutlineCube, HiOutlineArrowRight } from "react-icons/hi2";

// Settlement doesn't need new backend logic — it's the seller-payout-request
// side of AdminWallet plus the bulk/wholesale ledger in BulkSettlements.
// This page is just the Accountant nav's entry point into both, so an
// accountant-scoped staff member sees them under their own section instead
// of needing the full admin Wallet nav item.
const AccountantSettlement = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Settlement"
        description="Seller payout requests and bulk/wholesale settlements."
        badge={<Badge variant="info">Accountant</Badge>}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card
          className="border-none shadow-sm p-5 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/admin/wallet")}
        >
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-50"><HiOutlineBanknotes className="w-6 h-6 text-emerald-600" /></div>
            <div className="flex-1">
              <p className="font-semibold text-slate-800">Seller Payout Requests</p>
              <p className="text-sm text-slate-500">Review, process and record seller settlements.</p>
            </div>
            <HiOutlineArrowRight className="w-5 h-5 text-slate-400" />
          </div>
        </Card>
        <Card
          className="border-none shadow-sm p-5 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/admin/bulk-settlements")}
        >
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-brand-50"><HiOutlineCube className="w-6 h-6 text-brand-600" /></div>
            <div className="flex-1">
              <p className="font-semibold text-slate-800">Bulk / Wholesale Settlements</p>
              <p className="text-sm text-slate-500">Orders that tripped the bulk-order threshold.</p>
            </div>
            <HiOutlineArrowRight className="w-5 h-5 text-slate-400" />
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AccountantSettlement;
