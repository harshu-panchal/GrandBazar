import mongoose from "mongoose";

const cartSchema = new mongoose.Schema(
    {
        customerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
        },
        items: [
            {
                productId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Product",
                    required: true,
                },
                // Distinguish product variants inside the cart.
                // We use variant SKU because Product.variants includes a sku field.
                // Empty string / null means "base product" (no variant selected).
                variantSku: {
                    type: String,
                    default: "",
                    trim: true,
                },
                quantity: {
                    type: Number,
                    required: true,
                    min: 1,
                    default: 1,
                },
                // Set when this line was added while a Pre-Order Campaign was
                // active for the product (see preOrderCampaignService.js). Resolved
                // and persisted server-side in cartController.addToCart — never
                // trust a client-supplied value for this field. Drives the Cart
                // page's "Scheduling Page" mode and is forwarded into order
                // placement so the order gets tied back to the campaign.
                campaignId: {
                    type: String,
                    default: null,
                },
                // Denormalized at add-time so the cart can render/validate without
                // always re-joining Product (price may drift after the item was added).
                priceSnapshot: {
                    type: Number,
                    default: null,
                },
                sellerId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Seller",
                    default: null,
                },
            },
        ],
    },
    { timestamps: true }
);

const Cart = mongoose.model("Cart", cartSchema);
export default Cart;
