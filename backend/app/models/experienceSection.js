import mongoose from "mongoose";

const bannerItemSchema = new mongoose.Schema(
  {
    imageUrl: { type: String, required: true },
    title: { type: String, trim: true },
    subtitle: { type: String, trim: true },
    linkType: {
      type: String,
      enum: ["none", "header", "category", "subcategory", "product", "url"],
      default: "none",
    },
    linkValue: { type: String, trim: true },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { _id: false }
);

const superAdItemSchema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    title: { type: String, trim: true },
    imageUrl: { type: String, required: true },
    linkType: {
      type: String,
      enum: ["none", "header", "category", "subcategory", "product", "url", "store"],
      default: "store",
    },
    linkValue: { type: String, trim: true },
    priority: { type: Number, default: 0 },
    // Kept a stable _id (removed the old `_id: false`) so impressions/clicks
    // survive an admin re-saving the section — see updateExperienceSection's
    // preserve-by-id merge step.
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
  },
);

const configSchema = new mongoose.Schema(
  {
    // Banners configuration
    banners: {
      items: [bannerItemSchema],
    },
    // Admin-curated paid-placement ads (Super AD module)
    superAds: {
      items: [superAdItemSchema],
    },
    // Admin-curated shop-card row (section heading uses the top-level `title` field)
    sellerHighlights: {
      sellerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Store" }],
    },
    // Category sections
    categories: {
      maxItems: { type: Number, min: 1 },
      categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
      rows: { type: Number, min: 1 },
    },
    // Subcategory sections
    subcategories: {
      categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
      subcategoryIds: [
        { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
      ],
      rows: { type: Number, min: 1 },
    },
    // Product sections
    products: {
      categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
      subcategoryIds: [
        { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
      ],
      productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
      rows: { type: Number, min: 1 },
      columns: { type: Number, min: 1 },
      singleRowScrollable: { type: Boolean, default: false },
    },
  },
  { _id: false }
);

const experienceSectionSchema = new mongoose.Schema(
  {
    pageType: {
      type: String,
      enum: ["home", "header"],
      required: true,
    },
    headerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    displayType: {
      type: String,
      enum: ["banners", "categories", "subcategories", "products", "super_ads", "seller_highlights"],
      required: true,
    },
    title: {
      type: String,
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    config: configSchema,
  },
  { timestamps: true }
);

experienceSectionSchema.index({ pageType: 1, headerId: 1, order: 1 });

export default mongoose.model("ExperienceSection", experienceSectionSchema);

