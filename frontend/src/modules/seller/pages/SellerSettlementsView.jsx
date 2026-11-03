import { createElement, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { sellerApi } from "../services/sellerApi";
import { formatOrderId } from "@/shared/utils/orderId";

const fx = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
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
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);

  useEffect(() => {
    sellerApi
      .listSettlements()
      .then((res) => setRows(res.data?.result?.items || []))
      .catch(() => setRows([]));
  }, []);

  const openInvoice = async (orderId) => {
    setInvoiceLoading(true);
    try {
      const res = await sellerApi.getSettlementInvoice(orderId);
      setInvoice(res.data?.result || null);
      if (!res.data?.result) toast.error("Settlement invoice details are unavailable.");
    } catch (error) {
      setInvoice(null);
      toast.error(error?.response?.data?.message || "Failed to load settlement invoice.");
    } finally {
      setInvoiceLoading(false);
    }
  };

  const downloadInvoice = () => {
    if (!invoice) return;
    setDownloadLoading(true);
    try {
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 16;
      const right = pageWidth - margin;
      let y = 18;
      const money = (value) => `INR ${Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
      const ensureSpace = (height = 8) => {
        if (y + height > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
      };
      const heading = (text) => {
        ensureSpace(12);
        y += 3;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(15, 23, 42);
        pdf.text(text, margin, y);
        y += 3;
        pdf.setDrawColor(226, 232, 240);
        pdf.line(margin, y, right, y);
        y += 5;
      };
      const row = (label, value, { bold = false, color = [51, 65, 85] } = {}) => {
        ensureSpace(7);
        pdf.setFont("helvetica", bold ? "bold" : "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(...color);
        pdf.text(String(label), margin, y);
        pdf.text(String(value), right, y, { align: "right" });
        y += 6;
      };

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.setTextColor(15, 23, 42);
      pdf.text("SELLER SETTLEMENT INVOICE", margin, y);
      y += 8;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`${invoice.invoiceNo}  |  Order #${formatOrderId(invoice)}`, margin, y);
      y += 6;
      pdf.text(`${invoice.sellerName || "Seller"}${invoice.bulkRef ? `  |  Bulk settlement ${invoice.bulkRef}` : ""}`, margin, y);
      y += 6;
      if (invoice.paidAt) {
        pdf.text(`Paid ${new Date(invoice.paidAt).toLocaleString("en-IN")}`, margin, y);
        y += 5;
      }

      heading("Order amount breakdown (customer bill)");
      const breakdown = invoice.moneyBreakdown || {};
      const chargeRows = [
        ["Product subtotal", breakdown.productSubtotal],
        ["Delivery fee", breakdown.deliveryFee],
        ["Handling fee", breakdown.handlingFee],
        ["Packing fee", breakdown.packingFee],
        ["Product packaging charge", breakdown.productPackagingCharge],
        ["Packaging charge", breakdown.packagingCharge],
        [breakdown.customerSurchargeReason || "Extra charge", breakdown.customerSurcharge],
        ["Odd-hour surcharge", breakdown.oddHourSurcharge],
        ["Weather surcharge", breakdown.weatherSurcharge],
        ["Rider tip", breakdown.tip],
        ["Discount", -Number(breakdown.discount || 0)],
      ];
      chargeRows.forEach(([label, amount]) => {
        if (Number(amount || 0) !== 0) row(label, money(amount));
      });
      (breakdown.extraCharges || []).forEach((charge) => {
        row(charge.name || "Extra charge", money(charge.amount));
      });
      if (breakdown.taxJurisdiction === "inter_state") {
        row("IGST", `${money(breakdown.igstTotal)}${gstRatesText(invoice.items, "total") ? ` (${gstRatesText(invoice.items, "total")})` : ""}`);
      } else {
        const splitRates = gstRatesText(invoice.items, "split");
        row(`CGST${splitRates ? ` (${splitRates})` : ""}`, money(breakdown.cgstTotal));
        row(`SGST${splitRates ? ` (${splitRates})` : ""}`, money(breakdown.sgstTotal));
      }
      row("Total GST", money(breakdown.taxTotal), { bold: true });
      row("Customer order total", money(breakdown.grandTotal), { bold: true });
      if (Number(breakdown.walletAmount || 0) > 0) {
        row("Paid using wallet", money(breakdown.walletAmount));
        row("Remaining payment", money(Math.max(Number(breakdown.grandTotal || 0) - Number(breakdown.walletAmount), 0)));
      }
      if (breakdown.paymentMode) row("Payment mode", breakdown.paymentMode);

      heading("Items and GST");
      (invoice.items || []).forEach((item) => {
        ensureSpace(13);
        const rates = Number(item.gstRate || 0);
        const tax = Number(item.cgst || 0) + Number(item.sgst || 0) + Number(item.igst || 0);
        const detail = `${item.name || "Item"}  |  Qty ${item.quantity}  |  Unit ${money(item.unitPrice)}  |  Subtotal ${money(item.subtotal)}  |  GST ${rates}% (${money(tax)})`;
        const lines = pdf.splitTextToSize(detail, pageWidth - margin * 2);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(51, 65, 85);
        pdf.text(lines, margin, y);
        y += lines.length * 4 + 2;
      });

      heading("Seller settlement calculation");
      row("Seller amount quoted", money(invoice.quotedAmount));
      Object.entries(ISSUE_LABELS).forEach(([key, label]) => {
        row(`Less: ${label}`, `-${money(invoice.deductions?.[key] || 0)}`);
      });
      const totalDeductions = Object.values(invoice.deductions || {})
        .reduce((sum, amount) => sum + Number(amount || 0), 0);
      row("Total deductions", `-${money(totalDeductions)}`, { bold: true, color: [185, 28, 28] });
      row("Settled amount paid", money(invoice.settledAmount), { bold: true, color: [5, 150, 105] });
      row("Transaction number", invoice.txnNo || "—");
      row("UTR", invoice.utr || "—");

      pdf.save(`Settlement_${invoice.invoiceNo}_${invoice.orderId}.pdf`);
      toast.success("Settlement invoice downloaded.");
    } catch (error) {
      console.error("Settlement invoice PDF generation failed:", error);
      toast.error("Failed to generate settlement invoice PDF.");
    } finally {
      setDownloadLoading(false);
    }
  };

  const gstRatesText = (items = [], type) => {
    const rates = [...new Set(items.map((item) => Number(item.gstRate)).filter((rate) => Number.isFinite(rate) && rate > 0))]
      .sort((a, b) => a - b);
    const appliedRates = type === "split" ? rates.map((rate) => rate / 2) : rates;
    return appliedRates.map((rate) => `${Number(rate.toFixed(2))}%`).join(", ");
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
                <td className="px-2 py-2 font-semibold" title={r.orderId}>
                  {createElement(
                    Link,
                    {
                      to: `/seller/orders?orderId=${encodeURIComponent(r.orderId)}`,
                      className: "text-brand-700 underline decoration-brand-200 underline-offset-4 transition-colors hover:text-brand-900 hover:decoration-brand-500",
                      "aria-label": `View order ${formatOrderId(r)} details`,
                    },
                    `#${formatOrderId(r)}`,
                  )}
                </td>
                <td className="px-2 py-2">{r.customerName}</td>
                <td className="px-2 py-2">{r.date ? new Date(r.date).toLocaleDateString() : "—"}</td>
                <td className="px-2 py-2">{fx(r.quotedAmount)}</td>
                <td className={`px-2 py-2 font-bold ${r.settled ? "text-emerald-600" : "text-red-600"}`}>{fx(r.settledAmount)}</td>
                <td className="px-2 py-2">{r.status}</td>
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

      {invoiceLoading && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40">
          <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-700">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
            Loading settlement invoice…
          </div>
        </div>
      )}

      {invoice && (
        <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-20 md:pt-24" onClick={(e) => e.target === e.currentTarget && setInvoice(null)}>
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black">Settlement invoice · {invoice.invoiceNo}</h2>
                <div className="text-xs text-slate-500">{invoice.sellerName} · Order #{formatOrderId(invoice)}</div>
              </div>
              <button onClick={() => setInvoice(null)} className="text-slate-500">✕</button>
            </div>
            <div className="border-t pt-3">
              <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Order amount breakdown</h3>
              {(invoice.items || []).map((item, index) => (
                <div key={`${item.name}-${index}`} className="flex justify-between gap-3 py-1 text-xs text-slate-600">
                  <span>
                    {item.name} × {item.quantity} · GST {Number(item.gstRate || 0)}%
                    <span className="block text-[10px] text-slate-400">
                      Subtotal {fx(item.subtotal)} · Tax {fx(Number(item.cgst || 0) + Number(item.sgst || 0) + Number(item.igst || 0))}
                    </span>
                  </span>
                  <span className="shrink-0">{fx(item.subtotal + Number(item.cgst || 0) + Number(item.sgst || 0) + Number(item.igst || 0))}</span>
                </div>
              ))}
              {[
                ["Product subtotal", invoice.moneyBreakdown?.productSubtotal],
                ["Delivery fee", invoice.moneyBreakdown?.deliveryFee],
                ["Handling fee", invoice.moneyBreakdown?.handlingFee],
                ["Packing fee", invoice.moneyBreakdown?.packingFee],
                ["Product packaging charge", invoice.moneyBreakdown?.productPackagingCharge],
                ["Packaging charge", invoice.moneyBreakdown?.packagingCharge],
                [invoice.moneyBreakdown?.customerSurchargeReason || "Extra charge", invoice.moneyBreakdown?.customerSurcharge],
                ["Odd-hour surcharge", invoice.moneyBreakdown?.oddHourSurcharge],
                ["Weather surcharge", invoice.moneyBreakdown?.weatherSurcharge],
                ["Rider tip", invoice.moneyBreakdown?.tip],
                ["Discount", -Number(invoice.moneyBreakdown?.discount || 0)],
              ].filter(([, amount]) => Number(amount || 0) !== 0).map(([label, amount]) => (
                <div key={label} className="flex justify-between gap-3 py-1 text-xs text-slate-600">
                  <span>{label}</span><span>{fx(amount)}</span>
                </div>
              ))}
              {(invoice.moneyBreakdown?.extraCharges || []).map((charge, index) => (
                <div key={`${charge.name}-${index}`} className="flex justify-between gap-3 py-1 text-xs text-slate-600">
                  <span>{charge.name || "Extra charge"}</span><span>{fx(charge.amount)}</span>
                </div>
              ))}
              {invoice.moneyBreakdown?.taxJurisdiction === "inter_state" ? (
                <div className="flex justify-between py-1 text-xs text-slate-600">
                  <span>IGST {gstRatesText(invoice.items, "total")}</span><span>{fx(invoice.moneyBreakdown?.igstTotal)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between py-1 text-xs text-slate-600">
                    <span>CGST {gstRatesText(invoice.items, "split")}</span><span>{fx(invoice.moneyBreakdown?.cgstTotal)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-xs text-slate-600">
                    <span>SGST {gstRatesText(invoice.items, "split")}</span><span>{fx(invoice.moneyBreakdown?.sgstTotal)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between border-t pt-2 text-sm font-black text-slate-900">
                <span>Customer order total</span><span>{fx(invoice.moneyBreakdown?.grandTotal)}</span>
              </div>
              {Number(invoice.moneyBreakdown?.walletAmount || 0) > 0 && (
                <div className="flex justify-between py-1 text-xs text-slate-500">
                  <span>Paid using wallet</span><span>{fx(invoice.moneyBreakdown.walletAmount)}</span>
                </div>
              )}
              {invoice.moneyBreakdown?.paymentMode && (
                <div className="flex justify-between py-1 text-xs text-slate-500">
                  <span>Payment mode</span><span>{invoice.moneyBreakdown.paymentMode}</span>
                </div>
              )}
            </div>
            <div className="border-t pt-3">
              <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Seller settlement calculation</h3>
              <div className="flex justify-between text-sm"><span>Seller amount quoted</span><span>{fx(invoice.quotedAmount)}</span></div>
            </div>
            {invoice.bulkRef && (
              <div className="rounded-lg bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                Bulk settlement · Ref {invoice.bulkRef}
              </div>
            )}
            {Object.entries(ISSUE_LABELS).map(([key, label]) => (
              <div key={key} className="flex justify-between text-sm text-red-600"><span>− {label}</span><span>−{fx(invoice.deductions?.[key] || 0)}</span></div>
            ))}
            <div className="flex justify-between border-t pt-1 text-sm font-bold text-red-600">
              <span>Total deductions</span>
              <span>−{fx(Object.values(invoice.deductions || {}).reduce((sum, amount) => sum + Number(amount || 0), 0))}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-sm"><b>Settled amount</b><b className="text-emerald-600">{fx(invoice.settledAmount)}</b></div>
            <div className="flex justify-between text-sm"><span>Transaction no.</span><span>{invoice.txnNo || "—"}</span></div>
            {invoice.utr && <div className="flex justify-between text-sm"><span>UTR</span><span>{invoice.utr}</span></div>}
            {invoice.paidAt && <div className="text-xs text-slate-400">Paid {new Date(invoice.paidAt).toLocaleString()}</div>}
            <button
              type="button"
              onClick={downloadInvoice}
              disabled={downloadLoading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {downloadLoading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              {downloadLoading ? "Preparing PDF…" : "Download invoice PDF"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
