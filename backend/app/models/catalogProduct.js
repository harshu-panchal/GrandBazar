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
      required: true,
      trim: true,
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
    tags: [{
      type: String,
      trim: true,
    }],
    alternativeNames: [{
      type: String,
      trim: true,
    }],
    mainImage: {
      type: String, // Cloudinary URL
      required: true,
    },
    galleryImages: [{
      type: String, // Array of Cloudinary URLs
    }],
    headerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    subcategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
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
catalogProductSchema.index({ name: "text", tags: "text" });

export default mongoose.model("CatalogProduct", catalogProductSchema);
