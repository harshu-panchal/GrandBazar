import React, { useEffect, useState, useCallback } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Pagination from "@shared/components/ui/Pagination";
import { Receipt, Download, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { sellerApi } from "../services/sellerApi";

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/**
 * Seller-facing GST invoice list. The backend has supported a `type=seller`
 * invoice (netted to what the seller is owed, ownership-checked) since
 * before this page existed — this is purely the missing UI to reach it.
 */
const Invoices = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [downloadingId, setDownloadingId] = useState("");

  const fetchDeliveredOrders = useCallback(async (requestedPage = 1) => {
    setLoading(true);
    try {
      const res = await sellerApi.getOrders({ page: requestedPage, status: "delivered", limit: pageSize });
      const payload = res.data?.result || {};
      const items = Array.isArray(payload.items) ? payload.items : (res.data?.results || []);
      setOrders(items);
      setTotal(typeof payload.total === "number" ? payload.total : items.length);
    } catch (error) {
      toast.error("Failed to load delivered orders");
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  useEffect(() => {
    fetchDeliveredOrders(page);
  }, [page, fetchDeliveredOrders]);

  const handleDownload = async (orderId) => {
    setDownloadingId(orderId);
    try {
      const res = await sellerApi.getOrderInvoice(orderId);
      const pdfUrl = res?.data?.result?.pdfUrl;
      if (pdfUrl) {
        window.open(pdfUrl, "_blank", "noopener,noreferrer");
      } else {
        toast.error("Invoice not available yet — please try again shortly.");
      }
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          "Invoice not yet generated for this order — invoices are created once the order is delivered.",
      );
    } finally {
      setDownloadingId("");
    }
  };

  const filteredOrders = orders.filter((order) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return String(order.orderId || "").toLowerCase().includes(term)
      || String(order.customer?.name || "").toLowerCase().includes(term);
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Receipt className="h-5 w-5 text-brand-600" />
            GST Invoices
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Download the tax invoice for any of your delivered orders — generated automatically once an order is delivered.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search order ID or customer"
            className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>
      </div>

      <div className="sm:bg-white sm:shadow-sm sm:border sm:border-slate-100 sm:rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse mobile-table-card">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-100">
                <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Order ID</th>
                <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer</th>
                <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Delivered</th>
                <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Order Value</th>
                <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan="5" className="text-center py-10 text-slate-400 text-sm">Loading...</td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-10 text-slate-400 text-sm">
                    No delivered orders yet — invoices appear here once an order is delivered.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order._id || order.orderId} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-5 py-4" data-label="Order ID">
                      <span className="text-sm font-bold text-slate-900">{order.orderId}</span>
                    </td>
                    <td className="px-5 py-4" data-label="Customer">
                      <span className="text-sm text-slate-600">{order.customer?.name || "Customer"}</span>
                    </td>
                    <td className="px-5 py-4" data-label="Delivered">
                      <span className="text-sm text-slate-500">{formatDate(order.deliveredAt || order.updatedAt)}</span>
                    </td>
                    <td className="px-5 py-4 text-right" data-label="Order Value">
                      <span className="text-sm font-bold text-slate-900">
                        {formatMoney(order.paymentBreakdown?.grandTotal ?? order.pricing?.total)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right" data-label="Invoice">
                      <button
                        onClick={() => handleDownload(order.orderId)}
                        disabled={downloadingId === order.orderId}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-50 text-brand-700 hover:bg-brand-100 transition-all disabled:opacity-60"
                      >
                        {downloadingId === order.orderId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        Download
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100">
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
};

export default Invoices;
