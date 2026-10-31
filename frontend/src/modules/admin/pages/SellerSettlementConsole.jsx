import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi } from "../services/adminApi";
import { formatOrderId } from "@/shared/utils/orderId";

const fx = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const DOT_COLOR = { g: "#12a150", a: "#d99100", r: "#dc2626" };
const ISSUE_FIELDS = [
  ["packing", "Packing"],
  ["extra", "Extra charge"],
  ["quality", "Quality issue"],
  ["priceMismatch", "Price mismatch"],
  ["misc", "Miscellaneous"],
];

function Dots({ dots = [] }) {
  return (
    <span className="inline-flex gap-1">
      {dots.map((d) => (
        <span
          key={d.key}
          title={`${d.label}: ${d.tooltip}`}
          style={{ background: DOT_COLOR[d.dot] }}
          className="inline-block h-3 w-3 rounded-full"
        />
      ))}
    </span>
  );
}

export default function SellerSettlementConsole() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ k: "date", d: "desc" });
  const [openOrder, setOpenOrder] = useState(null);
  const navigate = useNavigate();
  const limit = 10;

  const load = () => {
    adminApi
      .listSettlements({ q, page, limit, sort: sort.k, dir: sort.d })
      .then((res) => {
        setRows(res.data?.result?.items || []);
        setTotal(res.data?.result?.total || 0);
      })
      .catch(() => setRows([]));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q, page, sort]);

  const pages = Math.max(1, Math.ceil(total / limit));
  const header = (label, k) => (
    <th className="px-2 py-2 text-left text-[11px] uppercase tracking-wide text-slate-500">
      <button
        onClick={() => setSort((s) => ({ k, d: s.k === k && s.d === "asc" ? "desc" : "asc" }))}
        className="hover:text-indigo-600"
      >
        {label} {sort.k === k ? (sort.d === "asc" ? "▲" : "▼") : ""}
      </button>
    </th>
  );

  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-black">Settlements</h1>
        <div className="flex-1" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="Search order, item, customer, phone (use * and ?)"
          className="w-72 rounded-lg border px-3 py-1.5 text-sm"
        />
        <button onClick={() => navigate("/admin/settlements/bulk")} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-bold text-white">
          Bulk Settlement ▸
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              {header("Date", "date")}
              {header("Order ID", "id")}
              {header("Customer Name", "cust")}
              {header("Seller Name", "seller")}
              {header("Settlement amount", "amt")}
              {header("Reviewed", "rev")}
              {header("Settle", "set")}
              <th className="px-2 py-2 text-left text-[11px] uppercase tracking-wide text-slate-500">Checks</th>
              <th className="px-2 py-2 text-left text-[11px] uppercase tracking-wide text-slate-500">View</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-2 py-6 text-center text-slate-400">No orders match.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.orderId} className="border-b last:border-0 hover:bg-indigo-50/40">
                <td className="px-2 py-2">{r.deliveredAt ? new Date(r.deliveredAt).toLocaleDateString() : "—"}</td>
                <td className="px-2 py-2">
                  <button
                    className="font-semibold text-indigo-600"
                    title={r.orderId}
                    onClick={() => navigate(`/admin/orders/view/${r.orderId}`)}
                  >
                    #{formatOrderId(r)}
                  </button>
                  {r.complaintId && (
                    <div className="text-[11px] text-slate-500">Complaint {r.complaintId}</div>
                  )}
                </td>
                <td className="px-2 py-2">{r.customerName}</td>
                <td className="px-2 py-2">{r.sellerName}</td>
                <td className="px-2 py-2 font-bold">{fx(r.settlementAmount)}</td>
                <td className="px-2 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.reviewed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {r.reviewed ? "Reviewed" : "Not reviewed"}
                  </span>
                </td>
                <td className="px-2 py-2">
                  {r.settled ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Settled</span>
                  ) : r.state === "PAYING" && r.mode === "AUTOMATIC" ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Processing</span>
                  ) : (
                    <button
                      disabled={!r.ready}
                      onClick={() => setOpenOrder(r.orderId)}
                      className={`rounded-lg px-3 py-1 text-xs font-bold text-white ${r.ready ? "bg-emerald-600" : "cursor-not-allowed bg-slate-300"}`}
                    >
                      {r.state === "FAILED" || r.state === "PAYING" ? "Retry Payment" : "Settle Now"}
                    </button>
                  )}
                </td>
                <td className="px-2 py-2"><Dots dots={r.dots} /></td>
                <td className="px-2 py-2"><button className="text-indigo-600" onClick={() => setOpenOrder(r.orderId)}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 text-sm">
        <span className="text-slate-500">{total} orders</span>
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border px-2 py-1 disabled:opacity-40">Prev</button>
        <span>{page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded border px-2 py-1 disabled:opacity-40">Next</button>
      </div>

      <p className="text-xs text-slate-500">
        Dots: <b style={{ color: DOT_COLOR.g }}>green</b> = clear · <b style={{ color: DOT_COLOR.a }}>amber</b> = waiting · <b style={{ color: DOT_COLOR.r }}>red</b> = needs action.
        Settle Now turns green only when all four dots are green.
      </p>

      {openOrder && (
        <SettlementWindow orderId={openOrder} onClose={() => { setOpenOrder(null); load(); }} />
      )}
    </div>
  );
}

