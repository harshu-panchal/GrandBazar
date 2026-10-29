import { roundCurrency } from "../../utils/money.js";

export function resolveRiderPayoutAmount(order) {
  if (
    !order?.deliveryBoy ||
    order.fulfillmentMethod === "seller_delivery" ||
    order.fulfillmentMethod === "customer_pickup"
  ) {
    return 0;
  }

  const breakdown = order.paymentBreakdown || {};
  const configuredTotal = Number(breakdown.riderPayoutTotal);
  if (Number.isFinite(configuredTotal) && configuredTotal > 0) {
    return roundCurrency(configuredTotal);
  }

  const componentTotal = roundCurrency(
    Number(breakdown.riderPayoutBase || 0) +
      Number(breakdown.riderPayoutDistance || 0) +
      Number(breakdown.riderPayoutBonus || 0) +
      Number(breakdown.riderTipAmount || 0),
  );
  if (componentTotal > 0) return componentTotal;

  const settings = breakdown.snapshots?.deliverySettings || {};
  const configuredBase = Number(settings.riderBasePayout);
  const orderEstimate = Number(order.riderEarnings);
  const basePayout =
    Number.isFinite(configuredBase) && configuredBase > 0
      ? configuredBase
      : Number.isFinite(orderEstimate) && orderEstimate > 0
        ? orderEstimate
        : 30;
  const perKmRaw = Number(settings.deliveryPartnerRatePerKm);
  const perKm = Number.isFinite(perKmRaw) && perKmRaw > 0 ? perKmRaw : 5;
  const baseDistanceRaw = Number(settings.baseDistanceCapacityKm);
  const baseDistance =
    Number.isFinite(baseDistanceRaw) && baseDistanceRaw > 0
      ? baseDistanceRaw
      : 0.5;
  const distance = Number(breakdown.distanceKmActual);
  const distancePayout =
    Number.isFinite(distance) && distance > baseDistance
      ? Math.ceil(distance - baseDistance) * perKm
      : 0;

  return roundCurrency(basePayout + distancePayout + Number(breakdown.riderTipAmount || 0));
}
