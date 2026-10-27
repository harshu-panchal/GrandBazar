import React from 'react';
import { ChevronLeft, ScrollText, AlertTriangle } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useSettings } from '@core/context/SettingsContext';

// PLACEHOLDER CONTENT — not reviewed by legal/business. Replace every
// bracketed [TO BE FINALIZED] item with the real figure/policy before this
// is relied on as the actual seller agreement. Structure/sections are a
// starting point covering what a seller agreement typically needs to; wording
// is not final.
const SellerTermsPage = () => {
    const navigate = useNavigate();
    const { settings } = useSettings();
    const appName = settings?.appName || 'App';
    const companyName = settings?.companyName || appName;

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
                    <h1 className="text-lg font-black text-slate-800">Seller Terms of Service</h1>
                </div>
                <Link
                    to="/seller/privacy"
                    className="text-[11px] font-bold text-primary hover:underline whitespace-nowrap"
                >
                    Privacy Policy
                </Link>
            </div>

            <div className="p-5 max-w-3xl mx-auto space-y-6">
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800">
                    <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                    <p className="text-xs font-semibold leading-relaxed">
                        Draft placeholder — this page has not been reviewed by legal or business and must not be
                        treated as the final seller agreement. Replace the bracketed items below with the real
                        commission, payout, and policy terms before launch.
                    </p>
                </div>

                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="h-12 w-12 rounded-2xl bg-brand-50 flex items-center justify-center text-primary">
                            <ScrollText size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">Agreement for Sellers</h2>
                            <p className="text-xs text-slate-500 font-medium">Draft — last updated: Oct 2026</p>
                        </div>
                    </div>

                    <div className="prose prose-slate prose-sm max-w-none text-slate-600 space-y-4">
                        <p>
                            This Seller Agreement governs your use of {appName} as a seller admin, including any
                            shops you add and operate under your account. By creating a seller admin account, you
                            agree to be bound by these terms.
                        </p>

                        <h3 className="text-slate-800 font-bold text-base mt-6">1. Seller Account &amp; Eligibility</h3>
                        <p>
                            You must provide accurate business, contact, and bank details, and keep your account
                            credentials secure. {companyName} may require KYC documents before approving your
                            account or any shop added under it.
                        </p>

                        <h3 className="text-slate-800 font-bold text-base mt-6">2. Shop Listings &amp; Product Accuracy</h3>
                        <p>
                            You are responsible for the accuracy of product listings, pricing, stock, and images for
                            every shop under your account, and for fulfilling orders within the timelines shown to
                            customers.
                        </p>

                        <h3 className="text-slate-800 font-bold text-base mt-6">3. Commission &amp; Subscription</h3>
                        <p>
                            [TO BE FINALIZED — exact commission percentages, subscription plan pricing, and when
                            each applies]. Your chosen business model for a shop determines how you are charged;
                            you may be able to switch models subject to approval.
                        </p>

                        <h3 className="text-slate-800 font-bold text-base mt-6">4. Payouts &amp; Settlement</h3>
                        <p>
                            [TO BE FINALIZED — settlement schedule, payout method, deductions]. Amounts owed to you
                            are calculated after commission, applicable deductions, and any approved complaints or
                            adjustments.
                        </p>

                        <h3 className="text-slate-800 font-bold text-base mt-6">5. Prohibited Items &amp; Conduct</h3>
                        <p>
                            [TO BE FINALIZED — list of prohibited/restricted categories]. You may not list items
                            that violate applicable law or {companyName}'s policies.
                        </p>

                        <h3 className="text-slate-800 font-bold text-base mt-6">6. Suspension &amp; Termination</h3>
                        <p>
                            {companyName} may suspend or terminate your seller account or a specific shop for
                            violating these terms, repeated order failures, or fraudulent activity.
                        </p>

                        <h3 className="text-slate-800 font-bold text-base mt-6">7. Limitation of Liability</h3>
                        <p>
                            [TO BE FINALIZED]. {companyName}'s liability to you is limited to the extent permitted
                            by applicable law.
                        </p>

                        <h3 className="text-slate-800 font-bold text-base mt-6">8. Changes to These Terms</h3>
                        <p>
                            These terms may be updated from time to time; continued use of your seller account after
                            a change constitutes acceptance of the updated terms.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SellerTermsPage;
