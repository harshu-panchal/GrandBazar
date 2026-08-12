import Coupon from "../models/coupon.js";
import mongoose from "mongoose";
import { normalizeCouponDateInput } from "../services/couponEligibilityService.js";

const normalizeCouponCode = (code = "") =>
  String(code).trim().toUpperCase().replace(/\s+/g, " ");

const VALID_COUPON_TYPES = Coupon.schema.path("couponType").enumValues;

const resolveCouponType = (couponType) =>
  VALID_COUPON_TYPES.includes(couponType) ? couponType : "generic";

const resolveSellerId = (sellerId) => {
  const id = sellerId?.toString?.() || sellerId;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : sellerId;
};

const duplicateCodeMessage = "A coupon with this code already exists for your store";

// Create a new seller coupon
export const createSellerCoupon = async (req, res) => {
    try {
        const sellerId = resolveSellerId(req.user.id || req.user._id);
        const {
            code,
            title,
            description,
            couponType,
            discountType,
            discountValue,
            maxDiscount,
            minOrderValue,
            validFrom,
            validTill,
            isActive
        } = req.body;

        const normalizedCode = normalizeCouponCode(code);
        if (!normalizedCode) {
            return res.status(400).json({
                success: false,
                message: "Coupon code is required",
            });
        }

        const existing = await Coupon.findOne({
            code: normalizedCode,
            sellerId,
        });

        if (existing) {
            return res.status(400).json({
                success: false,
                message: duplicateCodeMessage,
            });
        }

        const coupon = await Coupon.create({
            code: normalizedCode,
            sellerId,
            sponsor: "seller",
            title,
            description,
            discountType,
            discountValue,
            maxDiscount,
            minOrderValue,
            validFrom: normalizeCouponDateInput(validFrom, "start"),
            validTill: normalizeCouponDateInput(validTill, "end"),
            isActive: isActive !== undefined ? isActive : true,
            couponType: resolveCouponType(couponType)
        });

        res.status(201).json({
            success: true,
            message: "Coupon created successfully",
            result: coupon,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: duplicateCodeMessage,
            });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get all coupons for a seller
export const getSellerCoupons = async (req, res) => {
    try {
        const sellerId = resolveSellerId(req.user.id || req.user._id);
        const coupons = await Coupon.find({ sellerId }).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            results: coupons,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Update a seller coupon
export const updateSellerCoupon = async (req, res) => {
    try {
        const sellerId = resolveSellerId(req.user.id || req.user._id);
        const couponId = req.params.id;
        const updates = { ...req.body };

        if (updates.code !== undefined) {
            const normalizedCode = normalizeCouponCode(updates.code);
            if (!normalizedCode) {
                return res.status(400).json({
                    success: false,
                    message: "Coupon code is required",
                });
            }

            const duplicate = await Coupon.findOne({
                _id: { $ne: couponId },
                code: normalizedCode,
                sellerId,
            });

            if (duplicate) {
                return res.status(400).json({
                    success: false,
                    message: duplicateCodeMessage,
                });
            }

            updates.code = normalizedCode;
        }

        if (updates.validFrom) {
            updates.validFrom = normalizeCouponDateInput(updates.validFrom, "start");
        }
        if (updates.validTill) {
            updates.validTill = normalizeCouponDateInput(updates.validTill, "end");
        }

        if (updates.couponType !== undefined) {
            if (!VALID_COUPON_TYPES.includes(updates.couponType)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid coupon type",
                });
            }
        }

        const coupon = await Coupon.findOneAndUpdate(
            { _id: couponId, sellerId },
            updates,
            { new: true, runValidators: true }
        );

        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: "Coupon not found",
            });
        }

        res.status(200).json({
            success: true,
            message: "Coupon updated successfully",
            result: coupon,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: duplicateCodeMessage,
            });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete a seller coupon
export const deleteSellerCoupon = async (req, res) => {
    try {
        const sellerId = resolveSellerId(req.user.id || req.user._id);
        const couponId = req.params.id;

        const coupon = await Coupon.findOneAndDelete({ _id: couponId, sellerId });

        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: "Coupon not found",
            });
        }

        res.status(200).json({
            success: true,
            message: "Coupon deleted successfully",
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
