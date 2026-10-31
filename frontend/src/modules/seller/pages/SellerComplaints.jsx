import React, { useEffect, useState } from "react";
import { sellerApi } from "../services/sellerApi";
import { COMPLAINT_STATUS_LABEL, COMPLAINT_REASONS } from "@shared/constants/complaint";
import { formatOrderId } from "@/shared/utils/orderId";

const reasonLabel = (v) => COMPLAINT_REASONS.find((r) => r.value === v)?.label || v;

export default function SellerComplaints() {
  const [list, setList] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const loadList = () => {
    sellerApi
      .listComplaints()
      .then((res) => setList(res.data?.result?.items || []))
      .catch(() => setList([]));
  };
  const loadDetail = (id) => {
    sellerApi
      .getComplaint(id)
      .then((res) => { setDetail(res.data?.result || null); setErr(""); })
      .catch((e) => setErr(e.response?.data?.message || "Failed to load"));
  };

  useEffect(() => { loadList(); }, []);
  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId]);

  const c = detail?.complaint;
  const pending = c && c.culprit === "SELLER" && c.status === "ASSIGNED";

  const decide = async (decision) => {
    setBusy(true);
    setErr("");
    try {
      await sellerApi.complaintSellerDecision(c.complaintId, {
        decision,
        amount: decision === "approved" ? Number(amount) || 0 : 0,
        reason,
      });
      setAmount("");
      setReason("");
      loadDetail(selectedId);
      loadList();
    } catch (e) {
      setErr(e.response?.data?.message || "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1 space-y-2">
        <h1 className="text-xl font-black">Complaints against my products</h1>
        {list.length === 0 && <p className="text-sm text-slate-400">No complaints yet.</p>}
        {list.map((item) => (
          <button
            key={item.complaintId}
            onClick={() => setSelectedId(item.complaintId)}
            className={`w-full text-left rounded-xl border p-3 ${
              selectedId === item.complaintId ? "border-indigo-500 bg-indigo-50" : "bg-white"
            }`}
          >
            <div className="flex justify-between">
              <b>{item.complaintId}</b>
              <span className="text-[11px] rounded-full bg-slate-100 px-2 py-0.5 font-semibold">
                {COMPLAINT_STATUS_LABEL[item.status] || item.status}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1" title={item.orderPublicId}>
              Order {formatOrderId(item.orderPublicId)}
            </div>
          </button>
        ))}
      </div>

      <div className="lg:col-span-2">
        {!c && <p className="text-sm text-slate-400">Select a complaint.</p>}
        {c && (
          <div className="rounded-2xl border bg-white p-4 space-y-3">
            <div className="flex justify-between">
              <div>
                <div className="text-lg font-black">{c.complaintId}</div>
                <div className="text-xs text-slate-500" title={c.orderPublicId}>
                  Order {formatOrderId(c.orderPublicId)} · Settlement {c.settlementHeld ? "on hold" : "released"}
                </div>
              </div>
              <span className="rounded-full bg-indigo-100 text-indigo-700 px-3 py-1 text-xs font-bold">
                {COMPLAINT_STATUS_LABEL[c.status] || c.status}
              </span>
            </div>

            <div className="space-y-2">
              {(detail.items || []).map((it) => (
                <div key={it._id} className="rounded-lg border p-2">
                  <div className="flex justify-between text-sm">
                    <b>{it.productName}</b>
                    <span className="text-slate-500">{reasonLabel(it.reason)}</span>
                  </div>
                  {it.reasonText && (
                    <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">
                        Customer's complaint
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">
                        {it.reasonText}
                      </p>
                    </div>
                  )}
                  {it.photos?.length > 0 && (
                    <div className="flex gap-2 mt-2">
                      {it.photos.map((p, i) => (
                        <a key={i} href={p} target="_blank" rel="noopener noreferrer">
                          <img src={p} alt="" className="h-14 w-14 rounded object-cover border" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {err && <div className="rounded-lg bg-red-50 text-red-600 text-sm px-3 py-2">{err}</div>}

            {pending ? (
              <div className="rounded-xl border p-3 space-y-2">
                <b>Your decision</b>
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Amount ₹"
                    className="w-28 rounded-lg border px-2 py-1.5 text-sm"
                  />
                  <button
                    disabled={busy}
                    onClick={() => decide("approved")}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason if rejecting"
                    className="flex-1 rounded-lg border px-2 py-1.5 text-sm"
                  />
                  <button
                    disabled={busy}
                    onClick={() => decide("rejected")}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ) : c.sellerDecision?.decision === "approved" ? (
              <div className="rounded-lg bg-emerald-50 text-emerald-700 text-sm px-3 py-2">
                ₹{c.sellerDecision.amount} will be deducted in your settlement · {c.complaintId}
              </div>
            ) : c.sellerDecision?.decision === "rejected" ? (
              <p className="text-sm text-slate-500">You rejected this. It went back to Admin.</p>
            ) : (
              <p className="text-sm text-slate-500">
                {c.culprit ? `Admin assigned this to ${c.culprit}.` : "Admin is reviewing. No action needed yet."}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