function CheckRow({ c }) {
  const bg = c.dot === "g" ? "border-emerald-500" : c.dot === "a" ? "border-amber-500" : "border-red-500";
  const icon = c.dot === "g" ? "✓" : c.dot === "a" ? "⏳" : "✗";
  return (
    <div className={`rounded-lg border border-l-4 ${bg} p-2`}>
      <b>{icon} {c.label}</b>
      <div className="text-xs text-slate-500">{c.tooltip}</div>
    </div>
  );
}

function SettlementWindow({ orderId, onClose }) {
  const [d, setD] = useState(null);
  const [issues, setIssues] = useState({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("AUTOMATIC");
  const [txnNo, setTxnNo] = useState("");

  const load = () => {
    adminApi.getSettlement(orderId).then((res) => {
      const det = res.data?.result;
      setD(det);
      setIssues({ ...det.deductions });
      if (det.mode === "MANUAL" || det.mode === "AUTOMATIC") setMode(det.mode);
    }).catch((e) => setErr(e.response?.data?.message || "Failed to load"));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [orderId]);

  if (!d) return null;

  const quoted = d.quotedAmount || 0;
  const complaintDed = d.deductions?.complaint || 0;
  const issueSum = ISSUE_FIELDS.reduce((a, [k]) => a + (Number(issues[k]) || 0), 0);
  const liveSettled = Math.max(0, quoted - complaintDed - issueSum);

  const saveIssues = async () => {
    const payload = {};
    ISSUE_FIELDS.forEach(([k]) => { payload[k] = Number(issues[k]) || 0; });
    await adminApi.setSettlementIssues(orderId, { issues: payload });
  };

  const act = async (fn) => {
    setBusy(true); setErr("");
    try { await fn(); load(); }
    catch (e) { setErr(e.response?.data?.message || "Action failed"); }
    finally { setBusy(false); }
  };

  const pay = async () => {
    setBusy(true); setErr("");
    try {
      if (!d.settled) await saveIssues();
      const recoverable = d.state === "FAILED" || d.state === "PAYING";
      const request = recoverable ? adminApi.retrySettlement : adminApi.paySettlement;
      await request(orderId, { mode, txnNo });
      load();
    } catch (e) { setErr(e.response?.data?.message || "Payment failed"); }
    finally { setBusy(false); }
  };

  const releaseHold = () => act(async () => {
    await adminApi.releaseSellerPayout(orderId);
  });

  return (
    <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-20 md:pt-24">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black" title={d.orderId}>Settlement · #{formatOrderId(d)}</h2>
            <div className="text-xs text-slate-500">
              {d.customerName} · {d.sellerName} · {d.deliveredAt ? new Date(d.deliveredAt).toLocaleDateString() : ""}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500">✕</button>
        </div>

        {/* Order money (Admin/Finance only) */}
        {d.orderMoney && (
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <b>Order money</b> <span className="text-xs text-slate-400">(Admin / Finance only)</span>
            <div className="mt-1 grid grid-cols-2 gap-x-4">
              <Kv k="Customer paid" v={fx(d.orderMoney.customerPaid)} />
              <Kv k="Item price (quote)" v={fx(d.orderMoney.itemPrice)} />
              <Kv k="GST" v={fx(d.orderMoney.gst)} />
              <Kv k="Commission" v={fx(d.orderMoney.commission)} />
              <Kv k="Delivery charge" v={fx(d.orderMoney.deliveryCharge)} />
              <Kv k="Rider cost" v={fx(d.orderMoney.riderCost)} />
              <Kv k={`Razorpay fee ${d.orderMoney.gatewayFeePercent ?? ""}%`} v={fx(d.orderMoney.gatewayFee)} />
            </div>
          </div>
        )}

        {/* Checks */}
        <div className="space-y-2">
          {(d.checks || []).map((c) => <CheckRow key={c.key} c={c} />)}
          {d.complaint && (
            <div className="text-xs text-slate-500">Complaint {d.complaint.complaintId} · {d.complaint.status} · deduct {fx(d.complaint.deduction)}</div>
          )}
        </div>

        {/* Seller issue deductions */}
        <div className="rounded-xl border p-3">
          <b className="text-sm">Seller issues (deductions)</b>
          <div className="mt-2 space-y-1">
            {ISSUE_FIELDS.map(([k, label]) => (
              <label key={k} className="flex items-center justify-between text-sm">
                <span>{label}</span>
                <input
                  type="number"
                  min="0"
                  disabled={d.settled}
                  value={issues[k] ?? 0}
                  onChange={(e) => setIssues((s) => ({ ...s, [k]: e.target.value }))}
                  className="w-28 rounded border px-2 py-1 text-right"
                />
              </label>
            ))}
          </div>
        </div>

        {/* Live calc */}
        <div className="rounded-xl bg-indigo-50 p-3 text-sm">
          <div className="flex justify-between"><span>Seller deserves</span><b>{fx(quoted)}</b></div>
          {complaintDed > 0 && <div className="flex justify-between text-red-600"><span>− Complaint</span><span>−{fx(complaintDed)}</span></div>}
          {ISSUE_FIELDS.map(([k, label]) => (Number(issues[k]) > 0 ? (
            <div key={k} className="flex justify-between text-red-600"><span>− {label}</span><span>−{fx(Number(issues[k]))}</span></div>
          ) : null))}
          <div className="mt-1 flex justify-between border-t pt-1"><b>Settlement amount</b><b className="text-indigo-700">{fx(liveSettled)}</b></div>
        </div>

        {err && <div className="rounded-lg bg-red-50 text-red-600 text-sm px-3 py-2">{err}</div>}

        {d.payoutHold && !d.settled && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <div className="text-sm text-amber-900">
              <b>Settlement is on hold</b>
              <div className="text-xs">{d.holdReason || "The complaint/settlement hold must be released before payment."}</div>
            </div>
            <button
              disabled={busy}
              onClick={releaseHold}
              className="shrink-0 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              Release hold
            </button>
          </div>
        )}

        {d.settled ? (
          <p className="text-sm text-emerald-700">
            Settled · {d.invoiceNo} · Txn {d.txnNo}{d.bulkRef ? ` · Bulk ${d.bulkRef}` : ""}
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <button
                disabled={busy || d.reviewed}
                onClick={() => act(async () => { await saveIssues(); await adminApi.reviewSettlement(orderId); })}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {d.reviewed ? "Reviewed ✓" : "Mark as reviewed"}
              </button>
            </div>
            <div className="rounded-xl border p-3 space-y-2">
              <b className="text-sm">Pay</b>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1">
                  <input type="radio" checked={mode === "AUTOMATIC"} onChange={() => setMode("AUTOMATIC")} /> Automatic (Razorpay)
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" checked={mode === "MANUAL"} onChange={() => setMode("MANUAL")} /> Manual
                </label>
              </div>
              {mode === "MANUAL" && (
                <div className="text-sm">
                  <div className="text-xs text-slate-500">Seller UPI: <b>{d.seller?.upiId || "—"}</b></div>
                  <input
                    value={txnNo}
                    onChange={(e) => setTxnNo(e.target.value)}
                    placeholder="Transaction number"
                    className="mt-1 w-full rounded border px-2 py-1"
                  />
                </div>
              )}
              <button
                disabled={busy || !d.reviewed || !d.ready}
                onClick={pay}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {d.state === "FAILED" || d.state === "PAYING" ? "Retry & Pay" : "Confirm & Pay"} {fx(liveSettled)}
              </button>
              {!d.ready && <p className="text-xs text-red-600">All four checks must be green to pay.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Kv({ k, v }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-slate-500">{k}</span>
      <span>{v}</span>
    </div>
  );
}
