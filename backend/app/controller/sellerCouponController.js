import Coupon from "../models/coupon.js";
import mongoose from "mongoose";

const normalizeCouponCode = (code = "") =>
  String(code).trim().toUpperCase().replace(/\s+/g, " ");

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
            validFrom,
            validTill,
            isActive: isActive !== undefined ? isActive : true,
            couponType: "generic"
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
