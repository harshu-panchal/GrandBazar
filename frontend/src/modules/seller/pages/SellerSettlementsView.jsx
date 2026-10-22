import React, { useEffect, useState } from "react";
import { sellerApi } from "../services/sellerApi";

const fx = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const ISSUE_LABELS = {
  complaint: "Complaint",
  packing: "Packing",
  extra: "Extra charge",
  quality: "Quality issue",
  priceMismatch: "Price mismatch",
  misc: "Miscellaneous",
};

export default function SellerSettlementsView() {
  const [rows, setRows] = useState([]);
  const [invoice, setInvoice] = useState(null);

  useEffect(() => {
    sellerApi
      .listSettlements()
      .then((res) => setRows(res.data?.result?.items || []))
      .catch(() => setRows([]));
  }, []);

  const openInvoice = (orderId) => {
    sellerApi
      .getSettlementInvoice(orderId)
      .then((res) => setInvoice(res.data?.result))
      .catch(() => setInvoice(null));
  };

  return (
    <div className="p-4 space-y-3">
      <div>
        <h1 className="text-xl font-black">My Settlements</h1>
        <p className="text-xs text-slate-500">Amounts are red until settled, then turn green with the invoice attached.</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2 text-left">Order ID</th>
              <th className="px-2 py-2 text-left">Customer Name</th>
              <th className="px-2 py-2 text-left">Date</th>
              <th className="px-2 py-2 text-left">Amount (quoted)</th>
              <th className="px-2 py-2 text-left">Settled amount</th>
              <th className="px-2 py-2 text-left">Status</th>
              <th className="px-2 py-2 text-left">Invoice</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-2 py-6 text-center text-slate-400">No settlements yet.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.orderId} className="border-b last:border-0">
                <td className="px-2 py-2 font-semibold">#{r.orderId}</td>
                <td className="px-2 py-2">{r.customerName}</td>
                <td className="px-2 py-2">{r.date ? new Date(r.date).toLocaleDateString() : "—"}</td>
                <td className="px-2 py-2">{fx(r.quotedAmount)}</td>
                <td className={`px-2 py-2 font-bold ${r.settled ? "text-emerald-600" : "text-red-600"}`}>{fx(r.settledAmount)}</td>
                <td className="px-2 py-2">{r.settled ? "Credited" : "Pending"}</td>
                <td className="px-2 py-2">
                  {r.settled ? (
                    <button className="text-indigo-600" onClick={() => openInvoice(r.orderId)}>
                      📎 {r.invoiceNo}
                      {r.bulkRef ? ` · Bulk ${r.bulkRef}` : ""}
                    </button>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {invoice && (
        <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-20 md:pt-24" onClick={(e) => e.target === e.currentTarget && setInvoice(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black">Settlement invoice · {invoice.invoiceNo}</h2>
                <div className="text-xs text-slate-500">{invoice.sellerName} · Order #{invoice.orderId}</div>
              </div>
              <button onClick={() => setInvoice(null)} className="text-slate-500">✕</button>
            </div>
            {invoice.bulkRef && (
              <div className="rounded-lg bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                Bulk settlement · Ref {invoice.bulkRef}
              </div>
            )}
            <div className="flex justify-between text-sm"><span>Amount (quoted)</span><span>{fx(invoice.quotedAmount)}</span></div>
            {Object.entries(invoice.deductions || {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm text-red-600"><span>− {ISSUE_LABELS[k] || k}</span><span>−{fx(v)}</span></div>
            ))}
            <div className="flex justify-between border-t pt-1 text-sm"><b>Settled amount</b><b className="text-emerald-600">{fx(invoice.settledAmount)}</b></div>
            <div className="flex justify-between text-sm"><span>Transaction no.</span><span>{invoice.txnNo || "—"}</span></div>
            {invoice.paidAt && <div className="text-xs text-slate-400">Paid {new Date(invoice.paidAt).toLocaleString()}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
