import mongoose from "mongoose";

const storeBundleImportSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    bundleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CatalogBundle",
      required: true,
      index: true,
    },
    importedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
    },
    importedCount: {
      type: Number,
      default: 0,
    },
    skippedCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

storeBundleImportSchema.index({ storeId: 1, bundleId: 1 }, { unique: true });

export default mongoose.model("StoreBundleImport", storeBundleImportSchema);
