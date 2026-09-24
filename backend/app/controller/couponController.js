import mongoose from "mongoose";
import handleResponse from "../utils/helper.js";
import Coupon from "../models/coupon.js";
import { applySingleCoupon } from "../services/couponApplicationService.js";
import {
  normalizeCouponDateInput,
  startOfUtcDay,
} from "../services/couponEligibilityService.js";

const toObjectIds = (ids = []) =>
  ids
    .map((id) => String(id || "").trim())
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

const buildAndRunCouponQuery = async (req, res, { excludeExhausted = false } = {}) => {
  try {
    const { status, search, sellerIds } = req.query;
    const query = {};

    if (status === "active") {
      const now = new Date();
      // Include coupons whose validTill is on or after the start of today (UTC).
      const activeDayStart = startOfUtcDay(now);
      // Allow coupons whose start date is today in any timezone ahead of UTC (e.g., IST is UTC+5:30)
      const timezoneForwardBuffer = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      query.isActive = true;
      query.validFrom = { $lte: timezoneForwardBuffer };
      query.validTill = { $gte: activeDayStart };
    } else if (status === "expired") {
      query.$or = [{ isActive: false }, { validTill: { $lt: startOfUtcDay(new Date()) } }];
    }

    // Must cast to ObjectId — string $in does not match ObjectId fields in Mongo.
    const requestedSellerIds = toObjectIds(
      String(sellerIds || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    );

    // Customer checkout: platform coupons always + seller coupons for stores in cart
    if (requestedSellerIds.length > 0) {
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { sellerId: null },
            { sellerId: { $exists: false } },
            { sponsor: "admin" },
            { sellerId: { $in: requestedSellerIds } },
          ],
        },
      ];
    }

    if (search) {
      const term = search.trim();
      query.$or = [
        { code: { $regex: term, $options: "i" } },
        { title: { $regex: term, $options: "i" } },
        { description: { $regex: term, $options: "i" } },
      ];
    }

    if (excludeExhausted) {
      // A coupon whose usedCount has reached its usageLimit can no longer be
      // redeemed (see couponUsageService.consumeCouponUsageAtomic) — don't
      // show it to customers at all. usageLimit of 0/null means unlimited.
      query.$expr = {
        $or: [
          { $lte: [{ $ifNull: ["$usageLimit", 0] }, 0] },
          { $lt: [{ $ifNull: ["$usedCount", 0] }, "$usageLimit"] },
        ],
      };
    }

    const coupons = await Coupon.find(query)
      .populate("sellerId", "shopName")
      .sort({ createdAt: -1 })
      .lean();

    // isActive is the admin's manual on/off toggle and is left untouched by usage —
    // isExhausted tells the admin UI a coupon has hit its usage cap even though it's
    // still marked Active, without permanently disabling it (an admin may raise the
    // limit later and expect it to keep working).
    const couponsWithStatus = coupons.map((coupon) => ({
      ...coupon,
      isExhausted: Boolean(coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit),
    }));

    return handleResponse(res, 200, "Coupons fetched successfully", couponsWithStatus);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const listCoupons = (req, res) => buildAndRunCouponQuery(req, res);

export const listAvailableCoupons = (req, res) =>
  buildAndRunCouponQuery(req, res, { excludeExhausted: true });

export const createCoupon = async (req, res) => {
  try {
    const data = { ...req.body };
    if (!data.perUserLimit || Number(data.perUserLimit) < 1) {
      data.perUserLimit = 1;
    }
    if (data.validFrom) data.validFrom = normalizeCouponDateInput(data.validFrom, "start");
    if (data.validTill) data.validTill = normalizeCouponDateInput(data.validTill, "end");
    // Admin-created coupons are always platform coupons unless explicitly marked otherwise
    if (!data.sponsor) data.sponsor = "admin";
    if (data.sponsor === "admin") data.sellerId = null;

    const coupon = await Coupon.create(data);
    return handleResponse(res, 201, "Coupon created successfully", coupon);
  } catch (error) {
    if (error.code === 11000) {
      return handleResponse(res, 400, "Coupon code already exists");
    }
    return handleResponse(res, 500, error.message);
  }
};

export const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const data = { ...req.body };
    if (data.perUserLimit !== undefined) {
      const limit = Number(data.perUserLimit);
      data.perUserLimit = Number.isFinite(limit) && limit >= 1 ? limit : 1;
    }
    if (data.validFrom) data.validFrom = normalizeCouponDateInput(data.validFrom, "start");
    if (data.validTill) data.validTill = normalizeCouponDateInput(data.validTill, "end");

    const coupon = await Coupon.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });
    if (!coupon) {
      return handleResponse(res, 404, "Coupon not found");
    }
    return handleResponse(res, 200, "Coupon updated successfully", coupon);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    await Coupon.findByIdAndDelete(id);
    return handleResponse(res, 200, "Coupon deleted successfully");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Simple validation engine for checkout — only one coupon per apply
export const validateCoupon = async (req, res) => {
  try {
    const { code, cartTotal, items } = req.body;
    const customerId = req.user?.id || req.body.customerId || null;

    if (!code) {
      return handleResponse(res, 400, "Coupon code is required");
    }

    const result = await applySingleCoupon({
      code,
      cartTotal,
      items,
      customerId,
    });

    return handleResponse(res, 200, "Coupon applied", {
      couponId: result.couponId,
      code: result.code,
      discountAmount: result.discountAmount,
      freeDelivery: result.freeDelivery,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
