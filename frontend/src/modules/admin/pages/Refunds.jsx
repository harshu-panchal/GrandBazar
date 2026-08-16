import React, { useEffect, useState, useCallback } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Pagination from "@shared/components/ui/Pagination";
import { HiOutlineReceiptRefund, HiOutlineMagnifyingGlass, HiOutlineExclamationTriangle } from "react-icons/hi2";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { adminApi } from "../services/adminApi";

const STATUS_OPTIONS = ["all", "initiated", "processing", "completed", "failed"];
const TYPE_OPTIONS = ["all", "return", "price_adjustment", "cancellation"];
const MODE_OPTIONS = ["all", "wallet", "gateway", "cod_adjustment"];

const statusVariant = (status) => {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  return "warning"; // initiated / processing
};

const formatDate = (value) =>
  value ? new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

/**
 * Refund is written correctly on every return/price-adjustment/cancellation
 * refund but was never read back anywhere — admin's Returns page only shows
 * the amount from the Order's own return subdocument. This is the only
 * surface where mode/gatewayReference/failureReason are visible, and the
 * only way to find a gateway refund that's stuck in "initiated" (this
 * codebase doesn't auto-reconcile gateway refunds yet).
 */
const Refunds = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [stuckCount, setStuckCount] = useState(0);
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [mode, setMode] = useState("all");
  const [orderIdQuery, setOrderIdQuery] = useState("");

  const fetchRefunds = useCallback(async (requestedPage = 1) => {
    setLoading(true);
    try {
      const params = { page: requestedPage, limit: pageSize };
      if (status !== "all") params.status = status;
      if (type !== "all") params.type = type;
      if (mode !== "all") params.mode = mode;
      if (orderIdQuery.trim()) params.orderId = orderIdQuery.trim();

      const res = await adminApi.getRefunds(params);
      if (res.data.success) {
        const payload = res.data.result || {};
        setItems(Array.isArray(payload.items) ? payload.items : []);
        setTotal(payload.total || 0);
        setTotalPages(payload.totalPages || 1);
        setStuckCount(payload.stuckCount || 0);
        setPage(payload.page || requestedPage);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load refunds");
    } finally {
      setLoading(false);
    }
  }, [pageSize, status, type, mode, orderIdQuery]);

  useEffect(() => {
    const timer = setTimeout(() => fetchRefunds(1), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, type, mode, orderIdQuery, pageSize]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <HiOutlineReceiptRefund className="h-6 w-6 text-brand-600" />
            Refund Ledger
          </h1>
          <p className="text-gray-500 mt-1">
            Every refund record — return, price-adjustment, and cancellation — with mode, gateway reference, and failure reason.
          </p>
        </div>
      </div>

      {stuckCount > 0 && (
        <div
          onClick={() => { setStatus("initiated"); setMode("gateway"); }}
          role="button"
          className="flex items-center gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors"
        >
          <HiOutlineExclamationTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-amber-800">
            {stuckCount} gateway {stuckCount === 1 ? "refund has" : "refunds have"} been "initiated" for over an hour — these aren't auto-reconciled and may need a manual check. Click to filter.
          </p>
        </div>
      )}

      <Card className="border-none shadow-sm">
        <div className="p-4 border-b border-gray-100 flex gap-3 items-center flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by order ID..."
              value={orderIdQuery}
              onChange={(e) => setOrderIdQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>
            ))}
          </select>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t === "all" ? "All types" : t.replace("_", " ")}</option>
            ))}
          </select>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            {MODE_OPTIONS.map((m) => (
              <option key={m} value={m}>{m === "all" ? "All modes" : m.replace("_", " ")}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Order</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Mode</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Initiated</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Completed / Failed</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Reference / Failure</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="8" className="text-center py-10 text-gray-500">Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan="8" className="text-center py-10 text-gray-500">No refunds match these filters.</td></tr>
              ) : (
                items.map((r) => (
                  <tr key={r._id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <button
                        onClick={() => navigate(`/admin/orders/view/${r.orderId}`)}
                        className="text-sm font-bold text-brand-700 hover:underline"
                      >
                        {r.orderId}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 capitalize">{String(r.type || "").replace("_", " ")}</td>
                    <td className="py-3 px-4 text-sm font-bold text-gray-900">₹{Number(r.amount || 0).toLocaleString("en-IN")}</td>
                    <td className="py-3 px-4 text-sm text-gray-600 capitalize">{String(r.mode || "").replace("_", " ")}</td>
                    <td className="py-3 px-4">
                      <Badge variant={statusVariant(r.status)} className="text-[10px] font-bold uppercase px-2.5 py-1">
                        {r.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500">{formatDate(r.initiatedAt || r.createdAt)}</td>
                    <td className="py-3 px-4 text-xs text-gray-500">{formatDate(r.completedAt || r.failedAt)}</td>
                    <td className="py-3 px-4 text-xs text-gray-500 max-w-[220px]">
                      {r.status === "failed" && r.failureReason ? (
                        <span className="text-red-600 font-medium">{r.failureReason}</span>
                      ) : r.gatewayReference ? (
                        <span className="font-mono">{r.gatewayReference}</span>
                      ) : (
                        "—"
                      )}
                    </td>
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
            onPageChange={(p) => fetchRefunds(p)}
            onPageSizeChange={setPageSize}
            loading={loading}
          />
        </div>
      </Card>
    </div>
  );
};

export default Refunds;
