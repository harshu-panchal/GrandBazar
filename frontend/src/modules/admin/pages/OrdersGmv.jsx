import React, { useEffect, useState, useCallback } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import PageHeader from "@shared/components/ui/PageHeader";
import Pagination from "@shared/components/ui/Pagination";
import { HiOutlineArrowDownTray } from "react-icons/hi2";
import { toast } from "sonner";
import { adminApi } from "../services/adminApi";
import useExportBlob from "@shared/hooks/useExportBlob";

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const formatDate = (value) => (value ? new Date(value).toLocaleDateString("en-IN") : "—");

const STATUS_OPTIONS = [
  { value: "", label: "All status" },
  { value: "delivered", label: "Delivered" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "handed_over_to_logistics", label: "Handed over to logistics" },
  { value: "cancelled", label: "Cancelled" },
  { value: "returned", label: "Returned" },
];

const STATUS_BADGE_VARIANT = {
  delivered: "success",
  out_for_delivery: "info",
  handed_over_to_logistics: "info",
  cancelled: "error",
  returned: "warning",
};

const selectCls =
  "px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary-500/30";

// Order-level GMV ledger for the accountant: taxable value, GST and every
// customer-facing charge broken out per order, with a gross/refund/net
// column — the "Orders / GMV" module from the reference mock.
const OrdersGmv = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sellers, setSellers] = useState([]);
  const [sellerId, setSellerId] = useState("");
  const [status, setStatus] = useState("");
  const { exportBlob, isExporting } = useExportBlob();

  const fetchData = useCallback(async (requestedPage = 1) => {
    setLoading(true);
    try {
      const res = await adminApi.getOrdersGmv({
        page: requestedPage,
        limit: pageSize,
        sellerId: sellerId || undefined,
        status: status || undefined,
      });
      if (res?.data?.success) {
        const result = res.data.result || {};
        setItems(result.items || []);
        setTotal(result.total || 0);
        setTotalPages(result.totalPages || 1);
        setPage(result.page || requestedPage);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load orders/GMV report");
    } finally {
      setLoading(false);
    }
  }, [pageSize, sellerId, status]);

  useEffect(() => {
    fetchData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize, sellerId, status]);

  useEffect(() => {
    // getSellers() returns every verified/active/approved store, no params needed.
    adminApi
      .getSellers()
      .then((res) => {
        const list = res?.data?.results || res?.data?.result || [];
        setSellers(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        // Filter dropdown is a convenience — a failed fetch (e.g. an accountant
        // role without the "sellers" permission) just leaves "All sellers".
      });
  }, []);

  const handleExport = () => {
    exportBlob(
      () => adminApi.exportOrdersGmv({ sellerId: sellerId || undefined, status: status || undefined }),
      `orders-gmv_${new Date().toISOString().slice(0, 10)}.xlsx`,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  };

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Orders / GMV"
        description="Seller money (GMV) at the order level — taxable value, GST and every charge, with gross/refund/net."
        badge={<Badge variant="info">Accountant</Badge>}
        actions={
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-3 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-50"
          >
            <HiOutlineArrowDownTray className="w-4 h-4" />
            {isExporting ? "Exporting…" : "Export Excel"}
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <select value={sellerId} onChange={(e) => setSellerId(e.target.value)} className={selectCls}>
          <option value="">All sellers</option>
          {sellers.map((s) => (
            <option key={s._id} value={s._id}>{s.shopName}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <Card className="border-none shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 border-b border-gray-100">
                <th className="px-4 py-3">Order ID</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Seller</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Taxable</th>
                <th className="px-4 py-3 text-right">GST</th>
                <th className="px-4 py-3 text-right">Delivery</th>
                <th className="px-4 py-3 text-right">Weather</th>
                <th className="px-4 py-3 text-right">Packing</th>
                <th className="px-4 py-3 text-right">Gross</th>
                <th className="px-4 py-3 text-right">Refund</th>
                <th className="px-4 py-3 text-right">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={14} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={14} className="px-4 py-8 text-center text-slate-400">No orders match these filters.</td></tr>
              ) : (
                items.map((row) => (
                  <tr key={row.orderId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700">{row.orderId}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(row.date)}</td>
                    <td className="px-4 py-3">{row.seller}</td>
                    <td className="px-4 py-3">{row.customer}</td>
                    <td className="px-4 py-3">{row.product}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_BADGE_VARIANT[row.status] || "gray"}>
                        {String(row.status || "—").replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">{formatMoney(row.taxable)}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(row.gst)}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(row.delivery)}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(row.weather)}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(row.packing)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatMoney(row.gross)}</td>
                    <td className="px-4 py-3 text-right text-red-600">{row.refund ? formatMoney(row.refund) : "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatMoney(row.net)}</td>
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
          />
        </div>
      </Card>
    </div>
  );
};

export default OrdersGmv;
