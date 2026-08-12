import mongoose from "mongoose";

// Optional per-product customization layer over Product.addons[] (the
// seller-managed list of which products are addons) — see WS-15 item 243.
// A mapping only needs to exist when an addon's price/requiredness/order
// should differ from the addon product's own listing defaults.
const productAddonMappingSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    addonProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    priceOverride: {
      type: Number,
      default: null,
      min: 0,
    },
    required: {
      type: Boolean,
      default: false,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

productAddonMappingSchema.index({ productId: 1, addonProductId: 1 }, { unique: true });

export default mongoose.model("ProductAddonMapping", productAddonMappingSchema);
