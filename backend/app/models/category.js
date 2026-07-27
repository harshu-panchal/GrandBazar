import mongoose from "mongoose";
import {
  ALL_COMMISSION_FIXED_RULES,
  ALL_COMMISSION_TYPES,
  ALL_HANDLING_FEE_TYPES,
} from "../constants/finance.js";

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, "URL slug is required"],
      unique: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      trim: true,
    },
    image: {
      type: String, // Cloudinary URL
    },
    iconId: {
      type: String, // SVG icon identifier
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    type: {
      type: String,
      enum: ["header", "category", "subcategory"],
      required: [true, "Category type is required"],
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    applyCommission: {
      type: Boolean,
      default: false,
    },
    adminCommission: {
      type: Number,
      default: 0, // Percentage
    },
    adminCommissionType: {
      type: String,
      enum: ALL_COMMISSION_TYPES,
      default: "percentage",
    },
    adminCommissionValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    adminCommissionFixedRule: {
      type: String,
      enum: ALL_COMMISSION_FIXED_RULES,
      default: "per_qty",
    },
    handlingFees: {
      type: Number,
      default: 0, // Flat amount
    },
    handlingFeeType: {
      type: String,
      enum: ALL_HANDLING_FEE_TYPES,
      default: "fixed",
    },
    handlingFeeValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    packingFees: {
      type: Number,
      default: 0, // Flat amount (category packing)
    },
    packingFeeType: {
      type: String,
      enum: ALL_HANDLING_FEE_TYPES,
      default: "fixed",
    },
    packingFeeValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    headerColor: {
      type: String,
      trim: true, // Hex color selected in admin panel (e.g. #ff0000)
    },
    headerFontColor: {
      type: String,
      trim: true, // Hex color for font (e.g. #ffffff)
    },
    headerIconColor: {
      type: String,
      trim: true, // Hex color for icons (e.g. #ffffff)
    },
    priorityStartTime: {
      type: String,
      trim: true,
      default: null, // format "HH:mm"
    },
    priorityEndTime: {
      type: String,
      trim: true,
      default: null, // format "HH:mm"
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

function normalizeNonNegativeNumber(value) {
  const num = Number(value);
  if (isNaN(num) || !Number.isFinite(num)) return 0;
  return Math.max(num, 0);
}

function getUpdateSet(update) {
  if (!update || typeof update !== "object") return null;
  if (update.$set && typeof update.$set === "object") return update.$set;
  return update;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

categorySchema.pre("save", function syncLegacyFinanceFields(next) {
  try {
    const adminType = this.adminCommissionType || "percentage";
    const handlingType = this.handlingFeeType || "fixed";
    const packingType = this.packingFeeType || "fixed";

    const legacyAdminCommission = normalizeNonNegativeNumber(this.adminCommission);
    const newAdminCommissionValue = normalizeNonNegativeNumber(this.adminCommissionValue);
    const legacyHandlingFees = normalizeNonNegativeNumber(this.handlingFees);
    const newHandlingFeeValue = normalizeNonNegativeNumber(this.handlingFeeValue);
    const legacyPackingFees = normalizeNonNegativeNumber(this.packingFees);
    const newPackingFeeValue = normalizeNonNegativeNumber(this.packingFeeValue);

    const adminCommissionModified = this.isModified("adminCommission");
    const adminCommissionValueModified = this.isModified("adminCommissionValue");
    const handlingFeesModified = this.isModified("handlingFees");
    const handlingFeeValueModified = this.isModified("handlingFeeValue");
    const packingFeesModified = this.isModified("packingFees");
    const packingFeeValueModified = this.isModified("packingFeeValue");

    // Keep legacy + new commission fields in sync.
    if (
      (this.isNew && legacyAdminCommission > 0 && newAdminCommissionValue === 0) ||
      (adminCommissionModified && !adminCommissionValueModified)
    ) {
      this.adminCommissionValue = legacyAdminCommission;
    }
    if (
      (this.isNew && newAdminCommissionValue > 0 && legacyAdminCommission === 0) ||
      (adminCommissionValueModified && !adminCommissionModified)
    ) {
      this.adminCommission = newAdminCommissionValue;
    }

    // Keep legacy + new handling fee fields in sync.
    if (
      (this.isNew && legacyHandlingFees > 0 && newHandlingFeeValue === 0) ||
      (handlingFeesModified && !handlingFeeValueModified)
    ) {
      this.handlingFeeValue = legacyHandlingFees;
    }
    if (
      (this.isNew && newHandlingFeeValue > 0 && legacyHandlingFees === 0) ||
      (handlingFeeValueModified && !handlingFeesModified)
    ) {
      this.handlingFees = newHandlingFeeValue;
    }

    // Keep packing fee fields in sync.
    if (
      (this.isNew && legacyPackingFees > 0 && newPackingFeeValue === 0) ||
      (packingFeesModified && !packingFeeValueModified)
    ) {
      this.packingFeeValue = legacyPackingFees;
    }
    if (
      (this.isNew && newPackingFeeValue > 0 && legacyPackingFees === 0) ||
      (packingFeeValueModified && !packingFeesModified)
    ) {
      this.packingFees = newPackingFeeValue;
    }

    // Enforce canonical storage semantics.
    if (adminType === "percentage") {
      const value = normalizeNonNegativeNumber(this.adminCommissionValue);
      this.adminCommissionValue = value;
      this.adminCommission = value;
    } else {
      this.adminCommissionValue = normalizeNonNegativeNumber(this.adminCommissionValue);
      // Legacy field historically represented percent only.
      this.adminCommission = 0;
    }

    if (handlingType === "none") {
      this.handlingFees = 0;
      this.handlingFeeValue = 0;
    } else if (handlingType === "fixed") {
      const value = normalizeNonNegativeNumber(this.handlingFeeValue);
      this.handlingFeeValue = value;
      this.handlingFees = value;
    } else {
      // Percentage handling fee cannot be represented with legacy flat field.
      this.handlingFeeValue = normalizeNonNegativeNumber(this.handlingFeeValue);
      this.handlingFees = 0;
    }

    if (packingType === "none") {
      this.packingFees = 0;
      this.packingFeeValue = 0;
    } else if (packingType === "fixed") {
      const value = normalizeNonNegativeNumber(this.packingFeeValue);
      this.packingFeeValue = value;
      this.packingFees = value;
    } else {
      this.packingFeeValue = normalizeNonNegativeNumber(this.packingFeeValue);
      this.packingFees = 0;
    }

    next();
  } catch (error) {
    next(error);
  }
});

categorySchema.pre("findOneAndUpdate", function syncLegacyFinanceFieldsOnUpdate(next) {
  try {
    const update = this.getUpdate();
    const set = getUpdateSet(update);
    if (!set) return next();

    // If legacy fields are updated, also update new fields so pricing reads the correct values.
    if (hasOwn(set, "adminCommission") && !hasOwn(set, "adminCommissionValue")) {
      set.adminCommissionValue = set.adminCommission;
    }
    if (hasOwn(set, "adminCommissionValue") && !hasOwn(set, "adminCommission")) {
      set.adminCommission = set.adminCommissionValue;
    }

    if (hasOwn(set, "handlingFees") && !hasOwn(set, "handlingFeeValue")) {
      set.handlingFeeValue = set.handlingFees;
    }
    if (hasOwn(set, "handlingFeeValue") && !hasOwn(set, "handlingFees")) {
      if (set.handlingFeeType === "none" || set.handlingFeeType === "percentage") {
        set.handlingFees = 0;
      } else {
        set.handlingFees = set.handlingFeeValue;
      }
    }

    if (hasOwn(set, "packingFees") && !hasOwn(set, "packingFeeValue")) {
      set.packingFeeValue = set.packingFees;
    }
    if (hasOwn(set, "packingFeeValue") && !hasOwn(set, "packingFees")) {
      if (set.packingFeeType === "none" || set.packingFeeType === "percentage") {
        set.packingFees = 0;
      } else {
        set.packingFees = set.packingFeeValue;
      }
    }

    // Normalize "none" semantics even for update queries (save hooks won't run).
    if (hasOwn(set, "handlingFeeType") && set.handlingFeeType === "none") {
      set.handlingFees = 0;
      set.handlingFeeValue = 0;
    }
    if (hasOwn(set, "packingFeeType") && set.packingFeeType === "none") {
      set.packingFees = 0;
      set.packingFeeValue = 0;
    }
    if (hasOwn(set, "adminCommissionType") && set.adminCommissionType !== "percentage") {
      set.adminCommission = 0;
    }

    this.setUpdate(update);
    next();
  } catch (error) {
    next(error);
  }
});

// Indexes for common queries
categorySchema.index({ type: 1, status: 1 });
categorySchema.index({ parentId: 1, status: 1 });
categorySchema.index({ name: 1 });

// Virtual for children categories
categorySchema.virtual("children", {
  ref: "Category",
  localField: "_id",
  foreignField: "parentId",
});

export default mongoose.model("Category", categorySchema);
