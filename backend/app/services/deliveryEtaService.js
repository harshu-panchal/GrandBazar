import Setting from "../models/setting.js";
import { calculateDistance } from "../utils/helper.js";

const DEFAULT_ETA_SETTINGS = {
  basePrepTimeMinutes: 8,
  minutesPerKm: 4,
  rangeSpreadMinutes: 7,
};

/**
 * One real, admin-configurable delivery-time estimate — replaces the
 * independent hardcoded strings ("8-15 mins", "10-15 mins"...) that used to
 * be scattered across store cards, store detail, and checkout (see WS-16).
 */
export async function getDeliveryEtaSettings() {
  const settings = await Setting.findOne().select("deliveryEta").lean();
  return { ...DEFAULT_ETA_SETTINGS, ...(settings?.deliveryEta || {}) };
}

export function computeEtaFromDistance(distanceKm, etaSettings = DEFAULT_ETA_SETTINGS) {
  const { basePrepTimeMinutes, minutesPerKm, rangeSpreadMinutes } = {
    ...DEFAULT_ETA_SETTINGS,
    ...etaSettings,
  };
  const safeDistanceKm = Math.max(0, Number(distanceKm) || 0);
  const travelMinutes = safeDistanceKm * minutesPerKm;
  const low = Math.max(1, Math.round(basePrepTimeMinutes + travelMinutes));
  const high = Math.max(low + 1, Math.round(low + rangeSpreadMinutes));
  return { low, high, label: `${low}-${high} mins` };
}

export function computeStoreDistanceKm(store, lat, lng) {
  const coords = store?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const [storeLng, storeLat] = coords;
  if (!Number.isFinite(storeLat) || !Number.isFinite(storeLng)) return null;
  return calculateDistance(lat, lng, storeLat, storeLng);
}

/**
 * Single-store convenience wrapper — fetches settings itself. For a list of
 * stores/products, prefer getDeliveryEtaSettings() once + computeEtaFromDistance()
 * per item to avoid N redundant Setting lookups.
 */
export async function estimateDeliveryWindow(store, lat, lng) {
  const etaSettings = await getDeliveryEtaSettings();
  const distanceKm = computeStoreDistanceKm(store, lat, lng);
  return computeEtaFromDistance(distanceKm, etaSettings);
}
