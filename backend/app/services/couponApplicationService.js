import Coupon from "../models/coupon.js";
import CouponRedemption from "../modules/rewards/models/couponRedemption.model.js";
import Order from "../models/order.js";
import {
  assertSellerCouponCartEligibility,
  getSellerEligibleSubtotal,
  endOfUtcDay,
  startOfUtcDay,
} from "./couponEligibilityService.js";

/**
 * Validate and price exactly one coupon for a cart.
 * Throws Error with statusCode for HTTP mapping.
 */
export async function applySingleCoupon({
  code,
  couponId = null,
  cartTotal = 0,
  items = [],
  customerId = null,
}) {
  const now = new Date();
  let coupon = null;

  if (couponId) {
    coupon = await Coupon.findById(couponId);
  }
  if (!coupon && code) {
    coupon = await Coupon.findOne({ code: String(code).trim().toUpperCase() });
  }

  if (!coupon) {
    const err = new Error("Invalid coupon code");
    err.statusCode = 404;
    throw err;
  }

  const validFrom = coupon.validFrom ? startOfUtcDay(coupon.validFrom) : null;
  const validTill = coupon.validTill ? endOfUtcDay(coupon.validTill) : null;
  if (
    !coupon.isActive ||
    (validFrom && validFrom > now) ||
    (validTill && validTill < now)
  ) {
    const err = new Error("This coupon is not active");
    err.statusCode = 400;
    throw err;
  }

  const issuedTo = coupon.metadata?.issuedToCustomerId;
  if (issuedTo && customerId && String(issuedTo) !== String(customerId)) {
    const err = new Error("This reward voucher is not assigned to your account");
    err.statusCode = 400;
    throw err;
  }

  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    const err = new Error("This coupon has reached its usage limit");
    err.statusCode = 400;
    throw err;
  }

  // One redemption per user by default (schema default is 1)
  const perUserLimit =
    Number.isFinite(Number(coupon.perUserLimit)) && Number(coupon.perUserLimit) > 0
      ? Number(coupon.perUserLimit)
      : 1;

  let userUsageCount = 0;
  let monthlyVolume = 0;

  if (customerId) {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const userOrders = await Order.find({
      customer: customerId,
      createdAt: { $gte: monthStart, $lte: now },
    })
      .select("pricing.total")
      .lean();

    monthlyVolume = userOrders.reduce(
      (sum, o) => sum + (o.pricing?.total || 0),
      0,
    );

    userUsageCount = await CouponRedemption.countDocuments({
      couponId: coupon._id,
      customerId,
    });
  }

  if (userUsageCount >= perUserLimit) {
    const err = new Error(
      perUserLimit === 1
        ? "You have already used this coupon"
        : "You have reached the usage limit for this coupon",
    );
    err.statusCode = 400;
    throw err;
  }

  if (
    coupon.couponType === "monthly_volume" &&
    coupon.monthlyVolumeThreshold &&
    monthlyVolume < coupon.monthlyVolumeThreshold
  ) {
    const err = new Error("This coupon is for high‑volume buyers only");
    err.statusCode = 400;
    throw err;
  }

  if (coupon.minOrderValue && cartTotal < coupon.minOrderValue) {
    const err = new Error(
      `Minimum order value should be ₹${coupon.minOrderValue}`,
    );
    err.statusCode = 400;
    throw err;
  }

  if (coupon.minItems && Array.isArray(items) && items.length < coupon.minItems) {
    const err = new Error(
      `Add at least ${coupon.minItems} items to use this coupon`,
    );
    err.statusCode = 400;
    throw err;
  }

  if (
    coupon.couponType === "category_based" &&
    Array.isArray(coupon.applicableCategories) &&
    coupon.applicableCategories.length > 0
  ) {
    const hasEligibleItem =
      Array.isArray(items) &&
      items.some((i) =>
        coupon.applicableCategories.some(
          (cId) =>
            String(i.categoryId) === String(cId) ||
            String(i.category?._id) === String(cId),
        ),
      );
    if (!hasEligibleItem) {
      const err = new Error("This coupon is valid only on selected categories");
      err.statusCode = 400;
      throw err;
    }
  }

  let eligibleTotal = Number(cartTotal) || 0;
  if (coupon.sponsor === "seller" && coupon.sellerId) {
    const sellerEligibility = assertSellerCouponCartEligibility(coupon, items);
    if (!sellerEligibility.ok) {
      const err = new Error(sellerEligibility.message);
      err.statusCode = 400;
      throw err;
    }

    eligibleTotal = getSellerEligibleSubtotal(coupon, items);
    if (eligibleTotal <= 0) {
      const err = new Error(
        "This coupon is only valid for products from a specific store",
      );
      err.statusCode = 400;
      throw err;
    }
    if (coupon.minOrderValue && eligibleTotal < coupon.minOrderValue) {
      const err = new Error(
        `Minimum order value for this store should be ₹${coupon.minOrderValue}`,
      );
      err.statusCode = 400;
      throw err;
    }
  }

  let discountAmount = 0;
  let freeDelivery = false;

  if (coupon.discountType === "free_delivery") {
    freeDelivery = true;
  } else if (coupon.discountType === "percentage") {
    discountAmount = Math.round((eligibleTotal * coupon.discountValue) / 100);
  } else if (coupon.discountType === "fixed") {
    discountAmount = coupon.discountValue;
  }

  if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
    discountAmount = coupon.maxDiscount;
  }

  if (discountAmount <= 0 && !freeDelivery) {
    const err = new Error(
      "This coupon does not provide any discount on current cart",
    );
    err.statusCode = 400;
    throw err;
  }

  return {
    couponId: coupon._id,
    code: coupon.code,
    discountAmount,
    freeDelivery,
    coupon,
  };
}
