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
        <Card className="p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <MapPin className="w-5 h-5" /> City-Wise Billing Configuration
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Overrides global delivery, weather and extra charges for a specific city. Cities without a
                        configuration fall back to the global defaults below.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={refreshList}
                    className="p-2 rounded hover:bg-gray-100"
                    title="Refresh"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col text-sm">
                    <span className="font-semibold text-gray-700 mb-1">Select city</span>
                    <select
                        className="border rounded px-3 py-2 min-w-[280px]"
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
                    className="px-3 py-2 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm font-medium"
                >
                    <Plus className="w-4 h-4 inline mr-1" /> Add city
                </button>
                {selectedKey && (
                    <button
                        type="button"
                        onClick={deleteConfig}
                        className="px-3 py-2 rounded bg-red-50 text-red-700 hover:bg-red-100 text-sm font-medium"
                    >
                        <Trash2 className="w-4 h-4 inline mr-1" /> Delete
                    </button>
                )}
            </div>

            {isLoading ? (
                <div className="text-sm text-gray-500">Loading…</div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input
                            className="border rounded px-3 py-2"
                            placeholder="City key (e.g. indore)"
                            value={form.cityKey}
                            onChange={(e) => setForm((f) => ({ ...f, cityKey: e.target.value }))}
                            disabled={Boolean(selectedKey)}
                        />
                        <input
                            className="border rounded px-3 py-2"
                            placeholder="City name"
                            value={form.cityName}
                            onChange={(e) => setForm((f) => ({ ...f, cityName: e.target.value }))}
                        />
                        <input
                            className="border rounded px-3 py-2"
                            placeholder="State"
                            value={form.state}
                            onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                        />
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={form.isActive}
                            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                        />
                        Configuration is active (uncheck to fall back to global for this city)
                    </label>

                    {/* Delivery charges */}
                    <fieldset className="border rounded p-4 space-y-3">
                        <legend className="px-2 font-semibold">Delivery charges</legend>
                        <div className="flex gap-4">
                            <label className="inline-flex items-center gap-2 text-sm">
                                <input
                                    type="radio"
                                    checked={!isDistanceMode}
                                    onChange={() => updateDelivery({ pricingMode: 'fixed_price' })}
                                />
                                Fixed
                            </label>
                            <label className="inline-flex items-center gap-2 text-sm">
                                <input
                                    type="radio"
                                    checked={isDistanceMode}
                                    onChange={() => updateDelivery({ pricingMode: 'distance_based' })}
                                />
                                Distance-based
                            </label>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                    <fieldset className="border rounded p-4 space-y-3">
                        <legend className="px-2 font-semibold flex items-center gap-2">
                            <CloudRain className="w-4 h-4" /> Weather charge
                        </legend>
                        <label className="inline-flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={form.weatherCharges.enabled}
                                onChange={(e) => updateWeather({ enabled: e.target.checked })}
                            />
                            Enable weather charge for this city
                        </label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <NumberField label="Amount (₹)" value={form.weatherCharges.amount}
                                onChange={(v) => updateWeather({ amount: v })} />
                            <input className="border rounded px-3 py-2 col-span-2"
                                placeholder="Reason (e.g. Heavy rain)"
                                value={form.weatherCharges.reason}
                                onChange={(e) => updateWeather({ reason: e.target.value })} />
                            <div className="text-sm text-gray-600 self-center">
                                Status:{' '}
                                <span className={form.weatherCharges.active ? 'text-green-600 font-semibold' : 'text-gray-500'}>
                                    {form.weatherCharges.active ? 'ACTIVE' : 'INACTIVE'}
                                </span>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
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
                                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
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
                                    className="px-3 py-2 rounded bg-orange-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                                    disabled={!selectedKey}
                                >
                                    Activate now
                                </button>
                                <button
                                    type="button"
                                    onClick={deactivateWeather}
                                    className="px-3 py-2 rounded bg-gray-200 text-gray-800 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                                    disabled={!selectedKey || !form.weatherCharges.active}
                                >
                                    Deactivate
                                </button>
                            </div>
                            {!selectedKey && (
                                <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1">
                                    Save the city configuration first (green button below) — the Activate button
                                    writes to a saved city row.
                                </p>
                            )}
                        </div>
                    </fieldset>

                    {/* Extra charges */}
                    <fieldset className="border rounded p-4 space-y-3">
                        <div className="flex justify-between items-center">
                            <legend className="px-2 font-semibold">Extra charges</legend>
                            <button
                                type="button"
                                onClick={addExtraCharge}
                                className="text-sm px-3 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100"
                            >
                                <Plus className="w-4 h-4 inline mr-1" /> Add
                            </button>
                        </div>
                        {form.extraCharges.length === 0 ? (
                            <p className="text-sm text-gray-500">No extra charges configured.</p>
                        ) : (
                            <div className="space-y-2">
                                {form.extraCharges.map((c, idx) => (
                                    <div key={idx} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center border p-2 rounded">
                                        <input className="border rounded px-2 py-1 text-sm" placeholder="Name"
                                            value={c.name} onChange={(e) => updateExtraCharge(idx, { name: e.target.value })} />
                                        <select className="border rounded px-2 py-1 text-sm" value={c.type}
                                            onChange={(e) => updateExtraCharge(idx, { type: e.target.value })}>
                                            <option value="flat">Flat ₹</option>
                                            <option value="percentage">Percentage %</option>
                                        </select>
                                        <input type="number" className="border rounded px-2 py-1 text-sm" placeholder="Amount"
                                            value={c.amount} onChange={(e) => updateExtraCharge(idx, { amount: toNumber(e.target.value) })} />
                                        <select className="border rounded px-2 py-1 text-sm" value={c.appliesTo}
                                            onChange={(e) => updateExtraCharge(idx, { appliesTo: e.target.value })}>
                                            <option value="all_orders">All orders</option>
                                            <option value="cod">COD only</option>
                                            <option value="online">Online only</option>
                                            <option value="delivery">Delivery only</option>
                                            <option value="minimum_order_value">Min-order</option>
                                        </select>
                                        <select className="border rounded px-2 py-1 text-sm" value={c.revenueType}
                                            onChange={(e) => updateExtraCharge(idx, { revenueType: e.target.value })}>
                                            <option value="platform">Platform</option>
                                            <option value="seller">Seller</option>
                                            <option value="rider">Rider</option>
                                            <option value="split">Split</option>
                                        </select>
                                        <div className="flex items-center gap-2">
                                            <label className="text-xs inline-flex items-center gap-1">
                                                <input type="checkbox" checked={c.enabled}
                                                    onChange={(e) => updateExtraCharge(idx, { enabled: e.target.checked })} />
                                                Enabled
                                            </label>
                                            <button type="button" onClick={() => removeExtraCharge(idx)}
                                                className="text-red-600 hover:text-red-800" title="Remove">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </fieldset>

                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={saveConfig}
                            disabled={isSaving}
                            className="px-4 py-2 rounded bg-green-600 text-white font-semibold disabled:opacity-50"
                        >
                            {isSaving ? 'Saving…' : 'Save city configuration'}
                        </button>
                    </div>

                    {/* Preview calculator */}
                    <fieldset className="border rounded p-4 space-y-3 bg-gray-50">
                        <legend className="px-2 font-semibold flex items-center gap-2">
                            <Calculator className="w-4 h-4" /> Preview calculator
                        </legend>
                        <p className="text-xs text-gray-500">
                            Preview uses the live backend pricing engine, so what you see here is what real checkout would charge.
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <input className="border rounded px-3 py-2 text-sm"
                                placeholder="City key"
                                value={previewInput.cityKey}
                                onChange={(e) => setPreviewInput((p) => ({ ...p, cityKey: e.target.value }))} />
                            <NumberField label="Subtotal" value={previewInput.subtotal}
                                onChange={(v) => setPreviewInput((p) => ({ ...p, subtotal: v }))} />
                            <NumberField label="Distance (km)" value={previewInput.distanceKm} step="0.1"
                                onChange={(v) => setPreviewInput((p) => ({ ...p, distanceKm: v }))} />
                            <select className="border rounded px-3 py-2 text-sm"
                                value={previewInput.paymentMethod}
                                onChange={(e) => setPreviewInput((p) => ({ ...p, paymentMethod: e.target.value }))}>
                                <option value="ONLINE">Online</option>
                                <option value="COD">COD</option>
                            </select>
                            <button type="button" onClick={runPreview}
                                className="px-3 py-2 rounded bg-indigo-600 text-white text-sm font-semibold">
                                Calculate
                            </button>
                        </div>
                        {preview && <PreviewBreakdown preview={preview} />}
                    </fieldset>
                </>
            )}
        </Card>
    );
};

const NumberField = ({ label, value, onChange, step = '1' }) => (
    <label className="flex flex-col text-xs text-gray-600">
        <span className="mb-1">{label}</span>
        <input
            type="number"
            step={step}
            className="border rounded px-3 py-2 text-sm text-gray-900"
            value={value ?? 0}
            onChange={(e) => onChange(toNumber(e.target.value))}
        />
    </label>
);

const PreviewBreakdown = ({ preview }) => {
    const b = preview.breakdown || {};
    const row = (label, value) => (
        <div className="flex justify-between text-sm py-1 border-b last:border-0">
            <span className="text-gray-600">{label}</span>
            <span className="font-medium">₹{Number(value || 0).toFixed(2)}</span>
        </div>
    );
    return (
        <div className="bg-white border rounded p-3">
            <div className="text-xs text-gray-500 mb-2">
                Billing source: <span className="font-semibold">{preview.billing?.source}</span>
                {preview.billing?.cityName ? ` — ${preview.billing.cityName}` : ''}
            </div>
            {row('Subtotal', b.subtotal)}
            {row(`Delivery fee${b.freeDeliveryApplied ? ' (free)' : ''}`, b.deliveryFee)}
            {b.oddHourSurcharge > 0 && row('Odd-hour surcharge', b.oddHourSurcharge)}
            {b.weatherSurcharge > 0 && row('Weather surcharge', b.weatherSurcharge)}
            {(b.extraCharges || []).map((c, i) => (
                <div key={i} className="flex justify-between text-sm py-1 border-b">
                    <span className="text-gray-600">{c.name} ({c.type})</span>
                    <span className="font-medium">₹{Number(c.amount).toFixed(2)}</span>
                </div>
            ))}
            <div className="flex justify-between text-base font-bold pt-2 mt-2 border-t">
                <span>Grand total</span>
                <span>₹{Number(b.grandTotal || 0).toFixed(2)}</span>
            </div>
        </div>
    );
};

export default CityBillingSection;
