// "Available from other sellers" — plain section at the bottom of the
// product description that renders each match as a normal ProductCard
// (same card used elsewhere on the site, so add-to-cart / quantity /
// wishlist behavior is consistent). Matches "same product" server-side
// by shared `catalogProductId` first, then by identical name within the
// same subcategory (getOtherSellersForProductController).
import React, { useEffect, useState } from "react";
import { Store, TrendingDown } from "lucide-react";
import ProductCard from "../shared/ProductCard";
import { customerApi } from "../../services/customerApi";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400";

const priceOf = (p) =>
  Number(
    p.customerSalePrice ?? p.customerPrice ?? p.salePrice ?? p.price ?? 0,
  );

// Haversine great-circle distance in km. Returns null when either point
// is missing so ProductCard falls back to its delivery-time label.
function haversineKm(lat1, lng1, lat2, lng2) {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
  ) {
    return null;
  }
  const R = 6371;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const normalizeForCard = (p, customerLat, customerLng) => {
  const populated =
    p.sellerId && typeof p.sellerId === "object" ? p.sellerId : null;
  const shopName = populated ? populated.shopName || populated.name || "" : "";
  const sellerIdValue = populated ? populated._id || populated : p.sellerId;
  // Store.location is GeoJSON: coordinates = [lng, lat]
  const coords = populated?.location?.coordinates;
  const sellerLng = Array.isArray(coords) ? Number(coords[0]) : NaN;
  const sellerLat = Array.isArray(coords) ? Number(coords[1]) : NaN;
  const distance = haversineKm(customerLat, customerLng, sellerLat, sellerLng);
  return {
    ...p,
    id: p._id,
    image: p.mainImage || p.image || FALLBACK_IMAGE,
    price: priceOf(p),
    originalPrice: Number(p.customerPrice ?? p.price ?? 0),
    weight: p.weight || "1 unit",
    deliveryTime: p.deliveryEta?.label || "8-15 mins",
    // ProductCard renders `By <shop>` when either shopName or the
    // populated sellerId.shopName is present. Provide both.
    shopName,
    sellerId: sellerIdValue,
    // ProductCard prefers `product.distance` (km) over deliveryTime when
    // it is a finite number. Null falls back to delivery time.
    distance: distance != null ? Number(distance.toFixed(2)) : null,
  };
};

const OtherSellersSection = ({ productId, currentPrice, lat, lng }) => {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    const params = { limit: 10 };
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      params.lat = lat;
      params.lng = lng;
    }
    setIsLoading(true);
    customerApi
      .getOtherSellersForProduct(productId, params)
      .then((res) => {
        if (cancelled) return;
        setItems(res?.data?.result?.items || []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, lat, lng]);

  if (isLoading && items.length === 0) {
    return (
      <div className="mt-8 pt-6 border-t border-slate-100">
        <p className="text-sm text-slate-400 font-medium">
          Looking for other sellers…
        </p>
      </div>
    );
  }
  if (!items.length) return null;

  const currentPriceNum = Number(currentPrice || 0);
  const cheapest = items.reduce(
    (min, p) => Math.min(min, priceOf(p)),
    Number.POSITIVE_INFINITY,
  );
  const savings =
    currentPriceNum > 0 && cheapest < currentPriceNum
      ? Math.round(currentPriceNum - cheapest)
      : 0;

  return (
    <section className="mt-8 pt-6 border-t border-slate-100">
      <div className="flex items-center gap-2 mb-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50">
          <Store size={18} className="text-emerald-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-black text-slate-800 tracking-tight">
            Available from other sellers
          </h3>
          <p className="text-[11px] text-slate-500 font-medium">
            Same product from other stores near you.
          </p>
        </div>
        {savings > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
            <TrendingDown size={12} /> Save up to ₹{savings}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-3 md:gap-x-4 gap-y-6 md:gap-y-10">
        {items.map((p) => normalizeForCard(p, lat, lng)).map((product) => (
          <div key={product.id} className="flex justify-center">
            <ProductCard product={product} compact={true} neutralBg={true} />
          </div>
        ))}
      </div>
    </section>
  );
};

export default React.memo(OtherSellersSection);
