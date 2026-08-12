// Premium Billing & Financial Configuration System
import React, { useState, useEffect, useRef, useMemo } from 'react';
import Card from '@shared/components/ui/Card';
import {
    RotateCcw,
    Save,
    Info,
    Truck,
    Settings,
    Zap,
    MapPin,
    History,
    CloudRain,
    Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@shared/components/ui/Toast';
import { adminApi } from '../services/adminApi';

const SURCHARGE_REASON_PRESETS = [
    'Weather conditions',
    'Peak demand',
    'Festival surge',
    'Fuel price adjustment',
];
const OTHER_REASON_PRESET = 'Other';
const ALL_REASON_CHIPS = [...SURCHARGE_REASON_PRESETS, OTHER_REASON_PRESET];

const BillingCharges = () => {
    const { showToast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [deliveryMode, setDeliveryMode] = useState('distance'); // 'fixed' or 'distance'
    const [returnDeliveryCommission, setReturnDeliveryCommission] = useState(0);
    const [freeTierProductLimit, setFreeTierProductLimit] = useState(30);
    const [overLimitCommissionSurchargePercent, setOverLimitCommissionSurchargePercent] = useState(5);
    const [freeTierEnforcementMode, setFreeTierEnforcementMode] = useState('soft');
    const [replacementPriceTolerancePercent, setReplacementPriceTolerancePercent] = useState(0);
    const [alternativesDisplayLimit, setAlternativesDisplayLimit] = useState(6);
    const [bulkOrderQtyThreshold, setBulkOrderQtyThreshold] = useState(20);
    const [bulkOrderValueThreshold, setBulkOrderValueThreshold] = useState(15000);
    const [bulkOrderCommissionRate, setBulkOrderCommissionRate] = useState(0);
    const [reasonPreset, setReasonPreset] = useState(OTHER_REASON_PRESET);
    const reasonInputRef = useRef(null);

    const [config, setConfig] = useState({
        platformFee: 0,
        freeDeliveryThreshold: 0,
        baseCharge: 30,
        riderBasePayout: 30,
        baseDistance: 0.5,
        extraPerKm: 10,
        deliveryPartnerRatePerKm: 5,
        fixedCharge: 30,
        handlingFeeStrategy: "highest_category_fee",
        codEnabled: true,
        onlineEnabled: true,
        customerSurchargeEnabled: false,
        customerSurchargeAmount: 0,
        customerSurchargeReason: '',
        oddHourSurchargeEnabled: false,
        oddHourSurchargeAmount: 0,
        oddHourWindowStart: '22:00',
        oddHourWindowEnd: '06:00',
        oddHourSellerSplitPercent: 0,
        weatherSurchargeEnabled: false,
        weatherSurchargeAmount: 0,
        weatherSellerSplitPercent: 0,
    });
    const [cityCommissions, setCityCommissions] = useState([]);
    const [cityForm, setCityForm] = useState({
        cityKey: '',
        cityName: '',
        applyCommission: false,
        adminCommissionType: 'percentage',
        adminCommissionValue: 0,
        adminCommissionFixedRule: 'per_qty',
    });

    const activeReasonChip = useMemo(() => {
        if (SURCHARGE_REASON_PRESETS.includes(config.customerSurchargeReason)) {
            return config.customerSurchargeReason;
        }
        return OTHER_REASON_PRESET;
    }, [config.customerSurchargeReason]);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const [platformRes, deliveryRes] = await Promise.all([
                    adminApi.getPlatformSettings(),
                    adminApi.getDeliveryFinanceSettings(),
                ]);

                if (platformRes.data?.success && platformRes.data.result) {
                    setReturnDeliveryCommission(platformRes.data.result.returnDeliveryCommission ?? 0);
                    setFreeTierProductLimit(platformRes.data.result.freeTierProductLimit ?? 30);
                    setOverLimitCommissionSurchargePercent(platformRes.data.result.overLimitCommissionSurchargePercent ?? 5);
                    setFreeTierEnforcementMode(platformRes.data.result.freeTierEnforcementMode === 'hard' ? 'hard' : 'soft');
                    setReplacementPriceTolerancePercent(platformRes.data.result.replacementPriceTolerancePercent ?? 0);
                    setAlternativesDisplayLimit(platformRes.data.result.alternativesDisplayLimit ?? 6);
                    setBulkOrderQtyThreshold(platformRes.data.result.bulkOrderQtyThreshold ?? 20);
                    setBulkOrderValueThreshold(platformRes.data.result.bulkOrderValueThreshold ?? 15000);
                    setBulkOrderCommissionRate(platformRes.data.result.bulkOrderCommissionRate ?? 0);
                }

                if (deliveryRes.data?.success && deliveryRes.data.result) {
                    const s = deliveryRes.data.result;
                    setDeliveryMode(s.deliveryPricingMode === 'fixed_price' ? 'fixed' : 'distance');
                    const loadedReason = s.customerSurchargeReason || '';
                    setReasonPreset(
                        SURCHARGE_REASON_PRESETS.includes(loadedReason)
                            ? loadedReason
                            : OTHER_REASON_PRESET,
                    );
                    setConfig((prev) => ({
                        ...prev,
                        platformFee: s.platformFee ?? prev.platformFee,
                        freeDeliveryThreshold: s.freeDeliveryThreshold ?? prev.freeDeliveryThreshold,
                        baseCharge: s.customerBaseDeliveryFee ?? s.baseDeliveryCharge ?? prev.baseCharge,
                        riderBasePayout: s.riderBasePayout ?? s.customerBaseDeliveryFee ?? prev.riderBasePayout,
                        baseDistance: s.baseDistanceCapacityKm ?? prev.baseDistance,
                        extraPerKm: s.incrementalKmSurcharge ?? prev.extraPerKm,
                        deliveryPartnerRatePerKm: s.deliveryPartnerRatePerKm ?? s.fleetCommissionRatePerKm ?? prev.deliveryPartnerRatePerKm,
                        fixedCharge: s.fixedDeliveryFee ?? s.customerBaseDeliveryFee ?? prev.fixedCharge,
                        handlingFeeStrategy: s.handlingFeeStrategy ?? prev.handlingFeeStrategy,
                        codEnabled: s.codEnabled ?? prev.codEnabled,
                        onlineEnabled: s.onlineEnabled ?? prev.onlineEnabled,
                        customerSurchargeEnabled: Boolean(s.customerSurchargeEnabled),
                        customerSurchargeAmount: s.customerSurchargeAmount ?? 0,
                        customerSurchargeReason: loadedReason,
                        oddHourSurchargeEnabled: Boolean(s.oddHourSurcharge?.enabled),
                        oddHourSurchargeAmount: s.oddHourSurcharge?.amount ?? 0,
                        oddHourWindowStart: s.oddHourSurcharge?.windowStart || '22:00',
                        oddHourWindowEnd: s.oddHourSurcharge?.windowEnd || '06:00',
                        oddHourSellerSplitPercent: s.oddHourSurcharge?.revenueSplit?.seller ?? 0,
                        weatherSurchargeEnabled: Boolean(s.weatherSurcharge?.enabled),
                        weatherSurchargeAmount: s.weatherSurcharge?.amount ?? 0,
                        weatherSellerSplitPercent: s.weatherSurcharge?.revenueSplit?.seller ?? 0,
                    }));
                }
                try {
                    const cityRes = await adminApi.getCityCommissions();
                    setCityCommissions(cityRes?.data?.results || cityRes?.data?.result || []);
                } catch {
                    setCityCommissions([]);
                }
            } catch (error) {
                console.error('Failed to load settings', error);
            }
        };
        fetchSettings();
    }, []);

    const handleReasonPresetClick = (preset) => {
        if (preset === OTHER_REASON_PRESET) {
            setReasonPreset(OTHER_REASON_PRESET);
            // Keep existing custom text if it isn't one of the fixed presets
            setConfig((prev) => ({
                ...prev,
                customerSurchargeReason: SURCHARGE_REASON_PRESETS.includes(prev.customerSurchargeReason)
                    ? ''
                    : prev.customerSurchargeReason,
            }));
            requestAnimationFrame(() => {
                reasonInputRef.current?.focus();
            });
            return;
        }

        setReasonPreset(preset);
        setConfig((prev) => ({
            ...prev,
            customerSurchargeReason: preset,
        }));
    };

    const handleSave = async () => {
        try {
            if (config.customerSurchargeEnabled) {
                if (!config.customerSurchargeAmount || Number(config.customerSurchargeAmount) <= 0) {
                    showToast('Enter a surcharge amount greater than 0', 'error');
                    return;
                }
                if (!String(config.customerSurchargeReason || '').trim()) {
                    showToast('Please enter a reason for the customer surcharge', 'error');
                    return;
                }
            }

            setIsSaving(true);
            await Promise.all([
                adminApi.updatePlatformSettings({
                    returnDeliveryCommission,
                    freeTierProductLimit: Number(freeTierProductLimit) || 0,
                    overLimitCommissionSurchargePercent: Number(overLimitCommissionSurchargePercent) || 0,
                    freeTierEnforcementMode: freeTierEnforcementMode === 'hard' ? 'hard' : 'soft',
                    replacementPriceTolerancePercent: Number(replacementPriceTolerancePercent) || 0,
                    alternativesDisplayLimit: Number(alternativesDisplayLimit) || 6,
                    bulkOrderQtyThreshold: Number(bulkOrderQtyThreshold) || 0,
                    bulkOrderValueThreshold: Number(bulkOrderValueThreshold) || 0,
                    bulkOrderCommissionRate: Number(bulkOrderCommissionRate) || 0,
                }),
                adminApi.updateDeliveryFinanceSettings({
                    deliveryPricingMode: deliveryMode === 'fixed' ? 'fixed_price' : 'distance_based',
                    platformFee: Number(config.platformFee) || 0,
                    freeDeliveryThreshold: Number(config.freeDeliveryThreshold) || 0,
                    customerBaseDeliveryFee: config.baseCharge,
                    riderBasePayout: config.riderBasePayout,
                    baseDeliveryCharge: config.baseCharge,
                    baseDistanceCapacityKm: config.baseDistance,
                    incrementalKmSurcharge: config.extraPerKm,
                    deliveryPartnerRatePerKm: config.deliveryPartnerRatePerKm,
                    fleetCommissionRatePerKm: config.deliveryPartnerRatePerKm,
                    fixedDeliveryFee: config.fixedCharge,
                    handlingFeeStrategy: config.handlingFeeStrategy,
                    codEnabled: config.codEnabled,
                    onlineEnabled: config.onlineEnabled,
                    customerSurchargeEnabled: Boolean(config.customerSurchargeEnabled),
                    customerSurchargeAmount: Number(config.customerSurchargeAmount) || 0,
                    customerSurchargeReason: String(config.customerSurchargeReason || '').trim(),
                    oddHourSurcharge: {
                        enabled: Boolean(config.oddHourSurchargeEnabled),
                        amount: Number(config.oddHourSurchargeAmount) || 0,
                        windowStart: config.oddHourWindowStart,
                        windowEnd: config.oddHourWindowEnd,
                        revenueSplit: {
                            seller: Number(config.oddHourSellerSplitPercent) || 0,
                            platform: 100 - (Number(config.oddHourSellerSplitPercent) || 0),
                        },
                    },
                    weatherSurcharge: {
                        enabled: Boolean(config.weatherSurchargeEnabled),
                        amount: Number(config.weatherSurchargeAmount) || 0,
                        revenueSplit: {
                            seller: Number(config.weatherSellerSplitPercent) || 0,
                            platform: 100 - (Number(config.weatherSellerSplitPercent) || 0),
                        },
                    },
                }),
            ]);

            showToast('Delivery finance settings updated', 'success');
        } catch (error) {
            console.error('Failed to update platform settings', error);
            showToast('Failed to update fees settings', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveCityCommission = async () => {
        const cityKey = String(cityForm.cityKey || '').trim().toLowerCase().replace(/\s+/g, '-');
        if (!cityKey) {
            showToast('Enter city key (for example: indore)', 'error');
            return;
        }
        try {
            await adminApi.upsertCityCommission(cityKey, cityForm);
            showToast('City commission saved', 'success');
            const cityRes = await adminApi.getCityCommissions();
            setCityCommissions(cityRes?.data?.results || cityRes?.data?.result || []);
        } catch (error) {
            showToast(error.response?.data?.message || 'Failed to save city commission', 'error');
        }
    };

    const handleInputChange = (field, value) => {
        setConfig(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-1">
                <div>
                    <h1 className="admin-h1 flex items-center gap-3">
                        Fees & Charges
                        <div className="p-2 bg-red-100 rounded-xl">
                            <RotateCcw className="h-5 w-5 text-red-600" />
                        </div>
                    </h1>
                    <p className="admin-description mt-1">Set up delivery fees, platform charges, and free delivery limits.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-5 py-3 bg-white ring-1 ring-slate-200 text-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm">
                        <History className="h-4 w-4 text-slate-400" />
                        AUDIT LOGS
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={cn(
                            "flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-brand-100 active:scale-95",
                            isSaving ? "opacity-70 cursor-wait" : "hover:bg-brand-700"
                        )}
                    >
                        {isSaving ? (
                            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Save className="h-4 w-4" />
                        )}
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>


            <div className="max-w-4xl mx-auto text-left">
                {/* Main Configuration Core */}
                <div className="space-y-8">
                    {/* General Financial Thresholds */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-[32px] overflow-hidden">
                        <div className="p-6 border-b border-slate-50 bg-slate-50/30">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                <Settings className="h-4 w-4 text-slate-400" />
                                Main Charges
                            </h3>
                        </div>
                        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    Platform/Handling Fee (₹)
                                    <Info className="h-3 w-3 opacity-50" />
                                </label>
                                <div className="relative group">
                                    <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-300 group-focus-within:text-red-500 transition-colors">₹</span>
                                    <input
                                        type="number"
                                        value={config.platformFee}
                                        onChange={(e) => handleInputChange('platformFee', e.target.value)}
                                        className="w-full pl-10 pr-5 py-4 bg-slate-50 border-none rounded-2xl text-base font-black text-slate-900 outline-none focus:ring-2 focus:ring-red-500/10 transition-all"
                                    />
                                </div>
                                <p className="text-[10px] font-bold text-slate-400 italic">Fee added to every order.</p>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    Free Delivery Minimum (₹)
                                    <Zap className="h-3 w-3 text-amber-500" />
                                </label>
                                <div className="relative group">
                                    <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-300 group-focus-within:text-red-500 transition-colors">₹</span>
                                    <input
                                        type="number"
                                        value={config.freeDeliveryThreshold}
                                        onChange={(e) => handleInputChange('freeDeliveryThreshold', e.target.value)}
                                        className="w-full pl-10 pr-5 py-4 bg-slate-50 border-none rounded-2xl text-base font-black text-slate-900 outline-none focus:ring-2 focus:ring-red-500/10 transition-all"
                                    />
                                </div>
                                <p className="text-[10px] font-bold text-slate-400 italic">Orders above this amount will have free delivery.</p>
                            </div>
                        </div>
                    </Card>

                    {/* Customer-only surcharge */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-[32px] overflow-hidden">
                        <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                    <CloudRain className="h-4 w-4 text-sky-500" />
                                    Apply Extra Charge (Customers Only)
                                </h3>
                                <p className="text-[11px] font-medium text-slate-500 mt-1">
                                    Temporary surcharge shown on checkout with a reason (e.g. weather). Not paid to sellers or riders.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() =>
                                    setConfig((prev) => ({
                                        ...prev,
                                        customerSurchargeEnabled: !prev.customerSurchargeEnabled,
                                    }))
                                }
                                className={cn(
                                    "relative h-8 w-14 rounded-full transition-colors shrink-0",
                                    config.customerSurchargeEnabled ? "bg-sky-500" : "bg-slate-200",
                                )}
                                aria-label="Toggle customer surcharge"
                            >
                                <span
                                    className={cn(
                                        "absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform",
                                        config.customerSurchargeEnabled && "translate-x-6",
                                    )}
                                />
                            </button>
                        </div>
                        <div className={cn("p-8 grid grid-cols-1 md:grid-cols-2 gap-8", !config.customerSurchargeEnabled && "opacity-50 pointer-events-none")}>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Charge Amount (₹)
                                </label>
                                <div className="relative group">
                                    <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-300">₹</span>
                                    <input
                                        type="number"
                                        min="0"
                                        value={config.customerSurchargeAmount}
                                        onChange={(e) => handleInputChange('customerSurchargeAmount', e.target.value)}
                                        className="w-full pl-10 pr-5 py-4 bg-slate-50 border-none rounded-2xl text-base font-black text-slate-900 outline-none focus:ring-2 focus:ring-sky-500/10 transition-all"
                                    />
                                </div>
                                <p className="text-[10px] font-bold text-slate-400 italic">
                                    Added to every customer order total while enabled.
                                </p>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Reason (shown to customer)
                                </label>
                                <input
                                    ref={reasonInputRef}
                                    type="text"
                                    maxLength={120}
                                    value={config.customerSurchargeReason}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        setReasonPreset(
                                            SURCHARGE_REASON_PRESETS.includes(value)
                                                ? value
                                                : OTHER_REASON_PRESET,
                                        );
                                        setConfig((prev) => ({
                                            ...prev,
                                            customerSurchargeReason: value,
                                        }));
                                    }}
                                    placeholder={
                                        activeReasonChip === OTHER_REASON_PRESET
                                            ? "Type a custom reason..."
                                            : "e.g. Weather conditions"
                                    }
                                    className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-500/10 transition-all"
                                />
                                <div className="flex flex-wrap gap-2">
                                    {ALL_REASON_CHIPS.map((preset) => (
                                        <button
                                            key={preset}
                                            type="button"
                                            onClick={() => handleReasonPresetClick(preset)}
                                            className={cn(
                                                "px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ring-1 transition-all",
                                                activeReasonChip === preset
                                                    ? "bg-sky-50 text-sky-700 ring-sky-200"
                                                    : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50",
                                            )}
                                        >
                                            {preset}
                                        </button>
                                    ))}
                                </div>
                                {activeReasonChip === OTHER_REASON_PRESET && (
                                    <p className="text-[10px] font-bold text-sky-600 italic">
                                        Other selected — type your custom reason above.
                                    </p>
                                )}
                            </div>
                            {config.customerSurchargeEnabled && Number(config.customerSurchargeAmount) > 0 && (
                                <div className="md:col-span-2 bg-sky-50 border border-sky-100 rounded-2xl p-4">
                                    <p className="text-xs font-bold text-sky-900">
                                        Preview: customers will see{" "}
                                        <span className="font-black">
                                            ₹{Number(config.customerSurchargeAmount).toLocaleString("en-IN")}
                                        </span>
                                        {config.customerSurchargeReason
                                            ? ` — ${config.customerSurchargeReason}`
                                            : ""}{" "}
                                        on checkout. Sellers and delivery partners are not paid this amount.
                                    </p>
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* Odd-hour delivery surcharge — auto-applied in a time window */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-[32px] overflow-hidden">
                        <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                    <Clock className="h-4 w-4 text-indigo-500" />
                                    Odd-Hour Delivery Charge
                                </h3>
                                <p className="text-[11px] font-medium text-slate-500 mt-1">
                                    Automatically applied to orders placed inside the time window below. Separate from the weather surcharge.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() =>
                                    setConfig((prev) => ({
                                        ...prev,
                                        oddHourSurchargeEnabled: !prev.oddHourSurchargeEnabled,
                                    }))
                                }
                                className={cn(
                                    "relative h-8 w-14 rounded-full transition-colors shrink-0",
                                    config.oddHourSurchargeEnabled ? "bg-indigo-500" : "bg-slate-200",
                                )}
                                aria-label="Toggle odd-hour surcharge"
                            >
                                <span
                                    className={cn(
                                        "absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform",
                                        config.oddHourSurchargeEnabled && "translate-x-6",
                                    )}
                                />
                            </button>
                        </div>
                        <div className={cn("p-8 grid grid-cols-1 md:grid-cols-2 gap-8", !config.oddHourSurchargeEnabled && "opacity-50 pointer-events-none")}>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Charge Amount (₹)
                                </label>
                                <div className="relative group">
                                    <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-300">₹</span>
                                    <input
                                        type="number"
                                        min="0"
                                        value={config.oddHourSurchargeAmount}
                                        onChange={(e) => handleInputChange('oddHourSurchargeAmount', e.target.value)}
                                        className="w-full pl-10 pr-5 py-4 bg-slate-50 border-none rounded-2xl text-base font-black text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all"
                                    />
                                </div>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Seller Revenue Share (%)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={config.oddHourSellerSplitPercent}
                                    onChange={(e) => handleInputChange('oddHourSellerSplitPercent', e.target.value)}
                                    className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-base font-black text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all"
                                />
                                <p className="text-[10px] font-bold text-slate-400 italic">
                                    Remaining {100 - (Number(config.oddHourSellerSplitPercent) || 0)}% goes to the platform.
                                </p>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Window Start
                                </label>
                                <input
                                    type="time"
                                    value={config.oddHourWindowStart}
                                    onChange={(e) => setConfig((prev) => ({ ...prev, oddHourWindowStart: e.target.value }))}
                                    className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-base font-black text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all"
                                />
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Window End
                                </label>
                                <input
                                    type="time"
                                    value={config.oddHourWindowEnd}
                                    onChange={(e) => setConfig((prev) => ({ ...prev, oddHourWindowEnd: e.target.value }))}
                                    className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-base font-black text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all"
                                />
                            </div>
                        </div>
                    </Card>

                    {/* Weather surcharge — manual toggle, independent revenue split */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-[32px] overflow-hidden">
                        <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                    <CloudRain className="h-4 w-4 text-amber-500" />
                                    Weather Surcharge
                                </h3>
                                <p className="text-[11px] font-medium text-slate-500 mt-1">
                                    Manually toggled during bad weather. Independent of the odd-hour charge above.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() =>
                                    setConfig((prev) => ({
                                        ...prev,
                                        weatherSurchargeEnabled: !prev.weatherSurchargeEnabled,
                                    }))
                                }
                                className={cn(
                                    "relative h-8 w-14 rounded-full transition-colors shrink-0",
                                    config.weatherSurchargeEnabled ? "bg-amber-500" : "bg-slate-200",
                                )}
                                aria-label="Toggle weather surcharge"
                            >
                                <span
                                    className={cn(
                                        "absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform",
                                        config.weatherSurchargeEnabled && "translate-x-6",
                                    )}
                                />
                            </button>
                        </div>
                        <div className={cn("p-8 grid grid-cols-1 md:grid-cols-2 gap-8", !config.weatherSurchargeEnabled && "opacity-50 pointer-events-none")}>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Charge Amount (₹)
                                </label>
                                <div className="relative group">
                                    <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-300">₹</span>
                                    <input
                                        type="number"
                                        min="0"
                                        value={config.weatherSurchargeAmount}
                                        onChange={(e) => handleInputChange('weatherSurchargeAmount', e.target.value)}
                                        className="w-full pl-10 pr-5 py-4 bg-slate-50 border-none rounded-2xl text-base font-black text-slate-900 outline-none focus:ring-2 focus:ring-amber-500/10 transition-all"
                                    />
                                </div>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Seller Revenue Share (%)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={config.weatherSellerSplitPercent}
                                    onChange={(e) => handleInputChange('weatherSellerSplitPercent', e.target.value)}
                                    className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-base font-black text-slate-900 outline-none focus:ring-2 focus:ring-amber-500/10 transition-all"
                                />
                                <p className="text-[10px] font-bold text-slate-400 italic">
                                    Remaining {100 - (Number(config.weatherSellerSplitPercent) || 0)}% goes to the platform.
                                </p>
                            </div>
                        </div>
                    </Card>

                    {/* Delivery Fee Settings */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-[32px] overflow-hidden">
                        <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                <Truck className="h-4 w-4 text-brand-500" />
                                Delivery Fee Settings
                            </h3>
                            <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
                                <button
                                    onClick={() => setDeliveryMode('fixed')}
                                    className={cn("px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all", deliveryMode === 'fixed' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400")}
                                >Fixed Price</button>
                                <button
                                    onClick={() => setDeliveryMode('distance')}
                                    className={cn("px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all", deliveryMode === 'distance' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400")}
                                >Distance Based</button>
                            </div>
                        </div>
                        <div className="p-8">
                            {deliveryMode === 'distance' ? (
                                <>
                                    <div className="bg-brand-50 border border-brand-100 rounded-2xl p-4 mb-8 flex gap-4">
                                        <MapPin className="h-5 w-5 text-brand-500 shrink-0 mt-0.5" />
                                        <div className="space-y-1">
                                            <p className="text-[11px] font-black text-brand-900 uppercase tracking-tight">Location Accuracy</p>
                                            <p className="text-[10px] font-bold text-brand-700 leading-relaxed italic">Requires Google Maps API. Without it, the system will use straight-line distance.</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base Delivery Charge (₹)</label>
                                            <input
                                                type="number"
                                                value={config.baseCharge}
                                                onChange={(e) => handleInputChange('baseCharge', e.target.value)}
                                                className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                            />
                                            <p className="text-[10px] font-bold text-slate-400 italic">Customer-facing minimum fee for first X kms.</p>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rider Base Payout (₹)</label>
                                            <input
                                                type="number"
                                                value={config.riderBasePayout}
                                                onChange={(e) => handleInputChange('riderBasePayout', e.target.value)}
                                                className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                            />
                                            <p className="text-[10px] font-bold text-slate-400 italic">Base payout for delivery partner within base radius.</p>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base Distance Capacity (km)</label>
                                            <div className="relative group">
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={config.baseDistance}
                                                    onChange={(e) => handleInputChange('baseDistance', e.target.value)}
                                                    className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                                />
                                                <span className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300 uppercase">km</span>
                                            </div>
                                            <p className="text-[10px] font-bold text-slate-400 italic">Radius covered by the base charge.</p>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Incremental Km Surcharge (₹)</label>
                                            <input
                                                type="number"
                                                value={config.extraPerKm}
                                                onChange={(e) => handleInputChange('extraPerKm', e.target.value)}
                                                className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                            />
                                            <p className="text-[10px] font-bold text-slate-400 italic">Charged for every km beyond base radius.</p>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Delivery Partner Rate (₹/km)</label>
                                            <input
                                                type="number"
                                                value={config.deliveryPartnerRatePerKm}
                                                onChange={(e) => handleInputChange('deliveryPartnerRatePerKm', e.target.value)}
                                                className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                            />
                                            <p className="text-[10px] font-bold text-slate-400 italic">Net payout to delivery partner per km.</p>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-6">
                                    <div className="space-y-3">
                                        <label className="text-base font-bold text-slate-900">Fixed Delivery Charge (₹)</label>
                                        <div className="relative group max-w-md">
                                            <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-300 group-focus-within:text-slate-900 transition-colors">₹</span>
                                            <input
                                                type="number"
                                                value={config.fixedCharge}
                                                onChange={(e) => handleInputChange('fixedCharge', e.target.value)}
                                                className="w-full pl-10 pr-5 py-4 bg-white ring-1 ring-slate-200 border-none rounded-xl text-base font-medium text-slate-900 outline-none focus:ring-2 focus:ring-slate-900/10 transition-all"
                                            />
                                        </div>
                                        <p className="text-sm font-medium text-slate-400">Flat fee charged for all deliveries below threshold.</p>
                                    </div>
                                </div>
                            )}

                            <div className="mt-8 pt-6 border-t border-dashed border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        Return Delivery Commission (per pickup)
                                    </label>
                                    <div className="relative group max-w-md">
                                        <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-300 group-focus-within:text-slate-900 transition-colors">₹</span>
                                        <input
                                            type="number"
                                            min="0"
                                            value={returnDeliveryCommission}
                                            onChange={(e) =>
                                                setReturnDeliveryCommission(Number(e.target.value) || 0)
                                            }
                                            className="w-full pl-10 pr-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                        />
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-400">
                                        Flat amount paid to delivery partner for each approved return pickup (deducted from seller earnings).
                                    </p>
                                </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-dashed border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-8">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        Free-Tier Product Limit
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={freeTierProductLimit}
                                        onChange={(e) => setFreeTierProductLimit(Number(e.target.value) || 0)}
                                        className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                    />
                                    <p className="text-[10px] font-bold text-slate-400">
                                        Commission-model sellers can publish up to this many products before the limit applies. Subscription-tier sellers are governed by their plan instead.
                                    </p>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        Once Limit Is Reached
                                    </label>
                                    <div className="flex gap-2">
                                        {[
                                            { value: 'soft', label: 'Surcharge only' },
                                            { value: 'hard', label: 'Block publishing' },
                                        ].map((opt) => (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => setFreeTierEnforcementMode(opt.value)}
                                                className={`flex-1 px-3 py-4 rounded-2xl text-xs font-black transition-all ${
                                                    freeTierEnforcementMode === opt.value
                                                        ? 'bg-brand-600 text-white'
                                                        : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-400">
                                        "Surcharge only" always allows publishing (a nudge). "Block publishing" stops new products until the seller picks a subscription plan.
                                    </p>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        Over-Limit Commission Surcharge (%)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={overLimitCommissionSurchargePercent}
                                        onChange={(e) => setOverLimitCommissionSurchargePercent(Number(e.target.value) || 0)}
                                        className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                    />
                                    <p className="text-[10px] font-bold text-slate-400">
                                        Added on top of the normally-resolved commission rate once a seller exceeds the free-tier limit (applies in "Surcharge only" mode).
                                    </p>
                                </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-dashed border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-8">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        Bulk Order Qty Threshold
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={bulkOrderQtyThreshold}
                                        onChange={(e) => setBulkOrderQtyThreshold(Number(e.target.value) || 0)}
                                        className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                    />
                                    <p className="text-[10px] font-bold text-slate-400">
                                        A single line item with quantity at or above this is flagged as a bulk order.
                                    </p>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        Bulk Order Value Threshold (₹)
                                    </label>
                                    <div className="relative group">
                                        <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-300">₹</span>
                                        <input
                                            type="number"
                                            min="0"
                                            value={bulkOrderValueThreshold}
                                            onChange={(e) => setBulkOrderValueThreshold(Number(e.target.value) || 0)}
                                            className="w-full pl-10 pr-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                        />
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-400">
                                        Or an order subtotal at or above this amount — whichever triggers first.
                                    </p>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        Bulk Order Commission Rate (%)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={bulkOrderCommissionRate}
                                        onChange={(e) => setBulkOrderCommissionRate(Number(e.target.value) || 0)}
                                        className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                    />
                                    <p className="text-[10px] font-bold text-slate-400">
                                        0 = use the normally-resolved commission rate for bulk orders too. Set a value to override it specifically for bulk-flagged line items.
                                    </p>
                                </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-dashed border-slate-100">
                                <div className="space-y-3 max-w-md">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        Replacement Price Tolerance (%)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={replacementPriceTolerancePercent}
                                        onChange={(e) => setReplacementPriceTolerancePercent(Number(e.target.value) || 0)}
                                        className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                    />
                                    <p className="text-[10px] font-bold text-slate-400">
                                        0 = a seller-proposed replacement item must match the original item's price exactly. Raise this to allow a small markup before the request is rejected — pricier substitutes should go through a price adjustment request instead.
                                    </p>
                                </div>
                                <div className="space-y-3 max-w-md mt-6">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        Offline-Store Alternatives Shown
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="20"
                                        value={alternativesDisplayLimit}
                                        onChange={(e) => setAlternativesDisplayLimit(Number(e.target.value) || 6)}
                                        className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                    />
                                    <p className="text-[10px] font-bold text-slate-400">
                                        How many nearby stores to suggest to a customer when the store they opened is currently closed. Individual stores can be excluded from this list from their Shop Setup page.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </Card>

                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-[32px] overflow-hidden">
                        <div className="p-6 border-b border-slate-50 bg-slate-50/30">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                                City-wise Commission
                            </h3>
                            <p className="text-[11px] font-medium text-slate-500 mt-1">
                                Used when Add-on/Product/Subcategory/Shop levels are not applicable.
                            </p>
                        </div>
                        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">City key</label>
                                <input
                                    value={cityForm.cityKey}
                                    onChange={(e) => setCityForm((f) => ({ ...f, cityKey: e.target.value }))}
                                    placeholder="indore"
                                    className="w-full px-4 py-3 bg-slate-50 rounded-xl text-sm font-bold outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">City name</label>
                                <input
                                    value={cityForm.cityName}
                                    onChange={(e) => setCityForm((f) => ({ ...f, cityName: e.target.value }))}
                                    placeholder="Indore"
                                    className="w-full px-4 py-3 bg-slate-50 rounded-xl text-sm font-bold outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Commission type</label>
                                <select
                                    value={cityForm.adminCommissionType}
                                    onChange={(e) => setCityForm((f) => ({ ...f, adminCommissionType: e.target.value }))}
                                    className="w-full px-4 py-3 bg-slate-50 rounded-xl text-sm font-bold outline-none"
                                >
                                    <option value="percentage">Percentage</option>
                                    <option value="fixed">Fixed</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Commission value</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={cityForm.adminCommissionValue}
                                    onChange={(e) => setCityForm((f) => ({ ...f, adminCommissionValue: Number(e.target.value || 0) }))}
                                    className="w-full px-4 py-3 bg-slate-50 rounded-xl text-sm font-bold outline-none"
                                />
                            </div>
                            {cityForm.adminCommissionType === 'fixed' && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fixed rule</label>
                                    <select
                                        value={cityForm.adminCommissionFixedRule}
                                        onChange={(e) => setCityForm((f) => ({ ...f, adminCommissionFixedRule: e.target.value }))}
                                        className="w-full px-4 py-3 bg-slate-50 rounded-xl text-sm font-bold outline-none"
                                    >
                                        <option value="per_qty">Per qty</option>
                                        <option value="per_item">Per item</option>
                                    </select>
                                </div>
                            )}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Apply commission</label>
                                <label className="flex items-center gap-2 text-sm font-bold">
                                    <input
                                        type="checkbox"
                                        checked={cityForm.applyCommission}
                                        onChange={(e) => setCityForm((f) => ({ ...f, applyCommission: e.target.checked }))}
                                    />
                                    Enabled for city
                                </label>
                            </div>
                            <div className="md:col-span-2">
                                <button
                                    type="button"
                                    onClick={handleSaveCityCommission}
                                    className="px-5 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
                                >
                                    Save City Commission
                                </button>
                            </div>
                            <div className="md:col-span-2">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Configured cities</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {cityCommissions.map((city) => (
                                        <button
                                            key={city.cityKey}
                                            type="button"
                                            onClick={() =>
                                                setCityForm({
                                                    cityKey: city.cityKey,
                                                    cityName: city.cityName || city.cityKey,
                                                    applyCommission: city.applyCommission === true,
                                                    adminCommissionType: city.adminCommissionType || 'percentage',
                                                    adminCommissionValue: Number(city.adminCommissionValue || 0),
                                                    adminCommissionFixedRule: city.adminCommissionFixedRule || 'per_qty',
                                                })
                                            }
                                            className="text-left p-3 bg-slate-50 rounded-xl border border-slate-100 hover:bg-white"
                                        >
                                            <p className="text-xs font-black text-slate-900">{city.cityName || city.cityKey}</p>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                                {city.adminCommissionType === 'percentage'
                                                    ? `${city.adminCommissionValue}%`
                                                    : `₹${city.adminCommissionValue} (${city.adminCommissionFixedRule})`}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default BillingCharges;
