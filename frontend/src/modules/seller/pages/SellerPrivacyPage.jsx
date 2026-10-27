import React from 'react';
import { ChevronLeft, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useSettings } from '@core/context/SettingsContext';

// PLACEHOLDER CONTENT — not reviewed by legal/business. Replace every
// bracketed [TO BE FINALIZED] item with the real policy before this is
// relied on as the actual seller privacy policy.
const SellerPrivacyPage = () => {
    const navigate = useNavigate();
    const { settings } = useSettings();
    const appName = settings?.appName || 'App';
    const companyName = settings?.companyName || appName;
    const supportEmail = settings?.supportEmail || 'support@grandbazar.com';

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-10">
            {/* Header */}
            <div className="bg-white sticky top-0 z-30 px-4 py-3 flex items-center justify-between gap-1 shadow-sm">
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors"
                        aria-label="Go Back"
                    >
                        <ChevronLeft size={24} className="text-slate-600" />
                    </button>
                    <h1 className="text-lg font-black text-slate-800">Seller Privacy Policy</h1>
                </div>
                <Link
                    to="/seller/terms"
                    className="text-[11px] font-bold text-primary hover:underline whitespace-nowrap"
                >
                    Terms of Service
                </Link>
            </div>

            <div className="p-5 max-w-3xl mx-auto space-y-6">
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800">
                    <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                    <p className="text-xs font-semibold leading-relaxed">
                        Draft placeholder — this page has not been reviewed by legal or business and must not be
                        treated as the final privacy policy. Replace the bracketed items below before launch.
                    </p>
                </div>

                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="h-12 w-12 rounded-2xl bg-brand-50 flex items-center justify-center text-primary">
                            <ShieldCheck size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">Privacy Policy for Sellers</h2>
                            <p className="text-xs text-slate-500 font-medium">Draft — last updated: Oct 2026</p>
                        </div>
                    </div>

                    <div className="prose prose-slate prose-sm max-w-none text-slate-600 space-y-4">
                        <p>
                            This policy explains how {companyName} collects, uses, and protects information
                            belonging to sellers — the seller admin account and every shop added under it — as
                            distinct from how customer data is handled (see the customer Privacy Policy for that).
                        </p>

                        <h3 className="text-slate-800 font-bold text-base mt-6">1. Information We Collect</h3>
                        <p>
                            Business and contact details, shop information (location, category, documents), bank
                            and payout details, KYC documents, and usage data from the seller dashboard.
                        </p>

                        <h3 className="text-slate-800 font-bold text-base mt-6">2. How We Use Seller Information</h3>
                        <p>
                            To verify and approve your account and shops, process orders and payouts, calculate
                            commission and settlements, provide support, and comply with applicable law.
                        </p>

                        <h3 className="text-slate-800 font-bold text-base mt-6">3. Sharing of Information</h3>
                        <p>
                            [TO BE FINALIZED — exact third parties]. Shop name, location, and product details are
                            shown to customers; order and delivery details are shared with assigned delivery
                            partners; bank details are shared only with payment/payout processors.
                        </p>

                        <h3 className="text-slate-800 font-bold text-base mt-6">4. Data Retention</h3>
                        <p>
                            [TO BE FINALIZED — retention period for KYC documents, financial records, and account
                            data after account closure].
                        </p>

                        <h3 className="text-slate-800 font-bold text-base mt-6">5. Your Rights &amp; Account Control</h3>
                        <p>
                            You can review and update your business details from your seller profile, and request
                            account closure and data deletion (subject to applicable record-keeping requirements)
                            by contacting support.
                        </p>

                        <h3 className="text-slate-800 font-bold text-base mt-6">6. Security</h3>
                        <p>
                            [TO BE FINALIZED — security measures]. We take reasonable technical and organizational
                            steps to protect your data, but no system is completely secure.
                        </p>

                        <h3 className="text-slate-800 font-bold text-base mt-6">7. Contact</h3>
                        <p>
                            Questions about this policy can be sent to{' '}
                            <a href={`mailto:${supportEmail}`} className="font-bold text-slate-900 hover:underline">
                                {supportEmail}
                            </a>.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SellerPrivacyPage;
