// City-wise billing configuration panel — mounted inside /admin/billing
// alongside the existing global billing form. Global settings remain the
// fallback for any city with no configuration here.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '@shared/components/ui/Card';
import { useToast } from '@shared/components/ui/Toast';
import { adminApi } from '../services/adminApi';
import { MapPin, Plus, RefreshCw, Trash2, CloudRain, Calculator } from 'lucide-react';

const EMPTY_FORM = {
    cityKey: '',
    cityName: '',
    state: '',
    country: 'IN',
    isActive: true,
    deliveryCharges: {
        enabled: true,
        pricingMode: 'distance_based',
        fixedCharge: 30,
        baseCharge: 30,
        baseDistanceKm: 0.5,
        additionalChargePerKm: 10,
        riderBasePayout: 30,
        riderRatePerKm: 5,
        freeDeliveryThreshold: 0,
        minimumOrderValue: 0,
        maximumDeliveryCharge: 0,
    },
    weatherCharges: {
        enabled: false,
        active: false,
        amount: 0,
        reason: '',
        revenueSplit: { platform: 100, seller: 0 },
    },
    extraCharges: [],
};

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeIncoming(raw) {
    if (!raw) return { ...EMPTY_FORM };
    return {
        ...EMPTY_FORM,
        ...raw,
        deliveryCharges: { ...EMPTY_FORM.deliveryCharges, ...(raw.deliveryCharges || {}) },
        weatherCharges: {
            ...EMPTY_FORM.weatherCharges,
            ...(raw.weatherCharges || {}),
            revenueSplit: {
                ...EMPTY_FORM.weatherCharges.revenueSplit,
                ...(raw.weatherCharges?.revenueSplit || {}),
            },
        },
        extraCharges: Array.isArray(raw.extraCharges) ? raw.extraCharges : [],
        updatedAt: raw.updatedAt,
    };
}

const inputClass =
    'w-full rounded-xl border-none bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none ring-1 ring-slate-100 transition focus:bg-white focus:ring-2 focus:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60';
const compactInputClass =
    'w-full rounded-xl border-none bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-900 outline-none ring-1 ring-slate-100 transition focus:bg-white focus:ring-2 focus:ring-brand-200';
const sectionClass =
    'rounded-2xl border-none bg-white p-5 shadow-sm ring-1 ring-slate-100 space-y-4';
const sectionTitleClass =
    'px-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500';
const actionButtonClass =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40';

