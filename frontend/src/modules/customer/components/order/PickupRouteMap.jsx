import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { GoogleMap, useJsApiLoader, Marker, Polyline, DirectionsService, DirectionsRenderer } from "@react-google-maps/api";
import { MapPin, Navigation, Loader2 } from "lucide-react";
import customerPin from "@/assets/customer-pin.png";
import storePin from "@/assets/store-pin.png";
import { getGoogleMapsJsApiLoaderOptions } from "@/core/services/googleMapsLoader";

const containerStyle = {
  width: "100%",
  height: "100%",
  minHeight: "300px",
};

function hasValidLatLng(location) {
  return (
    location &&
    typeof location.lat === "number" &&
    typeof location.lng === "number" &&
    Number.isFinite(location.lat) &&
    Number.isFinite(location.lng)
  );
}

/**
 * Route from the customer's own location to the store, for self-pickup
 * orders. Deliberately a separate, simpler component rather than reusing
 * LiveTrackingMap — there's no rider here, so none of that component's
 * live-tracking/ETA-countdown machinery applies; this just needs to answer
 * "how do I get there" once, not track a moving position continuously.
 */
const PickupRouteMap = ({ customerLocation, storeLocation, storeName = "the store", onRequestLocation, isLocating = false }) => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
  const { isLoaded, loadError } = useJsApiLoader(getGoogleMapsJsApiLoaderOptions(apiKey));
  const [directions, setDirections] = useState(null);
  const [directionsError, setDirectionsError] = useState(false);

  const hasCustomer = hasValidLatLng(customerLocation);
  const hasStore = hasValidLatLng(storeLocation);

  // Re-request the route if the customer's location actually changes
  // (e.g. they tap "Use my location" for a fresher fix).
  useEffect(() => {
    setDirections(null);
    setDirectionsError(false);
  }, [customerLocation?.lat, customerLocation?.lng, storeLocation?.lat, storeLocation?.lng]);

  const directionsCallback = useCallback((result, status) => {
    if (status === "OK" && result) {
      setDirections(result);
      setDirectionsError(false);
    } else {
      setDirectionsError(true);
    }
  }, []);

  const onMapLoad = useCallback(
    (map) => {
      if (!hasCustomer || !hasStore || !window.google) return;
      const bounds = new window.google.maps.LatLngBounds();
      bounds.extend(customerLocation);
      bounds.extend(storeLocation);
      map.fitBounds(bounds, 56);
    },
    [hasCustomer, hasStore, customerLocation, storeLocation],
  );

  const customerMarkerIcon = useMemo(() => {
    if (!isLoaded || !window.google?.maps) return undefined;
    return {
      url: customerPin,
      scaledSize: new window.google.maps.Size(40, 40),
      anchor: new window.google.maps.Point(20, 40),
    };
  }, [isLoaded]);

  const storeMarkerIcon = useMemo(() => {
    if (!isLoaded || !window.google?.maps) return undefined;
    return {
      url: storePin,
      scaledSize: new window.google.maps.Size(40, 40),
      anchor: new window.google.maps.Point(20, 40),
    };
  }, [isLoaded]);

  const leg = directions?.routes?.[0]?.legs?.[0];

  const handleOpenInMaps = () => {
    if (!hasStore) return;
    if (hasCustomer) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&origin=${customerLocation.lat},${customerLocation.lng}&destination=${storeLocation.lat},${storeLocation.lng}`,
        "_blank",
      );
    } else {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${storeLocation.lat},${storeLocation.lng}`,
        "_blank",
      );
    }
  };

  if (!hasStore) return null;

  if (!hasCustomer) {
    return (
      <div className="relative w-full min-h-[220px] bg-gradient-to-br from-emerald-50 to-teal-50 rounded-3xl flex flex-col items-center justify-center gap-3 px-6 py-8 border border-emerald-100 text-center">
        <div className="h-12 w-12 bg-white rounded-full flex items-center justify-center shadow-sm">
          <MapPin className="text-emerald-600" size={22} />
        </div>
        <p className="text-sm font-bold text-slate-800">
          Set your location to see the route to {storeName}
        </p>
        {onRequestLocation && (
          <button
            type="button"
            onClick={onRequestLocation}
            disabled={isLocating}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-wide disabled:opacity-60"
          >
            {isLocating ? "Locating..." : "Use my location"}
          </button>
        )}
        <button type="button" onClick={handleOpenInMaps} className="text-xs font-bold text-emerald-700 underline">
          Open shop location in Maps
        </button>
      </div>
    );
  }

  if (!apiKey || loadError) {
    return (
      <div className="relative w-full min-h-[160px] bg-slate-50 rounded-3xl flex items-center justify-center text-center px-4 border border-slate-100">
        <button type="button" onClick={handleOpenInMaps} className="text-xs font-bold text-emerald-700 underline">
          Open route to {storeName} in Google Maps
        </button>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="relative w-full h-[300px] bg-slate-50 rounded-3xl flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-600" size={26} />
      </div>
    );
  }

  return (
    <div className="relative w-full h-[300px] bg-[#E5E3DF] overflow-hidden rounded-3xl shadow-md border border-slate-200/50">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={customerLocation}
        zoom={13}
        onLoad={onMapLoad}
        options={{
          disableDefaultUI: true,
          zoomControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        }}
      >
        {!directions && !directionsError && (
          <DirectionsService
            options={{
              origin: customerLocation,
              destination: storeLocation,
              travelMode: window.google.maps.TravelMode.DRIVING,
            }}
            callback={directionsCallback}
          />
        )}

        {directions ? (
          <DirectionsRenderer
            directions={directions}
            options={{
              suppressMarkers: true,
              polylineOptions: {
                strokeColor: "var(--primary)",
                strokeOpacity: 0.8,
                strokeWeight: 4,
              },
            }}
          />
        ) : (
          <Polyline
            path={[customerLocation, storeLocation]}
            options={{ strokeColor: "var(--primary)", strokeOpacity: 0.5, strokeWeight: 3, geodesic: true }}
          />
        )}

        <Marker position={customerLocation} title="Your location" icon={customerMarkerIcon} />
        <Marker position={storeLocation} title={storeName} icon={storeMarkerIcon} />
      </GoogleMap>

      <div className="absolute top-4 left-4 right-4 z-40 flex justify-between items-start gap-2">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-white/90 backdrop-blur-md rounded-2xl p-3 shadow-lg border border-white/50 flex items-center gap-3 min-w-0"
        >
          <div className="h-10 w-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 shrink-0">
            <Navigation size={20} strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider truncate">
              Distance to {storeName}
            </p>
            <h2 className="text-base font-black text-gray-900 leading-tight truncate">
              {leg
                ? `${leg.distance?.text} · ${leg.duration?.text}`
                : directionsError
                  ? "Route unavailable"
                  : "Calculating..."}
            </h2>
          </div>
        </motion.div>
        <button
          type="button"
          onClick={handleOpenInMaps}
          className="bg-white/90 backdrop-blur-md rounded-full px-3 py-2 shadow-lg border border-white/50 cursor-pointer hover:bg-white transition-colors flex items-center gap-1.5 text-[10px] font-bold text-slate-700 shrink-0"
        >
          <MapPin size={14} className="text-emerald-600" />
          Open in Maps
        </button>
      </div>
    </div>
  );
};

export default PickupRouteMap;
