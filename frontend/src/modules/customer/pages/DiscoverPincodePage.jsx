import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MapPin, Store } from "lucide-react";
import { customerApi } from "../services/customerApi";
import { useSeoMeta } from "@core/seo/useSeoMeta";

export default function DiscoverPincodePage() {
  const { citySlug, pincode } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState({ stores: [], categories: [], cityName: "" });
  const cityTitle = useMemo(
    () => (data.cityName || String(citySlug || "").replace(/-/g, " ")).trim(),
    [data.cityName, citySlug],
  );
  const canonicalUrl = `${window.location.origin}/discover/${citySlug}/${pincode}`;

  useSeoMeta({
    title: `Delivery in ${pincode} (${cityTitle}) | Grand Bazar`,
    description: `Explore stores delivering to pincode ${pincode} in ${cityTitle}.`,
    canonicalUrl,
    keywords: [cityTitle, pincode, "delivery", "Grand Bazar"],
    jsonLdId: "discover-pincode",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `Stores delivering to ${pincode}`,
      url: canonicalUrl,
    },
    robots: Number(data.totalStores || 0) > 0 ? "index,follow" : "noindex,follow",
  });

  useEffect(() => {
    async function load() {
      const res = await customerApi.getDiscoverPincodeData(citySlug, pincode);
      setData(res.data?.result || {});
    }
    load().catch(() => setData({ stores: [], categories: [], cityName: cityTitle }));
  }, [citySlug, pincode, cityTitle]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-24">
      <h1 className="text-3xl font-black text-slate-900">
        Delivery in {pincode}, {cityTitle}
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        {data.totalStores || 0} stores currently deliver in this pincode.
      </p>
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        {(data.stores || []).map((store) => (
          <button
            key={store._id}
            onClick={() => navigate(store.canonicalPath || `/store/${store._id}`)}
            className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm"
          >
            <div className="flex items-center gap-2 text-slate-900 font-bold">
              <Store size={16} />
              {store.shopName}
            </div>
            <p className="text-xs text-slate-500 mt-1">{store.category || "Store"}</p>
            <p className="text-xs text-slate-400 mt-1 inline-flex items-center gap-1">
              <MapPin size={12} />
              {store.locality || store.city} {store.pincode ? `- ${store.pincode}` : ""}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