const CityBillingSection = () => {
    const { showToast } = useToast();
    const [cities, setCities] = useState([]);
    const [knownCities, setKnownCities] = useState([]);
    const [selectedKey, setSelectedKey] = useState('');
    const [form, setForm] = useState(EMPTY_FORM);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [previewInput, setPreviewInput] = useState({
        cityKey: '',
        subtotal: 500,
        distanceKm: 3,
        paymentMethod: 'ONLINE',
    });
    const [preview, setPreview] = useState(null);

    const refreshList = useCallback(async () => {
        try {
            const [configsRes, optionsRes] = await Promise.all([
                adminApi.listCityBillingConfigs(),
                // Cities where stores exist. Same source the city-commissions
                // page uses so the dropdown shows real, matchable city keys
                // even before any billing config has been saved.
                adminApi.getCityCommissionOptions().catch(() => ({ data: null })),
            ]);
            const configured = configsRes.data?.result || configsRes.data?.data || [];
            setCities(Array.isArray(configured) ? configured : []);
            const options = optionsRes.data?.result?.cities || optionsRes.data?.data?.cities || [];
            setKnownCities(Array.isArray(options) ? options : []);
        } catch (err) {
            showToast('Failed to load city billing configurations', 'error');
        }
    }, [showToast]);

    useEffect(() => {
        refreshList();
    }, [refreshList]);

    const loadCity = useCallback(
        async (cityKey) => {
            if (!cityKey) {
                setForm(EMPTY_FORM);
                setSelectedKey('');
                return;
            }
            const alreadyConfigured = cities.some((c) => c.cityKey === cityKey);
            if (!alreadyConfigured) {
                // Store-known city that has no billing config yet — prefill the
                // form with defaults so the admin can save it in one click.
                const knownMatch = knownCities.find((c) => c.cityKey === cityKey);
                setForm({
                    ...EMPTY_FORM,
                    cityKey,
                    cityName: knownMatch?.cityName || cityKey,
                });
                setSelectedKey('');
                return;
            }
            setIsLoading(true);
            try {
                const res = await adminApi.getCityBillingConfig(cityKey);
                setForm(normalizeIncoming(res.data?.result || res.data?.data));
                setSelectedKey(cityKey);
            } catch (err) {
                showToast('Failed to load city configuration', 'error');
            } finally {
                setIsLoading(false);
            }
        },
        [showToast, cities, knownCities],
    );

    const startNewCity = () => {
        setSelectedKey('');
        setForm({ ...EMPTY_FORM });
    };

    const updateDelivery = (patch) =>
        setForm((f) => ({ ...f, deliveryCharges: { ...f.deliveryCharges, ...patch } }));
    const updateWeather = (patch) =>
        setForm((f) => ({ ...f, weatherCharges: { ...f.weatherCharges, ...patch } }));

    const saveConfig = async () => {
        if (!form.cityKey?.trim() || !form.cityName?.trim()) {
            showToast('City key and name are required', 'error');
            return;
        }
        const wSum =
            Number(form.weatherCharges.revenueSplit.platform || 0) +
            Number(form.weatherCharges.revenueSplit.seller || 0);
        if (Math.round(wSum) !== 100) {
            showToast(`Weather revenue split must sum to 100 (currently ${wSum}%).`, 'error');
            return;
        }
        setIsSaving(true);
        try {
            const res = await adminApi.upsertCityBillingConfig(form.cityKey.trim(), form);
            const saved = res.data?.result || res.data?.data;
            showToast('City billing configuration saved', 'success');
            await refreshList();
            if (saved?.cityKey) await loadCity(saved.cityKey);
        } catch (err) {
            const status = err.response?.status;
            const message =
                status === 409
                    ? 'Another admin changed this configuration. Refresh before saving.'
                    : err.response?.data?.message || 'Save failed';
            showToast(message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const deleteConfig = async () => {
        if (!selectedKey) return;
        if (!window.confirm(`Delete billing configuration for ${form.cityName}?`)) return;
        try {
            await adminApi.deleteCityBillingConfig(selectedKey);
            showToast('City billing configuration deleted', 'success');
            await refreshList();
            startNewCity();
        } catch (err) {
            showToast(err.response?.data?.message || 'Delete failed', 'error');
        }
    };

    const activateWeather = async () => {
        if (!selectedKey) {
            showToast('Save the city configuration first', 'error');
            return;
        }
        if (
            !window.confirm(
                `Activate weather charge of ₹${form.weatherCharges.amount} for ${form.cityName}? This affects new orders immediately.`,
            )
        ) {
            return;
        }
        try {
            await adminApi.activateCityWeatherCharge(selectedKey, {
                amount: toNumber(form.weatherCharges.amount),
                reason: form.weatherCharges.reason,
                revenueSplit: form.weatherCharges.revenueSplit,
            });
            showToast('Weather charge activated', 'success');
            await loadCity(selectedKey);
        } catch (err) {
            showToast(err.response?.data?.message || 'Activation failed', 'error');
        }
    };

    const deactivateWeather = async () => {
        if (!selectedKey) return;
        try {
            await adminApi.deactivateCityWeatherCharge(selectedKey);
            showToast('Weather charge deactivated', 'success');
            await loadCity(selectedKey);
        } catch (err) {
            showToast(err.response?.data?.message || 'Deactivation failed', 'error');
        }
    };

    const addExtraCharge = () => {
        setForm((f) => ({
            ...f,
            extraCharges: [
                ...f.extraCharges,
                {
                    name: '',
                    type: 'flat',
                    amount: 0,
                    enabled: true,
                    appliesTo: 'all_orders',
                    minimumOrderValue: 0,
                    maximumOrderValue: 0,
                    revenueType: 'platform',
                    platformPercentage: 100,
                    sellerPercentage: 0,
                    riderPercentage: 0,
                },
            ],
        }));
    };

    const updateExtraCharge = (index, patch) => {
        setForm((f) => ({
            ...f,
            extraCharges: f.extraCharges.map((c, i) => (i === index ? { ...c, ...patch } : c)),
        }));
    };

    const removeExtraCharge = (index) => {
        setForm((f) => ({
            ...f,
            extraCharges: f.extraCharges.filter((_, i) => i !== index),
        }));
    };

    const runPreview = async () => {
        try {
            const res = await adminApi.previewCityBilling({
                cityKey: previewInput.cityKey || selectedKey,
                subtotal: toNumber(previewInput.subtotal),
                distanceKm: toNumber(previewInput.distanceKm),
                paymentMethod: previewInput.paymentMethod,
            });
            setPreview(res.data?.result || res.data?.data);
        } catch (err) {
            showToast(err.response?.data?.message || 'Preview failed', 'error');
        }
    };

    const isDistanceMode = form.deliveryCharges.pricingMode === 'distance_based';

    return (
        <Card
            className="overflow-hidden rounded-[32px] border-none bg-white shadow-xl ring-1 ring-slate-100"
            contentClassName="p-0"
        >
            <div className="flex items-start justify-between gap-4 border-b border-slate-50 bg-slate-50/30 p-6">
                <div>
                    <h2 className="flex items-center gap-3 text-sm font-black uppercase tracking-widest text-slate-900">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                            <MapPin className="h-4 w-4" />
                        </span>
                        City-Wise Billing Configuration
                    </h2>
                    <p className="mt-2 max-w-3xl text-xs font-medium leading-relaxed text-slate-500">
                        Overrides global delivery, weather and extra charges for a specific city. Cities without a
                        configuration fall back to the global defaults below.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={refreshList}
                    className="rounded-xl bg-white p-2.5 text-slate-500 shadow-sm ring-1 ring-slate-100 transition hover:bg-slate-50 hover:text-slate-900"
                    title="Refresh"
                >
                    <RefreshCw className="h-4 w-4" />
                </button>
            </div>

            <div className="space-y-6 p-6">
            <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-slate-50/70 p-4 ring-1 ring-slate-100">
                <label className="flex min-w-[260px] flex-1 flex-col text-sm">
                    <span className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">Select city</span>
                    <select
                        className={inputClass}
                        value={selectedKey || form.cityKey}
                        onChange={(e) => loadCity(e.target.value)}
                    >
                        <option value="">— New city —</option>
                        {cities.length > 0 && (
                            <optgroup label="Configured cities">
                                {cities.map((c) => (
                                    <option key={`cfg-${c.cityKey}`} value={c.cityKey}>
                                        {c.cityName || c.cityKey}
                                        {c.isActive ? '' : ' (inactive)'}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                        {knownCities.filter((k) => !cities.some((c) => c.cityKey === k.cityKey)).length > 0 && (
                            <optgroup label="Cities with stores (not yet configured)">
                                {knownCities
                                    .filter((k) => !cities.some((c) => c.cityKey === k.cityKey))
                                    .map((k) => (
                                        <option key={`known-${k.cityKey}`} value={k.cityKey}>
                                            {k.cityName} ({k.shopCount} store{k.shopCount === 1 ? '' : 's'})
                                        </option>
                                    ))}
                            </optgroup>
                        )}
                    </select>
                </label>
                <button
                    type="button"
                    onClick={startNewCity}
                    className={`${actionButtonClass} bg-brand-50 text-brand-700 hover:bg-brand-100`}
                >
                    <Plus className="h-4 w-4" /> Add city
                </button>
                {selectedKey && (
                    <button
                        type="button"
                        onClick={deleteConfig}
                        className={`${actionButtonClass} bg-rose-50 text-rose-600 ring-1 ring-rose-100 hover:bg-rose-100`}
                    >
                        <Trash2 className="h-4 w-4" /> Delete
                    </button>
                )}
            </div>

            {isLoading ? (
                <div className="rounded-2xl bg-slate-50 py-12 text-center text-sm font-semibold text-slate-500 ring-1 ring-slate-100">Loading…</div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <input
                            className={inputClass}
                            placeholder="City key (e.g. indore)"
                            value={form.cityKey}
                            onChange={(e) => setForm((f) => ({ ...f, cityKey: e.target.value }))}
                            disabled={Boolean(selectedKey)}
                        />
                        <input
                            className={inputClass}
                            placeholder="City name"
                            value={form.cityName}
                            onChange={(e) => setForm((f) => ({ ...f, cityName: e.target.value }))}
                        />
                        <input
                            className={inputClass}
                            placeholder="State"
                            value={form.state}
                            onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                        />
                    </div>
                    <label className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 ring-1 ring-emerald-100">
                        <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 accent-brand-600"
                            checked={form.isActive}
                            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                        />
                        Configuration is active (uncheck to fall back to global for this city)
                    </label>

                    {/* Delivery charges */}
                    <fieldset className={sectionClass}>
                        <legend className={sectionTitleClass}>Delivery charges</legend>
                        <div className="inline-flex rounded-xl bg-slate-100 p-1">
                            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${!isDistanceMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                                <input
                                    type="radio"
                                    className="accent-brand-600"
                                    checked={!isDistanceMode}
                                    onChange={() => updateDelivery({ pricingMode: 'fixed_price' })}
                                />
                                Fixed
                            </label>
                            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${isDistanceMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                                <input
                                    type="radio"
                                    className="accent-brand-600"
                                    checked={isDistanceMode}
                                    onChange={() => updateDelivery({ pricingMode: 'distance_based' })}
                                />
                                Distance-based
                            </label>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                            {isDistanceMode ? (
                                <>
                                    <NumberField label="Base charge (₹)" value={form.deliveryCharges.baseCharge}
                                        onChange={(v) => updateDelivery({ baseCharge: v })} />
                                    <NumberField label="Base distance (km)" value={form.deliveryCharges.baseDistanceKm} step="0.1"
                                        onChange={(v) => updateDelivery({ baseDistanceKm: v })} />
                                    <NumberField label="Extra ₹ / km" value={form.deliveryCharges.additionalChargePerKm}
                                        onChange={(v) => updateDelivery({ additionalChargePerKm: v })} />
                                    <NumberField label="Rider base payout" value={form.deliveryCharges.riderBasePayout}
                                        onChange={(v) => updateDelivery({ riderBasePayout: v })} />
                                    <NumberField label="Rider ₹ / km" value={form.deliveryCharges.riderRatePerKm}
                                        onChange={(v) => updateDelivery({ riderRatePerKm: v })} />
                                </>
                            ) : (
                                <NumberField label="Fixed charge (₹)" value={form.deliveryCharges.fixedCharge}
                                    onChange={(v) => updateDelivery({ fixedCharge: v })} />
                            )}
                            <NumberField label="Free delivery above (₹)" value={form.deliveryCharges.freeDeliveryThreshold}
                                onChange={(v) => updateDelivery({ freeDeliveryThreshold: v })} />
                            <NumberField label="Minimum order (₹)" value={form.deliveryCharges.minimumOrderValue}
                                onChange={(v) => updateDelivery({ minimumOrderValue: v })} />
                            <NumberField label="Max delivery cap (₹)" value={form.deliveryCharges.maximumDeliveryCharge}
                                onChange={(v) => updateDelivery({ maximumDeliveryCharge: v })} />
                        </div>
                    </fieldset>

                    {/* Weather */}
                    <fieldset className={sectionClass}>
                        <legend className={`${sectionTitleClass} inline-flex items-center gap-2`}>
                            <CloudRain className="h-4 w-4" /> Weather charge
                        </legend>
                        <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                            <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300 accent-brand-600"
                                checked={form.weatherCharges.enabled}
                                onChange={(e) => updateWeather({ enabled: e.target.checked })}
                            />
                            Enable weather charge for this city
                        </label>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                            <NumberField label="Amount (₹)" value={form.weatherCharges.amount}
                                onChange={(v) => updateWeather({ amount: v })} />
                            <input className={`${inputClass} sm:col-span-2`}
                                placeholder="Reason (e.g. Heavy rain)"
                                value={form.weatherCharges.reason}
                                onChange={(e) => updateWeather({ reason: e.target.value })} />
                            <div className="self-center rounded-xl bg-slate-50 px-3 py-3 text-xs font-bold text-slate-600 ring-1 ring-slate-100">
                                Status:{' '}
                                <span className={form.weatherCharges.active ? 'text-emerald-600 font-black' : 'text-slate-400'}>
                                    {form.weatherCharges.active ? 'ACTIVE' : 'INACTIVE'}
                                </span>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <NumberField
                                label="Platform share (%)"
                                value={form.weatherCharges.revenueSplit.platform}
                                onChange={(v) => {
                                    const platform = Math.max(0, Math.min(100, v));
                                    // Auto-balance seller so the split always sums to 100 —
                                    // matches the backend Joi rule and prevents the "sum != 100"
                                    // save error the admin was hitting.
                                    updateWeather({
                                        revenueSplit: { platform, seller: 100 - platform },
                                    });
                                }}
                            />
                            <NumberField
                                label="Seller share (%)"
                                value={form.weatherCharges.revenueSplit.seller}
                                onChange={(v) => {
                                    const seller = Math.max(0, Math.min(100, v));
                                    updateWeather({
                                        revenueSplit: { seller, platform: 100 - seller },
                                    });
                                }}
                            />
                        </div>
                        {(() => {
                            const sum =
                                Number(form.weatherCharges.revenueSplit.platform || 0) +
                                Number(form.weatherCharges.revenueSplit.seller || 0);
                            if (sum === 100) return null;
                            return (
                                <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 ring-1 ring-rose-100">
                                    Platform + Seller must equal 100% (currently {sum}%). Adjust one field —
                                    the other will auto-balance.
                                </p>
                            );
                        })()}
                        <div className="flex flex-col gap-2">
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={activateWeather}
                                    title={
                                        !selectedKey
                                            ? "Save the city configuration first, then activate"
                                            : "Apply this weather charge to new orders immediately"
                                    }
                                    className={`${actionButtonClass} bg-amber-500 text-white shadow-sm shadow-amber-200 hover:bg-amber-600`}
                                    disabled={!selectedKey}
                                >
                                    Activate now
                                </button>
                                <button
                                    type="button"
                                    onClick={deactivateWeather}
                                    className={`${actionButtonClass} bg-slate-100 text-slate-700 hover:bg-slate-200`}
                                    disabled={!selectedKey || !form.weatherCharges.active}
                                >
                                    Deactivate
                                </button>
                            </div>
                            {!selectedKey && (
                                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">
                                    Save the city configuration first (green button below) — the Activate button
                                    writes to a saved city row.
                                </p>
                            )}
                        </div>
                    </fieldset>

                    {/* Extra charges */}
                    <fieldset className={sectionClass}>
                        <div className="flex justify-between items-center">
                            <legend className={sectionTitleClass}>Extra charges</legend>
                            <button
                                type="button"
                                onClick={addExtraCharge}
                                className={`${actionButtonClass} bg-brand-50 text-brand-700 hover:bg-brand-100`}
                            >
                                <Plus className="h-4 w-4" /> Add
                            </button>
                        </div>
                        {form.extraCharges.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-8 text-center text-xs font-semibold text-slate-400">No extra charges configured.</div>
                        ) : (
                            <div className="space-y-2">
                                {form.extraCharges.map((c, idx) => (
                                    <div key={idx} className="grid grid-cols-1 items-center gap-3 rounded-2xl bg-slate-50/70 p-3 ring-1 ring-slate-100 md:grid-cols-6">
                                        <input className={compactInputClass} placeholder="Name"
                                            value={c.name} onChange={(e) => updateExtraCharge(idx, { name: e.target.value })} />
                                        <select className={compactInputClass} value={c.type}
                                            onChange={(e) => updateExtraCharge(idx, { type: e.target.value })}>
                                            <option value="flat">Flat ₹</option>
                                            <option value="percentage">Percentage %</option>
                                        </select>
                                        <input type="number" className={compactInputClass} placeholder="Amount"
                                            value={c.amount} onChange={(e) => updateExtraCharge(idx, { amount: toNumber(e.target.value) })} />
                                        <select className={compactInputClass} value={c.appliesTo}
                                            onChange={(e) => updateExtraCharge(idx, { appliesTo: e.target.value })}>
                                            <option value="all_orders">All orders</option>
                                            <option value="cod">COD only</option>
                                            <option value="online">Online only</option>
                                            <option value="delivery">Delivery only</option>
                                            <option value="minimum_order_value">Min-order</option>
                                        </select>
                                        <select className={compactInputClass} value={c.revenueType}
                                            onChange={(e) => updateExtraCharge(idx, { revenueType: e.target.value })}>
                                            <option value="platform">Platform</option>
                                            <option value="seller">Seller</option>
                                            <option value="rider">Rider</option>
                                            <option value="split">Split</option>
                                        </select>
                                        <div className="flex items-center gap-2">
                                            <label className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-brand-600" checked={c.enabled}
                                                    onChange={(e) => updateExtraCharge(idx, { enabled: e.target.checked })} />
                                                Enabled
                                            </label>
                                            <button type="button" onClick={() => removeExtraCharge(idx)}
                                                className="rounded-lg p-2 text-rose-500 transition hover:bg-rose-50 hover:text-rose-700" title="Remove">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </fieldset>

                    <div className="flex justify-end border-t border-slate-100 pt-5">
                        <button
                            type="button"
                            onClick={saveConfig}
                            disabled={isSaving}
                            className={`${actionButtonClass} bg-slate-900 px-6 text-white shadow-lg shadow-slate-200 hover:bg-slate-800`}
                        >
                            {isSaving ? 'Saving…' : 'Save city configuration'}
                        </button>
                    </div>

                    {/* Preview calculator */}
                    <div className="space-y-5 rounded-2xl bg-slate-900 p-5 text-white shadow-xl sm:p-6 [&_label]:text-slate-300 [&_input]:bg-white/10 [&_input]:text-white [&_input]:ring-white/10">
                        <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-brand-300 ring-1 ring-white/10">
                                <Calculator className="h-4 w-4" />
                            </span>
                            <div>
                                <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-white">Preview calculator</h3>
                                <p className="mt-1 text-xs font-medium leading-relaxed text-slate-400">
                            Preview uses the live backend pricing engine, so what you see here is what real checkout would charge.
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-5">
                            <label className="flex flex-col text-[10px] font-black uppercase tracking-wider text-slate-300">
                                <span className="mb-1.5">City key</span>
                                <input className="w-full rounded-xl border-none bg-white/10 px-4 py-3 text-sm font-semibold text-white outline-none ring-1 ring-white/10 placeholder:text-slate-500 focus:ring-2 focus:ring-brand-400"
                                    placeholder={selectedKey || "e.g. indore"}
                                    value={previewInput.cityKey}
                                    onChange={(e) => setPreviewInput((p) => ({ ...p, cityKey: e.target.value }))} />
                            </label>
                            <NumberField label="Subtotal" value={previewInput.subtotal}
                                onChange={(v) => setPreviewInput((p) => ({ ...p, subtotal: v }))} />
                            <NumberField label="Distance (km)" value={previewInput.distanceKm} step="0.1"
                                onChange={(v) => setPreviewInput((p) => ({ ...p, distanceKm: v }))} />
                            <label className="flex flex-col text-[10px] font-black uppercase tracking-wider text-slate-300">
                                <span className="mb-1.5">Payment method</span>
                                <select className="w-full rounded-xl border-none bg-white/10 px-4 py-3 text-sm font-semibold text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-brand-400"
                                    value={previewInput.paymentMethod}
                                    onChange={(e) => setPreviewInput((p) => ({ ...p, paymentMethod: e.target.value }))}>
                                    <option className="text-slate-900" value="ONLINE">Online</option>
                                    <option className="text-slate-900" value="COD">COD</option>
                                </select>
                            </label>
                            <button type="button" onClick={runPreview}
                                className={`${actionButtonClass} min-h-11 bg-brand-500 text-white shadow-lg shadow-brand-950/20 hover:bg-brand-400`}>
                                Calculate
                            </button>
                        </div>
                        {preview && <PreviewBreakdown preview={preview} />}
                    </div>
                </>
            )}
            </div>
        </Card>
    );
};

const NumberField = ({ label, value, onChange, step = '1' }) => (
    <label className="flex flex-col text-[10px] font-black uppercase tracking-wider text-slate-500">
        <span className="mb-1.5">{label}</span>
        <input
            type="number"
            step={step}
            className={inputClass}
            value={value ?? 0}
            onChange={(e) => onChange(toNumber(e.target.value))}
        />
    </label>
);

const PreviewBreakdown = ({ preview }) => {
    const b = preview.breakdown || {};
    const row = (label, value) => (
        <div className="flex justify-between border-b border-slate-100 py-2 text-sm last:border-0">
            <span className="font-medium text-slate-500">{label}</span>
            <span className="font-black text-slate-900">₹{Number(value || 0).toFixed(2)}</span>
        </div>
    );
    return (
        <div className="rounded-2xl bg-white p-4 text-slate-900 shadow-lg ring-1 ring-slate-100">
            <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Billing source: <span className="font-semibold">{preview.billing?.source}</span>
                {preview.billing?.cityName ? ` — ${preview.billing.cityName}` : ''}
            </div>
            {row('Subtotal', b.subtotal)}
            {row(`Delivery fee${b.freeDeliveryApplied ? ' (free)' : ''}`, b.deliveryFee)}
            {b.oddHourSurcharge > 0 && row('Odd-hour surcharge', b.oddHourSurcharge)}
            {b.weatherSurcharge > 0 && row('Weather surcharge', b.weatherSurcharge)}
            {(b.extraCharges || []).map((c, i) => (
                <div key={i} className="flex justify-between border-b border-slate-100 py-2 text-sm">
                    <span className="font-medium text-slate-500">{c.name} ({c.type})</span>
                    <span className="font-black text-slate-900">₹{Number(c.amount).toFixed(2)}</span>
                </div>
            ))}
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-3 text-base font-black">
                <span>Grand total</span>
                <span>₹{Number(b.grandTotal || 0).toFixed(2)}</span>
            </div>
        </div>
    );
};

export default CityBillingSection;
