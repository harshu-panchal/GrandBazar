import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { customerApi } from "../services/customerApi";
import { useCart } from "../context/CartContext";
import { useToast } from "@shared/components/ui/Toast";
import { useLocation as useAppLocation } from "../context/LocationContext";
import { CalendarClock, ChevronLeft, Store, Truck } from "lucide-react";

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

export default function PreOrderDetailPage() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const cart = useCart();
  const addToCart = cart?.addToCart;
  const { showToast } = useToast();
  const { currentLocation, openLocationPicker } = useAppLocation();
  const [campaign, setCampaign] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [areaError, setAreaError] = useState("");

  const lat = currentLocation?.latitude;
  const lng = currentLocation?.longitude;
  const hasLocation =
    Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));

  useEffect(() => {
    if (!campaignId) return;

    if (!hasLocation) {
      setLoading(false);
      setCampaign(null);
      setProducts([]);
      setAreaError("Set your delivery location to view products for this booking.");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setAreaError("");

    customerApi
      .getCampaignDetail(campaignId, { lat, lng })
      .then((res) => {
        if (cancelled) return;
        const payload = res.data?.result || {};
        setCampaign(payload.campaign || null);
        setProducts(Array.isArray(payload.products) ? payload.products : []);
      })
      .catch((error) => {
        if (cancelled) return;
        setCampaign(null);
        setProducts([]);
        setAreaError(
          error?.response?.data?.message ||
            "This booking is not available for your area.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [campaignId, hasLocation, lat, lng]);

  const handleAdd = async (product) => {
    if (!campaign?.bookingOpen) {
      showToast(
        campaign?.bookingStartAt
          ? `Booking opens on ${formatDateTime(campaign.bookingStartAt)}`
          : "Booking has not started yet",
        "error",
      );
      return;
    }
    if (typeof addToCart !== "function") {
      showToast("Cart is not ready. Please refresh and try again.", "error");
      return;
    }
    try {
      const sellerId =
        product.sellerId?._id || product.sellerId || product.storeId || null;
      const result = await addToCart({
        ...product,
        id: product._id || product.id,
        sellerId,
        campaignId: campaign.campaignId,
        preOrderCampaignId: campaign.campaignId,
        advanceBooking: {
          campaignId: campaign.campaignId,
          bookingOpen: true,
          bookingStartAt: campaign.bookingStartAt,
          bookingEndAt: campaign.bookingEndAt,
          deliveryStartDate: campaign.deliveryStartDate,
          deliveryEndDate: campaign.deliveryEndDate,
        },
      });
      if (!result?.ok) return;
      showToast(
        result.replacedOtherSellerItems
          ? "Added for advance booking. Previous store items were cleared."
          : "Added to cart for advance booking",
        "success",
      );
    } catch {
      // CartContext already shows the error toast — avoid a second one.
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading products…</div>;
  }

  if (!campaign) {
    return (
      <div className="p-6 space-y-4 max-w-3xl mx-auto">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-xs font-bold text-slate-500"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <p className="text-sm text-slate-600">{areaError || "Campaign not found."}</p>
        {!hasLocation ? (
          <button
            type="button"
            onClick={() => openLocationPicker?.()}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
          >
            Choose location
          </button>
        ) : (
          <Link
            to="/preorder"
            className="inline-block text-xs font-bold text-violet-700 underline"
          >
            Browse other advance bookings
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-5 pb-24">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-xs font-bold text-slate-500"
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>

      <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-slate-900">{campaign.title}</h1>
            {campaign.description ? (
              <p className="text-xs text-slate-500 mt-1">{campaign.description}</p>
            ) : null}
            <p className="text-xs font-semibold text-slate-600 mt-2 flex items-center gap-1.5">
              <Store className="h-3.5 w-3.5" />
              {campaign.storeLabel ||
                campaign.seller?.shopName ||
                campaign.seller?.name ||
                "Partner store"}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${
              campaign.bookingOpen
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {campaign.bookingStatusLabel}
          </span>
        </div>

        <div className="grid gap-2 text-xs font-semibold text-slate-600">
          <p className="flex items-center gap-2">
            <CalendarClock className="h-3.5 w-3.5 text-violet-500" />
            Order from {formatDateTime(campaign.bookingStartAt)} to{" "}
            {formatDateTime(campaign.bookingEndAt)}
          </p>
          <p className="flex items-center gap-2">
            <Truck className="h-3.5 w-3.5 text-brand-500" />
            Delivery between {formatDate(campaign.deliveryStartDate)} and{" "}
            {formatDate(campaign.deliveryEndDate)}
          </p>
        </div>

        {!campaign.bookingOpen && (
          <p className="text-xs font-bold text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
            Products cannot be added to cart until booking starts.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">
          Products ({products.length})
        </h2>

        {products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center">
            <p className="text-sm font-semibold text-slate-600">
              No products available from stores that deliver to your area.
            </p>
          </div>
        ) : (
          products.map((product) => (
            <div
              key={product._id || product.id}
              className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm"
            >
              <div className="h-16 w-16 rounded-xl overflow-hidden bg-slate-50 shrink-0">
                {product.mainImage ? (
                  <img
                    src={product.mainImage}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900 truncate">
                  {product.name}
                </p>
                {product.storeName ? (
                  <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1 mt-0.5">
                    <Store className="h-3 w-3" />
                    {product.storeName}
                  </p>
                ) : null}
                <p className="text-xs font-semibold text-slate-700 mt-1">
                  ₹
                  {Number(product.salePrice || product.price || 0).toLocaleString(
                    "en-IN",
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleAdd(product)}
                disabled={!campaign.bookingOpen}
                className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider bg-slate-900 text-white disabled:bg-slate-200 disabled:text-slate-500"
              >
                {campaign.bookingOpen ? "Add" : "Locked"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
