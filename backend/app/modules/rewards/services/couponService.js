import Coupon from "../../../models/coupon.js";
import CouponRedemption from "../models/couponRedemption.model.js";

export async function listCustomerCoupons(customerId) {
  const now = new Date();
  const coupons = await Coupon.find({
    isActive: true,
    validFrom: { $lte: now },
    validTill: { $gte: now },
    sellerId: null,
  })
    .sort({ createdAt: -1 })
    .lean();

  const redemptions = await CouponRedemption.find({ customerId })
    .select("couponId")
    .lean();
  const usedCouponIds = new Set(redemptions.map((r) => String(r.couponId)));

  return coupons.map((coupon) => ({
    ...coupon,
    userUsageCount: [...usedCouponIds].filter((id) => id === String(coupon._id)).length,
    canUse:
      !coupon.perUserLimit ||
      redemptions.filter((r) => String(r.couponId) === String(coupon._id)).length <
        coupon.perUserLimit,
  }));
}

export default {
  listCustomerCoupons,
};
