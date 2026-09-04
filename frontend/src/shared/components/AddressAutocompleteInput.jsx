import React, { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { loadGoogleMaps } from "@/core/services/googleMapsLoader";

const MIN_QUERY_LENGTH = 4;
const SEARCH_DEBOUNCE_MS = 350;
const MAX_SUGGESTIONS = 5;

const getComponent = (components, types) =>
  components?.find((c) => types.every((t) => c.types.includes(t)))?.long_name;

/**
 * Google Places-backed address input. Lets the address field suggest real,
 * geocodable addresses while typing instead of accepting arbitrary free
 * text — selecting a suggestion always writes back Google's own
 * formatted_address (plus city/state/pincode/coords) rather than whatever
 * partial text the user had typed, so only a verified address string is
 * ever saved.
 */
const AddressAutocompleteInput = ({
  id,
  value,
  onChange,
  onSelect,
  placeholder = "Start typing your address...",
  biasLocation = null,
  className,
}) => {
  const [predictions, setPredictions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");

  const mapsReadyRef = useRef(false);
  const autocompleteServiceRef = useRef(null);
  const geocoderRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const latestRequestRef = useRef(0);
  const containerRef = useRef(null);

  const getSessionToken = useCallback(() => {
    if (!sessionTokenRef.current && window.google?.maps?.places?.AutocompleteSessionToken) {
      sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
    }
    return sessionTokenRef.current;
  }, []);

  const initGooglePlaces = useCallback(async () => {
    if (mapsReadyRef.current) return true;
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setError("Google Maps API key is missing");
      return false;
    }
    try {
      await loadGoogleMaps(apiKey);
      if (!window.google?.maps?.places) {
        setError("Google Places library is unavailable");
        return false;
      }
      autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
      geocoderRef.current = new window.google.maps.Geocoder();
      mapsReadyRef.current = true;
      return true;
    } catch (err) {
      setError(err?.message || "Unable to load Google search");
      return false;
    }
  }, []);

  useEffect(() => {
    const query = (value || "").trim();
    if (!isOpen || query.length < MIN_QUERY_LENGTH) {
      setPredictions([]);
      setIsSearching(false);
      return undefined;
    }

    const timer = setTimeout(async () => {
      const ready = await initGooglePlaces();
      if (!ready || !autocompleteServiceRef.current) return;

      const requestId = latestRequestRef.current + 1;
      latestRequestRef.current = requestId;
      setIsSearching(true);
      setError("");

      const request = {
        input: query,
        types: ["geocode"],
        componentRestrictions: { country: "in" },
        sessionToken: getSessionToken(),
      };
      const lat = Number(biasLocation?.lat);
      const lng = Number(biasLocation?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        request.location = new window.google.maps.LatLng(lat, lng);
        request.radius = 30000;
      }

      autocompleteServiceRef.current.getPlacePredictions(request, (results, status) => {
        if (requestId !== latestRequestRef.current) return;
        setIsSearching(false);
        if (status === window.google.maps.places.PlacesServiceStatus.OK) {
          setPredictions(Array.isArray(results) ? results.slice(0, MAX_SUGGESTIONS) : []);
        } else if (status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          setPredictions([]);
        } else {
          setPredictions([]);
          setError("Address search is temporarily unavailable");
        }
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, isOpen, initGooglePlaces, getSessionToken, biasLocation?.lat, biasLocation?.lng]);

  // Close the suggestion list on outside click.
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const handleSelectPrediction = (prediction) => {
    const geocoder = geocoderRef.current;
    if (!geocoder || !prediction?.place_id) return;

    geocoder.geocode({ placeId: prediction.place_id }, (results, status) => {
      if (status !== "OK" || !results?.[0]) {
        setError("Could not resolve selected address");
        return;
      }
      const result = results[0];
      const geometry = result.geometry?.location;
      const components = result.address_components || [];
      const formattedAddress = result.formatted_address || prediction.description;

      onChange?.(formattedAddress);
      onSelect?.({
        formattedAddress,
        lat: geometry ? geometry.lat() : null,
        lng: geometry ? geometry.lng() : null,
        city: getComponent(components, ["locality"]) || getComponent(components, ["administrative_area_level_2"]) || "",
        state: getComponent(components, ["administrative_area_level_1"]) || "",
        pincode: getComponent(components, ["postal_code"]) || "",
      });

      setPredictions([]);
      setIsOpen(false);
      sessionTokenRef.current = null;
    });
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => {
          onChange?.(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />
      {isOpen && (isSearching || predictions.length > 0 || error) && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
          {isSearching && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching...
            </div>
          )}
          {!isSearching && error && (
            <div className="px-3 py-2 text-xs text-red-500">{error}</div>
          )}
          {!isSearching &&
            predictions.map((prediction) => (
              <button
                type="button"
                key={prediction.place_id}
                onClick={() => handleSelectPrediction(prediction)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50 border-b border-slate-50 last:border-b-0"
              >
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400" />
                <span className="text-slate-700 leading-snug">{prediction.description}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
};

export default AddressAutocompleteInput;
