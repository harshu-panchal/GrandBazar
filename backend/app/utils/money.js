/**
 * Finance helpers.
 * Internally compute in paise to avoid floating-point drift.
 */

export function toPaise(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

export function fromPaise(paise) {
  const num = Number(paise || 0);
  if (!Number.isFinite(num)) return 0;
  return Number((num / 100).toFixed(2));
}

export function roundCurrency(value) {
  return fromPaise(toPaise(value));
}

export function addMoney(...values) {
  const totalPaise = values.reduce((sum, value) => sum + toPaise(value), 0);
  return fromPaise(totalPaise);
}

export function subtractMoney(minuend, ...subtrahends) {
  const totalPaise = subtrahends.reduce(
    (sum, value) => sum + toPaise(value),
    toPaise(minuend),
  );
  return fromPaise(totalPaise);
}

export function multiplyMoney(value, multiplier) {
  return fromPaise(toPaise(value) * Number(multiplier || 0));
}

export function percentOf(value, ratePercent) {
  const basePaise = toPaise(value);
  const pct = Number(ratePercent || 0);
  if (!Number.isFinite(pct)) return 0;
  return fromPaise(Math.round((basePaise * pct) / 100));
}

export function clampMoney(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return roundCurrency(Math.min(Math.max(Number(value || 0), min), max));
}

export function ceilKm(valueKm) {
  const num = Number(valueKm || 0);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.ceil(num);
}

/**
 * The price a customer actually pays for one unit, given a base (MRP) price
 * and an optional sale price.
 *
 * A sale price only counts when it is a genuine discount. A sale price that is
 * zero, equal to, or above the base price is ignored rather than charged —
 * otherwise a seller who mis-enters it (sale 100 on a base of 80) would have
 * customers billed MORE than the listed price.
 */
export function effectiveUnitPrice(source = {}) {
  const base = Number(source.price || 0);
  const sale = Number(source.salePrice || 0);
  return sale > 0 && sale < base ? sale : base;
}
