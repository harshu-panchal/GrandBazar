import React, { useEffect, useState, useCallback } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import PageHeader from "@shared/components/ui/PageHeader";
import StatCard from "@shared/components/ui/StatCard";
import Pagination from "@shared/components/ui/Pagination";
import { HiOutlinePaperClip, HiOutlineArrowDownTray, HiOutlineTrash, HiOutlineReceiptPercent, HiOutlineExclamationTriangle } from "react-icons/hi2";
import { toast } from "sonner";
import { adminApi } from "../services/adminApi";
import useExportBlob from "@shared/hooks/useExportBlob";

const CATEGORIES = [
  { value: "hosting", label: "Hosting" },
  { value: "marketing", label: "Marketing" },
  { value: "office", label: "Office" },
  { value: "salaries", label: "Salaries" },
  { value: "logistics", label: "Logistics" },
  { value: "professional_fees", label: "Professional Fees" },
  { value: "software", label: "Software" },
  { value: "other", label: "Other" },
];

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const formatDate = (value) => (value ? new Date(value).toLocaleDateString("en-IN") : "—");

const emptyForm = { category: "hosting", date: new Date().toISOString().slice(0, 10), amount: "", gstAmount: "", vendor: "", notes: "" };

// Expense tracking the reference mock calls for — add an expense (with an
// optional bill attachment), see this month's list with a "Bill Missing"
// flag, and export the report + bills as a ZIP. Bills are uploaded through
// the existing generic /media/upload endpoint (the same one
// NotificationComposer/CatalogManagement already use); this page only ever
// stores the resulting URL.
const Expenses = () => {
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState({ totalAmount: 0, totalGst: 0, missingBillCount: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const [form, setForm] = useState(emptyForm);
  const [billFile, setBillFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const { exportBlob, isExporting } = useExportBlob();

  const fetchData = useCallback(async (requestedPage = 1) => {
    setLoading(true);
    try {
      const res = await adminApi.getExpenses({ month, page: requestedPage, limit: pageSize });
      if (res?.data?.success) {
        const result = res.data.result || {};
        setItems(result.items || []);
        setTotal(result.total || 0);
        setTotalPages(result.totalPages || 1);
        setPage(result.page || requestedPage);
        setTotals(result.totals || { totalAmount: 0, totalGst: 0, missingBillCount: 0 });
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }, [month, pageSize]);

  useEffect(() => {
    fetchData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, pageSize]);

  const handleSave = async () => {
    if (!form.category || !form.date || !(Number(form.amount) > 0)) {
      toast.error("Category, date and a valid amount are required");
      return;
    }
    setSaving(true);
    try {
      let billUrl = "";
      if (billFile) {
        const formData = new FormData();
        formData.append("file", billFile);
        const uploadRes = await adminApi.uploadMedia(formData);
        billUrl = uploadRes.data?.result?.url || uploadRes.data?.url || "";
      }
      await adminApi.createExpense({ ...form, billUrl });
      toast.success("Expense recorded");
      setForm(emptyForm);
      setBillFile(null);
      fetchData(1);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to save expense");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await adminApi.deleteExpense(id);
      toast.success("Expense deleted");
      fetchData(page);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete expense");
    }
  };

  const handleExportZip = () => {
    exportBlob(
      () => adminApi.exportExpensesZip({ month }),
      `expense-report_${month}.zip`,
      "application/zip",
    );
  };

  const inputCls = "px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/30 w-full";

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Expenses"
        description="Record platform expenses with bills, and export the month's report for the CA."
        badge={<Badge variant="info">Accountant</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} />
            <button
              onClick={handleExportZip}
              disabled={isExporting}
              className="flex items-center gap-2 px-3 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 whitespace-nowrap"
            >
              <HiOutlineArrowDownTray className="w-4 h-4" />
              {isExporting ? "Exporting…" : "Report + Bills (ZIP)"}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Total Expenses" value={formatMoney(totals.totalAmount)} icon={HiOutlineReceiptPercent} color="text-red-600" bg="bg-red-50" />
        <StatCard label="GST on Expenses" value={formatMoney(totals.totalGst)} icon={HiOutlineReceiptPercent} color="text-sky-600" bg="bg-sky-50" />
        <StatCard label="Bills Missing" value={totals.missingBillCount} icon={HiOutlineExclamationTriangle} color="text-amber-600" bg="bg-amber-50" />
      </div>

      <Card className="border-none shadow-sm">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-semibold text-slate-800">Add Expense</h3>
        </div>
        <div className="p-4 flex flex-wrap gap-3 items-end">
          <div className="min-w-[160px]">
            <label className="text-xs font-bold text-slate-500 block mb-1">Category</label>
            <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="text-xs font-bold text-slate-500 block mb-1">Date</label>
            <input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="min-w-[120px]">
            <label className="text-xs font-bold text-slate-500 block mb-1">Amount ₹</label>
            <input type="number" className={inputCls} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="min-w-[100px]">
            <label className="text-xs font-bold text-slate-500 block mb-1">GST ₹</label>
            <input type="number" className={inputCls} value={form.gstAmount} onChange={(e) => setForm({ ...form, gstAmount: e.target.value })} />
          </div>
          <div className="min-w-[160px]">
            <label className="text-xs font-bold text-slate-500 block mb-1">Vendor</label>
            <input type="text" className={inputCls} value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="text-xs font-bold text-slate-500 block mb-1">Notes</label>
            <input type="text" className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm cursor-pointer">
            <HiOutlinePaperClip className="w-4 h-4" />
            {billFile ? billFile.name.slice(0, 16) : "Attach bill"}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setBillFile(e.target.files?.[0] || null)} />
          </label>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Expense"}
          </button>
        </div>
      </Card>

      <Card className="border-none shadow-sm">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-semibold text-slate-800">This Month</h3>
        </div>
        <ul className="divide-y divide-gray-100">
          {loading ? (
            <li className="px-4 py-8 text-center text-slate-400 text-sm">Loading…</li>
          ) : items.length === 0 ? (
            <li className="px-4 py-8 text-center text-slate-400 text-sm">No expenses recorded for this month.</li>
          ) : (
            items.map((e) => (
              <li key={e._id} className="flex items-center justify-between px-4 py-3 text-sm gap-3">
                <div className="flex-1">
                  <span className="font-medium text-slate-700">{CATEGORIES.find((c) => c.value === e.category)?.label || e.category}</span>
                  <span className="text-slate-400"> · {formatDate(e.date)}{e.vendor ? ` · ${e.vendor}` : ""}</span>
                  {!e.billUrl && <Badge variant="warning" className="ml-2">Bill missing</Badge>}
                </div>
                <span className="font-semibold">{formatMoney(e.amount)}</span>
                <button onClick={() => handleDelete(e._id)} className="text-red-500 hover:text-red-700">
                  <HiOutlineTrash className="w-4 h-4" />
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="px-4 py-3 border-t border-gray-100">
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={(p) => fetchData(p)} onPageSizeChange={setPageSize} />
        </div>
      </Card>
    </div>
  );
};

export default Expenses;
