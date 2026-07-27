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
  return buildKey("stores", "nearbyWithDistance", `${rLat}:${rLng}`);
}

/**
 * Nearby approved stores within service radius, with distanceKm from customer.
 * @returns {Promise<Array<{ id: string, distanceKm: number }>>}
 */
export async function getNearbySellersWithDistanceForCustomer(lat, lng) {
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
      .map((store) => {
        const coords = store?.location?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return null;
        const [storeLng, storeLat] = coords;
        if (!Number.isFinite(storeLat) || !Number.isFinite(storeLng)) {
          return null;
        }
        const distanceKm = calculateDistance(lat, lng, storeLat, storeLng);
        if (distanceKm > (store.serviceRadius || 5)) return null;
        return {
          id: String(store._id),
          distanceKm: Math.round(distanceKm * 10) / 10,
        };
      })
      .filter(Boolean);
  };

  const nearby = await getOrSet(
    buildNearbySellersKey(lat, lng),
    fetchFn,
    getTTL("nearbySellers"),
  );

  const allowedIds = new Set(
    await filterStoreIdsByOwnerBusinessModel(nearby.map((entry) => entry.id)),
  );

  return nearby.filter((entry) => allowedIds.has(entry.id));
}

export async function getNearbySellerIdsForCustomer(lat, lng) {
  const nearby = await getNearbySellersWithDistanceForCustomer(lat, lng);
  return nearby.map((entry) => entry.id);
}

export async function getNearbySellerDistanceMapForCustomer(lat, lng) {
  const nearby = await getNearbySellersWithDistanceForCustomer(lat, lng);
  return new Map(nearby.map((entry) => [entry.id, entry.distanceKm]));
}
