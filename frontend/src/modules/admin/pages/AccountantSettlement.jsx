import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import PageHeader from "@shared/components/ui/PageHeader";
import StatCard from "@shared/components/ui/StatCard";
import { HiOutlineBanknotes, HiOutlineCube, HiOutlineArrowRight, HiOutlineCheckCircle } from "react-icons/hi2";
import { toast } from "sonner";
import { adminApi } from "../services/adminApi";

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

// Settlement doesn't need new backend logic — it's the seller-payout-request
// side of AdminWallet plus the bulk/wholesale ledger in BulkSettlements.
// This page is the Accountant nav's entry point into both, fronted by the
// same seller-payable/paid/pending split the Home tab already computes
// (backend/app/services/finance/accountantService.js) — the reference mock's
// "Settlement" headline numbers, with the per-seller breakdown table living
// one click away in those two existing screens.
const AccountantSettlement = () => {
  const navigate = useNavigate();
  const [gmv, setGmv] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getAccountantOverview();
      if (res?.data?.success) setGmv(res.data.result?.gmv || null);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load settlement summary");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const isFullyPaid = gmv && Number(gmv.sellerPending) === 0;

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Settlement"
        description="Seller payable vs. paid, and the payout queues that settle the difference."
        badge={<Badge variant="info">Accountant</Badge>}
      />

      {!loading && gmv && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Seller Payable" value={formatMoney(gmv.sellerPayable)} icon={HiOutlineBanknotes} color="text-brand-600" bg="bg-brand-50" />
          <StatCard label="Seller Paid" value={formatMoney(gmv.sellerPaid)} icon={HiOutlineCheckCircle} color="text-emerald-600" bg="bg-emerald-50" />
          <StatCard
            label="Seller Pending"
            value={formatMoney(gmv.sellerPending)}
            icon={HiOutlineBanknotes}
            color={isFullyPaid ? "text-emerald-600" : "text-amber-600"}
            bg={isFullyPaid ? "bg-emerald-50" : "bg-amber-50"}
          />
          <StatCard label="Total GMV" value={formatMoney(gmv.gmv)} icon={HiOutlineCube} color="text-slate-600" bg="bg-slate-50" />
        </div>
      )}

      <p className="text-xs font-bold uppercase text-slate-400">Rule: Payable = gross sales − commission − other deductions. A seller can only be marked paid with a bank UTR.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card
          className="border-none shadow-sm p-5 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/admin/wallet")}
        >
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-50"><HiOutlineBanknotes className="w-6 h-6 text-emerald-600" /></div>
            <div className="flex-1">
              <p className="font-semibold text-slate-800">Seller Payout Requests</p>
              <p className="text-sm text-slate-500">Review, process and record seller settlements — per-seller gross sales, commission, payable, paid and balance.</p>
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
