import React from 'react';
import { 
    ChevronLeft, 
    RotateCcw, 
    ShieldCheck, 
    Clock, 
    CheckCircle2, 
    XCircle, 
    PackageCheck, 
    CreditCard, 
    Truck, 
    HelpCircle,
    ArrowRight,
    AlertCircle,
    Sparkles
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useSettings } from '@core/context/SettingsContext';

const ReturnPolicyPage = () => {
    const navigate = useNavigate();
    const { settings } = useSettings();
    const appName = settings?.appName || 'GrandBazar';
    const supportEmail = settings?.supportEmail || 'support@grandbazar.com';
    const supportPhone = settings?.supportPhone || '';
    const faviconUrl = settings?.faviconUrl || settings?.logoUrl || '';

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-16 text-slate-800">
            {/* Header */}
            <div className="bg-white/90 backdrop-blur-md sticky top-0 z-40 px-4 py-3 flex items-center justify-between border-b border-slate-100 shadow-sm">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 rounded-full hover:bg-slate-100 transition-colors"
                        aria-label="Go Back"
                    >
                        <ChevronLeft size={22} className="text-slate-700" />
                    </button>
                    <div className="flex items-center gap-2">
                        {faviconUrl ? (
                            <img src={faviconUrl} alt="logo" className="h-6 w-6 object-contain rounded-md" />
                        ) : (
                            <RotateCcw className="h-6 w-6 text-brand-600" />
                        )}
                        <h1 className="text-base font-black text-slate-900 tracking-tight">Return & Exchange Policy</h1>
                    </div>
                </div>
                <Link 
                    to="/support"
                    className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 bg-brand-50 px-3 py-1.5 rounded-xl border border-brand-100/50 transition-all"
                >
                    <span>Need Help?</span>
                    <ArrowRight size={12} />
                </Link>
            </div>

            <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
                {/* Hero Header Banner */}
                <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="relative z-10 space-y-3">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[11px] font-bold uppercase tracking-wider text-brand-300">
                            <Sparkles size={13} />
                            Hassle-Free Doorstep Returns & Exchanges
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                            Return & Exchange Policy
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                            At {appName}, customer satisfaction is our top priority. If you are not completely satisfied with your purchase, damaged products, or incorrect items, we offer a transparent return, replacement, and instant refund policy.
                        </p>
                        <div className="pt-2 flex items-center gap-4 text-[11px] text-slate-400 font-medium border-t border-white/10">
                            <span>Last Updated: October 2025</span>
                            <span>•</span>
                            <span>Applies to all local orders</span>
                        </div>
                    </div>
                </div>

                {/* Quick Highlights Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex flex-col items-start gap-2">
                        <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                            <Clock size={18} />
                        </div>
                        <div>
                            <h4 className="text-xs font-black text-slate-900">7-Day Window</h4>
                            <p className="text-[10px] text-slate-500 font-medium">For packaged & non-perishable goods</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex flex-col items-start gap-2">
                        <div className="h-9 w-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                            <ShieldCheck size={18} />
                        </div>
                        <div>
                            <h4 className="text-xs font-black text-slate-900">OTP Verified</h4>
                            <p className="text-[10px] text-slate-500 font-medium">Doorstep verification PIN code</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex flex-col items-start gap-2">
                        <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                            <CreditCard size={18} />
                        </div>
                        <div>
                            <h4 className="text-xs font-black text-slate-900">Instant Refunds</h4>
                            <p className="text-[10px] text-slate-500 font-medium">Direct to wallet or bank account</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex flex-col items-start gap-2">
                        <div className="h-9 w-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
                            <Truck size={18} />
                        </div>
                        <div>
                            <h4 className="text-xs font-black text-slate-900">Free Pickup</h4>
                            <p className="text-[10px] text-slate-500 font-medium">Doorstep rider pickup dispatch</p>
                        </div>
                    </div>
                </div>

                {/* Main Content Sections */}
                <div className="space-y-6">
                    {/* Section 1: Return Eligibility */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 font-bold">
                                <CheckCircle2 size={20} />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-slate-900">1. Return Eligibility Criteria</h3>
                                <p className="text-xs text-slate-500 font-medium">Conditions required for returning items</p>
                            </div>
                        </div>
                        <div className="prose prose-slate text-xs sm:text-sm text-slate-600 leading-relaxed space-y-3 pt-1 border-t border-slate-100">
                            <p>
                                An item is eligible for return or exchange under the following conditions:
                            </p>
                            <ul className="list-disc pl-5 space-y-2 font-medium">
                                <li>
                                    <strong className="text-slate-900">Timeframe:</strong> Request raised within 7 days of order delivery for general merchandise, electronics, clothing, and packaged items.
                                </li>
                                <li>
                                    <strong className="text-slate-900">Fresh Produce & Perishables:</strong> Damaged, expired, or spoiled groceries/dairy items must be reported within <strong>24 hours of delivery</strong> with item photos.
                                </li>
                                <li>
                                    <strong className="text-slate-900">Item Condition:</strong> The product must be unused, unwashed, with original tags, brand packaging, barcodes, user manuals, and warranty cards intact.
                                </li>
                                <li>
                                    <strong className="text-slate-900">Defects or Mismatch:</strong> Items received as damaged, physically defective, missing parts, or incorrect variants.
                                </li>
                            </ul>
                        </div>
                    </div>

                    {/* Section 2: Non-Returnable Items */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 font-bold">
                                <XCircle size={20} />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-slate-900">2. Non-Returnable Items</h3>
                                <p className="text-xs text-slate-500 font-medium">Categories excluded from return policy</p>
                            </div>
                        </div>
                        <div className="prose prose-slate text-xs sm:text-sm text-slate-600 leading-relaxed space-y-3 pt-1 border-t border-slate-100">
                            <p>
                                Due to hygiene, health, and safety regulations, certain products cannot be returned once delivered:
                            </p>
                            <ul className="list-disc pl-5 space-y-2 font-medium">
                                <li>Opened personal care products, cosmetics, innerwear, and hygiene supplies.</li>
                                <li>Perishable food items, frozen goods, or bakery items after 24 hours of delivery.</li>
                                <li>Customized, made-to-order, or clearance sale items explicitly marked non-returnable.</li>
                                <li>Items showing signs of physical wear, liquid spill, or user tampering.</li>
                            </ul>
                        </div>
                    </div>

                    {/* Section 3: Doorstep Return Process & OTP */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 font-bold">
                                <PackageCheck size={20} />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-slate-900">3. How the Doorstep Return Works</h3>
                                <p className="text-xs text-slate-500 font-medium">Simple 4-step return flow with live OTP security</p>
                            </div>
                        </div>
                        <div className="space-y-3 pt-1 border-t border-slate-100">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                    <div className="flex items-center gap-2 text-indigo-600 font-black">
                                        <span className="h-5 w-5 rounded-full bg-indigo-100 flex items-center justify-center text-[11px]">1</span>
                                        Request in App
                                    </div>
                                    <p className="text-slate-600 font-medium text-[11px]">Go to Orders → Select Item → Choose Return or Exchange and upload a brief photo.</p>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                    <div className="flex items-center gap-2 text-indigo-600 font-black">
                                        <span className="h-5 w-5 rounded-full bg-indigo-100 flex items-center justify-center text-[11px]">2</span>
                                        Rider Assigned
                                    </div>
                                    <p className="text-slate-600 font-medium text-[11px]">A delivery driver is dispatched to your address for hassle-free item pickup.</p>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                    <div className="flex items-center gap-2 text-indigo-600 font-black">
                                        <span className="h-5 w-5 rounded-full bg-indigo-100 flex items-center justify-center text-[11px]">3</span>
                                        Share Doorstep OTP
                                    </div>
                                    <p className="text-slate-600 font-medium text-[11px]">Provide the 4-digit pickup OTP displayed on your app screen to the driver during handoff.</p>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                    <div className="flex items-center gap-2 text-indigo-600 font-black">
                                        <span className="h-5 w-5 rounded-full bg-indigo-100 flex items-center justify-center text-[11px]">4</span>
                                        Refund Credit
                                    </div>
                                    <p className="text-slate-600 font-medium text-[11px]">Refund is immediately processed to your wallet or original payment mode.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section 4: Refund Timelines */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 font-bold">
                                <CreditCard size={20} />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-slate-900">4. Refund Methods & Timelines</h3>
                                <p className="text-xs text-slate-500 font-medium">How and when you receive your money back</p>
                            </div>
                        </div>
                        <div className="prose prose-slate text-xs sm:text-sm text-slate-600 leading-relaxed space-y-3 pt-1 border-t border-slate-100 font-medium">
                            <p>
                                Once your return pickup is verified by the delivery partner, refunds are issued based on your payment mode:
                            </p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>
                                    <strong className="text-slate-900">{appName} Wallet:</strong> Instant credit (available within 1-5 minutes for your next order).
                                </li>
                                <li>
                                    <strong className="text-slate-900">UPI / Net Banking:</strong> Refund credited back to your bank account within 24 to 48 hours.
                                </li>
                                <li>
                                    <strong className="text-slate-900">Credit / Debit Cards:</strong> Refund reflected in your bank statement within 2-4 business days.
                                </li>
                                <li>
                                    <strong className="text-slate-900">Cash on Delivery (COD):</strong> Refund credited directly to your `{appName}` Wallet or transferred via UPI upon providing VPA.
                                </li>
                            </ul>
                        </div>
                    </div>

                    {/* Section 5: Damaged / Wrong Items */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 font-bold">
                                <AlertCircle size={20} />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-slate-900">5. Replacement & Exchange Policy</h3>
                                <p className="text-xs text-slate-500 font-medium">Exchanging items for size or variant changes</p>
                            </div>
                        </div>
                        <div className="prose prose-slate text-xs sm:text-sm text-slate-600 leading-relaxed space-y-3 pt-1 border-t border-slate-100 font-medium">
                            <p>
                                If you receive a wrong size, wrong item, or damaged parcel, you can opt for an <strong>Exchange</strong> instead of a refund:
                            </p>
                            <p>
                                A replacement unit will be dispatched from the nearest merchant store directly to your address at no additional shipping fee.
                            </p>
                        </div>
                    </div>

                    {/* Section 6: Support */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 font-bold">
                                <HelpCircle size={20} />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-slate-900">6. Customer Support Assistance</h3>
                                <p className="text-xs text-slate-500 font-medium">Need help with a pending return or refund status?</p>
                            </div>
                        </div>
                        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-3 text-xs">
                            <Link
                                to="/support"
                                className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-brand-600 text-white font-black text-xs hover:bg-brand-700 transition-colors flex items-center justify-center gap-2 shadow-sm"
                            >
                                <span>Open Support Center</span>
                                <ArrowRight size={14} />
                            </Link>

                            <a
                                href={`mailto:${supportEmail}`}
                                className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-slate-100 text-slate-800 font-bold text-xs hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
                            >
                                <span>Email Support</span>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReturnPolicyPage;
