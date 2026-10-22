import React, { useEffect, useMemo, useState } from "react";
import { adminApi } from "../services/adminApi";
import {
  COMPLAINT_STATUS_LABEL,
  COMPLAINT_REASONS,
  CULPRITS,
  CALL_OUTCOMES,
} from "@shared/constants/complaint";

const OPEN_STATUSES = ["NEW", "UNDER_REVIEW", "CALL_DONE", "ASSIGNED", "SELLER_APPROVED", "SELLER_REJECTED", "REFUNDED"];
const reasonLabel = (v) => COMPLAINT_REASONS.find((r) => r.value === v)?.label || v;

function daysLeft(dueAt) {
  if (!dueAt) return null;
  const ms = new Date(dueAt).getTime() - Date.now();
  return Math.ceil(ms / (24 * 3600 * 1000));
}

export default function ComplaintConsolePage() {
  const [filter, setFilter] = useState("open");
  const [list, setList] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Call log + assign + close form state
  const [callOutcome, setCallOutcome] = useState(CALL_OUTCOMES[0].value);
  const [callFacts, setCallFacts] = useState("");
  const [photosChecked, setPhotosChecked] = useState(false);
  const [culprit, setCulprit] = useState(CULPRITS[0].value);
  const [amount, setAmount] = useState("");
  const [recoveryTicket, setRecoveryTicket] = useState("");
  const [summary, setSummary] = useState("");

  const loadList = () => {
    const params = {};
    if (filter === "overdue") params.overdue = true;
    else if (filter === "feedback") params.submitType = "feedback";
    else if (filter !== "open" && filter !== "all") params.status = filter;
    adminApi
      .listComplaints(params)
      .then((res) => {
        let items = res.data?.result?.items || [];
        if (filter === "open") items = items.filter((c) => OPEN_STATUSES.includes(c.status));
        setList(items);
      })
      .catch(() => setList([]));
  };

  const loadDetail = (complaintId) => {
    if (!complaintId) return;
    adminApi
      .getComplaint(complaintId)
      .then((res) => {
        setDetail(res.data?.result || null);
        setErr("");
      })
      .catch((e) => setErr(e.response?.data?.message || "Failed to load complaint"));
  };

  useEffect(() => { loadList(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId]);

  const c = detail?.complaint;
  const isFeedback = c?.submitType === "feedback";

  const run = async (fn, successReset) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
      if (successReset) successReset();
      loadDetail(selectedId);
      loadList();
    } catch (e) {
      setErr(e.response?.data?.message || "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const dLeft = useMemo(() => daysLeft(c?.dueAt), [c?.dueAt]);

  return (
    <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* List */}
      <div className="lg:col-span-1 space-y-3">
        <h1 className="text-xl font-black">Complaint Window</h1>
        <div className="flex flex-wrap gap-1">
          {[["open", "Open"], ["overdue", "Overdue"], ["feedback", "Feedback"], ["CLOSED", "Closed"], ["all", "All"]].map(
            ([v, label]) => (
              <button
                key={v}
                onClick={() => setFilter(v)}
                className={`rounded-lg px-3 py-1 text-xs font-bold ${
                  filter === v ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {label}
              </button>
            ),
          )}
        </div>
        <div className="space-y-2 max-h-[75vh] overflow-y-auto">
          {list.length === 0 && <p className="text-sm text-slate-400">No complaints.</p>}
          {list.map((item) => (
            <button
              key={item.complaintId}
              onClick={() => setSelectedId(item.complaintId)}
              className={`w-full text-left rounded-xl border p-3 ${
                selectedId === item.complaintId ? "border-indigo-500 bg-indigo-50" : "bg-white"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">{item.complaintId}</span>
                <span className="text-[11px] rounded-full bg-slate-100 px-2 py-0.5 font-semibold">
                  {COMPLAINT_STATUS_LABEL[item.status] || item.status}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Order {item.orderPublicId} · {item.submitType === "feedback" ? "Feedback" : "Complaint"}
                {item.isOverdue ? " · ⚠ Overdue" : ""}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div className="lg:col-span-2">
        {!c && <p className="text-sm text-slate-400">Select a complaint to work on it.</p>}
        {c && (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-black">
                    {c.complaintId} · Order {c.orderPublicId}
                  </div>
                  <div className="text-xs text-slate-500">
                    {isFeedback ? "Feedback" : "Complaint"} ·{" "}
                    {c.status === "CLOSED"
                      ? "Closed"
                      : c.isOverdue
                      ? "⚠ Overdue"
                      : dLeft != null
                      ? `${dLeft} day(s) left`
                      : ""}{" "}
                    · Settlement {c.settlementHeld ? "on hold" : "released"}
                  </div>
                </div>
                <span className="rounded-full bg-indigo-100 text-indigo-700 px-3 py-1 text-xs font-bold">
                  {COMPLAINT_STATUS_LABEL[c.status] || c.status}
                </span>
              </div>

              {/* Items */}
              <div className="mt-3 space-y-2">
                {(detail.items || []).map((it) => (
                  <div key={it._id} className="rounded-lg border p-2">
                    <div className="flex justify-between text-sm">
                      <b>{it.productName}</b>
                      <span className="text-slate-500">
                        {reasonLabel(it.reason)}
                        {it.reasonText ? ` — ${it.reasonText}` : ""}
                      </span>
                    </div>
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
            </div>

            {err && <div className="rounded-lg bg-red-50 text-red-600 text-sm px-3 py-2">{err}</div>}

            {/* Feedback: acknowledge */}
            {isFeedback && c.status !== "CLOSED" && (
              <div className="rounded-2xl border bg-white p-4">
                <button
                  disabled={busy}
                  onClick={() => run(() => adminApi.acknowledgeFeedback(c.complaintId))}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  Acknowledge feedback
                </button>
              </div>
            )}

            {/* Complaint workflow */}
            {!isFeedback && c.status !== "CLOSED" && (
              <>
                {/* 1. Call log */}
                <div className="rounded-2xl border bg-white p-4 space-y-2">
                  <b>1. Call the customer and log it</b>
                  <select
                    value={callOutcome}
                    onChange={(e) => setCallOutcome(e.target.value)}
                    className="w-full rounded-lg border px-2 py-1.5 text-sm"
                  >
                    {CALL_OUTCOMES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <textarea
                    value={callFacts}
                    onChange={(e) => setCallFacts(e.target.value)}
                    placeholder="What the customer said (facts)"
                    className="w-full rounded-lg border px-2 py-1.5 text-sm"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={photosChecked} onChange={(e) => setPhotosChecked(e.target.checked)} />
                    Photos checked
                  </label>
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          adminApi.logComplaintCall(c.complaintId, {
                            outcome: callOutcome,
                            facts: callFacts,
                            photosChecked,
                          }),
                        () => { setCallFacts(""); setPhotosChecked(false); },
                      )
                    }
                    className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    Save call log
                  </button>
                </div>

                {/* 2. Assign culprit */}
                <div className="rounded-2xl border bg-white p-4 space-y-2">
                  <b>2. Decide culprit and assign</b>
                  <div className="flex flex-wrap gap-2 items-center">
                    <select
                      value={culprit}
                      onChange={(e) => setCulprit(e.target.value)}
                      className="rounded-lg border px-2 py-1.5 text-sm"
                    >
                      {CULPRITS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {culprit !== "SELLER" && culprit !== "CUSTOMER" && (
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Refund ₹"
                        className="w-28 rounded-lg border px-2 py-1.5 text-sm"
                      />
                    )}
                    {culprit === "RIDER_LOGISTICS" && (
                      <input
                        value={recoveryTicket}
                        onChange={(e) => setRecoveryTicket(e.target.value)}
                        placeholder="Recovery ticket ref"
                        className="w-40 rounded-lg border px-2 py-1.5 text-sm"
                      />
                    )}
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(() =>
                          adminApi.assignComplaint(c.complaintId, {
                            culprit,
                            amount: Number(amount) || 0,
                            recoveryTicketRef: recoveryTicket,
                          }),
                        )
                      }
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                      Assign
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Seller approves their own amount. For other parties, enter the refund here. Reassign any number of times.
                  </p>
                  <div className="text-sm">
                    Culprit: <b>{c.culprit || "Not decided"}</b> · Amount: <b>₹{c.amount || 0}</b>
                    {c.culprit === "SELLER" && (
                      <> · Seller decision: <b>{c.sellerDecision?.decision || "pending"}</b></>
                    )}
                  </div>
                </div>

                {/* 3. Refund + close */}
                <div className="rounded-2xl border bg-white p-4 space-y-2">
                  <b>3. Refund and close</b>
                  <div className="flex gap-2">
                    <button
                      disabled={busy || c.culprit === "CUSTOMER" || c.status === "REFUNDED"}
                      onClick={() => run(() => adminApi.refundComplaint(c.complaintId))}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                      Refund customer
                    </button>
                  </div>
                  <textarea
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="Final summary (required to close)"
                    className="w-full rounded-lg border px-2 py-1.5 text-sm"
                  />
                  <button
                    disabled={busy}
                    onClick={() => run(() => adminApi.closeComplaint(c.complaintId, { summary }), () => setSummary(""))}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    Close complaint
                  </button>
                </div>
              </>
            )}

            {/* Audit log */}
            <div className="rounded-2xl border bg-white p-4">
              <b>Audit log</b>
              <p className="text-xs text-slate-400 mb-2">Read-only. Every step is recorded.</p>
              <div className="space-y-1">
                {(detail.events || []).map((ev) => (
                  <div key={ev._id} className="text-xs border-b py-1">
                    <span className="text-slate-400">{new Date(ev.createdAt).toLocaleString()}</span> ·{" "}
                    <b>{ev.actorRole}</b> · {ev.action}
                    {ev.fromStatus || ev.toStatus ? ` (${ev.fromStatus || "—"} → ${ev.toStatus || "—"})` : ""}
                    {ev.note ? ` · ${ev.note}` : ""}
                  </div>
                ))}
                {(detail.events || []).length === 0 && <p className="text-xs text-slate-400">No entries.</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
