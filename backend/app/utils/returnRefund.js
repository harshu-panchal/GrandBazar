function currency(value) {
  return Number(Number(value || 0).toFixed(2));
}

/** Merchandise-only refundable base. Order-level fees are intentionally absent. */
export function calculateReturnedProductAmount(returnItems = []) {
  if (!Array.isArray(returnItems)) return 0;
  return currency(returnItems.reduce((total, item) => {
    const price = Math.max(0, Number(item?.price || 0));
    const quantity = Math.max(0, Number(item?.quantity || 0));
    return total + price * quantity;
  }, 0));
}

export default { calculateReturnedProductAmount };
