import mongoose from "mongoose";

const catalogProductSchema = new mongoose.Schema(
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
    description: {
      type: String,
      trim: true,
      default: "",
    },
    brand: {
      type: String,
      trim: true,
      default: "",
    },
    weight: {
      type: String,
      trim: true,
      default: "",
    },
    unit: {
      type: String,
      enum: ["kg", "g", "l", "ml", "piece", "pack", "packet", "other", ""],
      default: "",
      trim: true,
    },
    netQuantity: { type: Number, default: null, min: 0 },
    barcode: { type: String, trim: true, default: "" },
    hsnCode: { type: String, trim: true, default: "" },
    foodType: {
      type: String,
      enum: ["veg", "non_veg", "egg", "non_food", ""],
      default: "",
    },
    // Optional admin-authored notice shown at the end of checkout when a product
    // claimed from this catalogue item is in the cart. Copied onto the seller's
    // Product at claim time.
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
    alternativeNames: [{
      type: String,
      trim: true,
    }],
    localizedNames: [{
      languageCode: { type: String, trim: true, lowercase: true },
      name: { type: String, trim: true },
    }],
    // Lightweight variant templates (e.g. "500g", "1kg", "Red") a seller can
    // use as a starting point when claiming this catalog item — price/stock
    // for each variant are set by the seller at claim time, not stored here.
    variants: [
      {
        name: { type: String, trim: true },
        weight: { type: String, trim: true },
        sku: { type: String, trim: true },
        barcode: { type: String, trim: true, default: "" },
        unit: { type: String, trim: true, default: "" },
        netQuantity: { type: Number, default: null, min: 0 },
      },
    ],
    gstStatus: {
      type: String,
      enum: ["taxable", "exempt", "nil_rated", "non_gst", ""],
      default: "",
    },
    gstSlabOverride: {
      type: Number,
      enum: [0, 5, 12, 18, 28, null],
      default: null,
    },
    isTaxInclusive: { type: Boolean, default: false },
    variableWeight: { type: Boolean, default: false },
    legal: {
      fssaiLicenseNumber: { type: String, trim: true, default: "" },
      fssaiLicenseExpiry: { type: Date, default: null },
      manufactureDate: { type: Date, default: null },
      expiryDate: { type: Date, default: null },
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
    preparationTimeMinutes: { type: Number, default: null, min: 0 },
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
    mainImage: {
      type: String, // Cloudinary URL
      default: "",
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
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    }
  },
  { timestamps: true }
);

// Indexes for fast searching and browsing
catalogProductSchema.index({ status: 1, createdAt: -1 });
catalogProductSchema.index({ categoryId: 1, status: 1 });
catalogProductSchema.index({
  name: "text",
  tags: "text",
  alternativeNames: "text",
  "localizedNames.name": "text",
});

export default mongoose.model("CatalogProduct", catalogProductSchema);
