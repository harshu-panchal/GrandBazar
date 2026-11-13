import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DirectionsRenderer,
  DirectionsService,
  GoogleMap,
  Marker,
  Polyline,
  useJsApiLoader,
} from '@react-google-maps/api';
import { Loader2, LocateFixed, MapPin, Navigation } from 'lucide-react';
import customerPin from '@/assets/customer-pin.png';
import deliveryIcon from '@/assets/deliveryIcon.png';
import storePin from '@/assets/store-pin.png';
import { getGoogleMapsJsApiLoaderOptions } from '@/core/services/googleMapsLoader';

const mapContainerStyle = { width: '100%', height: '100%' };
const ROUTE_REFRESH_DISTANCE_METERS = 150;

function validLocation(location) {
  return location && Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng));
}

function distanceMeters(a, b) {
  if (!validLocation(a) || !validLocation(b)) return Infinity;
  const radians = (value) => (value * Math.PI) / 180;
  const lat1 = radians(Number(a.lat));
  const lat2 = radians(Number(b.lat));
  const deltaLat = lat2 - lat1;
  const deltaLng = radians(Number(b.lng) - Number(a.lng));
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export default function GuestNavigationMap({
  courierLocation,
  destination,
  destinationLabel,
  destinationKind = 'customer',
  onRequestLocation,
  onNavigate,
}) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  const { isLoaded, loadError } = useJsApiLoader(getGoogleMapsJsApiLoaderOptions(apiKey));
  const [map, setMap] = useState(null);
  const [routeOrigin, setRouteOrigin] = useState(null);
  const [directions, setDirections] = useState(null);
  const [routeFailed, setRouteFailed] = useState(false);

  const hasCourier = validLocation(courierLocation);
  const hasDestination = validLocation(destination);

  // Avoid requesting a paid Directions route for every GPS tick. The moving
  // marker stays live, while the route refreshes after meaningful movement.
  useEffect(() => {
    if (!hasCourier) return;
    if (!routeOrigin || distanceMeters(routeOrigin, courierLocation) >= ROUTE_REFRESH_DISTANCE_METERS) {
      setRouteOrigin({ lat: Number(courierLocation.lat), lng: Number(courierLocation.lng) });
      setDirections(null);
      setRouteFailed(false);
    }
  }, [courierLocation?.lat, courierLocation?.lng, hasCourier, routeOrigin]);

  useEffect(() => {
    setDirections(null);
    setRouteFailed(false);
  }, [destination?.lat, destination?.lng]);

  useEffect(() => {
    if (!map || !isLoaded || !window.google?.maps || !hasDestination) return;
    if (hasCourier && routeOrigin) {
      const bounds = new window.google.maps.LatLngBounds();
      bounds.extend(routeOrigin);
      bounds.extend(destination);
      map.fitBounds(bounds, 48);
    } else {
      map.setCenter(destination);
      map.setZoom(15);
    }
  }, [map, isLoaded, hasCourier, hasDestination, routeOrigin?.lat, routeOrigin?.lng, destination?.lat, destination?.lng]);

  const directionsCallback = useCallback((result, status) => {
    if (status === 'OK' && result) {
      setDirections(result);
      setRouteFailed(false);
    } else {
      setRouteFailed(true);
    }
  }, []);

  const courierIcon = useMemo(() => {
    if (!isLoaded || !window.google?.maps) return undefined;
    return {
      url: deliveryIcon,
      scaledSize: new window.google.maps.Size(38, 55),
      anchor: new window.google.maps.Point(19, 55),
    };
  }, [isLoaded]);

  const destinationIcon = useMemo(() => {
    if (!isLoaded || !window.google?.maps) return undefined;
    return {
      url: destinationKind === 'store' ? storePin : customerPin,
      scaledSize: new window.google.maps.Size(40, 40),
      anchor: new window.google.maps.Point(20, 40),
    };
  }, [destinationKind, isLoaded]);

  if (!hasDestination) {
    return (
      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-center">
        <MapPin className="mx-auto text-amber-600" />
        <p className="mt-2 text-sm font-black text-amber-950">Destination coordinates are unavailable</p>
        <p className="mt-1 text-xs text-amber-700">Use the address shown above or contact the administrator.</p>
      </section>
    );
  }

  if (!apiKey || loadError) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-5 text-center shadow-sm">
        <MapPin className="mx-auto text-orange-600" />
        <p className="mt-2 text-sm font-black text-slate-900">{destinationLabel}</p>
        <button type="button" onClick={onNavigate} className="mt-3 rounded-xl bg-slate-900 px-5 py-3 text-xs font-black text-white">
          Open in Google Maps
        </button>
      </section>
    );
  }

  if (!isLoaded) {
    return <div className="flex h-72 items-center justify-center rounded-3xl bg-slate-100"><Loader2 className="animate-spin text-orange-600" /></div>;
  }

  const leg = directions?.routes?.[0]?.legs?.[0];

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="relative h-72 bg-slate-100">
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={hasCourier ? courierLocation : destination}
          zoom={hasCourier ? 13 : 15}
          onLoad={setMap}
          onUnmount={() => setMap(null)}
          options={{
            disableDefaultUI: true,
            zoomControl: true,
            clickableIcons: false,
            gestureHandling: 'greedy',
          }}
        >
          {routeOrigin && !directions && !routeFailed && (
            <DirectionsService
              options={{
                origin: routeOrigin,
                destination,
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
                preserveViewport: true,
                polylineOptions: { strokeColor: '#f97316', strokeOpacity: 0.9, strokeWeight: 5 },
              }}
            />
          ) : routeOrigin ? (
            <Polyline path={[routeOrigin, destination]} options={{ strokeColor: '#f97316', strokeOpacity: 0.6, strokeWeight: 4, geodesic: true }} />
          ) : null}
          {hasCourier && <Marker position={courierLocation} title="Your live location" icon={courierIcon} />}
          <Marker position={destination} title={destinationLabel} icon={destinationIcon} />
        </GoogleMap>

        <div className="pointer-events-none absolute left-3 right-3 top-3 flex items-start justify-between gap-2">
          <div className="min-w-0 rounded-2xl bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
            <p className="truncate text-[10px] font-black uppercase tracking-wider text-slate-500">Current destination</p>
            <p className="truncate text-sm font-black text-slate-900">{destinationLabel}</p>
            <p className="text-xs font-bold text-orange-600">
              {leg ? `${leg.distance?.text} · ${leg.duration?.text}` : routeFailed ? 'Route preview unavailable' : hasCourier ? 'Calculating route…' : 'Waiting for your location'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 p-3">
        <button type="button" onClick={onRequestLocation} className="flex items-center justify-center gap-2 rounded-2xl bg-orange-50 px-3 py-3 text-xs font-black text-orange-700">
          <LocateFixed size={16} />Refresh location
        </button>
        <button type="button" onClick={onNavigate} className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-3 py-3 text-xs font-black text-white">
          <Navigation size={16} />Start navigation
        </button>
      </div>
    </section>
  );
}
