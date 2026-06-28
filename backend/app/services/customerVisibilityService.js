import Store from "../models/store.js";
import { calculateDistance } from "../utils/helper.js";
import { buildKey, getOrSet, getTTL } from "./cacheService.js";
import { filterStoreIdsByOwnerBusinessModel } from "./sellerBusinessModelService.js";

const MAX_SELLER_SEARCH_DISTANCE_M = 100000;

export function parseCustomerCoordinates(query = {}) {
  const lat = Number(query.lat);
  const lng = Number(query.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { valid: false, lat: null, lng: null };
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { valid: false, lat: null, lng: null };
  }

  return { valid: true, lat, lng };
}

function buildNearbySellersKey(lat, lng) {
  const rLat = Number(lat).toFixed(4);
  const rLng = Number(lng).toFixed(4);
  return buildKey("stores", "nearby", `${rLat}:${rLng}`);
}

export async function getNearbySellerIdsForCustomer(lat, lng) {
  const fetchFn = async () => {
    const stores = await Store.find({
      isActive: true,
      isVerified: true,
      applicationStatus: "approved",
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [lng, lat],
          },
          $maxDistance: MAX_SELLER_SEARCH_DISTANCE_M,
        },
      },
    })
      .select("_id location serviceRadius")
      .lean();

    return stores
      .filter((store) => {
        const coords = store?.location?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return false;
        const [storeLng, storeLat] = coords;
        if (!Number.isFinite(storeLat) || !Number.isFinite(storeLng)) {
          return false;
        }
        const distanceKm = calculateDistance(lat, lng, storeLat, storeLng);
        return distanceKm <= (store.serviceRadius || 5);
      })
      .map((store) => String(store._id));
  };

  const storeIds = await getOrSet(buildNearbySellersKey(lat, lng), fetchFn, getTTL("nearbySellers"));
  return filterStoreIdsByOwnerBusinessModel(storeIds);
}
