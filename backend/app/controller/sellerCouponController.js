import Coupon from "../models/coupon.js";
import mongoose from "mongoose";

// Create a new seller coupon
export const createSellerCoupon = async (req, res) => {
    try {
        const sellerId = req.user.id || req.user._id;
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

        // Check if code exists for this seller
        const existing = await Coupon.findOne({
            code: code.toUpperCase(),
            sellerId
        });

        if (existing) {
            return res.status(400).json({
                success: false,
                message: "A coupon with this code already exists for your store",
            });
        }

        const coupon = await Coupon.create({
            code: code.toUpperCase(),
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
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get all coupons for a seller
export const getSellerCoupons = async (req, res) => {
    try {
        const sellerId = req.user.id || req.user._id;
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
        const sellerId = req.user.id || req.user._id;
        const couponId = req.params.id;

        const coupon = await Coupon.findOneAndUpdate(
            { _id: couponId, sellerId },
            req.body,
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
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete a seller coupon
export const deleteSellerCoupon = async (req, res) => {
    try {
        const sellerId = req.user.id || req.user._id;
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
