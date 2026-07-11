import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { customerApi } from "../services/customerApi";
import { hasValidStoredAuthToken } from "@core/utils/authStorage";

const LocationContext = createContext(undefined);
// v3 clears the old hardcoded Indore default that was auto-persisted into location_v2.
const STORAGE_KEY = "location_v3";
const LEGACY_STORAGE_KEY = "location_v2";

const UNSET_LOCATION = {
  name: "Select your location",
  time: "",
  city: "",
  state: "",
  pincode: "",
  latitude: null,
  longitude: null,
};

function hasValidCoordinates(location) {
  const lat = location?.latitude;
  const lng = location?.longitude;
  // Number(null) === 0, so null must be rejected explicitly.
  if (lat == null || lng == null || lat === "" || lng === "") return false;
  const latN = Number(lat);
  const lngN = Number(lng);
  return Number.isFinite(latN) && Number.isFinite(lngN);
}

export const LocationProvider = ({ children }) => {
  const [currentLocation, setCurrentLocation] = useState(UNSET_LOCATION);
  const [hasHydratedLocation, setHasHydratedLocation] = useState(false);

  // Address list for drawer UI – will be hydrated from profile API.
  const [savedAddresses, setSavedAddresses] = useState([]);

  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);

  const openLocationPicker = useCallback(() => {
    setIsLocationPickerOpen(true);
  }, []);

  const closeLocationPicker = useCallback(() => {
    setIsLocationPickerOpen(false);
  }, []);

  // Update the current location.
  // By default this does NOT change saved addresses; only explicit
  // address actions should touch the saved list.
  const updateLocation = (
    newLoc,
    { persist = true, updateSavedHome = false } = {},
  ) => {
    setCurrentLocation(newLoc || UNSET_LOCATION);

    if (updateSavedHome && newLoc?.name) {
      setSavedAddresses((prev) =>
        prev.map((addr) =>
          addr.label === "Home" ? { ...addr, address: newLoc.name } : addr,
        ),
      );
    }

    if (persist && typeof window !== "undefined" && hasValidCoordinates(newLoc)) {
      try {
        const payload = {
          address: newLoc.name,
          city: newLoc.city,
          state: newLoc.state,
          pincode: newLoc.pincode,
          latitude: newLoc.latitude,
          longitude: newLoc.longitude,
          // Internal app properties
          time: newLoc.time,
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // ignore storage errors
      }
    }
  };

  const addAddress = (newAddress) => {
    setSavedAddresses((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        label: newAddress.label || "Other",
        address: newAddress.address,
        phone: newAddress.phone || "N/A",
        isCurrent: false,
      },
    ]);
  };

  // Resolve location once using browser geolocation + Google Maps Geocoding.
  // Must be called directly from a user gesture (click/tap) for the browser to show the permission prompt.
  const fetchAndCacheLocation = () =>
    new Promise((resolve) => {
      if (
        typeof window === "undefined" ||
        !("navigator" in window) ||
        !navigator.geolocation
      ) {
        resolve({
          ok: false,
          error: "Geolocation is not supported on this device",
        });
        return;
      }

      setIsFetchingLocation(true);
      setLocationError(null);

      const fallbackFromCoords = (latitude, longitude) => ({
        name: `Lat ${Number(latitude).toFixed(5)}, Lng ${Number(longitude).toFixed(5)}`,
        time: "12-15 mins",
        city: "",
        state: "",
        pincode: "",
        latitude,
        longitude,
      });

      const handleLocationSuccess = async (latitude, longitude) => {
        try {
          // Always succeed with coordinates (needed for delivery fee calculation),
          // even if reverse geocoding fails (key missing / quota / restrictions).
          let liveLocation = fallbackFromCoords(latitude, longitude);

          const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

          if (apiKey) {
            const params = new URLSearchParams({
              latlng: `${latitude},${longitude}`,
              key: apiKey,
            });

            const response = await fetch(
              `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
            );

            if (!response.ok) {
              throw new Error("Failed to fetch address from Google Maps");
            }

            const data = await response.json();

            // Handle Google Geocoding API error responses
            if (data.status === "REQUEST_DENIED") {
              const msg =
                data.error_message ||
                "Geocoding API rejected (check API key restrictions)";
              throw new Error(msg);
            }
            if (data.status === "OVER_QUERY_LIMIT") {
              throw new Error("Geocoding API quota exceeded");
            }
            if (!data.results || data.results.length === 0) {
              throw new Error(
                data.error_message || "No address found for current location",
              );
            }

            const components = data.results[0].address_components || [];

            const getComponent = (types) =>
              components.find((c) => types.every((t) => c.types.includes(t)))
                ?.long_name;

            const premise = getComponent(["premise"]);
            const neighborhood = getComponent(["neighborhood"]);
            const sublocality = getComponent([
              "sublocality_level_1",
              "sublocality",
            ]);
            const locality = getComponent(["locality"]);
            const state = getComponent(["administrative_area_level_1"]);
            const pincode = getComponent(["postal_code"]);
            const country = getComponent(["country"]);

            const displayParts = [];
            if (premise) displayParts.push(premise);
            if (neighborhood) displayParts.push(neighborhood);
            if (sublocality && sublocality !== neighborhood)
              displayParts.push(sublocality);
            if (locality) displayParts.push(locality);

            let statePincode = "";
            if (state) statePincode += state;
            if (pincode) statePincode += (statePincode ? " " : "") + pincode;
            if (statePincode) displayParts.push(statePincode);

            if (country) displayParts.push(country);

            const friendlyName =
              displayParts.join(", ") || data.results[0].formatted_address;

            liveLocation = {
              name: friendlyName,
              time: "12-15 mins",
              city: locality || liveLocation.city,
              state: state || liveLocation.state,
              pincode: pincode || liveLocation.pincode,
              latitude: latitude,
              longitude: longitude,
            };
          }

          updateLocation(liveLocation, {
            persist: true,
            updateSavedHome: false,
          });
          resolve({ ok: true, location: liveLocation });
        } catch (err) {
          const loc = fallbackFromCoords(latitude, longitude);
          updateLocation(loc, { persist: true, updateSavedHome: false });
          resolve({
            ok: true,
            location: loc,
            warning: err?.message || "Unable to fetch address",
          });
        } finally {
          setIsFetchingLocation(false);
        }
      };

      const handleLocationError = (error) => {
        const message =
          typeof error === "string"
            ? error
            : error.message || "Location permission denied";
        setLocationError(message);
        setIsFetchingLocation(false);
        resolve({ ok: false, error: message });
      };

      // Native Flutter Bridge
      if (window.Flutter) {
        import("../../../lib/appZetoBridge")
          .then(async (m) => {
            const AppZetoBridge = m.default;
            const coords = await AppZetoBridge.getLocation();
            if (coords && coords.lat && coords.lng) {
              handleLocationSuccess(coords.lat, coords.lng);
            } else {
              handleLocationError("Native location failed");
            }
          })
          .catch(() => handleLocationError("Bridge not found"));
        return;
      }

      // Standard Browser Geolocation
      navigator.geolocation.getCurrentPosition(
        (position) =>
          handleLocationSuccess(
            position.coords.latitude,
            position.coords.longitude,
          ),
        handleLocationError,
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        },
      );
    });

  const refreshAddresses = useCallback(async () => {
    // Skip if user is not logged in – getProfile would 401 and trigger axios reload loop
    if (!hasValidStoredAuthToken("auth_customer")) return;
    try {
      const { data } = await customerApi.getProfile();
      const profile = data?.result ?? data?.data ?? data;
      const raw = Array.isArray(profile?.addresses) ? profile.addresses : [];
      setSavedAddresses(
        raw.map((addr, idx) => ({
          id: addr._id ?? String(idx),
          label:
            (addr.label || "Home").charAt(0).toUpperCase() +
            (addr.label || "home").slice(1),
          address:
            addr.fullAddress ||
            [addr.landmark, addr.city, addr.state, addr.pincode]
              .filter(Boolean)
              .join(", ") ||
            "",
          city: addr.city || "",
          state: addr.state || "",
          pincode: addr.pincode || "",
          landmark: addr.landmark || "",
          location:
            addr?.location &&
            typeof addr.location.lat === "number" &&
            typeof addr.location.lng === "number" &&
            Number.isFinite(addr.location.lat) &&
            Number.isFinite(addr.location.lng)
              ? { lat: addr.location.lat, lng: addr.location.lng }
              : null,
          placeId: typeof addr?.placeId === "string" ? addr.placeId : null,
          phone: profile?.phone ?? "",
          name: profile?.name ?? "",
          isCurrent: idx === 0,
        })),
      );
    } catch {
      // If API fails, keep existing in-memory addresses.
    }
  }, []);

  // On mount: hydrate saved addresses from profile (only when customer is logged in)
  useEffect(() => {
    refreshAddresses();
  }, [refreshAddresses]);

  // On mount: only restore a previously chosen location. Never seed a fake default.
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const addressName = parsed.address || parsed.name;
        const restored = {
          name: addressName || UNSET_LOCATION.name,
          time: parsed.time || "12-15 mins",
          city: parsed.city || "",
          state: parsed.state || "",
          pincode: parsed.pincode || "",
          latitude: parsed.latitude,
          longitude: parsed.longitude,
        };
        if (hasValidCoordinates(restored) && addressName) {
          updateLocation(restored, { persist: false, updateSavedHome: false });
        }
      }
    } catch {
      // ignore parse errors
    } finally {
      setHasHydratedLocation(true);
    }
    // Live fetch happens only when user taps location pill or "Use current location"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const needsLocationSetup =
    hasHydratedLocation && !hasValidCoordinates(currentLocation);

  // Open picker until location is chosen; force-close once we have valid coords
  // so the blur backdrop never gets stuck after selection.
  useEffect(() => {
    if (!hasHydratedLocation) return;
    if (needsLocationSetup) {
      setIsLocationPickerOpen(true);
    } else {
      setIsLocationPickerOpen(false);
    }
  }, [hasHydratedLocation, needsLocationSetup]);

  const locationValue = useMemo(
    () => ({
      currentLocation,
      savedAddresses,
      updateLocation,
      addAddress,
      refreshAddresses,
      isFetchingLocation,
      locationError,
      refreshLocation: fetchAndCacheLocation,
      needsLocationSetup,
      hasValidLocation: hasValidCoordinates(currentLocation),
      isLocationPickerOpen,
      openLocationPicker,
      closeLocationPicker,
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }),
    [
      currentLocation,
      savedAddresses,
      isFetchingLocation,
      locationError,
      refreshAddresses,
      needsLocationSetup,
      isLocationPickerOpen,
      openLocationPicker,
      closeLocationPicker,
    ],
  );

  return (
    <LocationContext.Provider value={locationValue}>
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error("useLocation must be used within a LocationProvider");
  }
  return context;
};
