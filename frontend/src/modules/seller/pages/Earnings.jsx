import React, { useMemo, useState } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Button from "@shared/components/ui/Button";
import {
  TrendingUp,
  DollarSign,
  Download,
  Banknote,
  ArrowDownToLine,
  Building2,
  Search,
  Receipt,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

import { BlurFade } from "@/components/ui/blur-fade";
import ShimmerButton from "@/components/ui/shimmer-button";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { exportToCSV } from "@/lib/exportUtils";
import { useSellerEarnings } from "../context/SellerEarningsContext";
import Pagination from "@shared/components/ui/Pagination";

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const statusVariant = (status) => {
  const s = String(status || "").toLowerCase();
  if (s === "settled" || s === "delivered" || s === "completed") return "success";
  if (s === "pending" || s === "processing") return "warning";
  if (s === "failed" || s === "cancelled") return "error";
  return "gray";
};

const Earnings = () => {
  const navigate = useNavigate();
  const { earningsData: data, earningsLoading: loading } = useSellerEarnings();
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  React.useEffect(() => {
    if (data?.balances != null && withdrawAmount === "") {
      const settled = Number(data.balances?.settledBalance ?? 0);
      setWithdrawAmount(settled > 0 ? String(settled) : "");
    }
  }, [data?.balances]);

  const ledger = Array.isArray(data?.ledger) ? data.ledger : [];

  const filteredLedger = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return ledger.filter((row) => {
      const matchesType = typeFilter === "All" || row.type === typeFilter;
      if (!matchesType) return false;
      if (!term) return true;
      const haystack = [
        row.orderId,
        row.ref,
        row.customerName || row.customer,
        row.customerPhone,
        row.customerEmail,
        row.type,
        row.status,
        row.itemsSummary,
        row.paymentMethod,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [ledger, searchTerm, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLedger.length / pageSize));

  React.useEffect(() => {
    setPage(1);
  }, [searchTerm, typeFilter, pageSize]);

  React.useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const paginatedLedger = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredLedger.slice(start, start + pageSize);
  }, [filteredLedger, page, pageSize]);

  const typeOptions = useMemo(() => {
    const set = new Set(ledger.map((row) => row.type).filter(Boolean));
    return ["All", ...Array.from(set)];
  }, [ledger]);

  const handleWithdraw = () => {
    const totalBalance = Number(data?.balances?.settledBalance ?? 0);
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0 || amount > totalBalance) {
      alert(
        "Please enter a valid amount between ₹0.01 and ₹" +
          totalBalance.toLocaleString(),
      );
      return;
    }

    setIsWithdrawing(true);
    setTimeout(() => {
      setIsWithdrawing(false);
      setIsWithdrawModalOpen(false);
      alert(`Withdrawal request of ₹${amount.toLocaleString()} submitted successfully!`);
    }, 1500);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen font-black text-slate-600">
        LOADING EARNINGS...
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      <BlurFade delay={0.1}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Earnings Overview</h2>
            <p className="text-sm text-slate-500 mt-1">
              Detailed earnings by order, customer, and payout status
            </p>
          </div>
          <div className="flex space-x-3">
            <Button
              onClick={() => {
                if (filteredLedger.length === 0) {
                  toast.info("No earnings rows to export.");
                  return;
                }
                const exportData = filteredLedger.map((txn) => ({
                  date: txn.date ?? "",
                  time: txn.time ?? "",
                  orderId: txn.orderId || txn.ref || "",
                  customer: txn.customerName || txn.customer || "",
                  phone: txn.customerPhone || "",
                  email: txn.customerEmail || "",
                  items: txn.itemsSummary || "",
                  orderTotal: Number(txn.orderTotal ?? 0),
                  earning: Number(txn.amount ?? 0),
                  sellerPayout: Number(txn.sellerPayout ?? 0),
                  type: txn.type ?? "",
                  status: txn.status ?? "",
                  paymentMethod: txn.paymentMethod ?? "",
                  orderStatus: txn.orderStatus ?? "",
                }));
                exportToCSV(exportData, "Seller_Earnings_Detailed", {
                  date: "Date",
                  time: "Time",
                  orderId: "Order ID",
                  customer: "Customer Name",
                  phone: "Customer Phone",
                  email: "Customer Email",
                  items: "Items",
                  orderTotal: "Order Total",
                  earning: "Earning Amount",
                  sellerPayout: "Seller Payout",
                  type: "Type",
                  status: "Payout Status",
                  paymentMethod: "Payment Method",
                  orderStatus: "Order Status",
                });
                toast.success("Earnings report downloaded successfully!");
              }}
              variant="outline"
              className="border-gray-200"
            >
              <Download className="mr-2 h-5 w-5" />
              Download Report
            </Button>
            <ShimmerButton
              onClick={() => navigate("/seller/withdrawals")}
              className="px-6 py-2 rounded-xl text-sm font-bold text-white shadow-lg"
            >
              <span className="text-white">Withdraw Funds</span>
            </ShimmerButton>
          </div>
        </div>
      </BlurFade>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <BlurFade delay={0.2}>
          <Card className="bg-gradient-to-br from-brand-600 to-teal-700 text-white border-none shadow-lg h-full">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-brand-100 font-medium">Total Revenue</p>
                <h3 className="text-4xl font-bold mt-2">
                  {formatMoney(data?.balances?.totalRevenue)}
                </h3>
              </div>
              <div className="p-3 bg-white/20 rounded-xl">
                <DollarSign className="h-8 w-8 text-white" />
              </div>
            </div>
            <div className="mt-8 flex items-center text-brand-100 bg-white/10 w-fit px-3 py-1 rounded-full text-sm">
              <TrendingUp className="mr-2" />
              <span>Real-time earnings data</span>
            </div>
          </Card>
        </BlurFade>

        <BlurFade delay={0.3}>
          <Card className="h-full border-none shadow-md bg-white p-6 flex flex-col justify-between group hover:shadow-xl transition-all duration-300">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-black text-slate-600 uppercase tracking-widest mb-1">
                  Total Withdrawn
                </p>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                  {formatMoney(data?.balances?.totalWithdrawn)}
                </h2>
              </div>
              <div className="p-3 bg-brand-50 rounded-lg group-hover:scale-110 transition-transform duration-300">
                <Banknote className="h-6 w-6 text-brand-500" />
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs">
                  <ArrowDownToLine className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-600 uppercase">
                    Available to Withdraw
                  </p>
                  <p className="text-xs font-black text-slate-900">
                    {formatMoney(data?.balances?.settledBalance)}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </BlurFade>
      </div>

      <BlurFade delay={0.4}>
        <Card className="border-none shadow-md bg-white overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Receipt className="h-5 w-5 text-brand-500" />
                Detailed Earnings
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                {filteredLedger.length} record{filteredLedger.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <div className="relative flex-1 sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search order, customer, phone..."
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-medium outline-none"
              >
                {typeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-slate-50/80">
                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 whitespace-nowrap">Order</th>
                  <th className="px-4 py-3 whitespace-nowrap">Customer</th>
                  <th className="px-4 py-3 whitespace-nowrap">Items</th>
                  <th className="px-4 py-3 whitespace-nowrap">Order Total</th>
                  <th className="px-4 py-3 whitespace-nowrap">Your Earning</th>
                  <th className="px-4 py-3 whitespace-nowrap">Payment</th>
                  <th className="px-4 py-3 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedLedger.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-slate-500">
                      No earnings records found yet.
                    </td>
                  </tr>
                ) : (
                  paginatedLedger.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-4 whitespace-nowrap align-top">
                        <p className="text-sm font-bold text-slate-900">{row.date || "—"}</p>
                        <p className="text-xs text-slate-500">{row.time || ""}</p>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap align-top">
                        <p className="text-sm font-black text-slate-900">
                          {row.orderId ? `#${row.orderId}` : row.ref || "—"}
                        </p>
                        {row.orderStatus && (
                          <Badge variant={statusVariant(row.orderStatus)} className="mt-1 uppercase">
                            {row.orderStatus}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-4 align-top min-w-[180px]">
                        <p className="text-sm font-bold text-slate-900">
                          {row.customerName || row.customer || "—"}
                        </p>
                        {row.customerPhone && (
                          <p className="text-xs text-slate-500 mt-0.5">{row.customerPhone}</p>
                        )}
                        {row.customerEmail && (
                          <p className="text-xs text-slate-400 mt-0.5">{row.customerEmail}</p>
                        )}
                      </td>
                      <td className="px-4 py-4 align-top min-w-[200px] max-w-[280px]">
                        <p className="text-xs font-semibold text-slate-700">
                          {row.itemCount ? `${row.itemCount} item(s)` : "—"}
                        </p>
                        {row.itemsSummary && (
                          <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                            {row.itemsSummary}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap align-top">
                        <p className="text-sm font-bold text-slate-900">
                          {row.orderId ? formatMoney(row.orderTotal) : "—"}
                        </p>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap align-top">
                        <p
                          className={cn(
                            "text-sm font-black",
                            Number(row.amount) < 0 ? "text-rose-600" : "text-emerald-600",
                          )}
                        >
                          {Number(row.amount) < 0 ? "-" : "+"}
                          {formatMoney(Math.abs(Number(row.amount || 0)))}
                        </p>
                        {row.sellerPayout > 0 && (
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Payout: {formatMoney(row.sellerPayout)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap align-top">
                        <p className="text-xs font-bold text-slate-700 capitalize">
                          {row.paymentMethod || "—"}
                        </p>
                        {row.paymentStatus && (
                          <p className="text-[11px] text-slate-400 capitalize">{row.paymentStatus}</p>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap align-top">
                        <Badge variant={statusVariant(row.status)} className="uppercase">
                          {row.status || "—"}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filteredLedger.length > 0 && (
            <div className="p-4 border-t border-slate-100 bg-slate-50/40">
              <Pagination
                page={page}
                totalPages={totalPages}
                total={filteredLedger.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(newSize) => {
                  setPageSize(newSize);
                  setPage(1);
                }}
                loading={loading}
              />
            </div>
          )}
        </Card>
      </BlurFade>

      <AnimatePresence>
        {isWithdrawModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md relative z-10 bg-white rounded-lg shadow-2xl overflow-hidden p-8 text-center"
            >
              <div className="h-16 w-16 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                <Banknote className="h-8 w-8 text-brand-600" />
              </div>

              <h2 className="text-2xl font-black text-slate-900 mb-2">Withdraw Funds</h2>
              <p className="text-sm text-slate-600 font-medium mb-8">
                Available Balance:{" "}
                <span className="text-brand-600 font-bold">
                  {formatMoney(data?.balances?.settledBalance)}
                </span>
              </p>

              <div className="space-y-4 text-left">
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">
                    Amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 font-bold">
                      ₹
                    </span>
                    <input
                      type="number"
                      className="w-full pl-8 pr-4 py-3 rounded-lg border-slate-200 bg-slate-50 font-bold text-slate-900 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none"
                      placeholder="0.00"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">
                    Select Bank Account
                  </label>
                  <div className="p-4 border border-slate-200 rounded-lg flex items-center gap-4 cursor-pointer hover:border-brand-500 hover:bg-brand-50/10 transition-all group">
                    <div className="h-10 w-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600 group-hover:bg-brand-100 group-hover:text-brand-600 transition-colors">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-black text-slate-900">HDFC Bank **** 4589</p>
                      <p className="text-xs text-slate-600 font-bold">Primary Account</p>
                    </div>
                    <div className="h-5 w-5 rounded-full border-2 border-slate-200 group-hover:border-brand-500 group-hover:bg-brand-500 transition-all" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-8">
                <button
                  onClick={() => setIsWithdrawModalOpen(false)}
                  className="py-3 rounded-lg font-black text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleWithdraw}
                  disabled={isWithdrawing}
                  className="py-3 rounded-lg bg-brand-600 text-white font-black shadow-lg shadow-brand-200 hover:bg-brand-700 transition-all disabled:opacity-60"
                >
                  {isWithdrawing ? "SUBMITTING..." : "CONFIRM"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Earnings;
