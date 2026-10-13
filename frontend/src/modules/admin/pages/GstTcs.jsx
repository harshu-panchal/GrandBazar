import React, { useEffect, useState, useCallback } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import PageHeader from "@shared/components/ui/PageHeader";
import { HiOutlineInformationCircle } from "react-icons/hi2";
import { toast } from "sonner";
import { adminApi } from "../services/adminApi";

const formatMoney = (value) => (value === null || value === undefined ? "—" : `₹${Number(value).toLocaleString("en-IN")}`);

const FILING_TYPES = ["GSTR-1", "GSTR-3B", "GSTR-8", "OTHER"];

// GST/TCS summary + a manual filing tracker. There is no GSTN e-filing API
// in this codebase — the numbers here are computed from our own order and
// subscription data (and are explicitly marked unconfirmed, same caveat the
// reference mock carries), while "filed" status/amount is whatever the
// accountant records after actually filing outside this platform.
const GstTcs = () => {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filingForm, setFilingForm] = useState({ type: "GSTR-3B", status: "pending", filedAmount: "", filedDate: "", referenceNumber: "" });
  const [saving, setSaving] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getGstTcsSummary({ month });
      if (res?.data?.success) setSummary(res.data.result);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load GST/TCS summary");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleSaveFiling = async () => {
    if (!(Number(filingForm.filedAmount) >= 0) && filingForm.status === "filed") {
      toast.error("Enter the filed amount");
      return;
    }
    setSaving(true);
    try {
      await adminApi.saveTaxFilingRecord({ period: month, ...filingForm });
      toast.success("Filing record saved");
      fetchSummary();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to save filing record");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/30";

  if (loading && !summary) {
    return <div className="p-6 text-sm text-slate-500">Loading GST/TCS summary…</div>;
  }

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="GST / TCS"
        description="Estimated tax summary and a manual filing tracker."
        badge={<Badge variant="info">Accountant</Badge>}
        actions={<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} />}
      />

      {summary && (
        <>
          <Card className="border-none shadow-sm">
            <div className="p-4 border-b border-gray-100 flex items-start gap-2">
              <HiOutlineInformationCircle className="w-5 h-5 text-sky-500 shrink-0 mt-0.5" />
              <p className="text-sm text-slate-500">{summary.gst.note}</p>
            </div>
            <ul className="divide-y divide-gray-100">
              <li className="flex items-center justify-between px-4 py-3 text-sm">
                <span>Output GST on Commission (at {summary.gst.gstRatePercent}%)</span>
                <b>{formatMoney(summary.gst.outputGstCommission)}</b>
              </li>
              <li className="flex items-center justify-between px-4 py-3 text-sm">
                <span>Output GST on Subscription (at {summary.gst.gstRatePercent}%)</span>
                <b>{formatMoney(summary.gst.outputGstSubscription)}</b>
              </li>
              <li className="flex items-center justify-between px-4 py-3 text-sm">
                <span>Input GST (gateway fee GST — not captured)</span>
                <span className="text-slate-400">{formatMoney(summary.gst.inputGst)}</span>
              </li>
              <li className="flex items-center justify-between px-4 py-3 text-sm font-semibold">
                <span>Net GST Payable (estimated)</span>
                <b>{formatMoney(summary.gst.netGstPayable)}</b>
              </li>
            </ul>
          </Card>

          <Card className="border-none shadow-sm">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-slate-800">ECO / TCS</h3>
              <p className="text-sm text-slate-500 mt-1">{summary.tcs.note}</p>
            </div>
            <ul className="divide-y divide-gray-100">
              <li className="flex items-center justify-between px-4 py-3 text-sm">
                <span>GMV subject to TCS</span>
                <b>{formatMoney(summary.tcs.gmv)}</b>
              </li>
              <li className="flex items-center justify-between px-4 py-3 text-sm">
                <span>TCS Liability (at {summary.tcs.tcsRatePercent}%)</span>
                <b>{formatMoney(summary.tcs.tcsLiability)}</b>
              </li>
            </ul>
          </Card>
        </>
      )}

      <Card className="border-none shadow-sm">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-semibold text-slate-800">Record a Filing — {month}</h3>
        </div>
        <div className="p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Return Type</label>
            <select className={inputCls} value={filingForm.type} onChange={(e) => setFilingForm({ ...filingForm, type: e.target.value })}>
              {FILING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Status</label>
            <select className={inputCls} value={filingForm.status} onChange={(e) => setFilingForm({ ...filingForm, status: e.target.value })}>
              <option value="pending">Pending</option>
              <option value="filed">Filed</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Filed Amount ₹</label>
            <input type="number" className={inputCls} value={filingForm.filedAmount} onChange={(e) => setFilingForm({ ...filingForm, filedAmount: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Filed Date</label>
            <input type="date" className={inputCls} value={filingForm.filedDate} onChange={(e) => setFilingForm({ ...filingForm, filedDate: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Reference #</label>
            <input type="text" className={inputCls} value={filingForm.referenceNumber} onChange={(e) => setFilingForm({ ...filingForm, referenceNumber: e.target.value })} />
          </div>
          <button onClick={handleSaveFiling} disabled={saving} className="px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-50">
            {saving ? "Saving…" : "Save Filing"}
          </button>
        </div>

        {summary?.filingRecords?.length > 0 && (
          <ul className="divide-y divide-gray-100 border-t border-gray-100">
            {summary.filingRecords.map((r) => (
              <li key={r._id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>{r.type}{r.referenceNumber ? ` · ${r.referenceNumber}` : ""}</span>
                <Badge variant={r.status === "filed" ? "success" : "warning"}>{r.status === "filed" ? "Filed" : "Pending"}</Badge>
                <span>{formatMoney(r.filedAmount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

export default GstTcs;
