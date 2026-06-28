import mongoose from "mongoose";

const catalogBundleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    headerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    catalogProductIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "CatalogProduct",
    }],
    description: {
      type: String,
      trim: true,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true },
);

catalogBundleSchema.index({ headerId: 1, isActive: 1 });

export default mongoose.model("CatalogBundle", catalogBundleSchema);
