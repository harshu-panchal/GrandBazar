import React, { useEffect, useState } from "react";
import { Store, Truck, Package } from "lucide-react";
import { customerApi } from "../../services/customerApi";

const METHOD_META = {
  customer_pickup: {
    label: "Store Pickup",
    description: "Collect from the shop",
    icon: Store,
  },
  seller_delivery: {
    label: "Seller Delivery",
    description: "Delivered by the shop",
    icon: Package,
  },
  platform_logistics: {
    label: "Platform Delivery",
    description: "Fast delivery via platform riders",
    icon: Truck,
  },
};

export default function FulfillmentMethodPicker({
  sellerId,
  fulfillmentType = "instant",
  customerLocation,
  value,
  onChange,
}) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [blockers, setBlockers] = useState([]);

  useEffect(() => {
    if (!sellerId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const params = {
          sellerId,
          fulfillmentType,
        };
        if (customerLocation?.lat && customerLocation?.lng) {
          params.lat = customerLocation.lat;
          params.lng = customerLocation.lng;
        }
        const res = await customerApi.getDeliveryOptions(params);
        const data = res.data?.result || res.data?.results;
        if (cancelled) return;
        const list = data?.options || [];
        setOptions(list);
        setBlockers(data?.operational?.open === false ? [data.operational] : []);

        const available = list.filter((o) => o.available);
        if (available.length && !available.some((o) => o.method === value)) {
          onChange?.(available[0].method);
        }
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [sellerId, fulfillmentType, customerLocation?.lat, customerLocation?.lng]);

  if (!sellerId) return null;

  const availableOptions = options.filter((o) => o.available);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
        How do you want to receive your order?
      </p>

      {loading && (
        <p className="text-xs text-slate-400 font-medium">Loading delivery options...</p>
      )}

      {!loading && availableOptions.length === 0 && (
        <p className="text-xs text-rose-600 font-semibold">
          {blockers[0]?.message || "No delivery options available for this shop right now."}
        </p>
      )}

      <div className="grid gap-2">
        {options.map((option) => {
          const meta = METHOD_META[option.method] || {
            label: option.label,
            description: "",
            icon: Truck,
          };
          const Icon = meta.icon;
          const selected = value === option.method;
          const disabled = !option.available;

          return (
            <button
              key={option.method}
              type="button"
              disabled={disabled}
              onClick={() => onChange?.(option.method)}
              className={`flex items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
                selected
                  ? "border-emerald-500 bg-emerald-50"
                  : disabled
                    ? "border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed"
                    : "border-slate-200 hover:border-emerald-300"
              }`}
            >
              <div
                className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg ${
                  selected ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900">{meta.label}</p>
                <p className="text-xs text-slate-500">{meta.description}</p>
                {option.estimatedMinutes != null && option.available && (
                  <p className="text-[11px] font-semibold text-emerald-700 mt-1">
                    Est. {option.estimatedMinutes} mins
                    {option.deliveryFee === 0 ? " · Free delivery" : ""}
                  </p>
                )}
                {disabled && option.reason && (
                  <p className="text-[11px] font-medium text-rose-600 mt-1">{option.reason}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
