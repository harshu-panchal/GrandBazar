import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import StatCard from "@shared/components/ui/StatCard";
import Pagination from "@shared/components/ui/Pagination";
import { HiOutlineCube, HiOutlineMagnifyingGlass, HiOutlineBanknotes, HiOutlineReceiptPercent, HiOutlineArchiveBoxArrowDown } from "react-icons/hi2";
import { toast } from "sonner";
import { sellerApi } from "../services/sellerApi";

const STATUS_OPTIONS = ["all", "PENDING", "COMPLETED", "CANCELLED"];
const REASON_LABEL = {
  value_threshold: "Order value threshold",
  qty_threshold: "Line item quantity threshold",
};

const statusVariant = (status) => {
  if (status === "COMPLETED") return "success";
  if (status === "CANCELLED") return "error";
  return "warning"; // PENDING
};

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

/**
 * Dedicated seller-facing view of BulkSettlement — the commission/packaging/
 * tax breakdown behind every order that tripped the platform's bulk/
 * wholesale threshold. Previously sellers only saw a bare "Bulk" badge on
 * the Earnings ledger with no way to see how that order's payout was split.
 */
const BulkSettlements = () => {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState({ count: 0, sellerPayoutAmount: 0, commissionAmount: 0, packagingAmount: 0, taxAmount: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [status, setStatus] = useState("all");
  const [orderIdQuery, setOrderIdQuery] = useState(searchParams.get("orderId") || "");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const fetchData = useCallback(async (requestedPage = 1) => {
    setLoading(true);
    try {
      const params = { page: requestedPage, limit: pageSize };
      if (status !== "all") params.status = status;
      if (orderIdQuery.trim()) params.orderId = orderIdQuery.trim();
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;

      const res = await sellerApi.getBulkSettlements(params);
      if (res.data.success) {
        const payload = res.data.result || {};
        setItems(Array.isArray(payload.items) ? payload.items : []);
        setTotal(payload.total || 0);
        setTotalPages(payload.totalPages || 1);
        setTotals(payload.totals || { count: 0, sellerPayoutAmount: 0, commissionAmount: 0, packagingAmount: 0, taxAmount: 0 });
        setPage(payload.page || requestedPage);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load bulk settlements");
    } finally {
      setLoading(false);
    }
  }, [pageSize, status, orderIdQuery, fromDate, toDate]);

  useEffect(() => {
    const timer = setTimeout(() => fetchData(1), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, orderIdQuery, fromDate, toDate, pageSize]);

  const inputCls =
    "px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/30";

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Bulk Order Settlements</h1>
        <p className="text-gray-500 mt-1">
          Orders that crossed the platform's bulk/wholesale threshold, with the exact payout, commission, packaging and tax split for each.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Bulk Settlements" value={totals.count} icon={HiOutlineCube} color="text-brand-600" bg="bg-brand-50" />
        <StatCard label="You Received" value={formatMoney(totals.sellerPayoutAmount)} icon={HiOutlineBanknotes} color="text-emerald-600" bg="bg-emerald-50" />
        <StatCard label="Commission" value={formatMoney(totals.commissionAmount)} icon={HiOutlineReceiptPercent} color="text-violet-600" bg="bg-violet-50" />
        <StatCard label="Packaging" value={formatMoney(totals.packagingAmount)} icon={HiOutlineArchiveBoxArrowDown} color="text-amber-600" bg="bg-amber-50" />
        <StatCard label="Tax" value={formatMoney(totals.taxAmount)} icon={HiOutlineReceiptPercent} color="text-sky-600" bg="bg-sky-50" />
      </div>

      <Card className="border-none shadow-sm">
        <div className="p-4 border-b border-gray-100 flex gap-3 items-end flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <label className="text-xs font-bold text-slate-500 block mb-1">Order ID</label>
            <HiOutlineMagnifyingGlass className="absolute left-3 top-[38px] text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by order ID..."
              value={orderIdQuery}
              onChange={(e) => setOrderIdQuery(e.target.value)}
              className={`w-full pl-9 ${inputCls}`}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Order</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Reason</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">You Receive</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Commission</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Packaging</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tax</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Settled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="8" className="text-center py-10 text-gray-500">Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan="8" className="text-center py-10 text-gray-500">No bulk settlements match these filters.</td></tr>
              ) : (
                items.map((row) => (
                  <tr key={row._id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 px-4 text-sm font-bold text-gray-900">{row.orderId}</td>
                    <td className="py-3 px-4 text-xs text-gray-500">{REASON_LABEL[row.bulkOrderReason] || "—"}</td>
                    <td className="py-3 px-4 text-sm font-bold text-gray-900">{formatMoney(row.sellerPayoutAmount)}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{formatMoney(row.commissionAmount)}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{formatMoney(row.packagingAmount)}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{formatMoney(row.taxAmount)}</td>
                    <td className="py-3 px-4">
                      <Badge variant={statusVariant(row.status)} className="text-[10px] font-bold uppercase px-2.5 py-1">
                        {row.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500">{formatDate(row.settledAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-gray-100">
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            onPageChange={(p) => fetchData(p)}
            onPageSizeChange={setPageSize}
            loading={loading}
          />
        </div>
      </Card>
    </div>
  );
};

export default BulkSettlements;
