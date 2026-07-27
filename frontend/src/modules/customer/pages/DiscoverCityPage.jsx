import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MapPin, Store } from "lucide-react";
import { customerApi } from "../services/customerApi";
import { useSeoMeta } from "@core/seo/useSeoMeta";

export default function DiscoverCityPage() {
  const { citySlug } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState({ stores: [], categories: [], cityName: "" });
  const cityTitle = useMemo(
    () => (data.cityName || String(citySlug || "").replace(/-/g, " ")).trim(),
    [data.cityName, citySlug],
  );
  const canonicalUrl = `${window.location.origin}/discover/${citySlug}`;

  useSeoMeta({
    title: `Stores in ${cityTitle} | Grand Bazar`,
    description: `Discover local stores in ${cityTitle} and browse top categories.`,
    canonicalUrl,
    keywords: [cityTitle, "nearby stores", "Grand Bazar"],
    jsonLdId: "discover-city",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `Discover stores in ${cityTitle}`,
      url: canonicalUrl,
    },
    robots: Number(data.totalStores || 0) > 0 ? "index,follow" : "noindex,follow",
  });

  useEffect(() => {
    async function load() {
      const res = await customerApi.getDiscoverCityData(citySlug);
      setData(res.data?.result || {});
    }
    load().catch(() => setData({ stores: [], categories: [], cityName: cityTitle }));
  }, [citySlug, cityTitle]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-24">
      <h1 className="text-3xl font-black text-slate-900">Stores in {cityTitle}</h1>
      <p className="mt-2 text-sm text-slate-500">
        {data.totalStores || 0} stores available for your city-level discovery page.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        {(data.categories || []).map((c) => (
          <span key={c} className="px-3 py-1 rounded-full bg-slate-100 text-xs font-bold text-slate-600">
            {c}
          </span>
        ))}
      </div>
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
