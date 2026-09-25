import React, { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Clock, Loader2 } from "lucide-react";
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
  initialTimeSlot = null,
  initialDeliveryDate = null,
  initialWindowLabel = null,
}) {
  const [initDate, initLabel] = useMemo(() => {
    let date = initialDeliveryDate;
    let label = initialWindowLabel;

    if ((!date || !label) && initialTimeSlot && typeof initialTimeSlot === "string" && initialTimeSlot.includes("|")) {
      const parts = initialTimeSlot.split("|");
      if (!date) date = parts[0];
      if (!label) label = parts[1];
    }

    if (date) {
      if (typeof date === "string" && date.includes("T")) {
        date = date.split("T")[0];
      } else if (date instanceof Date) {
        date = formatLocalDate(date);
      }
    }

    return [date || formatLocalDate(new Date()), label || ""];
  }, [initialTimeSlot, initialDeliveryDate, initialWindowLabel]);

  const [deliveryDate, setDeliveryDate] = useState(initDate);
  const [windows, setWindows] = useState([]);
  const [windowLabel, setWindowLabel] = useState(initLabel);

  // Sync state if initial props change while component is mounted
  useEffect(() => {
    if (initDate && initDate !== deliveryDate) {
      setDeliveryDate(initDate);
    }
  }, [initDate]);

  useEffect(() => {
    if (initLabel && initLabel !== windowLabel) {
      setWindowLabel(initLabel);
    }
  }, [initLabel]);

  const [loading, setLoading] = useState(false);
  const [schedulingEnabled, setSchedulingEnabled] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [campaignDeliveryWindow, setCampaignDeliveryWindow] = useState(null);
  const [maxDaysAhead, setMaxDaysAhead] = useState(30);

  // Fast in-component memory cache keyed by "sellerId_deliveryDate_campaignId"
  const cacheRef = useRef(new Map());
  const lastEmittedRef = useRef("");

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

  const emitChange = (label, date = deliveryDate) => {
    const timeSlot = label ? `${date}|${label}` : "";
    const key = `${fulfillmentType}|${date}|${label}|${campaignId || ""}`;
    if (lastEmittedRef.current === key) return;
    lastEmittedRef.current = key;
    onChange?.({
      fulfillmentType,
      deliveryDate: date,
      windowLabel: label,
      timeSlot,
      campaignId,
      preOrderCampaignId: campaignId,
    });
  };

  useEffect(() => {
    if (!isScheduled || !sellerId) {
      onChange?.({ fulfillmentType: "instant", timeSlot: "now" });
      return;
    }

    const cacheKey = `${sellerId}_${deliveryDate}_${fulfillmentType}_${campaignId || ""}`;
    const cachedData = cacheRef.current.get(cacheKey);

    // If already in memory cache, restore instantly without blanking the UI
    if (cachedData) {
      setSchedulingEnabled(cachedData.schedulingEnabled);
      setWindows(cachedData.windows);
      if (cachedData.campaignDeliveryWindow) {
        setCampaignDeliveryWindow(cachedData.campaignDeliveryWindow);
      }
      if (cachedData.maxDaysAhead) {
        setMaxDaysAhead(cachedData.maxDaysAhead);
      }
      const targetLabel = windowLabel || initLabel;
      const matchingWindow = cachedData.windows.find(
        (w) => w.label === targetLabel && w.available !== false
      );
      const firstAvailable = cachedData.windows.find((w) => w.available !== false);
      const selected = matchingWindow || firstAvailable;
      const label = selected?.label || "";
      setWindowLabel(label);
      setErrorMessage(cachedData.errorMessage || "");
      emitChange(label, deliveryDate);
    }

    let cancelled = false;
    const load = async () => {
      // Only set loading true if we don't have cached data to show
      if (!cachedData) {
        setLoading(true);
        setErrorMessage("");
      }

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

        const isEnabled = result.schedulingEnabled !== false;
        setSchedulingEnabled(isEnabled);
        setWindows(list);
        if (campaignId && result.campaignDeliveryWindow) {
          setCampaignDeliveryWindow(result.campaignDeliveryWindow);
        }
        if (Number.isFinite(Number(result.maxDaysAhead)) && Number(result.maxDaysAhead) > 0) {
          setMaxDaysAhead(Number(result.maxDaysAhead));
        }

        const targetLabel = windowLabel || initLabel;
        const matchingWindow = list.find((w) => w.label === targetLabel && w.available !== false);
        const firstAvailable = list.find((w) => w.available !== false);
        const selectedWindow = matchingWindow || firstAvailable;
        const label = selectedWindow?.label || "";
        setWindowLabel(label);

        let calculatedError = "";
        if (!firstAvailable) {
          calculatedError =
            list.find((w) => w.reason)?.reason ||
            (isEnabled
              ? "No delivery windows available for this date"
              : "Scheduling is not enabled for this store");
          setErrorMessage(calculatedError);
        } else {
          setErrorMessage("");
        }

        // Save into local memory cache
        cacheRef.current.set(cacheKey, {
          windows: list,
          schedulingEnabled: isEnabled,
          campaignDeliveryWindow: result.campaignDeliveryWindow || null,
          maxDaysAhead: result.maxDaysAhead || 30,
          errorMessage: calculatedError,
        });

        emitChange(label, deliveryDate);
      } catch (error) {
        if (cancelled) return;
        setWindows([]);
        setWindowLabel("");
        const msg = error?.response?.data?.message || "Failed to load delivery slots";
        setErrorMessage(msg);
        emitChange("", deliveryDate);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    const refreshInterval = setInterval(load, 90 * 1000);
    return () => {
      cancelled = true;
      clearInterval(refreshInterval);
    };
  }, [sellerId, deliveryDate, isScheduled, fulfillmentType, campaignId]);

  const handleSelectWindow = (label) => {
    setWindowLabel(label);
    emitChange(label, deliveryDate);
  };

  if (!isScheduled) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <Clock className="h-4 w-4 text-emerald-600" />
          Deliver now
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Your order will be prepared immediately after seller accepts.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Calendar className="h-4 w-4 text-emerald-600" />
          Choose delivery date & window
        </div>
        {loading && windows.length > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Updating...</span>
          </div>
        )}
      </div>

      <select
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-900 bg-white shadow-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-hidden cursor-pointer"
        value={deliveryDate}
        onChange={(e) => setDeliveryDate(e.target.value)}
      >
        {dateOptions.map((d, idx) => {
          let dayLabel = d;
          try {
            const dateObj = new Date(`${d}T12:00:00`);
            const formatted = dateObj.toLocaleDateString("en-IN", {
              weekday: "short",
              day: "numeric",
              month: "short",
            });
            if (idx === 0) dayLabel = `Today (${formatted})`;
            else if (idx === 1) dayLabel = `Tomorrow (${formatted})`;
            else dayLabel = formatted;
          } catch (_) {
            dayLabel = d;
          }

          return (
            <option
              key={d}
              value={d}
              className="bg-white text-slate-900 font-bold py-1.5"
              style={{ color: "#0f172a", backgroundColor: "#ffffff" }}
            >
              {dayLabel}
            </option>
          );
        })}
      </select>

      {/* Loading Skeleton if no windows yet */}
      {loading && windows.length === 0 ? (
        <div className="grid grid-cols-2 gap-2 pt-1">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-10 rounded-xl border border-slate-100 bg-slate-100/70 animate-pulse flex items-center px-3"
            >
              <div className="h-3 w-16 bg-slate-200 rounded-md" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div
            className={`grid grid-cols-2 gap-2 transition-opacity duration-150 ${
              loading ? "opacity-60 pointer-events-none" : "opacity-100"
            }`}
          >
            {windows.map((w) => (
              <button
                key={w.label}
                type="button"
                disabled={w.available === false}
                title={w.reason || ""}
                onClick={() => handleSelectWindow(w.label)}
                className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                  windowLabel === w.label
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500"
                    : w.available === false
                      ? "border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
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
