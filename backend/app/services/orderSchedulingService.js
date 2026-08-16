import Order from "../models/order.js";
import Store from "../models/store.js";
import {
  DEFAULT_ACTIVATION_LEAD_MS,
  DEFAULT_SCHEDULED_SELLER_TIMEOUT_MS,
  DEFAULT_STORE_TIMEZONE,
  FULFILLMENT_TYPE,
  WORKFLOW_STATUS,
} from "../constants/orderWorkflow.js";
import {
  combineDateAndWindowEnd,
  combineDateAndWindowStart,
  computeActivationAt,
  computeCutoffAt,
  daysBetweenUtc,
  formatDeliveryDateKey,
  isDateWithinRange,
  isPastCutoff,
  startOfDayUtc,
} from "../utils/scheduleDateUtils.js";
import {
  orderActivationQueue,
  JOB_NAMES,
} from "../queues/orderQueues.js";

const DEFAULT_WINDOWS = [
  { label: "9 AM - 12 PM", start: "09:00", end: "12:00", capacityPerDay: 50, enabled: true },
  { label: "12 PM - 3 PM", start: "12:00", end: "15:00", capacityPerDay: 50, enabled: true },
  { label: "3 PM - 6 PM", start: "15:00", end: "18:00", capacityPerDay: 50, enabled: true },
  { label: "6 PM - 9 PM", start: "18:00", end: "21:00", capacityPerDay: 50, enabled: true },
];

export function resolveStoreSchedulingSettings(store) {
  const settings = store?.schedulingSettings || {};
  const windows =
    Array.isArray(settings.deliveryWindows) && settings.deliveryWindows.length > 0
      ? settings.deliveryWindows.filter((w) => w.enabled !== false)
      : DEFAULT_WINDOWS;
  // Default ON unless seller explicitly disabled scheduling.
  const enabled =
    settings.enabled === false || settings.enabled === "false"
      ? false
      : true;
  return {
    enabled,
    maxDaysAhead: Math.max(1, Number(settings.maxDaysAhead || 30)),
    rescheduleCutoffDays: Math.max(0, Number(settings.rescheduleCutoffDays ?? 1)),
    selfLogistics: settings.selfLogistics === true,
    deliveryWindows: windows,
    timezone: store?.timezone || DEFAULT_STORE_TIMEZONE(),
  };
}

export function findWindowByLabel(settings, windowLabel) {
  return (settings.deliveryWindows || []).find(
    (w) => String(w.label).trim() === String(windowLabel).trim(),
  );
}

export async function countOrdersForWindow({ sellerId, deliveryDate, windowLabel }) {
  const dayStart = startOfDayUtc(deliveryDate);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  return Order.countDocuments({
    seller: sellerId,
    fulfillmentType: { $in: [FULFILLMENT_TYPE.SCHEDULED, FULFILLMENT_TYPE.PREORDER] },
    workflowStatus: {
      $nin: [WORKFLOW_STATUS.CANCELLED],
    },
    status: { $ne: "cancelled" },
    "schedule.deliveryDate": { $gte: dayStart, $lt: dayEnd },
    "schedule.windowLabel": windowLabel,
  });
}

export async function validateScheduleSelection({
  sellerId,
  deliveryDate,
  windowLabel,
  fulfillmentType = FULFILLMENT_TYPE.SCHEDULED,
  campaign = null,
  now = new Date(),
  checkRescheduleCutoff = false,
}) {
  const store = await Store.findById(sellerId).lean();
  if (!store) {
    const err = new Error("Store not found");
    err.statusCode = 404;
    throw err;
  }

  const settings = resolveStoreSchedulingSettings(store);
  if (fulfillmentType === FULFILLMENT_TYPE.SCHEDULED && !settings.enabled) {
    const err = new Error("Scheduling is not enabled for this store");
    err.statusCode = 400;
    throw err;
  }

  const delivery = new Date(deliveryDate);
  if (Number.isNaN(delivery.getTime())) {
    const err = new Error("Invalid delivery date");
    err.statusCode = 400;
    throw err;
  }

  const maxDate = startOfDayUtc(now);
  maxDate.setUTCDate(maxDate.getUTCDate() + settings.maxDaysAhead);
  if (delivery < startOfDayUtc(now) && fulfillmentType !== FULFILLMENT_TYPE.PREORDER) {
    const err = new Error("Delivery date cannot be in the past");
    err.statusCode = 400;
    throw err;
  }
  if (delivery > maxDate && !campaign) {
    const err = new Error(`Delivery date cannot be more than ${settings.maxDaysAhead} days ahead`);
    err.statusCode = 400;
    throw err;
  }

  if (campaign) {
    if (
      !isDateWithinRange(
        delivery,
        campaign.deliveryWindow?.startDate,
        campaign.deliveryWindow?.endDate,
      )
    ) {
      const err = new Error("Delivery date must be within campaign delivery window");
      err.statusCode = 400;
      throw err;
    }

    if (campaign.maxAdvanceBookingDays != null) {
      const campaignMaxDate = startOfDayUtc(now);
      campaignMaxDate.setUTCDate(campaignMaxDate.getUTCDate() + campaign.maxAdvanceBookingDays);
      if (delivery > campaignMaxDate) {
        const err = new Error(
          `Delivery date cannot be more than ${campaign.maxAdvanceBookingDays} days ahead for this campaign`,
        );
        err.statusCode = 400;
        throw err;
      }
    }
  }

  const windows =
    campaign?.deliveryWindows?.length > 0
      ? campaign.deliveryWindows.filter((w) => w.enabled !== false)
      : settings.deliveryWindows;
  const window = windows.find((w) => String(w.label).trim() === String(windowLabel).trim());
  if (!window) {
    const err = new Error("Invalid delivery window");
    err.statusCode = 400;
    throw err;
  }

  const slotStart = combineDateAndWindowStart(delivery, window.start, settings.timezone);
  const slotEnd = combineDateAndWindowEnd(delivery, window.end, settings.timezone);
  // New bookings: allow any window that has not ended yet.
  if (
    fulfillmentType !== FULFILLMENT_TYPE.PREORDER &&
    now.getTime() >= slotEnd.getTime()
  ) {
    const err = new Error("Selected slot has already ended");
    err.statusCode = 400;
    throw err;
  }

  const cutoffDays =
    campaign?.rescheduleCutoffDays != null
      ? campaign.rescheduleCutoffDays
      : settings.rescheduleCutoffDays;
  const cutoffAt = computeCutoffAt(delivery, window.start, cutoffDays, settings.timezone);
  // Reschedule/cancel cutoff applies only when changing an existing order.
  if (
    checkRescheduleCutoff &&
    isPastCutoff(now, cutoffAt) &&
    fulfillmentType !== FULFILLMENT_TYPE.PREORDER
  ) {
    const err = new Error("Selected slot is past the reschedule/cancel cutoff");
    err.statusCode = 400;
    throw err;
  }

  const capacity = Number(window.capacityPerDay || 50);
  const booked = await countOrdersForWindow({ sellerId, deliveryDate: delivery, windowLabel });
  if (booked >= capacity) {
    const err = new Error("Selected delivery window is fully booked");
    err.statusCode = 409;
    throw err;
  }

  const activationAt = computeActivationAt(
    delivery,
    window.start,
    DEFAULT_ACTIVATION_LEAD_MS(),
    settings.timezone,
  );

  return {
    deliveryDate: startOfDayUtc(delivery),
    windowLabel: window.label,
    windowStart: window.start,
    windowEnd: window.end,
    cutoffAt,
    activationAt,
    timezone: settings.timezone,
    timeSlot: `${formatDeliveryDateKey(delivery)}|${window.label}`,
  };
}

