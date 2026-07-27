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

export const listCoupons = async (req, res) => {
  try {
    const { status, search, sellerIds } = req.query;
    const query = {};

    if (status === "active") {
      const now = new Date();
      // Include coupons whose validTill is the same calendar day (stored as midnight).
      const activeDayStart = startOfUtcDay(now);
      query.isActive = true;
      query.validFrom = { $lte: now };
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

    const coupons = await Coupon.find(query)
      .populate("sellerId", "shopName")
      .sort({ createdAt: -1 })
      .lean();
    return handleResponse(res, 200, "Coupons fetched successfully", coupons);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

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
