import React, { useEffect, useMemo, useState } from "react";
import { adminApi } from "../services/adminApi";

const fx = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const DOT_COLOR = { g: "#12a150", a: "#d99100", r: "#dc2626" };

function Dots({ dots = [] }) {
  return (
    <span className="inline-flex gap-1">
      {dots.map((d) => (
        <span key={d.key} title={`${d.label}: ${d.tooltip}`} style={{ background: DOT_COLOR[d.dot] }} className="inline-block h-3 w-3 rounded-full" />
      ))}
    </span>
  );
}

export default function AdminBulkSettlement() {
  const [sellers, setSellers] = useState([]);
  const [sellerId, setSellerId] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [orders, setOrders] = useState([]);
  const [sel, setSel] = useState(new Set());
  const [review, setReview] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    adminApi.getActiveSellers({ limit: 200 })
      .then((res) => setSellers(res.data?.result?.items || []))
      .catch(() => setSellers([]));
  }, []);

  const loadOrders = (sid) => {
    setSel(new Set());
    setResult(null);
    adminApi.listSellerUnsettledOrders(sid)
      .then((res) => setOrders(res.data?.result?.items || []))
      .catch(() => setOrders([]));
  };

  const pickSeller = (sid) => {
    setSellerId(sid);
    setSellerName(sellers.find((s) => String(s._id || s.id) === String(sid))?.shopName || "");
    if (sid) loadOrders(sid);
    else setOrders([]);
  };

  const toggle = (orderId, ready) => {
    if (!ready) return; // non-ready orders cannot be ticked (BLK-03)
    setSel((s) => {
      const n = new Set(s);
      n.has(orderId) ? n.delete(orderId) : n.add(orderId);
      return n;
    });
  };

  const selectAllReady = (on) => {
    setSel(on ? new Set(orders.filter((o) => o.ready).map((o) => o.orderId)) : new Set());
  };

  const selectedOrders = useMemo(() => orders.filter((o) => sel.has(o.orderId)), [orders, sel]);
  const total = selectedOrders.reduce((a, o) => a + (o.settlementAmount || 0), 0);

  const doReview = async () => {
    setErr("");
    try {
      const res = await adminApi.previewBulkSettlement({ sellerId, orderIds: [...sel] });
      setReview(res.data?.result);
    } catch (e) { setErr(e.response?.data?.message || "Preview failed"); }
  };

  return (
    <div className="p-4 space-y-3">
      <div>
        <h1 className="text-xl font-black">Bulk Settlement</h1>
        <p className="text-xs text-slate-500">Choose a seller. All their unsettled orders appear. Only green (ready) orders can be selected.</p>
      </div>

      <select value={sellerId} onChange={(e) => pickSeller(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm">
        <option value="">Select seller</option>
        {sellers.map((s) => (
          <option key={s._id || s.id} value={s._id || s.id}>{s.shopName}</option>
        ))}
      </select>

      {sellerId && (
        <>
          <div className="overflow-x-auto rounded-2xl border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2 text-left"><input type="checkbox" title="Select all ready orders" onChange={(e) => selectAllReady(e.target.checked)} /></th>
                  <th className="px-2 py-2 text-left">Date</th>
                  <th className="px-2 py-2 text-left">Order ID</th>
                  <th className="px-2 py-2 text-left">Customer</th>
                  <th className="px-2 py-2 text-left">Amount</th>
                  <th className="px-2 py-2 text-left">Checks</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 && <tr><td colSpan={6} className="px-2 py-6 text-center text-slate-400">No unsettled orders.</td></tr>}
                {orders.map((o) => (
                  <tr key={o.orderId} className="border-b last:border-0">
                    <td className="px-2 py-2">
                      <input type="checkbox" checked={sel.has(o.orderId)} disabled={!o.ready} onChange={() => toggle(o.orderId, o.ready)} />
                    </td>
                    <td className="px-2 py-2">{o.date ? new Date(o.date).toLocaleDateString() : "—"}</td>
                    <td className="px-2 py-2">
                      #{o.orderId}
                      {o.complaintId && <div className="text-[11px] text-slate-500">Complaint {o.complaintId}</div>}
                    </td>
                    <td className="px-2 py-2">{o.customerName}</td>
                    <td className="px-2 py-2 font-bold">{fx(o.settlementAmount)}</td>
                    <td className="px-2 py-2"><Dots dots={o.dots} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-4 rounded-2xl border-2 border-indigo-500 bg-white p-3">
            <div><b>{selectedOrders.length}</b> orders selected</div>
            <div>Seller: <b>{sellerName}</b></div>
            <div>Total to settle: <b>{fx(total)}</b></div>
            <div className="flex-1" />
            <button disabled={!selectedOrders.length} onClick={doReview} className="rounded-lg border px-4 py-2 text-sm font-bold disabled:opacity-40">Review</button>
            <button disabled={!selectedOrders.length} onClick={() => setPayOpen(true)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Settle Now</button>
          </div>
        </>
      )}

      {err && <div className="rounded-lg bg-red-50 text-red-600 text-sm px-3 py-2">{err}</div>}

      {result && (
        <div className="rounded-2xl border bg-white p-4">
          <div className="font-black">Bulk settlement {result.refNo} · {result.status}</div>
          <div className="text-sm text-slate-500">{result.settledCount} settled · {result.failedCount} failed · total {fx(result.total)}</div>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="border-b text-[11px] uppercase text-slate-500"><th className="px-2 py-1 text-left">Order</th><th className="px-2 py-1 text-left">Amount</th><th className="px-2 py-1 text-left">Status</th><th className="px-2 py-1 text-left">Invoice</th></tr></thead>
            <tbody>
              {(result.orders || []).map((o) => (
                <tr key={o.orderPublicId} className="border-b last:border-0">
                  <td className="px-2 py-1">#{o.orderPublicId}</td>
                  <td className="px-2 py-1">{fx(o.settledAmount)}</td>
                  <td className={`px-2 py-1 font-semibold ${o.status === "SETTLED" ? "text-emerald-600" : o.status === "FAILED" ? "text-red-600" : "text-amber-600"}`}>{o.status}</td>
                  <td className="px-2 py-1">{o.invoiceNo || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {review && (
        <Modal onClose={() => setReview(null)} title={`Bulk review · ${review.sellerName}`}>
          <p className="text-xs text-slate-500">{review.readyCount} ready · {review.notReadyCount} not ready · total {fx(review.total)}</p>
          {review.requireDifferentReviewerAndPayer && review.makerCheckerBlockedCount > 0 && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
              Maker-checker is on: {review.makerCheckerBlockedCount} of these orders have not been reviewed by a
              different Admin/Finance user yet. If you pay now, those will show FAILED — ask another reviewer
              to mark them reviewed first, or settle them individually after review.
            </p>
          )}
          <table className="mt-2 w-full text-sm">
            <thead><tr className="border-b text-[11px] uppercase text-slate-500"><th className="px-2 py-1 text-left">Order</th><th className="px-2 py-1 text-left">Customer</th><th className="px-2 py-1">Del</th><th className="px-2 py-1">Pay</th><th className="px-2 py-1">No cmp</th><th className="px-2 py-1">No pen</th><th className="px-2 py-1 text-left">Amount</th></tr></thead>
            <tbody>
              {review.rows.map((r) => (
                <tr key={r.orderId} className="border-b last:border-0">
                  <td className="px-2 py-1">#{r.orderId}</td>
                  <td className="px-2 py-1">{r.customerName}</td>
                  {[r.delivered, r.razorpay, r.noComplaint, r.noPenalty].map((ok, i) => (
                    <td key={i} className={`px-2 py-1 text-center ${ok ? "text-emerald-600" : "text-red-600"}`}>{ok ? "✓" : "✗"}</td>
                  ))}
                  <td className="px-2 py-1">{fx(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}

      {payOpen && (
        <BulkPayModal
          sellerId={sellerId}
          sellerName={sellerName}
          orderIds={[...sel]}
          total={total}
          onClose={() => setPayOpen(false)}
          onDone={(res) => { setResult(res); setPayOpen(false); loadOrders(sellerId); }}
        />
      )}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-20 md:pt-24" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-3xl rounded-2xl bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">{title}</h2>
          <button onClick={onClose} className="text-slate-500">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function BulkPayModal({ sellerId, sellerName, orderIds, total, onClose, onDone }) {
  const [reviewed, setReviewed] = useState(false);
  const [mode, setMode] = useState("AUTOMATIC");
  const [txnNo, setTxnNo] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const pay = async () => {
    if (!reviewed) { setErr("Tick the review box first."); return; }
    if (mode === "MANUAL" && !txnNo.trim()) { setErr("Add the transaction number."); return; }
    setBusy(true); setErr("");
    try {
      const res = await adminApi.payBulkSettlement({ sellerId, orderIds, mode, txnNo });
      onDone(res.data?.result);
    } catch (e) { setErr(e.response?.data?.message || "Bulk settlement failed"); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`Bulk settle · ${sellerName}`} onClose={onClose}>
      <p className="text-sm text-slate-500">{orderIds.length} orders · Total {fx(total)}</p>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
        I have reviewed all orders
      </label>
      <div className="mt-2 flex gap-4 text-sm">
        <label className="flex items-center gap-1"><input type="radio" checked={mode === "AUTOMATIC"} onChange={() => setMode("AUTOMATIC")} /> Automatic (Razorpay)</label>
        <label className="flex items-center gap-1"><input type="radio" checked={mode === "MANUAL"} onChange={() => setMode("MANUAL")} /> Manual</label>
      </div>
      {mode === "MANUAL" && (
        <input value={txnNo} onChange={(e) => setTxnNo(e.target.value)} placeholder="Transaction number" className="mt-2 w-full rounded border px-2 py-1 text-sm" />
      )}
      {err && <div className="mt-2 rounded-lg bg-red-50 text-red-600 text-sm px-3 py-2">{err}</div>}
      <div className="mt-3 flex justify-end">
        <button disabled={busy} onClick={pay} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Confirm &amp; Pay</button>
      </div>
    </Modal>
  );
}
