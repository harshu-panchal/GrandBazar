import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { customerApi } from "../services/customerApi";
import { useLocation as useAppLocation } from "../context/LocationContext";
import { CalendarClock, Store, Truck } from "lucide-react";

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function PreOrderBrowsePage() {
  const { currentLocation, openLocationPicker } = useAppLocation();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  const lat = currentLocation?.latitude;
  const lng = currentLocation?.longitude;
  const hasLocation =
    Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));

  useEffect(() => {
    if (!hasLocation) {
      setCampaigns([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    customerApi
      .getActiveCampaigns({
        includeUpcoming: true,
        lat,
        lng,
      })
      .then((res) => {
        setCampaigns(res.data?.result || res.data?.results || []);
      })
      .catch(() => setCampaigns([]))
      .finally(() => setLoading(false));
  }, [hasLocation, lat, lng]);

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-4 pb-24">
      <div>
        <h1 className="text-xl font-black text-slate-900">Advance Order Booking</h1>
        <p className="text-xs font-semibold text-slate-500 mt-1">
          Shown only for stores that deliver to your selected location.
        </p>
      </div>

      {!hasLocation ? (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 space-y-3">
          <p className="text-sm font-bold text-amber-800">
            Set your delivery location to see advance bookings near you.
          </p>
          <button
            type="button"
            onClick={() => openLocationPicker?.()}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
          >
            Choose location
          </button>
        </div>
      ) : loading ? (
        <p className="text-sm text-slate-500">Loading bookings in your area…</p>
      ) : campaigns.length === 0 ? (
        <p className="text-sm text-slate-500">
          No advance booking campaigns from stores serving your area right now.
        </p>
      ) : (
        campaigns.map((c) => (
          <Link
            key={c.campaignId}
            to={`/preorder/${c.campaignId}`}
            className="block rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:ring-1 hover:ring-slate-200 transition"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900">{c.title}</h2>
                {c.description ? (
                  <p className="mt-1 text-xs text-slate-500">{c.description}</p>
                ) : null}
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${
                  c.bookingOpen
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {c.bookingStatusLabel || (c.bookingOpen ? "Open" : "Upcoming")}
              </span>
            </div>

            <div className="mt-3 space-y-2 text-xs font-semibold text-slate-600">
              <p className="flex items-center gap-2">
                <Store className="h-3.5 w-3.5 text-slate-400" />
                {c.storeLabel || c.seller?.shopName || c.seller?.name || "Partner store"}
              </p>
              <p className="flex items-center gap-2">
                <CalendarClock className="h-3.5 w-3.5 text-violet-500" />
                Booking: {formatDateTime(c.bookingStartAt || c.saleWindow?.startAt)} →{" "}
                {formatDateTime(c.bookingEndAt || c.saleWindow?.endAt)}
              </p>
              <p className="flex items-center gap-2">
                <Truck className="h-3.5 w-3.5 text-brand-500" />
                Delivery: {formatDate(c.deliveryStartDate || c.deliveryWindow?.startDate)} →{" "}
                {formatDate(c.deliveryEndDate || c.deliveryWindow?.endDate)}
              </p>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
