import mongoose from "mongoose";

export const STOREFRONT_SECTION_LAYOUTS = Object.freeze([
  "carousel",
  "grid",
  "featured",
  "compact_list",
]);

const storefrontSectionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    layout: {
      type: String,
      enum: STOREFRONT_SECTION_LAYOUTS,
      required: true,
    },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
  },
  { _id: true },
);

const storefrontLayoutSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      unique: true,
    },
    draftSections: {
      type: [storefrontSectionSchema],
      default: [],
    },
    publishedSections: {
      type: [storefrontSectionSchema],
      default: [],
    },
    draftRevision: {
      type: Number,
      default: 0,
      min: 0,
    },
    publishedRevision: {
      type: Number,
      default: 0,
      min: 0,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    lastEditedBy: {
      actorType: {
        type: String,
        enum: ["seller", "admin"],
        default: "seller",
      },
      actorId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
    },
  },
  { timestamps: true },
);

export default mongoose.model("StorefrontLayout", storefrontLayoutSchema);
