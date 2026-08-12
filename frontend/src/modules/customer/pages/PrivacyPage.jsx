import React from 'react';
import { 
    ChevronLeft, 
    ShieldCheck, 
    Lock, 
    MapPin, 
    UserCheck, 
    Database, 
    FileText, 
    Mail, 
    Phone, 
    HelpCircle,
    ArrowRight
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useSettings } from '@core/context/SettingsContext';

const PrivacyPage = () => {
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
                            <ShieldCheck className="h-6 w-6 text-brand-600" />
                        )}
                        <h1 className="text-base font-black text-slate-900 tracking-tight">Privacy Policy</h1>
                    </div>
                </div>
                <Link 
                    to="/terms"
                    className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 bg-brand-50 px-3 py-1.5 rounded-xl border border-brand-100/50 transition-all"
                >
                    <span>Terms & Conditions</span>
                    <ArrowRight size={12} />
                </Link>
            </div>

            <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
                {/* Hero Header Banner */}
                <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="relative z-10 space-y-3">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[11px] font-bold uppercase tracking-wider text-brand-300">
                            <Lock size={13} />
                            Your Trust & Privacy First
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                            Privacy Policy for {appName}
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                            At {appName}, we are committed to protecting your personal information and respecting your privacy. This policy details how we collect, store, handle, and safeguard your data across our hyper-local marketplace platform.
                        </p>
                        <div className="pt-2 flex items-center gap-4 text-[11px] text-slate-400 font-medium border-t border-white/10">
                            <span>Effective Date: October 2025</span>
                            <span>•</span>
                            <span>Version 2.4</span>
                        </div>
                    </div>
                </div>

                {/* Main Content Grid */}
                <div className="space-y-6">
                    {/* Section 1: Information We Collect */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 font-bold">
                                <Database size={20} />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-slate-900">1. Information We Collect</h3>
                                <p className="text-xs text-slate-500 font-medium">Types of data gathered to deliver your orders</p>
                            </div>
                        </div>
                        <div className="prose prose-slate text-xs sm:text-sm text-slate-600 leading-relaxed space-y-3 pt-1 border-t border-slate-100">
                            <p>
                                To provide seamless hyper-local ordering, fast delivery, and customer service, we collect the following categories of information:
                            </p>
                            <ul className="list-disc pl-5 space-y-2 font-medium">
                                <li>
                                    <strong className="text-slate-900">Account & Profile Information:</strong> Your full name, mobile phone number, email address, and account login details.
                                </li>
                                <li>
                                    <strong className="text-slate-900">Delivery Address & Geolocation:</strong> Saved delivery addresses, pincodes, building details, and GPS coordinates provided to locate your delivery dropoff point.
                                </li>
                                <li>
                                    <strong className="text-slate-900">Order & Transaction History:</strong> Details about items purchased, store preferences, transaction amounts, payment methods, and invoice receipts.
                                </li>
                                <li>
                                    <strong className="text-slate-900">Device & Usage Data:</strong> IP address, device model, operating system, push notification tokens, app crash logs, and interaction data to optimize app performance.
                                </li>
                            </ul>
                        </div>
                    </div>

                    {/* Section 2: How We Use Information */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 font-bold">
                                <UserCheck size={20} />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-slate-900">2. How We Use Your Information</h3>
                                <p className="text-xs text-slate-500 font-medium">How your data enables instant order fulfillment</p>
                            </div>
                        </div>
                        <div className="prose prose-slate text-xs sm:text-sm text-slate-600 leading-relaxed space-y-3 pt-1 border-t border-slate-100">
                            <p>
                                We use your personal data strictly for operational, support, and security purposes:
                            </p>
                            <ul className="list-disc pl-5 space-y-2 font-medium">
                                <li>Processing, dispatching, and completing your product & grocery orders with local merchant partners and delivery drivers.</li>
                                <li>Sending real-time order status updates via SMS, WhatsApp, push notifications, and email notifications.</li>
                                <li>Enabling quick contact between delivery partners and customers for seamless order handoffs.</li>
                                <li>Preventing fraudulent activities, unauthorized access, and maintaining database security.</li>
                                <li>Personalizing store recommendations and local offer discoveries based on your location.</li>
                            </ul>
                        </div>
                    </div>

                    {/* Section 3: Location Data & GPS Usage */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 font-bold">
                                <MapPin size={20} />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-slate-900">3. Location Data & Live Tracking</h3>
                                <p className="text-xs text-slate-500 font-medium">Why precise location permission is requested</p>
                            </div>
                        </div>
                        <div className="prose prose-slate text-xs sm:text-sm text-slate-600 leading-relaxed space-y-3 pt-1 border-t border-slate-100">
                            <p>
                                {appName} relies on location services to provide hyper-local delivery services:
                            </p>
                            <div className="p-3.5 bg-rose-50/50 rounded-2xl border border-rose-100/80 text-xs font-semibold text-rose-950 space-y-1">
                                <p className="font-black uppercase tracking-wider text-[10px] text-rose-600">Location Usage Notice</p>
                                <p>
                                    Your precision location is used to display nearby stores, estimate accurate delivery times, and allow delivery drivers to navigate directly to your address. Location data is only shared with an assigned delivery driver during an active order delivery.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Section 4: Data Sharing & Third Parties */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 font-bold">
                                <FileText size={20} />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-slate-900">4. Sharing of Information</h3>
                                <p className="text-xs text-slate-500 font-medium">Strict zero-sale policy for personal data</p>
                            </div>
                        </div>
                        <div className="prose prose-slate text-xs sm:text-sm text-slate-600 leading-relaxed space-y-3 pt-1 border-t border-slate-100 font-medium">
                            <p>
                                <strong className="text-slate-900">We do NOT sell, rent, or trade your personal data to third-party advertisers.</strong>
                            </p>
                            <p>
                                Information is shared strictly on a need-to-know basis with:
                            </p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li><strong className="text-slate-900">Merchant Stores:</strong> Item details and customer dropoff name for order packing.</li>
                                <li><strong className="text-slate-900">Delivery Partners:</strong> Address, contact phone number, and dropoff location for order delivery.</li>
                                <li><strong className="text-slate-900">Payment Gateways:</strong> Encrypted payment parameters for transaction processing.</li>
                            </ul>
                        </div>
                    </div>

                    {/* Section 5: Data Rights & Account Deletion */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 font-bold">
                                <Lock size={20} />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-slate-900">5. Your Data Rights & Account Control</h3>
                                <p className="text-xs text-slate-500 font-medium">Managing your data and privacy preferences</p>
                            </div>
                        </div>
                        <div className="prose prose-slate text-xs sm:text-sm text-slate-600 leading-relaxed space-y-3 pt-1 border-t border-slate-100 font-medium">
                            <p>
                                You have the full right to access, edit, or request deletion of your personal account data at any time:
                            </p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>View and edit your profile details, addresses, and saved info from the app settings.</li>
                                <li>Revoke location permissions through your mobile device settings.</li>
                                <li>Request complete account closure and data purging by contacting our support team.</li>
                            </ul>
                        </div>
                    </div>

                    {/* Section 6: Contact & Support Info */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 font-bold">
                                <HelpCircle size={20} />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-slate-900">6. Privacy Inquiries & Support</h3>
                                <p className="text-xs text-slate-500 font-medium">Have questions regarding your data privacy?</p>
                            </div>
                        </div>
                        <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <a
                                href={`mailto:${supportEmail}`}
                                className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-colors"
                            >
                                <div className="h-8 w-8 rounded-xl bg-white text-emerald-600 flex items-center justify-center shadow-sm shrink-0">
                                    <Mail size={16} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email Us</p>
                                    <p className="font-bold text-slate-800 truncate">{supportEmail}</p>
                                </div>
                            </a>

                            {supportPhone && (
                                <a
                                    href={`tel:${supportPhone}`}
                                    className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-colors"
                                >
                                    <div className="h-8 w-8 rounded-xl bg-white text-indigo-600 flex items-center justify-center shadow-sm shrink-0">
                                        <Phone size={16} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Call Support</p>
                                        <p className="font-bold text-slate-800 truncate">{supportPhone}</p>
                                    </div>
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PrivacyPage;
