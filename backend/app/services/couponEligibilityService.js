export const startOfUtcDay = (date = new Date()) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

export const endOfUtcDay = (date = new Date()) => {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
};

/** Normalize date-only form values so validity covers the full selected day. */
export const normalizeCouponDateInput = (value, bound = "start") => {
  if (!value) return value;
  const raw = String(value).trim();
  if (!raw) return value;

  // HTML date input: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return bound === "end" ? endOfUtcDay(`${raw}T00:00:00.000Z`) : startOfUtcDay(`${raw}T00:00:00.000Z`);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return value;
  return bound === "end" ? endOfUtcDay(parsed) : startOfUtcDay(parsed);
};

export const resolveSellerIdValue = (seller) => {
  if (!seller) return null;
  if (typeof seller === "object") {
    const id = seller._id || seller.id;
    return id ? String(id) : null;
  }
  return String(seller);
};

const resolveItemSellerId = (item) => {
  return (
    resolveSellerIdValue(item?.sellerId) ||
    resolveSellerIdValue(item?.product?.sellerId) ||
    resolveSellerIdValue(item?.product?.branch) ||
    resolveSellerIdValue(item?.branch) ||
    resolveSellerIdValue(item?.storeId) ||
    resolveSellerIdValue(item?.seller) ||
    resolveSellerIdValue(item?.store) ||
    null
  );
};

export const getCartSellerIds = (items = []) => {
  const ids = (Array.isArray(items) ? items : []).map(resolveItemSellerId).filter(Boolean);
  return [...new Set(ids)];
};

export const isSingleSellerCart = (items = []) =>
  Array.isArray(items) && items.length > 0 && getCartSellerIds(items).length === 1;

export const getSingleCartSellerId = (items = []) => {
  const ids = getCartSellerIds(items);
  return ids.length === 1 ? ids[0] : null;
};

export const assertSellerCouponCartEligibility = (coupon, items = []) => {
  const couponSellerId = resolveSellerIdValue(coupon.sellerId);
  const isSellerScoped = coupon.sponsor === "seller" || Boolean(couponSellerId);

  if (!isSellerScoped) {
    return { ok: true };
  }

  if (!couponSellerId) {
    return {
      ok: false,
      message: "This store coupon is not linked to a store",
    };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return {
      ok: false,
      message: "Add items to cart before applying this store coupon",
    };
  }

  const cartSellerIds = getCartSellerIds(items);
  const allResolved = items.every((item) => Boolean(resolveItemSellerId(item)));

  if (!allResolved || cartSellerIds.length !== 1 || cartSellerIds[0] !== couponSellerId) {
    return {
      ok: false,
      message:
        "This store coupon is valid only when all items in your cart are from the same store",
    };
  }

  return { ok: true, sellerId: couponSellerId };
};

export const getSellerEligibleSubtotal = (coupon, items = []) => {
  const couponSellerId = resolveSellerIdValue(coupon.sellerId);
  let eligibleTotal = 0;

  items.forEach((item) => {
    const itemSellerId = resolveItemSellerId(item);
    if (!couponSellerId || itemSellerId !== couponSellerId) return;

    const price =
      item.product?.salePrice ||
      item.product?.price ||
      item.salePrice ||
      item.price ||
      0;
    eligibleTotal += Number(price) * Number(item.quantity || 1);
  });

  return eligibleTotal;
};
