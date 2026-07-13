import Store from "../models/store.js";
import { getPlatformDeliveryProvider } from "./finance/financeSettingsService.js";
import { distanceMeters } from "../utils/geoUtils.js";
import {
  DEFAULT_AVAILABILITY,
  DEFAULT_DELIVERY_POLICY,
  FULFILLMENT_METHOD,
  fulfillmentMethodToLogisticsMode,
} from "../constants/deliveryPolicy.js";
import { DEFAULT_STORE_TIMEZONE } from "../constants/orderWorkflow.js";

function parseTimeToMinutes(timeStr) {
  const [h, m] = String(timeStr || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function getZonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  );
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dayOfWeek: dayMap[parts.weekday] ?? 0,
    minutes: parseTimeToMinutes(`${parts.hour}:${parts.minute}`),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export function resolveStoreDeliveryPolicy(store) {
  const raw = store?.deliveryPolicy || {};
  const scheduling = store?.schedulingSettings || {};

  const policy = {
    ...DEFAULT_DELIVERY_POLICY,
    customerPickup: Boolean(raw.customerPickup),
    sellerDelivery: Boolean(raw.sellerDelivery ?? scheduling.selfLogistics),
    platformLogistics: raw.platformLogistics !== false,
    autoSwitchToPlatform: Boolean(raw.autoSwitchToPlatform),
    platformLogisticsEnabledByAdmin: raw.platformLogisticsEnabledByAdmin !== false,
    sameDayCutoffTime: raw.sameDayCutoffTime || DEFAULT_DELIVERY_POLICY.sameDayCutoffTime,
  };

  if (policy.platformLogisticsEnabledByAdmin === false) {
    policy.platformLogistics = false;
  }

  return policy;
}

export function resolveStoreAvailability(store) {
  const raw = store?.availability || {};
  return {
    ...DEFAULT_AVAILABILITY,
    workingDays: Array.isArray(raw.workingDays)
      ? raw.workingDays
      : DEFAULT_AVAILABILITY.workingDays,
    openTime: raw.openTime || DEFAULT_AVAILABILITY.openTime,
    closeTime: raw.closeTime || DEFAULT_AVAILABILITY.closeTime,
    weeklyOff: Array.isArray(raw.weeklyOff) ? raw.weeklyOff : [],
    holidays: Array.isArray(raw.holidays) ? raw.holidays : [],
    vacation: { ...DEFAULT_AVAILABILITY.vacation, ...(raw.vacation || {}) },
    temporaryClosure: {
      ...DEFAULT_AVAILABILITY.temporaryClosure,
      ...(raw.temporaryClosure || {}),
    },
  };
}

export function isStoreOperationallyOpen(store, now = new Date()) {
  if (!store?.isActive || !store?.isVerified) {
    return { open: false, reason: "store_inactive" };
  }

  const availability = resolveStoreAvailability(store);
  const tz = store.timezone || DEFAULT_STORE_TIMEZONE();
  const zoned = getZonedParts(now, tz);

  if (availability.temporaryClosure?.active) {
    const restoreAt = availability.temporaryClosure.restoreAt
      ? new Date(availability.temporaryClosure.restoreAt)
      : null;
    if (restoreAt && now >= restoreAt) {
      return { open: true, autoRestored: true };
    }
    return {
      open: false,
      reason: availability.temporaryClosure.reason || "temporary_closure",
      message: availability.temporaryClosure.message || "Shop is temporarily closed",
    };
  }

  if (availability.vacation?.active) {
    const start = availability.vacation.startAt
      ? new Date(availability.vacation.startAt)
      : null;
    const end = availability.vacation.endAt
      ? new Date(availability.vacation.endAt)
      : null;
    if ((!start || now >= start) && (!end || now <= end)) {
      return {
        open: false,
        reason: "vacation",
        message: availability.vacation.message || "Shop is on vacation",
      };
    }
  }

  if (availability.holidays.includes(zoned.dateKey)) {
    return { open: false, reason: "holiday", message: "Shop is closed for a holiday" };
  }

  if (availability.weeklyOff.includes(zoned.dayOfWeek)) {
    return { open: false, reason: "weekly_off", message: "Shop is closed today" };
  }

  if (!availability.workingDays.includes(zoned.dayOfWeek)) {
    return { open: false, reason: "non_working_day", message: "Shop is not open today" };
  }

  const openMin = parseTimeToMinutes(availability.openTime);
  const closeMin = parseTimeToMinutes(availability.closeTime);
  if (zoned.minutes < openMin || zoned.minutes >= closeMin) {
    return { open: false, reason: "outside_hours", message: "Shop is outside business hours" };
  }

  return { open: true };
}

export function isSameDayCutoffPassed(store, now = new Date()) {
  const policy = resolveStoreDeliveryPolicy(store);
  const tz = store.timezone || DEFAULT_STORE_TIMEZONE();
  const zoned = getZonedParts(now, tz);
  const cutoffMin = parseTimeToMinutes(policy.sameDayCutoffTime);
  return zoned.minutes >= cutoffMin;
}

function isWithinServiceRadius(store, customerLocation) {
  if (!customerLocation?.lat || !customerLocation?.lng) return true;
  const coords = store?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return true;

  const [sellerLng, sellerLat] = coords;
  const distanceKm =
    distanceMeters(
      Number(customerLocation.lat),
      Number(customerLocation.lng),
      Number(sellerLat),
      Number(sellerLng),
    ) / 1000;
  const radius = Number(store.serviceRadius || 5);
  return distanceKm <= radius;
}

/**
 * Build available fulfillment methods for a store at checkout time.
 */
export async function resolveDeliveryOptions({
  store,
  customerLocation = null,
  fulfillmentType = "instant",
  now = new Date(),
}) {
  if (!store) {
    const err = new Error("Store not found");
    err.statusCode = 404;
    throw err;
  }

  const platformProvider = await getPlatformDeliveryProvider();
  const policy = resolveStoreDeliveryPolicy(store);

  const operational = isStoreOperationallyOpen(store, now);
  const withinRadius =
    fulfillmentType === "instant"
      ? isWithinServiceRadius(store, customerLocation)
      : true;

  const options = [];
  const blockers = [];

  if (!operational.open) {
    blockers.push({
      code: operational.reason,
      message: operational.message,
    });
  }

  if (policy.customerPickup) {
    const available = operational.open;
    options.push({
      method: FULFILLMENT_METHOD.CUSTOMER_PICKUP,
      label: "Store Pickup",
      available,
      deliveryFee: 0,
      estimatedMinutes: null,
      reason: available ? null : operational.message,
    });
  }

  if (policy.sellerDelivery) {
    const sameDayBlocked =
      fulfillmentType === "instant" && isSameDayCutoffPassed(store, now);
    const available =
      operational.open && withinRadius && !sameDayBlocked;
    options.push({
      method: FULFILLMENT_METHOD.SELLER_DELIVERY,
      label: "Seller Delivery",
      available,
      deliveryFee: null,
      estimatedMinutes: 45,
      reason: !operational.open
        ? operational.message
        : !withinRadius
          ? "Outside delivery radius"
          : sameDayBlocked
            ? "Same-day cutoff passed"
            : null,
    });
  }

  if (policy.platformLogistics) {
    const sameDayBlocked =
      fulfillmentType === "instant" && isSameDayCutoffPassed(store, now);
    const available =
      operational.open && withinRadius && !sameDayBlocked;
    options.push({
      method: FULFILLMENT_METHOD.PLATFORM_LOGISTICS,
      label: platformProvider === "external" ? "Platform Delivery" : "Platform Delivery",
      description:
        platformProvider === "external"
          ? "Delivered via platform courier partners"
          : "Fast delivery via platform riders",
      available,
      deliveryFee: null,
      estimatedMinutes: platformProvider === "external" ? 60 : 30,
      reason: !operational.open
        ? operational.message
        : !withinRadius
          ? "Outside delivery radius"
          : sameDayBlocked
            ? "Same-day cutoff passed"
            : null,
    });
  }

  const availableOptions = options.filter((o) => o.available);

  return {
    storeId: String(store._id),
    shopName: store.shopName,
    operational,
    withinRadius,
    platformProvider,
    policy: {
      customerPickup: policy.customerPickup,
      sellerDelivery: policy.sellerDelivery,
      platformLogistics: policy.platformLogistics,
      autoSwitchToPlatform: policy.autoSwitchToPlatform,
      sameDayCutoffTime: policy.sameDayCutoffTime,
    },
    options,
    availableMethods: availableOptions.map((o) => o.method),
    hasAnyOption: availableOptions.length > 0,
  };
}

/**
 * Validate and resolve the fulfillment method chosen at checkout.
 */
export async function resolveChosenFulfillmentMethod({
  store,
  requestedMethod,
  customerLocation = null,
  fulfillmentType = "instant",
  now = new Date(),
}) {
  const resolved = await resolveDeliveryOptions({
    store,
    customerLocation,
    fulfillmentType,
    now,
  });

  if (!resolved.hasAnyOption) {
    const err = new Error(
      resolved.operational?.message ||
        "No delivery options available for this shop",
    );
    err.statusCode = 400;
    err.code = "NO_DELIVERY_OPTION";
    throw err;
  }

  const method =
    requestedMethod && resolved.availableMethods.includes(requestedMethod)
      ? requestedMethod
      : resolved.availableMethods[0];

  if (!method) {
    const err = new Error("Selected fulfillment method is not available");
    err.statusCode = 400;
    throw err;
  }

  return {
    fulfillmentMethod: method,
    logisticsMode: fulfillmentMethodToLogisticsMode(
      method,
      resolved.platformProvider,
    ),
    deliveryOptions: resolved,
  };
}

/**
 * At seller accept time: auto-switch seller delivery to platform if seller unavailable.
 */
export async function resolveFulfillmentAtSellerAccept(order, store) {
  const policy = resolveStoreDeliveryPolicy(store);
  const operational = isStoreOperationallyOpen(store);
  const platformProvider = await getPlatformDeliveryProvider();
  let fulfillmentMethod = order.fulfillmentMethod;
  let logisticsMode = order.logisticsMode;
  let autoSwitched = false;
  let switchReason = null;

  if (
    fulfillmentMethod === FULFILLMENT_METHOD.SELLER_DELIVERY &&
    !operational.open
  ) {
    if (policy.autoSwitchToPlatform && policy.platformLogistics) {
      fulfillmentMethod = FULFILLMENT_METHOD.PLATFORM_LOGISTICS;
      logisticsMode = fulfillmentMethodToLogisticsMode(
        fulfillmentMethod,
        platformProvider,
      );
      autoSwitched = true;
      switchReason = operational.reason;
    } else if (policy.customerPickup) {
      fulfillmentMethod = FULFILLMENT_METHOD.CUSTOMER_PICKUP;
      logisticsMode = fulfillmentMethodToLogisticsMode(fulfillmentMethod);
      autoSwitched = true;
      switchReason = "seller_unavailable_pickup_only";
    }
  }

  return { fulfillmentMethod, logisticsMode, autoSwitched, switchReason };
}

export async function loadStoreForDeliveryPolicy(storeId) {
  return Store.findById(storeId).lean();
}
