/**
 * Timezone-safe scheduling helpers (store timezone = Asia/Kolkata by default).
 */

export function parseTimeToMinutes(timeStr) {
  const [h, m] = String(timeStr || "00:00").split(":").map((v) => parseInt(v, 10) || 0);
  return h * 60 + m;
}

export function startOfDayUtc(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function addDaysUtc(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function combineDateAndWindowStart(deliveryDate, windowStart) {
  const base = startOfDayUtc(deliveryDate);
  const minutes = parseTimeToMinutes(windowStart);
  base.setUTCMinutes(minutes);
  return base;
}

export function combineDateAndWindowEnd(deliveryDate, windowEnd) {
  const base = startOfDayUtc(deliveryDate);
  const minutes = parseTimeToMinutes(windowEnd);
  base.setUTCMinutes(minutes);
  return base;
}

export function computeCutoffAt(deliveryDate, windowStart, cutoffDays = 1) {
  const slotStart = combineDateAndWindowStart(deliveryDate, windowStart);
  return addDaysUtc(slotStart, -cutoffDays);
}

export function computeActivationAt(deliveryDate, windowStart, leadMs) {
  const slotStart = combineDateAndWindowStart(deliveryDate, windowStart);
  return new Date(slotStart.getTime() - leadMs);
}

export function isPastCutoff(now, cutoffAt) {
  if (!cutoffAt) return false;
  return new Date(now).getTime() >= new Date(cutoffAt).getTime();
}

export function isDateWithinRange(date, startDate, endDate) {
  const t = startOfDayUtc(date).getTime();
  const s = startOfDayUtc(startDate).getTime();
  const e = startOfDayUtc(endDate).getTime();
  return t >= s && t <= e;
}

export function daysBetweenUtc(fromDate, toDate) {
  const a = startOfDayUtc(fromDate).getTime();
  const b = startOfDayUtc(toDate).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export function formatDeliveryDateKey(date) {
  const d = startOfDayUtc(date);
  return d.toISOString().slice(0, 10);
}
