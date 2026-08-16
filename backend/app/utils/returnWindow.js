// Shared post-delivery time-window logic for returns/refunds AND complaints
// (disputes). Both share the same admin-configurable window on purpose —
// the checklist requirement (and the customer-facing countdown UI) treats
// "refund and complaint options available within N hours of delivery" as
// one window, not two independently configurable ones. Extracted out of
// orderController.js so disputeService.js can reuse it without a
// service -> controller import.

function parsePositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return fallback;
}

export function getReturnEligibilityDelayMinutes() {
  return parsePositiveInt(process.env.RETURN_ELIGIBILITY_DELAY_MINUTES, 0);
}

export function getReturnWindowMinutes(customHours = null) {
  if (customHours && typeof customHours === "number" && customHours > 0) {
    return customHours * 60;
  }
  return parsePositiveInt(process.env.RETURN_WINDOW_MINUTES, 1440); // 24 hours default (1440 mins)
}

/**
 * @param {object} order - Mongoose Order document (or lean object) with
 *   deliveredAt/createdAt and optional returnEligibleAt/returnWindowExpiresAt.
 * @param {number|null} customHours - category or platform override, in hours.
 */
export function computeReturnWindowForOrder(order, customHours = null) {
  const base = order?.deliveredAt || order?.createdAt || new Date();
  const deliveredAt = base instanceof Date ? base : new Date(base);
  const eligibleDelay = getReturnEligibilityDelayMinutes();
  const windowMinutes = getReturnWindowMinutes(customHours);
  const eligibleAt = order?.returnEligibleAt || new Date(deliveredAt.getTime() + eligibleDelay * 60 * 1000);
  let windowExpiresAt = order?.returnWindowExpiresAt || new Date(deliveredAt.getTime() + windowMinutes * 60 * 1000);
  if (windowExpiresAt < eligibleAt) {
    windowExpiresAt = eligibleAt;
  }

  return {
    eligibleAt,
    windowExpiresAt,
    eligibleDelay,
    windowMinutes,
  };
}

/**
 * Resolves the same category-refund-override precedence requestReturn()
 * already uses, so a complaint on the same order respects the same
 * category-level policy (e.g. a category with a shorter/disabled return
 * window applies the same way to complaints).
 */
export async function resolveCategoryWindowOverrideHours(productIds = []) {
  const ids = Array.from(new Set((productIds || []).filter(Boolean).map(String)));
  if (!ids.length) return { overrideHours: null, ineligibleProductName: null };

  const [{ default: Product }, { default: Category }] = await Promise.all([
    import("../models/product.js"),
    import("../models/category.js"),
  ]);

  const products = await Product.find({ _id: { $in: ids } })
    .select("_id name categoryId")
    .lean();
  const categoryIds = Array.from(
    new Set(products.map((p) => String(p.categoryId || "")).filter(Boolean)),
  );
  if (!categoryIds.length) return { overrideHours: null, ineligibleProductName: null };

  const categories = await Category.find({ _id: { $in: categoryIds } })
    .select("_id name returnEligible refundWindowHours")
    .lean();
  const categoryById = new Map(categories.map((c) => [String(c._id), c]));

  const ineligibleProduct = products.find((p) => {
    const cat = categoryById.get(String(p.categoryId || ""));
    return cat && cat.returnEligible === false;
  });

  const configuredWindows = categories
    .map((c) => c.refundWindowHours)
    // Number(null) is 0, not NaN — without this null/undefined check a
    // category that was explicitly saved with no window configured (as
    // opposed to a genuine 0-hour window) would incorrectly win as the
    // strictest override via Math.min below, effectively disabling returns
    // for every product in that category instead of falling back to the
    // platform default.
    .filter((hours) => hours !== null && hours !== undefined)
    .map((hours) => Number(hours))
    .filter((hours) => Number.isFinite(hours) && hours >= 0);
  const overrideHours = configuredWindows.length > 0 ? Math.min(...configuredWindows) : null;

  return { overrideHours, ineligibleProductName: ineligibleProduct?.name || null };
}
