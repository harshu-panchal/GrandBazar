/**
 * Timezone-safe scheduling helpers (store timezone = Asia/Kolkata by default).
 */

import { DEFAULT_STORE_TIMEZONE } from "../constants/orderWorkflow.js";

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

/** Minutes to add to a UTC instant to get its wall-clock time in `timeZone` (e.g. +330 for IST). */
function getTimeZoneOffsetMinutes(utcDate, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(utcDate).map((p) => [p.type, p.value]));
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - utcDate.getTime()) / 60000;
}

/**
 * Combines a calendar date (read from its UTC Y/M/D, e.g. from a "YYYY-MM-DD" delivery date)
 * with a minutes-since-midnight wall-clock time *in `timeZone`*, returning the correct UTC
 * instant. Previously this treated window times as UTC clock times instead of store-local
 * ones, so e.g. a "3 PM" (IST) window end was compared against "3 PM UTC" (8:30 PM IST) — a
 * 5.5-hour error that let already-ended slots stay selectable.
 */
function zonedDateAndMinutes(deliveryDate, minutes, timeZone) {
  const d = new Date(deliveryDate);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  // First guess: treat the wall-clock time as if it were already UTC, then correct by the
  // zone's real offset at that instant. Exact for India (no DST); correct in general too,
  // since the offset used is the one in effect at the guessed instant itself.
  const guess = new Date(Date.UTC(y, m, day, hh, mm, 0));
  const offsetMinutes = getTimeZoneOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offsetMinutes * 60000);
}

export function combineDateAndWindowStart(deliveryDate, windowStart, timeZone = DEFAULT_STORE_TIMEZONE()) {
  return zonedDateAndMinutes(deliveryDate, parseTimeToMinutes(windowStart), timeZone);
}

export function combineDateAndWindowEnd(deliveryDate, windowEnd, timeZone = DEFAULT_STORE_TIMEZONE()) {
  return zonedDateAndMinutes(deliveryDate, parseTimeToMinutes(windowEnd), timeZone);
}

export function computeCutoffAt(deliveryDate, windowStart, cutoffDays = 1, timeZone = DEFAULT_STORE_TIMEZONE()) {
  const slotStart = combineDateAndWindowStart(deliveryDate, windowStart, timeZone);
  return addDaysUtc(slotStart, -cutoffDays);
}

export function computeActivationAt(deliveryDate, windowStart, leadMs, timeZone = DEFAULT_STORE_TIMEZONE()) {
  const slotStart = combineDateAndWindowStart(deliveryDate, windowStart, timeZone);
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
