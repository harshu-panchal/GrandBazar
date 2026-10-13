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
  HiOutlineClock,
} from "react-icons/hi2";
import { toast } from "sonner";
import { adminApi } from "../services/adminApi";

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const formatDate = (value) => {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
};

// Mirrors the reference mock's "Exceptions and due dates" panel: upcoming/
// overdue filings first, a handful of already-filed ones after — built from
// the same TaxFilingRecord data the GST/TCS page's "Record a Filing" form
// already writes to (backend/app/services/finance/gstTcsService.js).
const buildDueDatesFeed = (records) => {
  const now = Date.now();
  const pending = (records || [])
    .filter((r) => r.status === "pending")
    .sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
  const filed = (records || [])
    .filter((r) => r.status === "filed")
    .sort((a, b) => new Date(b.filedDate || b.updatedAt || 0) - new Date(a.filedDate || a.updatedAt || 0));

  return [...pending, ...filed].slice(0, 6).map((r) => {
    const isOverdue = r.status === "pending" && r.dueDate && new Date(r.dueDate).getTime() < now;
    const isDueSoon =
      r.status === "pending" && r.dueDate && !isOverdue && new Date(r.dueDate).getTime() - now < 7 * 86400000;
    return {
      id: r._id,
      label: `${r.type} · ${r.period}${r.dueDate ? ` · due ${formatDate(r.dueDate)}` : ""}`,
      status: r.status === "filed" ? "Filed" : isOverdue ? "Overdue" : isDueSoon ? "Due soon" : "Pending",
      variant: r.status === "filed" ? "success" : isOverdue ? "error" : isDueSoon ? "warning" : "gray",
    };
  });
};

// Accountant's landing screen: the GMV-vs-gateway-vs-sellers reconciliation
// check, plus the real revenue/GST KPIs it's built from. Mirrors the
// reference mock's "NOT READY FOR CA REVIEW" banner, but every number here
// is computed from live orders/payments/refunds/payouts — see
// backend/app/services/finance/accountantService.js.
const AccountantHome = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dueDates, setDueDates] = useState([]);

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
    adminApi
      .getTaxFilingRecords()
      .then((res) => {
        if (res?.data?.success) setDueDates(buildDueDatesFeed(res.data.result));
      })
      .catch(() => {
        // Non-critical widget on this page — the GST/TCS tab is the source of truth.
      });
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
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className={`text-base font-black uppercase tracking-wide ${isClean ? "text-emerald-700" : "text-amber-700"}`}>
                {isClean ? "Ready for CA review" : "Not ready for CA review"}
              </p>
              {!isClean && (
                <span className="text-sm font-semibold text-amber-700">
                  Difference {formatMoney(Math.abs(reconciliation.decompositionDiff) + Math.abs(reconciliation.walletDiff))}
                </span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="bg-white/70 rounded-lg p-3 border border-black/5">
                <p className="text-slate-500 text-xs font-bold uppercase tracking-wide mb-1">
                  1 · GMV = Seller payable + Revenue + Refunds
                </p>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    {formatMoney(gmv.gmv)} vs {formatMoney(gmv.sellerPayable + revenue.commission + revenue.subscriptionIncome + revenue.refunds)}
                  </span>
                  <Badge variant={reconciliation.isGmvDecompositionClean ? "success" : "error"}>
                    {reconciliation.isGmvDecompositionClean ? "Matches" : `${formatMoney(Math.abs(reconciliation.decompositionDiff))} off`}
                  </Badge>
                </div>
              </div>
              <div className="bg-white/70 rounded-lg p-3 border border-black/5">
                <p className="text-slate-500 text-xs font-bold uppercase tracking-wide mb-1">
                  2 · Wallet balance = Gateway collected − Payouts
                </p>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{formatMoney(gmv.gatewayCollected)}</span>
                  <Badge variant={reconciliation.isWalletReconciled ? "success" : "error"}>
                    {reconciliation.isWalletReconciled ? "Matches" : `${formatMoney(Math.abs(reconciliation.walletDiff))} off`}
                  </Badge>
                </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {reconciliation.mismatches.length > 0 && (
          <Card className="border-none shadow-sm">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-slate-800">Where the difference comes from</h3>
              <p className="text-xs text-slate-400 mt-0.5">Each line below opens the exact orders and payments it covers.</p>
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

        <Card className="border-none shadow-sm">
          <div className="p-4 border-b border-gray-100 flex items-center gap-2">
            <HiOutlineClock className="w-4 h-4 text-slate-400" />
            <h3 className="font-semibold text-slate-800">Exceptions &amp; due dates</h3>
          </div>
          {dueDates.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400">No filings recorded yet — add one from the GST/TCS tab.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {dueDates.map((row) => (
                <li key={row.id} className="flex items-center justify-between px-4 py-3 text-sm gap-3">
                  <span className="text-slate-600">{row.label}</span>
                  <Badge variant={row.variant}>{row.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
};

export default AccountantHome;
