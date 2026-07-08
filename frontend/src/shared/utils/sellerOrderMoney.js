/**
 * Amount the seller actually earns from an order (after commission / per business model).
 * Prefer frozen checkout snapshot on paymentBreakdown.
 */
export function getSellerOrderPayout(order) {
  if (!order) return 0;

  const fromBreakdown = Number(order.paymentBreakdown?.sellerPayoutTotal);
  if (Number.isFinite(fromBreakdown) && fromBreakdown >= 0) {
    return fromBreakdown;
  }

  const fromPricing = Number(
    order.pricing?.sellerPayout ?? order.pricing?.sellerPayoutTotal,
  );
  if (Number.isFinite(fromPricing) && fromPricing >= 0) {
    return fromPricing;
  }

  const productSubtotal = Number(
    order.paymentBreakdown?.productSubtotal ?? order.pricing?.subtotal,
  );
  if (Number.isFinite(productSubtotal) && productSubtotal > 0) {
    return productSubtotal;
  }

  return 0;
}

export function getCustomerOrderTotal(order) {
  if (!order) return 0;
  const total = Number(
    order.paymentBreakdown?.grandTotal ??
      order.pricing?.total ??
      order.total ??
      0,
  );
  return Number.isFinite(total) ? total : 0;
}

export function formatInr(amount) {
  return Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
