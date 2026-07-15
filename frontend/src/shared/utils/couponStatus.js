export const COUPON_STATUSES = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  EXPIRED: "expired",
};

const endOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

export const isCouponExpired = (coupon, now = new Date()) => {
  if (!coupon?.validTill) return false;
  return endOfDay(coupon.validTill) < now;
};

export const getCouponStatus = (coupon, now = new Date()) => {
  if (isCouponExpired(coupon, now)) return COUPON_STATUSES.EXPIRED;
  if (!coupon?.isActive) return COUPON_STATUSES.INACTIVE;
  return COUPON_STATUSES.ACTIVE;
};

export const getCouponStatusLabel = (status) => {
  switch (status) {
    case COUPON_STATUSES.EXPIRED:
      return "Expired";
    case COUPON_STATUSES.INACTIVE:
      return "Inactive";
    default:
      return "Active";
  }
};

export const getCouponStatusBadgeVariant = (status) => {
  switch (status) {
    case COUPON_STATUSES.EXPIRED:
      return "error";
    case COUPON_STATUSES.INACTIVE:
      return "gray";
    default:
      return "success";
  }
};

export const getCouponStatusClassName = (status) => {
  switch (status) {
    case COUPON_STATUSES.EXPIRED:
      return "bg-red-100 text-red-700";
    case COUPON_STATUSES.INACTIVE:
      return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
    default:
      return "bg-green-100 text-green-700";
  }
};
