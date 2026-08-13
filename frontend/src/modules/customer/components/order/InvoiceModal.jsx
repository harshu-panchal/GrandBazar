import React, { useState } from 'react';
import { X, Printer, Download, Share2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettings } from '@core/context/SettingsContext';
import { customerApi } from '../../services/customerApi';
import { toast } from 'sonner';

const InvoiceModal = ({ isOpen, onClose, order }) => {
    const { settings } = useSettings();
    const appName = settings?.appName || 'App';
    const primaryColor = settings?.primaryColor || 'var(--primary)';
    const [isFetchingPdf, setIsFetchingPdf] = useState(false);
    if (!order) return null;

    const pricing = order.pricing || {};
    const breakdown = order.paymentBreakdown || {};
    const items = Array.isArray(order.items) ? order.items : [];
    const isDelivered = order.status === 'delivered' || order.orderStatus === 'delivered' || order.workflowStatus === 'DELIVERED' || Boolean(order.deliveredAt);
    const isInterState = breakdown.taxJurisdiction === 'inter_state';

    const handlePrint = () => {
        window.print();
    };

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
                toast.error('Invoice not available yet — please try again shortly.');
            }
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Failed to fetch invoice PDF');
        } finally {
            setIsFetchingPdf(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl relative"
                        >
                            {/* Header */}
                            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-black text-slate-800">Invoice</h2>
                                    <p className="text-xs text-slate-500 font-medium">#{order.orderId || order.id}</p>
                                </div>
                                <button onClick={onClose} className="p-2 bg-white rounded-full hover:bg-slate-200 transition-colors shadow-sm border border-slate-100">
                                    <X size={20} className="text-slate-500" />
                                </button>
                            </div>

                            {/* Printable Area */}
                            <div className="p-8 space-y-6" id="printable-invoice">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h1 className="text-2xl font-black tracking-tight" style={{ color: primaryColor }}>{appName}</h1>
                                        <p className="text-xs text-slate-500 mt-1">{settings?.companyName || 'Quick Commerce'}<br />{settings?.address || '—'}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-slate-800">Bill To:</p>
                                        <p className="text-xs text-slate-500 mt-1">{order.address?.name}<br />{order.address?.phone}</p>
                                    </div>
                                </div>

                                <div className="border rounded-xl overflow-hidden border-slate-100">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                                            <tr>
                                                <th className="px-4 py-3">Item</th>
                                                <th className="px-4 py-3 text-right">Qty</th>
                                                <th className="px-4 py-3 text-right">Price</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {items.map((item, idx) => (
                                                <tr key={idx}>
                                                    <td className="px-4 py-3 text-slate-700 font-medium">{item.name}</td>
                                                    <td className="px-4 py-3 text-slate-500 text-right">{item.quantity}</td>
                                                    <td className="px-4 py-3 text-slate-800 font-bold text-right">₹{item.price}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="space-y-2 pt-2 border-t border-slate-100">
                                    <div className="flex justify-between text-sm text-slate-500">
                                        <span>Subtotal</span>
                                        <span>₹{pricing.subtotal ?? 0}</span>
                                    </div>
                                    <div className="flex justify-between text-sm text-slate-500">
                                        <span>Delivery Fee</span>
                                        <span>₹{pricing.deliveryFee ?? 0}</span>
                                    </div>
                                    {isInterState ? (
                                        <div className="flex justify-between text-sm text-slate-500">
                                            <span>IGST</span>
                                            <span>₹{breakdown.igstTotal ?? 0}</span>
                                        </div>
                                    ) : (breakdown.cgstTotal || breakdown.sgstTotal) ? (
                                        <>
                                            <div className="flex justify-between text-sm text-slate-500">
                                                <span>CGST</span>
                                                <span>₹{breakdown.cgstTotal ?? 0}</span>
                                            </div>
                                            <div className="flex justify-between text-sm text-slate-500">
                                                <span>SGST</span>
                                                <span>₹{breakdown.sgstTotal ?? 0}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex justify-between text-sm text-slate-500">
                                            <span>Tax</span>
                                            <span>₹{pricing.gst ?? 0}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-base font-black text-slate-800 pt-2 border-t border-slate-100">
                                        <span>Total Paid</span>
                                        <span>₹{pricing.total ?? 0}</span>
                                    </div>
                                </div>
                                {!isDelivered && (
                                    <p className="text-[11px] text-slate-400 font-medium text-center">
                                        A downloadable tax invoice PDF will be generated once this order is delivered.
                                    </p>
                                )}
                            </div>

                            {/* Footer Actions */}
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                                <button onClick={handlePrint} className="flex-1 py-3 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-lg" style={{ backgroundColor: primaryColor }}>
                                    <Printer size={18} /> Print
                                </button>
                                <button
                                    onClick={handleDownloadPdf}
                                    disabled={isFetchingPdf}
                                    className="flex-1 py-3 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors disabled:opacity-60"
                                >
                                    {isFetchingPdf ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                                    {isDelivered ? 'Download PDF' : 'Save PDF'}
                                </button>
                            </div>

                            <style>
                                {`
                                    @media print {
                                        body * { visibility: hidden; }
                                        #printable-invoice, #printable-invoice * { visibility: visible; }
                                        #printable-invoice { position: absolute; left: 0; top: 0; width: 100%; }
                                    }
                                `}
                            </style>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default InvoiceModal;

