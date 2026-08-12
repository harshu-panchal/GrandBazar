import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";
import { MapPin, ChevronRight, Store } from "lucide-react";
import { customerApi } from "../../services/customerApi";
import { useLocation as useAppLocation } from "../../context/LocationContext";
import { getGoogleMapsJsApiLoaderOptions } from "@/core/services/googleMapsLoader";
import storePin from "@/assets/store-pin.png";
import customerPin from "@/assets/customer-pin.png";

/**
 * Home page teaser card, not a full interactive map — clicking anywhere
 * routes to the real map view on StoresPage.jsx (gestureHandling is
 * disabled here on purpose).
 */
const NearbyStoresMapTeaser = () => {
  const navigate = useNavigate();
  const { currentLocation } = useAppLocation();
  const [sellers, setSellers] = useState([]);

  const { isLoaded } = useJsApiLoader(
    getGoogleMapsJsApiLoaderOptions(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ""),
  );

  const hasValidLocation =
    Number.isFinite(currentLocation?.latitude) && Number.isFinite(currentLocation?.longitude);

  useEffect(() => {
    if (!hasValidLocation) return;
    let cancelled = false;
    customerApi
      .getNearbySellers({ lat: currentLocation.latitude, lng: currentLocation.longitude })
      .then((res) => {
        if (cancelled) return;
        const dbSellers = res.data?.results || res.data?.result || res.data || [];
        setSellers(Array.isArray(dbSellers) ? dbSellers.slice(0, 12) : []);
      })
      .catch(() => {
        if (!cancelled) setSellers([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasValidLocation, currentLocation?.latitude, currentLocation?.longitude]);

  const storeMarkerIcon = useMemo(
    () => (isLoaded && window.google ? { url: storePin, scaledSize: new window.google.maps.Size(32, 32) } : null),
    [isLoaded],
  );
  const customerMarkerIcon = useMemo(
    () => (isLoaded && window.google ? { url: customerPin, scaledSize: new window.google.maps.Size(32, 32) } : null),
    [isLoaded],
  );

  if (!hasValidLocation) return null;

  return (
    <div className="mb-4 md:mb-8">
      <div className="container mx-auto px-4 md:px-8 lg:px-[50px]">
        <div className="flex justify-between items-center mb-4 md:mb-6 px-1">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100">
              <MapPin size={14} className="text-emerald-600" />
            </div>
            <h3 className="text-base md:text-xl font-black text-[#1A1A1A] tracking-tight uppercase leading-none">
              Stores <span className="text-emerald-600">near you</span>
            </h3>
          </div>
          <button
            onClick={() => navigate("/stores")}
            className="flex items-center gap-1 bg-white px-2.5 py-1 md:px-4 md:py-2 rounded-full text-slate-700 font-bold text-[11px] md:text-sm cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.05)] md:shadow-md border border-slate-100 transition-all whitespace-nowrap active:scale-95"
          >
            View all
            <ChevronRight size={12} className="ml-0.5" strokeWidth={3} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => navigate("/stores")}
          className="relative w-full h-48 md:h-64 rounded-3xl overflow-hidden border border-slate-100 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.1)] cursor-pointer group text-left"
        >
          {isLoaded ? (
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
              center={{ lat: currentLocation.latitude, lng: currentLocation.longitude }}
              zoom={13}
              options={{ disableDefaultUI: true, gestureHandling: "none", clickableIcons: false, keyboardShortcuts: false }}
            >
              <Marker position={{ lat: currentLocation.latitude, lng: currentLocation.longitude }} icon={customerMarkerIcon} />
              {sellers.map((s) =>
                s.location?.coordinates?.length === 2 ? (
                  <Marker
                    key={s._id}
                    position={{ lat: s.location.coordinates[1], lng: s.location.coordinates[0] }}
                    icon={storeMarkerIcon}
                  />
                ) : null,
              )}
            </GoogleMap>
          ) : (
            <div className="flex items-center justify-center h-full bg-slate-50">
              <div className="h-8 w-8 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
            </div>
          )}
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/55 via-transparent to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 flex items-center justify-between pointer-events-none">
            <div className="flex items-center gap-2 text-white">
              <Store size={16} />
              <span className="font-black text-sm drop-shadow">
                {sellers.length} store{sellers.length === 1 ? "" : "s"} nearby
              </span>
            </div>
            <span className="text-white text-xs font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform drop-shadow">
              Open map <ChevronRight size={14} />
            </span>
          </div>
        </button>
      </div>
    </div>
  );
};

export default React.memo(NearbyStoresMapTeaser);
