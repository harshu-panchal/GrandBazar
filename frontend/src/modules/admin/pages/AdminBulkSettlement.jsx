import { useEffect, useMemo, useState } from "react";
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
  const [sellerLoadError, setSellerLoadError] = useState("");
  const [sellersLoading, setSellersLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    adminApi.listBulkSettlementSellers()
      .then((res) => {
        setSellers(res.data?.result?.items || []);
        setSellerLoadError("");
      })
      .catch((error) => {
        setSellers([]);
        setSellerLoadError(error.response?.data?.message || "Failed to load sellers for bulk settlement.");
      })
      .finally(() => setSellersLoading(false));
  }, []);

  const loadOrders = (sid, { resetSelection = true, resetResult = true } = {}) => {
    if (resetSelection) setSel(new Set());
    if (resetResult) setResult(null);
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
        <p className="text-xs text-slate-500">Choose a seller. Only unsettled orders with all four checks green are listed. Open an order to review its details.</p>
      </div>

      <select
        value={sellerId}
        onChange={(e) => pickSeller(e.target.value)}
        disabled={sellersLoading || sellers.length === 0}
        className="rounded-lg border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">{sellersLoading ? "Loading sellers…" : "Select seller"}</option>
        {sellers.map((s) => (
          <option key={s.id || s._id} value={s.id || s._id}>{s.shopName}</option>
        ))}
      </select>
      {sellerLoadError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{sellerLoadError}</div>}
      {!sellersLoading && !sellerLoadError && sellers.length === 0 && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">No active sellers are available for settlement.</div>
      )}

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
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-left">Detail</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 && <tr><td colSpan={8} className="px-2 py-6 text-center text-slate-400">No unsettled orders with all four checks green.</td></tr>}
                {orders.map((o) => (
                  <tr key={o.orderId} className="border-b last:border-0">
                    <td className="px-2 py-2">
                      <input type="checkbox" checked={sel.has(o.orderId)} disabled={!o.ready} onChange={() => toggle(o.orderId, o.ready)} />
                    </td>
                    <td className="px-2 py-2">{o.date ? new Date(o.date).toLocaleDateString() : "—"}</td>
                    <td className="px-2 py-2">
                      #{formatOrderId(o)}
                      {o.complaintId && <div className="text-[11px] text-slate-500">Complaint {o.complaintId}</div>}
                    </td>
                    <td className="px-2 py-2">{o.customerName}</td>
                    <td className="px-2 py-2 font-bold">{fx(o.settlementAmount)}</td>
                    <td className="px-2 py-2"><Dots dots={o.dots} /></td>
                    <td className="px-2 py-2"><SettlementStatus status={o.state} /></td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => setDetail(o)}
                        className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-50"
                        aria-label={`Open details for order ${formatOrderId(o)}`}
                      >
                        Open
                      </button>
                    </td>
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
            <thead><tr className="border-b text-[11px] uppercase text-slate-500"><th className="px-2 py-1 text-left">Order</th><th className="px-2 py-1 text-left">Amount</th><th className="px-2 py-1 text-left">Status</th><th className="px-2 py-1 text-left">Failure reason</th><th className="px-2 py-1 text-left">Invoice</th></tr></thead>
            <tbody>
              {(result.orders || []).map((o) => (
                <tr key={o.orderPublicId} className="border-b last:border-0">
                  <td className="px-2 py-1">#{o.orderPublicId}</td>
                  <td className="px-2 py-1">{fx(o.settledAmount)}</td>
                  <td className={`px-2 py-1 font-semibold ${o.status === "SETTLED" ? "text-emerald-600" : o.status === "FAILED" ? "text-red-600" : "text-amber-600"}`}>{o.status}</td>
                  <td className={`max-w-md px-2 py-1 text-sm ${o.status === "FAILED" ? "text-red-600" : "text-slate-400"}`}>
                    {o.status === "FAILED" ? (o.failureReason || "No failure reason was recorded.") : "—"}
                  </td>
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
                  <td className="px-2 py-1">#{formatOrderId(r)}</td>
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

      {detail && (
        <Modal
          onClose={() => setDetail(null)}
          title={`Settlement · #${formatOrderId(detail)}`}
          className="max-w-2xl space-y-3"
        >
          <div className="text-xs text-slate-500">
            {detail.customerName || "Customer"} · {sellerName || "Seller"} · {detail.deliveredAt ? new Date(detail.deliveredAt).toLocaleDateString() : "—"}
          </div>
          {detail.orderMoney && (
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <b>Order money</b> <span className="text-xs text-slate-400">(Admin / Finance only)</span>
              <div className="mt-1 grid grid-cols-2 gap-x-4">
                <Kv label="Customer paid" value={fx(detail.orderMoney.customerPaid)} />
                <Kv label="Item price (quote)" value={fx(detail.orderMoney.itemPrice)} />
                <Kv label="GST" value={fx(detail.orderMoney.gst)} />
                <Kv label="Commission" value={fx(detail.orderMoney.commission)} />
                <Kv label="Delivery charge" value={fx(detail.orderMoney.deliveryCharge)} />
                <Kv label="Rider cost" value={fx(detail.orderMoney.riderCost)} />
                <Kv label={`Razorpay fee ${detail.orderMoney.gatewayFeePercent ?? ""}%`} value={fx(detail.orderMoney.gatewayFee)} />
              </div>
            </div>
          )}
          <div className="space-y-2">
            {(detail.dots || []).map((check) => <CheckRow key={check.key} check={check} />)}
            <PayoutStatusRow
              label="Processing from RazorpayX side"
              status={detail.payoutProgress?.razorpay || "PENDING"}
              detail={
                detail.payoutProgress?.razorpay === "PROCESSED" ? "RazorpayX payout processed"
                  : detail.payoutProgress?.razorpay === "PROCESSING" ? "Waiting for RazorpayX terminal webhook"
                    : detail.payoutProgress?.razorpay === "FAILED" ? (detail.failureReason || "RazorpayX payout failed")
                      : detail.payoutProgress?.razorpay === "NOT_APPLICABLE" ? "Manual payment selected"
                        : "Payout not started"
              }
            />
            <PayoutStatusRow
              label="Settled"
              status={detail.payoutProgress?.settlement || "PENDING"}
              detail={detail.payoutProgress?.settlement === "SETTLED"
                ? `Settlement completed${detail.invoiceNo ? ` · ${detail.invoiceNo}` : ""}`
                : "Waiting for successful payout completion"}
            />
          </div>
          {detail.complaint && (
            <div className="text-xs text-slate-500">
              Complaint {detail.complaint.complaintId} · {detail.complaint.status} · deduct {fx(detail.complaint.deduction)}
            </div>
          )}
          <div className="rounded-xl border p-3">
            <b className="text-sm">Seller issues (deductions)</b>
            <div className="mt-2 space-y-1">
              {ISSUE_FIELDS.map(([key, label]) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span>{label}</span>
                  <span className="w-28 rounded border px-2 py-1 text-right">{fx(detail.deductions?.[key])}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-indigo-50 p-3 text-sm">
            <div className="flex justify-between"><span>Seller deserves</span><b>{fx(detail.quotedAmount)}</b></div>
            {Number(detail.deductions?.complaint || 0) > 0 && (
              <div className="flex justify-between text-red-600"><span>− Complaint</span><span>−{fx(detail.deductions.complaint)}</span></div>
            )}
            {ISSUE_FIELDS.map(([key, label]) => Number(detail.deductions?.[key]) > 0 && (
              <div key={key} className="flex justify-between text-red-600"><span>− {label}</span><span>−{fx(detail.deductions[key])}</span></div>
            ))}
            <div className="mt-1 flex justify-between border-t pt-1">
              <b>Settlement amount</b><b className="text-indigo-700">{fx(detail.settledAmount)}</b>
            </div>
          </div>
        </Modal>
      )}

      {payOpen && (
        <BulkPayModal
          sellerId={sellerId}
          sellerName={sellerName}
          orderIds={[...sel]}
          total={total}
          onClose={() => setPayOpen(false)}
          onDone={(res) => {
            setResult(res);
            setPayOpen(false);
            loadOrders(sellerId, { resetResult: false });
          }}
        />
      )}
    </div>
  );
}

function Modal({ title, children, onClose, className = "" }) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-20 md:pt-24" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`w-full max-w-3xl rounded-2xl bg-white p-5 ${className}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">{title}</h2>
          <button onClick={onClose} className="text-slate-500">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Kv({ label, value }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-slate-500">{label}</span><span>{value}</span>
    </div>
  );
}

function SettlementStatus({ status }) {
  const normalized = String(status || "READY").toUpperCase();
  const presentation = {
    READY: { label: "Ready", className: "bg-emerald-50 text-emerald-700" },
    REVIEWED: { label: "Reviewed", className: "bg-blue-50 text-blue-700" },
    PAYING: { label: "Processing", className: "bg-amber-50 text-amber-700" },
    FAILED: { label: "Failed", className: "bg-red-50 text-red-700" },
    SETTLED: { label: "Settled", className: "bg-emerald-100 text-emerald-800" },
    WINDOW_OPEN: { label: "Window open", className: "bg-slate-100 text-slate-600" },
    HELD: { label: "On hold", className: "bg-orange-50 text-orange-700" },
  }[normalized] || { label: normalized, className: "bg-slate-100 text-slate-600" };

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${presentation.className}`}>
      {presentation.label}
    </span>
  );
}

function CheckRow({ check }) {
  const borderColor = check.dot === "g" ? "border-emerald-500" : check.dot === "a" ? "border-amber-500" : "border-red-500";
  const icon = check.dot === "g" ? "✓" : check.dot === "a" ? "⏳" : "✕";
  return (
    <div className={`rounded-lg border border-l-4 ${borderColor} p-2`}>
      <b>{icon} {check.label}</b>
      <div className="text-xs text-slate-500">{check.tooltip}</div>
    </div>
  );
}

function PayoutStatusRow({ label, status, detail }) {
  const complete = status === "PROCESSED" || status === "SETTLED";
  const failed = status === "FAILED";
  const active = status === "PROCESSING";
  const color = complete
    ? "border-emerald-500 bg-emerald-50"
    : failed
      ? "border-red-500 bg-red-50"
      : active
        ? "border-amber-500 bg-amber-50"
        : "border-slate-300 bg-slate-50";
  const icon = complete ? "✓" : failed ? "✕" : active ? "⏳" : "○";
  return (
    <div className={`rounded-lg border border-l-4 ${color} p-2`}>
      <b>{icon} {label}</b>
      <div className="text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function BulkPayModal({ sellerId, sellerName, orderIds, total, onClose, onDone }) {
  const [reviewed, setReviewed] = useState(false);
  const [mode, setMode] = useState("AUTOMATIC");
  const [txnNo, setTxnNo] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [idempotencyKey] = useState(() => {
    const randomPart = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `bulk-${sellerId}-${randomPart}`;
  });

  const pay = async () => {
    if (!reviewed) { setErr("Tick the review box first."); return; }
    if (mode === "MANUAL" && !txnNo.trim()) { setErr("Add the transaction number."); return; }
    setBusy(true); setErr("");
    try {
      const res = await adminApi.payBulkSettlement({
        sellerId,
        orderIds,
        mode,
        txnNo,
        idempotencyKey,
      });
      const result = res.data?.result;
      if (!result) throw new Error("The server returned an empty settlement response.");
      onDone(result);
    } catch (e) {
      setErr(
        e.response?.data?.message
        || e.message
        || "Bulk settlement failed. Check your connection and try again.",
      );
    }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`Bulk settle · ${sellerName}`} onClose={() => { if (!busy) onClose(); }}>
      <p className="text-sm text-slate-500">{orderIds.length} orders · Total {fx(total)}</p>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={reviewed} disabled={busy} onChange={(e) => setReviewed(e.target.checked)} />
        I have reviewed all orders
      </label>
      <div className="mt-2 flex gap-4 text-sm">
        <label className="flex items-center gap-1"><input type="radio" checked={mode === "AUTOMATIC"} disabled={busy} onChange={() => setMode("AUTOMATIC")} /> Automatic (Razorpay)</label>
        <label className="flex items-center gap-1"><input type="radio" checked={mode === "MANUAL"} disabled={busy} onChange={() => setMode("MANUAL")} /> Manual</label>
      </div>
      {mode === "MANUAL" && (
        <input value={txnNo} disabled={busy} onChange={(e) => setTxnNo(e.target.value)} placeholder="Transaction number" className="mt-2 w-full rounded border px-2 py-1 text-sm disabled:bg-slate-100" />
      )}
      {busy && (
        <div role="status" aria-live="polite" className="mt-3 flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
          <span className="mt-0.5 inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
          <span>
            Sending {orderIds.length} payout{orderIds.length === 1 ? "" : "s"} to Razorpay. Keep this window open; each payout may take up to 20 seconds to start.
          </span>
        </div>
      )}
      {err && <div className="mt-2 rounded-lg bg-red-50 text-red-600 text-sm px-3 py-2">{err}</div>}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={busy}
          onClick={pay}
          className="min-w-32 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? "Starting payouts…" : "Confirm & Pay"}
        </button>
      </div>
    </Modal>
  );
}
