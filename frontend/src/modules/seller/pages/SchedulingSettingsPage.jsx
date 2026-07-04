import React, { useEffect, useState } from "react";
import { sellerApi } from "../services/sellerApi";

const DEFAULT_WINDOWS = [
  { label: "9 AM - 12 PM", start: "09:00", end: "12:00", capacityPerDay: 50, enabled: true },
  { label: "12 PM - 3 PM", start: "12:00", end: "15:00", capacityPerDay: 50, enabled: true },
  { label: "3 PM - 6 PM", start: "15:00", end: "18:00", capacityPerDay: 50, enabled: true },
  { label: "6 PM - 9 PM", start: "18:00", end: "21:00", capacityPerDay: 50, enabled: true },
];

export default function SchedulingSettingsPage() {
  const [settings, setSettings] = useState({
    enabled: false,
    maxDaysAhead: 7,
    rescheduleCutoffDays: 1,
    selfLogistics: false,
    deliveryWindows: DEFAULT_WINDOWS,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    sellerApi.getSchedulingSettings().then((res) => {
      const data = res.data?.result || res.data?.results;
      if (data) setSettings((s) => ({ ...s, ...data }));
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await sellerApi.updateSchedulingSettings(settings);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-2xl">
      <h1 className="text-xl font-black">Scheduling & Delivery Windows</h1>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
        />
        Enable scheduled delivery
      </label>
      <label className="block text-sm">
        Max days ahead
        <input
          type="number"
          className="mt-1 w-full rounded-xl border px-3 py-2"
          value={settings.maxDaysAhead}
          onChange={(e) => setSettings({ ...settings, maxDaysAhead: Number(e.target.value) })}
        />
      </label>
      <label className="block text-sm">
        Reschedule cutoff (days before slot)
        <input
          type="number"
          className="mt-1 w-full rounded-xl border px-3 py-2"
          value={settings.rescheduleCutoffDays}
          onChange={(e) => setSettings({ ...settings, rescheduleCutoffDays: Number(e.target.value) })}
        />
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={settings.selfLogistics}
          onChange={(e) => setSettings({ ...settings, selfLogistics: e.target.checked })}
        />
        Use seller self-logistics
      </label>
      <button
        type="button"
        disabled={saving}
        onClick={save}
        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white"
      >
        {saving ? "Saving..." : "Save settings"}
      </button>
    </div>
  );
}
