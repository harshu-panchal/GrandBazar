import React, { useEffect, useState, useCallback } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import PageHeader from "@shared/components/ui/PageHeader";
import StatCard from "@shared/components/ui/StatCard";
import {
  HiOutlineBanknotes,
  HiOutlineShoppingCart,
  HiOutlineReceiptPercent,
  HiOutlineArrowTrendingUp,
  HiOutlineExclamationTriangle,
  HiOutlineCheckCircle,
} from "react-icons/hi2";
import { toast } from "sonner";
import { adminApi } from "../services/adminApi";

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

// Accountant's landing screen: the GMV-vs-gateway-vs-sellers reconciliation
// check, plus the real revenue/GST KPIs it's built from. Mirrors the
// reference mock's "NOT READY FOR CA REVIEW" banner, but every number here
// is computed from live orders/payments/refunds/payouts — see
// backend/app/services/finance/accountantService.js.
const AccountantHome = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getAccountantOverview();
      if (res?.data?.success) setData(res.data.result);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load accountant overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  if (loading && !data) {
    return <div className="p-6 text-sm text-slate-500">Loading accountant overview…</div>;
  }
  if (!data) return null;

  const { gmv, revenue, reconciliation } = data;
  const isClean = reconciliation.isGmvDecompositionClean && reconciliation.isWalletReconciled;

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Accountant Home"
        description="Reconciliation summary across orders, payment gateway, seller settlement and revenue."
        badge={<Badge variant="info">Accountant</Badge>}
      />

      <Card className={`border-none shadow-sm p-5 ${isClean ? "bg-emerald-50" : "bg-amber-50"}`}>
        <div className="flex items-start gap-3">
          {isClean ? (
            <HiOutlineCheckCircle className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <HiOutlineExclamationTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p className={`font-semibold ${isClean ? "text-emerald-700" : "text-amber-700"}`}>
              {isClean ? "Reconciliation looks clean" : "Reconciliation differences found"}
            </p>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="bg-white/70 rounded-lg p-3 border border-black/5">
                <p className="text-slate-500">GMV vs. Seller payable + Revenue + Refunds</p>
                <p className="font-semibold mt-1">
                  {formatMoney(gmv.gmv)} vs {formatMoney(gmv.sellerPayable + revenue.commission + revenue.subscriptionIncome + revenue.refunds)}
                  {" · "}
                  <span className={reconciliation.isGmvDecompositionClean ? "text-emerald-600" : "text-red-600"}>
                    {reconciliation.isGmvDecompositionClean ? "Matches" : `${formatMoney(Math.abs(reconciliation.decompositionDiff))} off`}
                  </span>
                </p>
              </div>
              <div className="bg-white/70 rounded-lg p-3 border border-black/5">
                <p className="text-slate-500">Wallet balance vs. Gateway collected − Payouts</p>
                <p className="font-semibold mt-1">
                  <span className={reconciliation.isWalletReconciled ? "text-emerald-600" : "text-red-600"}>
                    {reconciliation.isWalletReconciled ? "Matches" : `${formatMoney(Math.abs(reconciliation.walletDiff))} off`}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div>
        <p className="text-xs font-bold uppercase text-slate-400 mb-2">Seller money (GMV) — not platform revenue</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total GMV" value={formatMoney(gmv.gmv)} icon={HiOutlineShoppingCart} color="text-brand-600" bg="bg-brand-50" />
          <StatCard label="Total Orders" value={gmv.orderCount} icon={HiOutlineShoppingCart} color="text-slate-600" bg="bg-slate-50" />
          <StatCard label="Seller Payable" value={formatMoney(gmv.sellerPayable)} icon={HiOutlineBanknotes} color="text-emerald-600" bg="bg-emerald-50" />
          <StatCard label="Seller Paid" value={formatMoney(gmv.sellerPaid)} icon={HiOutlineBanknotes} color="text-emerald-600" bg="bg-emerald-50" />
          <StatCard label="Seller Pending" value={formatMoney(gmv.sellerPending)} icon={HiOutlineBanknotes} color="text-amber-600" bg="bg-amber-50" />
          <StatCard label="Gateway Collected" value={formatMoney(gmv.gatewayCollected)} icon={HiOutlineBanknotes} color="text-sky-600" bg="bg-sky-50" />
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase text-slate-400 mb-2">Platform's own revenue</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Commission" value={formatMoney(revenue.commission)} icon={HiOutlineReceiptPercent} color="text-violet-600" bg="bg-violet-50" />
          <StatCard label="Subscription Income" value={formatMoney(revenue.subscriptionIncome)} icon={HiOutlineArrowTrendingUp} color="text-violet-600" bg="bg-violet-50" />
          <StatCard label="Refunds" value={formatMoney(revenue.refunds)} icon={HiOutlineReceiptPercent} color="text-red-600" bg="bg-red-50" />
          <StatCard label="Net Revenue" value={formatMoney(revenue.netRevenue)} icon={HiOutlineArrowTrendingUp} color="text-emerald-600" bg="bg-emerald-50" />
          <StatCard label="GST Collected" value={formatMoney(revenue.gstCollected)} icon={HiOutlineReceiptPercent} color="text-sky-600" bg="bg-sky-50" />
        </div>
      </div>

      {reconciliation.mismatches.length > 0 && (
        <Card className="border-none shadow-sm">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-slate-800">Where the difference comes from</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {reconciliation.mismatches.map((row, idx) => (
              <li key={idx} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-slate-600">{row.label}</span>
                <span className="font-semibold text-red-600">{formatMoney(row.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
};

export default AccountantHome;
