export const resolveCartItemSellerId = (item) => {
  const seller =
    item?.sellerId?._id ||
    item?.sellerId ||
    item?.seller?._id ||
    item?.seller ||
    item?.product?.sellerId?._id ||
    item?.product?.sellerId ||
    item?.product?.branch?._id ||
    item?.product?.branch ||
    item?.storeId?._id ||
    item?.storeId ||
    item?.store?._id ||
    item?.store ||
    item?.branch?._id ||
    item?.branch ||
    null;

  return seller ? String(seller) : null;
};

export const getCartSellerIds = (cart = []) => {
  const ids = (Array.isArray(cart) ? cart : [])
    .map(resolveCartItemSellerId)
    .filter(Boolean);
  return [...new Set(ids)];
};

export const getSingleCartSellerId = (cart = []) => {
  const ids = getCartSellerIds(cart);
  return ids.length === 1 ? ids[0] : null;
};

export const resolveCouponSellerId = (coupon) => {
  const seller = coupon?.sellerId?._id || coupon?.sellerId || null;
  return seller ? String(seller) : null;
};

export const isSellerCoupon = (coupon) => {
  if (!coupon) return false;
  if (coupon.sponsor === "admin") return false;
  return coupon.sponsor === "seller" || Boolean(resolveCouponSellerId(coupon));
};

export const isPlatformCoupon = (coupon) => !isSellerCoupon(coupon);

export const isSellerCouponEligibleForCart = (coupon, cart = []) => {
  if (!isSellerCoupon(coupon)) return true;

  const couponSellerId = resolveCouponSellerId(coupon);
  if (!couponSellerId) return false;
  if (!Array.isArray(cart) || cart.length === 0) return false;

  // Every cart line must resolve to this seller
  return cart.every((item) => resolveCartItemSellerId(item) === couponSellerId);
};

export const filterCouponsForCart = (coupons = [], cart = []) =>
  (Array.isArray(coupons) ? coupons : []).filter((coupon) =>
    isSellerCouponEligibleForCart(coupon, cart),
  );
