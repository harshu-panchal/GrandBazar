import React, { useEffect, useMemo, useState } from "react";
import { Calendar, Clock } from "lucide-react";
import { customerApi } from "../../services/customerApi";

const formatLocalDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export default function DeliverySlotPicker({
  sellerId,
  fulfillmentType,
  onChange,
  campaignId = null,
}) {
  const [deliveryDate, setDeliveryDate] = useState(() => formatLocalDate(new Date()));
  const [windows, setWindows] = useState([]);
  const [windowLabel, setWindowLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [schedulingEnabled, setSchedulingEnabled] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const isScheduled = fulfillmentType === "scheduled" || fulfillmentType === "preorder";

  const dateOptions = useMemo(() => {
    const options = [];
    const base = new Date();
    base.setHours(12, 0, 0, 0);
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      options.push(formatLocalDate(d));
    }
    return options;
  }, []);

  useEffect(() => {
    if (!isScheduled || !sellerId) {
      onChange?.({ fulfillmentType: "instant", timeSlot: "now" });
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setErrorMessage("");
      try {
        const res = await customerApi.getDeliverySlots({ sellerId, deliveryDate });
        const result = res.data?.result || res.data?.results || {};
        const list = Array.isArray(result.windows) ? result.windows : [];
        if (cancelled) return;
        setSchedulingEnabled(result.schedulingEnabled !== false);
        setWindows(list);
        const firstAvailable = list.find((w) => w.available !== false);
        const label = firstAvailable?.label || "";
        setWindowLabel(label);
        if (!firstAvailable) {
          const reason =
            list.find((w) => w.reason)?.reason ||
            (result.schedulingEnabled === false
              ? "Scheduling is not enabled for this store"
              : "No delivery windows available for this date");
          setErrorMessage(reason);
        }
        onChange?.({
          fulfillmentType,
          deliveryDate,
          windowLabel: label,
          timeSlot: label ? `${deliveryDate}|${label}` : "",
          campaignId,
          preOrderCampaignId: campaignId,
        });
      } catch (error) {
        if (cancelled) return;
        setWindows([]);
        setWindowLabel("");
        setErrorMessage(error?.response?.data?.message || "Failed to load delivery slots");
        onChange?.({
          fulfillmentType,
          deliveryDate,
          windowLabel: "",
          timeSlot: "",
          campaignId,
          preOrderCampaignId: campaignId,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [sellerId, deliveryDate, isScheduled, fulfillmentType, campaignId]);

  useEffect(() => {
    if (!isScheduled) return;
    onChange?.({
      fulfillmentType,
      deliveryDate,
      windowLabel,
      timeSlot: windowLabel ? `${deliveryDate}|${windowLabel}` : "",
      campaignId,
      preOrderCampaignId: campaignId,
    });
  }, [windowLabel]);

  if (!isScheduled) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <Clock className="h-4 w-4 text-emerald-600" />
          Deliver now
        </div>
        <p className="mt-1 text-xs text-slate-500">Your order will be prepared immediately after seller accepts.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <Calendar className="h-4 w-4 text-emerald-600" />
        Choose delivery date & window
      </div>
      <select
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        value={deliveryDate}
        onChange={(e) => setDeliveryDate(e.target.value)}
      >
        {dateOptions.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      {loading ? (
        <p className="text-xs text-slate-500">Loading slots...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {windows.map((w) => (
              <button
                key={w.label}
                type="button"
                disabled={w.available === false}
                title={w.reason || ""}
                onClick={() => setWindowLabel(w.label)}
                className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold ${
                  windowLabel === w.label
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                    : w.available === false
                      ? "border-slate-100 bg-slate-50 text-slate-400"
                      : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          {!schedulingEnabled && (
            <p className="text-xs font-semibold text-amber-700">
              Scheduling is not enabled for this store. Ask the seller to enable it in Delivery Policy, or use Deliver now.
            </p>
          )}
          {schedulingEnabled && errorMessage && !windowLabel && (
            <p className="text-xs font-semibold text-amber-700">{errorMessage}</p>
          )}
        </>
      )}
    </div>
  );
}
