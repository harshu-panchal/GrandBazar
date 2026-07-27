import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarClock, ChevronRight, Store, Truck } from "lucide-react";
import { customerApi } from "../../services/customerApi";
import { useLocation as useAppLocation } from "../../context/LocationContext";

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

/**
 * Home section: advance bookings only for stores that serve the customer's pin.
 */
const AdvanceBookingSection = () => {
  const navigate = useNavigate();
  const { currentLocation } = useAppLocation();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);

  const lat = currentLocation?.latitude;
  const lng = currentLocation?.longitude;
  const hasLocation =
    Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));

  useEffect(() => {
    if (!hasLocation) {
      setCampaigns([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    customerApi
      .getActiveCampaigns({
        includeUpcoming: true,
        lat,
        lng,
      })
      .then((res) => {
        if (cancelled) return;
        const list = res.data?.result || res.data?.results || [];
        setCampaigns(Array.isArray(list) ? list.slice(0, 6) : []);
      })
      .catch(() => {
        if (!cancelled) setCampaigns([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasLocation, lat, lng]);

  if (!hasLocation || loading || campaigns.length === 0) {
    return null;
  }

  return (
    <section className="container mx-auto px-4 md:px-8 lg:px-[50px] py-6 md:py-8">
      <div className="flex items-end justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-violet-600">
            Near you
          </p>
          <h2 className="text-lg md:text-2xl font-black text-slate-900 tracking-tight">
            Advance Order Booking
          </h2>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            Only stores that deliver to your area
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/preorder")}
          className="text-[11px] font-black uppercase tracking-widest text-slate-700 flex items-center gap-1"
        >
          See all <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
        {campaigns.map((campaign) => {
          const id = encodeURIComponent(String(campaign.campaignId || ""));
          if (!campaign.campaignId) return null;
          return (
          <Link
            key={campaign.campaignId}
            to={`/preorder/${id}`}
            className="snap-start shrink-0 w-[260px] md:w-[300px] rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:ring-1 hover:ring-violet-200 transition"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="text-sm font-black text-slate-900 line-clamp-2">
                {campaign.title}
              </h3>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                  campaign.bookingOpen
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {campaign.bookingOpen ? "Open" : "Soon"}
              </span>
            </div>
            <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mb-2">
              <Store className="h-3.5 w-3.5" />
              {campaign.storeLabel ||
                campaign.seller?.shopName ||
                campaign.seller?.name ||
                "Store"}
            </p>
            <p className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5 text-violet-500" />
              Book: {formatDateTime(campaign.bookingStartAt || campaign.saleWindow?.startAt)}
            </p>
            <p className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5 mt-1">
              <Truck className="h-3.5 w-3.5 text-brand-500" />
              Deliver: {formatDate(campaign.deliveryStartDate || campaign.deliveryWindow?.startDate)}
              {" – "}
              {formatDate(campaign.deliveryEndDate || campaign.deliveryWindow?.endDate)}
            </p>
          </Link>
          );
        })}
      </div>
    </section>
  );
};

export default React.memo(AdvanceBookingSection);
