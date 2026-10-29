import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        sku: {
            type: String,
            unique: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        price: {
            type: Number,
            default: 0,
            min: 0,
        },
        salePrice: {
            type: Number,
            default: 0,
            min: 0,
        },
        // Denormalized commission-inclusive customer-facing price. Computed
        // from price/salePrice + resolved commission (see
        // finance/customerPriceService.js). null = not yet computed.
        // Display/search/filter/sort only — never authoritative for checkout,
        // which always live-computes via generateOrderPaymentBreakdown.
        customerPrice: {
            type: Number,
            default: null,
            min: 0,
        },
        customerSalePrice: {
            type: Number,
            default: null,
            min: 0,
        },
        customerPriceComputedAt: {
            type: Date,
            default: null,
        },
        stock: {
            type: Number,
            required: true,
            default: 0,
        },
        lowStockAlert: {
            type: Number,
            default: 5,
        },
        // Optional best-before / expiry date (used by inventory "Expiring Soon" analytics)
        expiryDate: {
            type: Date,
            default: null,
        },
        brand: {
            type: String,
            trim: true,
        },
        weight: {
            type: String,
            trim: true,
        },
        unit: {
            type: String,
            enum: ["kg", "g", "l", "ml", "piece", "pack", "packet", "other", ""],
            default: "",
            trim: true,
        },
        netQuantity: {
            type: Number,
            default: null,
            min: 0,
        },
        barcode: {
            type: String,
            trim: true,
            default: "",
        },
        hsnCode: {
            type: String,
            trim: true,
            default: "",
        },
        foodType: {
            type: String,
            enum: ["veg", "non_veg", "egg", "non_food", ""],
            default: "",
        },
        // Snapshot of CatalogProduct.productDisclaimer taken when the seller claims
        // the catalogue item; shown at the end of the customer's checkout.
        productDisclaimer: {
            type: String,
            trim: true,
            default: "",
            maxlength: 1000,
        },
        tags: [{
            type: String,
            trim: true,
        }],
        searchSynonyms: [{
            type: String,
            trim: true,
        }],
        localizedNames: [{
            languageCode: { type: String, trim: true, lowercase: true },
            name: { type: String, trim: true },
        }],
        mainImage: {
            type: String, // Cloudinary URL
        },
        galleryImages: [{
            type: String, // Array of Cloudinary URLs
        }],
        headerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            default: null,
        },
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            default: null,
        },
        subcategoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            default: null,
        },
        sellerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Store",
            required: false,
        },
        catalogProductId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CatalogProduct",
            default: null,
        },
        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active",
        },
        approvalStatus: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "approved",
        },
        approvalRequestedAt: {
            type: Date,
            default: null,
        },
        approvalReviewedAt: {
            type: Date,
            default: null,
        },
        approvalReviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            default: null,
        },
        approvalNote: {
            type: String,
            trim: true,
            default: "",
        },
        lastSubmittedByRole: {
            type: String,
            enum: ["seller", "admin"],
            default: null,
        },
        variants: [
            {
                name: String,
                price: Number,
                salePrice: Number,
                customerPrice: {
                    type: Number,
                    default: null,
                    min: 0,
                },
                customerSalePrice: {
                    type: Number,
                    default: null,
                    min: 0,
                },
                stock: Number,
                sku: String,
                barcode: { type: String, trim: true, default: "" },
                unit: { type: String, trim: true, default: "" },
                netQuantity: { type: Number, default: null, min: 0 },
                applyCommission: {
                    type: Boolean,
                    default: false,
                },
                adminCommissionType: {
                    type: String,
                    enum: ["percentage", "fixed"],
                    default: "percentage",
                },
                adminCommissionValue: {
                    type: Number,
                    default: 0,
                    min: 0,
                },
                adminCommissionFixedRule: {
                    type: String,
                    enum: ["per_qty", "per_item"],
                    default: "per_qty",
                },
            }
        ],
        isFeatured: {
            type: Boolean,
            default: false,
        },
        isSignatureProduct: {
            type: Boolean,
            default: false,
        },
        displayOrder: {
            type: Number,
            default: 0,
            min: 0,
        },
        addons: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
        }],
        importSource: {
            type: String,
            enum: ["manual", "catalog_claim", "bundle_import"],
            default: "manual",
        },
        isPublished: {
            type: Boolean,
            default: true,
        },
        applyCommission: {
            type: Boolean,
            default: false,
        },
        adminCommission: {
            type: Number,
            default: 0,
            min: 0,
        },
        adminCommissionType: {
            type: String,
            enum: ["percentage", "fixed"],
            default: "percentage",
        },
        adminCommissionValue: {
            type: Number,
            default: 0,
            min: 0,
        },
        adminCommissionFixedRule: {
            type: String,
            enum: ["per_qty", "per_item"],
            default: "per_qty",
        },
        avgRating: {
            type: Number,
            default: 0,
            min: 0,
            max: 5,
        },
        reviewCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        gstSlabOverride: {
            type: Number,
            enum: [0, 5, 12, 18, 28, null],
            default: null, // null = inherit gstSlab from category
        },
        packagingCharge: {
            type: Number,
            default: null,
            min: 0,
            // Optional per-product packaging charge, set by the seller (or
            // admin on their behalf). null = not set — checkout falls back to
            // the category-hierarchy packing fee / store packaging charge as
            // before. When set, it wins for this product's line items.
        },
        isPreorderEligible: {
            type: Boolean,
            default: false,
        },
        preorderExpectedDate: {
            type: Date,
            default: null,
        },
        minOrderQuantity: {
            type: Number,
            default: 1,
            min: 1,
        },
        maxOrderQuantity: {
            type: Number,
            default: null,
            min: 1,
        },
        variableWeight: {
            type: Boolean,
            default: false,
        },
        gstStatus: {
            type: String,
            enum: ["taxable", "exempt", "nil_rated", "non_gst", ""],
            default: "",
        },
        // The current checkout flow treats entered prices as tax-exclusive and
        // adds the resolved GST at checkout. Kept explicit for the form/API so
        // that behavior is visible and cannot be accidentally inverted.
        isTaxInclusive: {
            type: Boolean,
            default: false,
        },
        legal: {
            fssaiLicenseNumber: { type: String, trim: true, default: "" },
            fssaiLicenseExpiry: { type: Date, default: null },
            manufactureDate: { type: Date, default: null },
            batchNumber: { type: String, trim: true, default: "" },
            countryOfOrigin: { type: String, trim: true, default: "India" },
            manufacturerPacker: { type: String, trim: true, default: "" },
            storageInstructions: { type: String, trim: true, default: "" },
            ingredients: { type: String, trim: true, default: "" },
            allergens: [{ type: String, trim: true, lowercase: true }],
            ageRestricted: { type: Boolean, default: false },
            prescriptionOnly: { type: Boolean, default: false },
            inheritStoreFssai: { type: Boolean, default: true },
        },
        preparationTimeMinutes: {
            type: Number,
            default: null,
            min: 0,
        },
        dimensions: {
            weightKg: { type: Number, default: null, min: 0 },
            lengthCm: { type: Number, default: null, min: 0 },
            widthCm: { type: Number, default: null, min: 0 },
            heightCm: { type: Number, default: null, min: 0 },
        },
        returnPolicy: {
            type: String,
            enum: ["inherit", "non_returnable", "replace_only", "returnable"],
            default: "inherit",
        },
        handlingFlags: {
            perishable: { type: Boolean, default: false },
            fragile: { type: Boolean, default: false },
            keepCold: { type: Boolean, default: false },
        },
        deliveryOptions: {
            mode: { type: String, enum: ["inherit", "override"], default: "inherit" },
            customerPickup: { type: Boolean, default: false },
            sellerDelivery: { type: Boolean, default: false },
            platformLogistics: { type: Boolean, default: true },
        },
        relatedProducts: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
        }],
        marketingFlag: {
            type: String,
            enum: ["none", "signature", "hot_deal", "best_seller"],
            default: "none",
        },
        commissionOverrideReason: {
            type: String,
            trim: true,
            default: "",
        },
        commissionEffectiveFrom: {
            type: Date,
            default: null,
        },
        availability: {
            dailyStartTime: {
                type: String,
                default: null, // "HH:mm" in store timezone; recurring hidden-window start
            },
            dailyEndTime: {
                type: String,
                default: null, // "HH:mm" in store timezone; recurring hidden-window end
            },
            pausedUntil: {
                type: Date,
                default: null, // absolute instant; product hidden until this time
            },
        },
        isCurrentlyAvailable: {
            type: Boolean,
            default: true, // derived; maintained by productAvailabilityJob, never set directly
        },
        isHidden: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

// Optimize performance for common queries on home/search pages
productSchema.index({ status: 1, isFeatured: 1, createdAt: -1 });
productSchema.index({ status: 1, createdAt: -1, _id: -1 });
productSchema.index({ approvalStatus: 1, status: 1, createdAt: -1 });
productSchema.index({ headerId: 1, status: 1 });
productSchema.index({ categoryId: 1, status: 1 });
productSchema.index({ subcategoryId: 1, status: 1 });
productSchema.index({ sellerId: 1, status: 1 });
productSchema.index({ sellerId: 1, approvalStatus: 1, createdAt: -1 });
productSchema.index({ sellerId: 1, createdAt: -1, _id: -1 });
productSchema.index({ sellerId: 1, displayOrder: 1, createdAt: -1 });
productSchema.index({ sellerId: 1, isPublished: 1, status: 1 });
productSchema.index({ isCurrentlyAvailable: 1, status: 1 });
productSchema.index({ status: 1, customerPrice: 1 });
productSchema.index({
    name: "text",
    tags: "text",
    searchSynonyms: "text",
    "localizedNames.name": "text",
});

export default mongoose.model("Product", productSchema);
