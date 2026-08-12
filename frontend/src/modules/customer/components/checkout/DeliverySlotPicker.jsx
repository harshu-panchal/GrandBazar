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
  const [campaignDeliveryWindow, setCampaignDeliveryWindow] = useState(null);
  // Store-configurable "how many days ahead can a regular scheduled order be
  // placed" (backend default: 30). Starts at that same default and is
  // corrected once the store's actual setting comes back from the API, so
  // there's no hardcoded cap here regardless of what a given store configures.
  const [maxDaysAhead, setMaxDaysAhead] = useState(30);

  const isScheduled = fulfillmentType === "scheduled" || fulfillmentType === "preorder";

  const dateOptions = useMemo(() => {
    const options = [];
    if (campaignId && campaignDeliveryWindow?.startDate && campaignDeliveryWindow?.endDate) {
      const start = new Date(campaignDeliveryWindow.startDate);
      const end = new Date(campaignDeliveryWindow.endDate);
      start.setHours(12, 0, 0, 0);
      end.setHours(12, 0, 0, 0);
      const maxSpanDays = 60; // defensive cap against a misconfigured huge campaign window
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        options.push(formatLocalDate(d));
        if (options.length >= maxSpanDays) break;
      }
      return options;
    }
    const base = new Date();
    base.setHours(12, 0, 0, 0);
    const span = Math.max(1, Number(maxDaysAhead) || 30);
    for (let i = 0; i < span; i += 1) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      options.push(formatLocalDate(d));
    }
    return options;
  }, [campaignId, campaignDeliveryWindow, maxDaysAhead]);

  // Once the campaign's delivery window is known, snap the selected date into range.
  useEffect(() => {
    if (!campaignId || !dateOptions.length) return;
    if (!dateOptions.includes(deliveryDate)) {
      setDeliveryDate(dateOptions[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateOptions.join(","), campaignId]);

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
        const res = await customerApi.getDeliverySlots({
          sellerId,
          deliveryDate,
          fulfillmentType,
          ...(campaignId ? { campaignId } : {}),
        });
        const result = res.data?.result || res.data?.results || {};
        const list = Array.isArray(result.windows) ? result.windows : [];
        if (cancelled) return;
        setSchedulingEnabled(result.schedulingEnabled !== false);
        setWindows(list);
        if (campaignId && result.campaignDeliveryWindow) {
          setCampaignDeliveryWindow(result.campaignDeliveryWindow);
        }
        if (Number.isFinite(Number(result.maxDaysAhead)) && Number(result.maxDaysAhead) > 0) {
          setMaxDaysAhead(Number(result.maxDaysAhead));
        }
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
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 bg-white shadow-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none cursor-pointer"
        value={deliveryDate}
        onChange={(e) => setDeliveryDate(e.target.value)}
      >
        {dateOptions.map((d) => (
          <option key={d} value={d} className="bg-white text-slate-900 font-bold py-1.5" style={{ color: '#0f172a', backgroundColor: '#ffffff' }}>
            {d}
          </option>
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
