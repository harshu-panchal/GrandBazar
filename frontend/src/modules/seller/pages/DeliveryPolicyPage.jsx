import React, { useEffect, useState } from "react";
import { sellerApi } from "../services/sellerApi";

const DEFAULT_WINDOWS = [
  { label: "9 AM - 12 PM", start: "09:00", end: "12:00", capacityPerDay: 50, enabled: true },
  { label: "12 PM - 3 PM", start: "12:00", end: "15:00", capacityPerDay: 50, enabled: true },
  { label: "3 PM - 6 PM", start: "15:00", end: "18:00", capacityPerDay: 50, enabled: true },
  { label: "6 PM - 9 PM", start: "18:00", end: "21:00", capacityPerDay: 50, enabled: true },
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function DeliveryPolicyPage() {
  const [deliveryPolicy, setDeliveryPolicy] = useState({
    customerPickup: false,
    sellerDelivery: false,
    platformLogistics: true,
    autoSwitchToPlatform: false,
    sameDayCutoffTime: "18:00",
  });
  const [availability, setAvailability] = useState({
    workingDays: [0, 1, 2, 3, 4, 5, 6],
    openTime: "09:00",
    closeTime: "21:00",
    weeklyOff: [],
    holidays: [],
    vacation: { active: false, startAt: "", endAt: "", message: "" },
    temporaryClosure: { active: false, reason: "other", message: "", restoreAt: "" },
  });
  const [schedulingSettings, setSchedulingSettings] = useState({
    enabled: false,
    maxDaysAhead: 7,
    rescheduleCutoffDays: 1,
    deliveryWindows: DEFAULT_WINDOWS,
  });
  const [serviceRadius, setServiceRadius] = useState(5);
  const [packagingChargeEnabled, setPackagingChargeEnabled] = useState(false);
  const [packagingCharge, setPackagingCharge] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    sellerApi.getDeliveryPolicy().then((res) => {
      const data = res.data?.result || res.data?.results;
      if (!data) return;
      if (data.deliveryPolicy) setDeliveryPolicy((s) => ({ ...s, ...data.deliveryPolicy }));
      if (data.availability) setAvailability((s) => ({ ...s, ...data.availability }));
      if (data.schedulingSettings) {
        setSchedulingSettings((s) => ({
          ...s,
          ...data.schedulingSettings,
          deliveryWindows: data.schedulingSettings.deliveryWindows?.length
            ? data.schedulingSettings.deliveryWindows
            : DEFAULT_WINDOWS,
        }));
      }
      if (data.serviceRadius != null) setServiceRadius(data.serviceRadius);
      setPackagingChargeEnabled(Boolean(data.packagingChargeEnabled));
      setPackagingCharge(Number(data.packagingCharge || 0));
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      if (packagingChargeEnabled && Number(packagingCharge) <= 0) {
        setMessage("Enter a packaging charge greater than 0, or turn it off.");
        setSaving(false);
        return;
      }
      await sellerApi.updateDeliveryPolicy({
        deliveryPolicy: {
          ...deliveryPolicy,
          sellerDelivery: deliveryPolicy.sellerDelivery,
        },
        availability: {
          ...availability,
          vacation: {
            ...availability.vacation,
            startAt: availability.vacation.startAt || null,
            endAt: availability.vacation.endAt || null,
          },
          temporaryClosure: {
            ...availability.temporaryClosure,
            restoreAt: availability.temporaryClosure.restoreAt || null,
          },
        },
        schedulingSettings: {
          ...schedulingSettings,
          selfLogistics: deliveryPolicy.sellerDelivery,
        },
        serviceRadius,
        packagingChargeEnabled,
        packagingCharge: Number(packagingCharge) || 0,
      });
      setMessage("Delivery policy saved.");
    } catch (e) {
      setMessage(e?.response?.data?.message || "Failed to save delivery policy.");
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (listKey, day) => {
    setAvailability((prev) => {
      const list = new Set(prev[listKey] || []);
      if (list.has(day)) list.delete(day);
      else list.add(day);
      return { ...prev, [listKey]: Array.from(list).sort() };
    });
  };

  return (
    <div className="p-4 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Delivery Policy & Availability</h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure how customers can receive orders from your shop.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Fulfillment Methods</h2>
        {[
          ["customerPickup", "Customer Pickup"],
          ["sellerDelivery", "Seller Self Delivery"],
          ["platformLogistics", "Platform Logistics"],
          ["autoSwitchToPlatform", "Auto-switch to platform when seller unavailable"],
        ].map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={Boolean(deliveryPolicy[key])}
              onChange={(e) => setDeliveryPolicy({ ...deliveryPolicy, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
        <label className="block text-sm">
          Same-day order cutoff
          <input
            type="time"
            className="mt-1 w-full rounded-xl border px-3 py-2"
            value={deliveryPolicy.sameDayCutoffTime}
            onChange={(e) => setDeliveryPolicy({ ...deliveryPolicy, sameDayCutoffTime: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          Delivery radius (km)
          <input
            type="number"
            min="0.5"
            step="0.5"
            className="mt-1 w-full rounded-xl border px-3 py-2"
            value={serviceRadius}
            onChange={(e) => setServiceRadius(Number(e.target.value))}
          />
        </label>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">
              Packaging Charge
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Flat fee added on customer checkout for this store. Paid to you (not platform or rider).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPackagingChargeEnabled((v) => !v)}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${
              packagingChargeEnabled ? "bg-emerald-500" : "bg-slate-200"
            }`}
            aria-label="Toggle packaging charge"
          >
            <span
              className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                packagingChargeEnabled ? "translate-x-6" : ""
              }`}
            />
          </button>
        </div>
        <label className={`block text-sm ${!packagingChargeEnabled ? "opacity-50" : ""}`}>
          Amount (₹)
          <input
            type="number"
            min="0"
            step="1"
            disabled={!packagingChargeEnabled}
            className="mt-1 w-full rounded-xl border px-3 py-2 disabled:bg-slate-50"
            value={packagingCharge}
            onChange={(e) => setPackagingCharge(Number(e.target.value) || 0)}
          />
        </label>
        {packagingChargeEnabled && Number(packagingCharge) > 0 && (
          <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
            Customers will pay ₹{Number(packagingCharge).toLocaleString("en-IN")} packaging on orders from this store.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Business Hours</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            Open
            <input type="time" className="mt-1 w-full rounded-xl border px-3 py-2" value={availability.openTime} onChange={(e) => setAvailability({ ...availability, openTime: e.target.value })} />
          </label>
          <label className="block text-sm">
            Close
            <input type="time" className="mt-1 w-full rounded-xl border px-3 py-2" value={availability.closeTime} onChange={(e) => setAvailability({ ...availability, closeTime: e.target.value })} />
          </label>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-2">Working days</p>
          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map((label, day) => (
              <button
                key={label}
                type="button"
                onClick={() => toggleDay("workingDays", day)}
                className={`rounded-lg px-3 py-1 text-xs font-bold ${
                  availability.workingDays.includes(day)
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 mb-2">Weekly off</p>
          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map((label, day) => (
              <button
                key={`off-${label}`}
                type="button"
                onClick={() => toggleDay("weeklyOff", day)}
                className={`rounded-lg px-3 py-1 text-xs font-bold ${
                  availability.weeklyOff.includes(day)
                    ? "bg-rose-600 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Vacation & Temporary Closure</h2>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={availability.vacation.active}
            onChange={(e) => setAvailability({
              ...availability,
              vacation: { ...availability.vacation, active: e.target.checked },
            })}
          />
          Vacation mode
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            Vacation start
            <input type="datetime-local" className="mt-1 w-full rounded-xl border px-3 py-2" value={availability.vacation.startAt || ""} onChange={(e) => setAvailability({ ...availability, vacation: { ...availability.vacation, startAt: e.target.value } })} />
          </label>
          <label className="block text-sm">
            Vacation end
            <input type="datetime-local" className="mt-1 w-full rounded-xl border px-3 py-2" value={availability.vacation.endAt || ""} onChange={(e) => setAvailability({ ...availability, vacation: { ...availability.vacation, endAt: e.target.value } })} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={availability.temporaryClosure.active}
            onChange={(e) => setAvailability({
              ...availability,
              temporaryClosure: { ...availability.temporaryClosure, active: e.target.checked },
            })}
          />
          Temporary shop closure
        </label>
        <select
          className="w-full rounded-xl border px-3 py-2 text-sm"
          value={availability.temporaryClosure.reason}
          onChange={(e) => setAvailability({
            ...availability,
            temporaryClosure: { ...availability.temporaryClosure, reason: e.target.value },
          })}
        >
          <option value="vacation">Vacation</option>
          <option value="festival">Festival</option>
          <option value="emergency">Emergency</option>
          <option value="staff_unavailable">Staff unavailable</option>
          <option value="other">Other</option>
        </select>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Scheduled Delivery</h2>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={schedulingSettings.enabled}
            onChange={(e) => setSchedulingSettings({ ...schedulingSettings, enabled: e.target.checked })}
          />
          Enable scheduled delivery
        </label>
        <label className="block text-sm">
          Max days ahead
          <input type="number" className="mt-1 w-full rounded-xl border px-3 py-2" value={schedulingSettings.maxDaysAhead} onChange={(e) => setSchedulingSettings({ ...schedulingSettings, maxDaysAhead: Number(e.target.value) })} />
        </label>
        <label className="block text-sm">
          Reschedule cutoff (days before slot)
          <input type="number" className="mt-1 w-full rounded-xl border px-3 py-2" value={schedulingSettings.rescheduleCutoffDays} onChange={(e) => setSchedulingSettings({ ...schedulingSettings, rescheduleCutoffDays: Number(e.target.value) })} />
        </label>
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-500">Delivery windows</p>
          {schedulingSettings.deliveryWindows.map((window, index) => (
            <div key={window.label} className="grid grid-cols-4 gap-2 items-center">
              <input
                className="rounded-lg border px-2 py-1 text-xs col-span-2"
                value={window.label}
                onChange={(e) => {
                  const next = [...schedulingSettings.deliveryWindows];
                  next[index] = { ...next[index], label: e.target.value };
                  setSchedulingSettings({ ...schedulingSettings, deliveryWindows: next });
                }}
              />
              <input
                type="time"
                className="rounded-lg border px-2 py-1 text-xs"
                value={window.start}
                onChange={(e) => {
                  const next = [...schedulingSettings.deliveryWindows];
                  next[index] = { ...next[index], start: e.target.value };
                  setSchedulingSettings({ ...schedulingSettings, deliveryWindows: next });
                }}
              />
              <input
                type="time"
                className="rounded-lg border px-2 py-1 text-xs"
                value={window.end}
                onChange={(e) => {
                  const next = [...schedulingSettings.deliveryWindows];
                  next[index] = { ...next[index], end: e.target.value };
                  setSchedulingSettings({ ...schedulingSettings, deliveryWindows: next });
                }}
              />
            </div>
          ))}
        </div>
      </section>

      {message && <p className="text-sm font-semibold text-slate-600">{message}</p>}

      <button
        type="button"
        disabled={saving}
        onClick={save}
        className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white"
      >
        {saving ? "Saving..." : "Save delivery policy"}
      </button>
    </div>
  );
}