export function buildSchedulePayload(scheduleMeta) {
  return {
    deliveryDate: scheduleMeta.deliveryDate,
    windowLabel: scheduleMeta.windowLabel,
    windowStart: scheduleMeta.windowStart,
    windowEnd: scheduleMeta.windowEnd,
    cutoffAt: scheduleMeta.cutoffAt,
    activationAt: scheduleMeta.activationAt,
    timezone: scheduleMeta.timezone,
  };
}

export function computeSellerPendingExpiry(order, now = new Date()) {
  if (order.fulfillmentType === FULFILLMENT_TYPE.INSTANT) {
    return null;
  }
  // Seller accept window — not schedule.cutoffAt (customer reschedule deadline).
  return new Date(now.getTime() + DEFAULT_SCHEDULED_SELLER_TIMEOUT_MS());
}

export async function scheduleOrderActivationJob(orderId, activationAt) {
  const delay = Math.max(0, new Date(activationAt).getTime() - Date.now());
  const jobId = `order:${orderId}:activate`;
  try {
    const existing = await orderActivationQueue.getJob(jobId);
    if (existing) await existing.remove();
  } catch {
    /* ignore */
  }
  const job = await orderActivationQueue.add(
    JOB_NAMES.ORDER_ACTIVATION,
    { orderId },
    { delay, jobId, removeOnComplete: true },
  );
  return job?.id ? String(job.id) : jobId;
}

export async function removeOrderActivationJob(orderId) {
  const jobId = `order:${orderId}:activate`;
  try {
    const job = await orderActivationQueue.getJob(jobId);
    if (job) await job.remove();
  } catch {
    /* ignore */
  }
}

export function isInstantFulfillment(payload = {}) {
  const ft = payload.fulfillmentType || payload.fulfillment_type;
  if (ft === FULFILLMENT_TYPE.SCHEDULED || ft === FULFILLMENT_TYPE.PREORDER) return false;
  if (payload.deliveryDate && payload.windowLabel) return false;
  if (payload.timeSlot && payload.timeSlot !== "now") return false;
  return true;
}

export function inferFulfillmentType(payload = {}) {
  if (payload.fulfillmentType) return payload.fulfillmentType;
  if (payload.preOrderCampaignId || payload.campaignId) return FULFILLMENT_TYPE.PREORDER;
  if (payload.deliveryDate && payload.windowLabel) return FULFILLMENT_TYPE.SCHEDULED;
  return FULFILLMENT_TYPE.INSTANT;
}

export function describeSchedule(order) {
  if (!order?.schedule?.deliveryDate) return order?.timeSlot || "now";
  const date = formatDeliveryDateKey(order.schedule.deliveryDate);
  return `${date} ${order.schedule.windowLabel || ""}`.trim();
}

export function daysUntilDelivery(order) {
  if (!order?.schedule?.deliveryDate) return 0;
  return daysBetweenUtc(new Date(), order.schedule.deliveryDate);
}

export function windowHasStarted(order, now = new Date()) {
  if (!order?.schedule?.deliveryDate) return true;
  const start = combineDateAndWindowStart(order.schedule.deliveryDate, order.schedule.windowStart);
  return now.getTime() >= start.getTime();
}

export function windowHasEnded(order, now = new Date()) {
  if (!order?.schedule?.deliveryDate) return false;
  const end = combineDateAndWindowEnd(order.schedule.deliveryDate, order.schedule.windowEnd);
  return now.getTime() > end.getTime();
}
