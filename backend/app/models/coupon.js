import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
        },
        sellerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Seller",
            default: null, // null means it is an Admin/Global coupon
        },
        sponsor: {
            type: String,
            enum: ["admin", "seller"],
            default: "admin",
        },
        title: {
            type: String,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        // How discount is applied on amount
        discountType: {
            type: String,
            enum: ["percentage", "fixed", "free_delivery"],
            default: "percentage",
        },
        discountValue: {
            type: Number,
            required: true,
        },
        maxDiscount: {
            type: Number,
        },
        // High level coupon strategy
        couponType: {
            type: String,
            enum: [
                "bulk_order", // Bulk Order Discount – Extra discount on high-value orders
                "min_order_value", // Minimum Order Value Coupon
                "free_delivery", // Free Delivery Coupon
                "category_based", // Category-Based Coupon
                "monthly_volume", // Monthly Volume Coupon
                "generic", // Plain discount without extra conditions
            ],
            default: "generic",
        },
        // Common conditions
        minOrderValue: {
            type: Number,
            default: 0,
        },
        minItems: {
            type: Number,
            default: 0,
        },
        applicableCategories: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Category",
            },
        ],
        // Monthly volume (for future analytics‑based rules)
        monthlyVolumeThreshold: {
            type: Number,
        },
        usageLimit: {
            type: Number,
        },
        perUserLimit: {
            type: Number,
            default: 1,
        },
        usedCount: {
            type: Number,
            default: 0,
        },
        validFrom: {
            type: Date,
            required: true,
        },
        validTill: {
            type: Date,
            required: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        metadata: {
            type: Object,
        },
    },
    { timestamps: true }
);

// A code must be unique per seller (or globally for admin), so we use a compound index
couponSchema.index({ code: 1, sellerId: 1 }, { unique: true });
couponSchema.index({ isActive: 1, validFrom: 1, validTill: 1 });

export default mongoose.model("Coupon", couponSchema);

