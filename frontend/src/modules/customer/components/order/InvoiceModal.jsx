import React, { useState } from 'react';
import { X, Download, Loader2, FileText, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettings } from '@core/context/SettingsContext';
import { customerApi } from '../../services/customerApi';
import { toast } from 'sonner';

const InvoiceModal = ({ isOpen, onClose, order }) => {
    const { settings } = useSettings();
    const appName = settings?.appName || 'Grand Bazar';
    const primaryColor = settings?.primaryColor || 'var(--primary)';
    const [isFetchingPdf, setIsFetchingPdf] = useState(false);

    if (!order) return null;

    const pricing = order.pricing || {};
    const breakdown = order.paymentBreakdown || {};
    const items = Array.isArray(order.items) ? order.items : [];
    const isDelivered =
        order.status === 'delivered' ||
        order.orderStatus === 'delivered' ||
        order.workflowStatus === 'DELIVERED' ||
        Boolean(order.deliveredAt);

    const isInterState = breakdown.taxJurisdiction === 'inter_state';

    // Detailed Line Items with Tax calculation fallbacks
    const lineItems = (breakdown.lineItems && breakdown.lineItems.length > 0)
        ? breakdown.lineItems
        : items.map((item) => {
              const qty = Number(item.quantity) || 1;
              const price = Number(item.price) || 0;
              const sub = price * qty;
              const gstRate = Number(item.gstRate || item.gst || 0);
              const totalTax = (sub * gstRate) / 100;
              const cgst = isInterState ? 0 : totalTax / 2;
              const sgst = isInterState ? 0 : totalTax / 2;
              const igst = isInterState ? totalTax : 0;
              return {
                  productName: item.name || 'Product',
                  quantity: qty,
                  unitPrice: price,
                  itemSubtotal: sub,
                  gstSlab: gstRate,
                  cgst,
                  sgst,
                  igst,
                  lineTotal: sub + totalTax,
              };
          });

    // Breakdown charges fallbacks
    const deliveryFee = Number(breakdown.deliveryFeeCharged ?? pricing.deliveryFee ?? 0);
    const handlingFee = Number(breakdown.handlingFeeCharged ?? pricing.handlingFee ?? 0);
    const packingFee = Number(breakdown.packingFeeCharged ?? pricing.packingFee ?? 0);
    const packagingCharge = Number(breakdown.packagingChargeAmount ?? 0);
    const oddHourSurcharge = Number(breakdown.oddHourSurchargeAmount ?? 0);
    const weatherSurcharge = Number(breakdown.weatherSurchargeAmount ?? 0);
    const platformSurcharge = Number(breakdown.customerSurchargeAmount ?? 0);
    const discount = Number(breakdown.discountAmount ?? pricing.discount ?? 0);

    const subtotal = Number(breakdown.productSubtotal ?? pricing.subtotal ?? lineItems.reduce((acc, item) => acc + (item.itemSubtotal || 0), 0));
    const cgstTotal = Number(breakdown.cgstTotal ?? lineItems.reduce((acc, item) => acc + (item.cgst || 0), 0));
    const sgstTotal = Number(breakdown.sgstTotal ?? lineItems.reduce((acc, item) => acc + (item.sgst || 0), 0));
    const igstTotal = Number(breakdown.igstTotal ?? lineItems.reduce((acc, item) => acc + (item.igst || 0), 0));
    const totalTax = cgstTotal + sgstTotal + igstTotal || Number(pricing.gst || 0);

    const grandTotal = Number(breakdown.grandTotal ?? pricing.total ?? (subtotal + totalTax + deliveryFee + handlingFee + packingFee + packagingCharge + oddHourSurcharge + weatherSurcharge + platformSurcharge - discount));

    const handleDownloadPdf = async () => {
        if (!isDelivered) {
            toast.info('The tax invoice PDF is generated once this order is delivered.');
            return;
        }
        setIsFetchingPdf(true);
        try {
            const res = await customerApi.getOrderInvoice(order.orderId || order.id);
            const pdfUrl = res?.data?.result?.pdfUrl;
            if (pdfUrl) {
                window.open(pdfUrl, '_blank', 'noopener,noreferrer');
            } else {
                toast.error('Invoice PDF is generating — please try again in a few seconds.');
            }
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Failed to fetch invoice PDF');
        } finally {
            setIsFetchingPdf(false);
        }
    };

    const formattedDate = order.createdAt
        ? new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 15 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 15 }}
                            transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl relative my-auto max-h-[92vh] flex flex-col"
                        >
                            {/* Modal Navigation Header */}
                            <div className="bg-slate-900 px-6 py-4 border-b border-slate-800 flex items-center justify-between text-white shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-slate-800 rounded-xl text-emerald-400">
                                        <FileText size={20} />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-bold tracking-tight">Tax Invoice</h2>
                                        <p className="text-xs text-slate-400 font-mono">#{order.orderId || order.id}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-full transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Printable Area Content */}
                            <div className="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1 bg-slate-50/50" id="printable-invoice">
                                {/* Branding & Title Header */}
                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                                    <div>
                                        <h1 className="text-2xl font-black tracking-tight" style={{ color: primaryColor }}>
                                            {appName}
                                        </h1>
                                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                                            {settings?.companyName || 'Grand Bazar Quick Commerce'}
                                        </p>
                                    </div>
                                    <div className="sm:text-right">
                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                            <CheckCircle2 size={12} className="mr-1.5" /> GST TAX INVOICE
                                        </span>
                                        <p className="text-xs text-slate-500 font-mono mt-1.5">
                                            Date: {formattedDate}
                                        </p>
                                    </div>
                                </div>

                                {/* Order & Billing Meta Details Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {/* Billed From (Seller) */}
                                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Billed From (Seller)</p>
                                        <h3 className="text-sm font-bold text-slate-900">{order.sellerStoreName || order.sellerName || 'Merchant Store'}</h3>
                                        <p className="text-xs text-slate-600 mt-1 whitespace-pre-line leading-relaxed">
                                            {order.sellerAddress || 'Verified Store Partner'}
                                        </p>
                                        {order.sellerGst && (
                                            <p className="text-xs font-mono font-semibold text-slate-700 mt-2 bg-slate-100 px-2.5 py-1 rounded-md inline-block">
                                                GSTIN: {order.sellerGst}
                                            </p>
                                        )}
                                    </div>

                                    {/* Billed To (Customer) */}
                                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Billed To (Customer)</p>
                                        <h3 className="text-sm font-bold text-slate-900">{order.address?.name || 'Valued Customer'}</h3>
                                        <p className="text-xs text-slate-600 mt-1 whitespace-pre-line leading-relaxed">
                                            {order.address?.address}
                                        </p>
                                        <p className="text-xs font-medium text-slate-700 mt-1">
                                            Phone: {order.address?.phone || '—'}
                                        </p>
                                    </div>
                                </div>

                                {/* Itemized Product & Tax Table */}
                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                    <div className="px-5 py-3 bg-slate-900 text-white font-bold text-xs flex justify-between items-center">
                                        <span>Item Description</span>
                                        <span className="font-mono text-slate-400">Order Items ({lineItems.length})</span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs text-left">
                                            <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                                                <tr>
                                                    <th className="px-4 py-2.5">#</th>
                                                    <th className="px-4 py-2.5">Item</th>
                                                    <th className="px-4 py-2.5 text-center">Qty</th>
                                                    <th className="px-4 py-2.5 text-right">Price</th>
                                                    <th className="px-4 py-2.5 text-right">GST%</th>
                                                    {isInterState ? (
                                                        <th className="px-4 py-2.5 text-right">IGST</th>
                                                    ) : (
                                                        <>
                                                            <th className="px-4 py-2.5 text-right">CGST</th>
                                                            <th className="px-4 py-2.5 text-right">SGST</th>
                                                        </>
                                                    )}
                                                    <th className="px-4 py-2.5 text-right font-bold">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 text-slate-700">
                                                {lineItems.map((item, idx) => (
                                                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                                        <td className="px-4 py-3 text-slate-400 font-mono">{idx + 1}</td>
                                                        <td className="px-4 py-3 font-semibold text-slate-800">{item.productName || item.name}</td>
                                                        <td className="px-4 py-3 text-center font-medium">{item.quantity}</td>
                                                        <td className="px-4 py-3 text-right font-mono">₹{Number(item.unitPrice || 0).toFixed(2)}</td>
                                                        <td className="px-4 py-3 text-right text-slate-500">{item.gstSlab || 0}%</td>
                                                        {isInterState ? (
                                                            <td className="px-4 py-3 text-right font-mono text-slate-600">₹{Number(item.igst || 0).toFixed(2)}</td>
                                                        ) : (
                                                            <>
                                                                <td className="px-4 py-3 text-right font-mono text-slate-600">₹{Number(item.cgst || 0).toFixed(2)}</td>
                                                                <td className="px-4 py-3 text-right font-mono text-slate-600">₹{Number(item.sgst || 0).toFixed(2)}</td>
                                                            </>
                                                        )}
                                                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                                                            ₹{Number(item.lineTotal || (item.itemSubtotal || 0) + (item.lineTax || 0)).toFixed(2)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Comprehensive Price Breakdown & Totals Box */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                                    {/* Left: GST Summary & Payment Mode */}
                                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">GST Tax Summary</h4>
                                        <div className="text-xs text-slate-600 space-y-1.5 font-mono">
                                            {isInterState ? (
                                                <div className="flex justify-between">
                                                    <span>IGST Total Tax:</span>
                                                    <span className="font-semibold text-slate-900">₹{igstTotal.toFixed(2)}</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex justify-between">
                                                        <span>CGST Tax Total:</span>
                                                        <span className="font-semibold text-slate-900">₹{cgstTotal.toFixed(2)}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>SGST Tax Total:</span>
                                                        <span className="font-semibold text-slate-900">₹{sgstTotal.toFixed(2)}</span>
                                                    </div>
                                                </>
                                            )}
                                            <div className="flex justify-between pt-1 border-t border-slate-100 font-bold text-slate-900">
                                                <span>Total Tax Amount:</span>
                                                <span>₹{totalTax.toFixed(2)}</span>
                                            </div>
                                        </div>

                                        <div className="pt-2 border-t border-slate-100">
                                            <p className="text-[11px] text-slate-500">
                                                Payment Method:{' '}
                                                <span className="font-bold text-slate-800 uppercase">
                                                    {order.paymentMethod || order.paymentMode || 'Online'}
                                                </span>
                                            </p>
                                        </div>
                                    </div>

                                    {/* Right: Detailed Charges & Grand Total */}
                                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2 text-xs">
                                        <div className="flex justify-between text-slate-600">
                                            <span>Items Subtotal</span>
                                            <span className="font-mono font-medium text-slate-800">₹{subtotal.toFixed(2)}</span>
                                        </div>

                                        {deliveryFee > 0 && (
                                            <div className="flex justify-between text-slate-600">
                                                <span>Delivery Fee</span>
                                                <span className="font-mono text-slate-800">₹{deliveryFee.toFixed(2)}</span>
                                            </div>
                                        )}

                                        {handlingFee > 0 && (
                                            <div className="flex justify-between text-slate-600">
                                                <span>Handling Fee</span>
                                                <span className="font-mono text-slate-800">₹{handlingFee.toFixed(2)}</span>
                                            </div>
                                        )}

                                        {packingFee > 0 && (
                                            <div className="flex justify-between text-slate-600">
                                                <span>Packing Fee</span>
                                                <span className="font-mono text-slate-800">₹{packingFee.toFixed(2)}</span>
                                            </div>
                                        )}

                                        {packagingCharge > 0 && (
                                            <div className="flex justify-between text-slate-600">
                                                <span>Packaging Charge</span>
                                                <span className="font-mono text-slate-800">₹{packagingCharge.toFixed(2)}</span>
                                            </div>
                                        )}

                                        {oddHourSurcharge > 0 && (
                                            <div className="flex justify-between text-slate-600">
                                                <span>Odd-Hour Surge</span>
                                                <span className="font-mono text-slate-800">₹{oddHourSurcharge.toFixed(2)}</span>
                                            </div>
                                        )}

                                        {weatherSurcharge > 0 && (
                                            <div className="flex justify-between text-slate-600">
                                                <span>Weather Surge</span>
                                                <span className="font-mono text-slate-800">₹{weatherSurcharge.toFixed(2)}</span>
                                            </div>
                                        )}

                                        {platformSurcharge > 0 && (
                                            <div className="flex justify-between text-slate-600">
                                                <span>Platform Charge</span>
                                                <span className="font-mono text-slate-800">₹{platformSurcharge.toFixed(2)}</span>
                                            </div>
                                        )}

                                        {discount > 0 && (
                                            <div className="flex justify-between text-emerald-600 font-semibold">
                                                <span>Discount Saved</span>
                                                <span className="font-mono">-₹{discount.toFixed(2)}</span>
                                            </div>
                                        )}

                                        <div className="flex justify-between text-slate-600">
                                            <span>GST Taxes</span>
                                            <span className="font-mono text-slate-800">₹{totalTax.toFixed(2)}</span>
                                        </div>

                                        <div className="flex justify-between items-center text-sm font-black text-slate-900 pt-3 border-t border-slate-200">
                                            <span>Grand Total Paid</span>
                                            <span className="text-base font-mono text-slate-900" style={{ color: primaryColor }}>
                                                ₹{grandTotal.toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="text-[11px] text-slate-400 text-center font-medium pt-2">
                                    This is an electronically generated tax invoice and does not require a physical signature.
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex gap-3 shrink-0">
                                <button
                                    onClick={handleDownloadPdf}
                                    disabled={isFetchingPdf}
                                    className="flex-1 py-3 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-60"
                                    style={{ backgroundColor: primaryColor }}
                                >
                                    {isFetchingPdf ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                                    {isDelivered ? 'Download Official PDF' : 'Save Invoice'}
                                </button>
                            </div>

                            {/* Custom Scoped Print Styles retained for browser-native Ctrl+P printing */}
                            <style>{`
                                @media print {
                                    @page {
                                        size: A4 portrait;
                                        margin: 10mm;
                                    }
                                    body {
                                        background: white !important;
                                        margin: 0 !important;
                                        padding: 0 !important;
                                    }
                                    body > * {
                                        display: none !important;
                                    }
                                    #printable-invoice, #printable-invoice * {
                                        visibility: visible !important;
                                        display: block !important;
                                    }
                                    #printable-invoice {
                                        position: absolute !important;
                                        left: 0 !important;
                                        top: 0 !important;
                                        width: 100% !important;
                                        margin: 0 !important;
                                        padding: 0 !important;
                                        background: white !important;
                                    }
                                    #printable-invoice table, #printable-invoice tbody, #printable-invoice tr, #printable-invoice td, #printable-invoice th {
                                        display: table-cell !important;
                                    }
                                    #printable-invoice tr {
                                        display: table-row !important;
                                    }
                                    #printable-invoice table {
                                        display: table !important;
                                    }
                                    #printable-invoice thead {
                                        display: table-header-group !important;
                                    }
                                }
                            `}</style>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default InvoiceModal;
