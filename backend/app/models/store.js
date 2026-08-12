import mongoose from "mongoose";
import { slugify } from "../utils/slugify.js";
import {
  ALL_COMMISSION_FIXED_RULES,
  ALL_COMMISSION_TYPES,
} from "../constants/finance.js";

const storeSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
      index: true,
    },

    shopName: {
      type: String,
      required: true,
      trim: true,
    },
    logoUrl: {
      type: String,
      trim: true,
      default: "",
    },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },
    slugHistory: {
      type: [String],
      default: [],
    },
    seoTitle: {
      type: String,
      trim: true,
      default: "",
    },
    seoDescription: {
      type: String,
      trim: true,
      default: "",
    },
    seoKeywords: {
      type: [String],
      default: [],
    },

    category: {
      type: String,
      trim: true,
    },

    categories: {
      type: [String],
      default: [],
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

    description: {
      type: String,
      trim: true,
    },

    banners: [{
      type: String,
      trim: true,
    }],

    storeVideo: {
      type: String,
      trim: true,
    },

    address: {
      type: String,
      trim: true,
    },
    locality: {
      type: String,
      trim: true,
    },
    pincode: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },

    documents: {
      tradeLicense: { type: String, trim: true },
      gstCertificate: { type: String, trim: true },
      idProof: { type: String, trim: true },
      businessRegistration: { type: String, trim: true },
      fssaiLicense: { type: String, trim: true },
      aadhar: { type: String, trim: true },
      pan: { type: String, trim: true },
      bankProof: { type: String, trim: true },
      other: { type: String, trim: true },
    },

    aadharNumber: {
      type: String,
      trim: true,
    },
    panNumber: {
      type: String,
      trim: true,
    },
    gstNumber: {
      type: String,
      trim: true,
      uppercase: true,
    },
    gstExempt: {
      type: Boolean,
      default: false,
    },
    accountHolder: {
      type: String,
      trim: true,
    },
    accountNumber: {
      type: String,
      trim: true,
    },
    ifsc: {
      type: String,
      trim: true,
    },
    bankName: {
      type: String,
      trim: true,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    applicationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    reviewedAt: {
      type: Date,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },

    rejectionReason: {
      type: String,
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: false,
    },

    /** Seller open/close for orders. Closed stores stay listed but show as Off to customers. */
    isOpen: {
      type: Boolean,
      default: true,
    },

    /** Admin-controlled: excludes this store from ever appearing as a suggested alternative for other closed stores. */
    excludeFromAlternatives: {
      type: Boolean,
      default: false,
    },

    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },

    serviceRadius: {
      type: Number,
      default: 5,
    },

    /** Flat packaging fee charged to customer and paid to this store */
    packagingCharge: {
      type: Number,
      default: 0,
      min: 0,
    },
    packagingChargeEnabled: {
      type: Boolean,
      default: false,
    },

    timezone: {
      type: String,
      default: "Asia/Kolkata",
      trim: true,
    },

    schedulingSettings: {
      enabled: { type: Boolean, default: false },
      maxDaysAhead: { type: Number, default: 30, min: 1, max: 90 },
      rescheduleCutoffDays: { type: Number, default: 1, min: 0, max: 7 },
      selfLogistics: { type: Boolean, default: false },
      deliveryWindows: {
        type: [
          {
            label: { type: String, trim: true },
            start: { type: String, trim: true },
            end: { type: String, trim: true },
            capacityPerDay: { type: Number, default: 50, min: 1 },
            enabled: { type: Boolean, default: true },
          },
        ],
        default: [],
      },
    },

    deliveryPolicy: {
      customerPickup: { type: Boolean, default: false },
      sellerDelivery: { type: Boolean, default: false },
      platformLogistics: { type: Boolean, default: true },
      autoSwitchToPlatform: { type: Boolean, default: false },
      platformLogisticsEnabledByAdmin: { type: Boolean, default: true },
      sameDayCutoffTime: { type: String, default: "18:00", trim: true },
    },

    availability: {
      workingDays: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
      openTime: { type: String, default: "09:00", trim: true },
      closeTime: { type: String, default: "21:00", trim: true },
      weeklyOff: { type: [Number], default: [] },
      holidays: { type: [String], default: [] },
      vacation: {
        active: { type: Boolean, default: false },
        startAt: { type: Date, default: null },
        endAt: { type: Date, default: null },
        message: { type: String, default: "", trim: true },
      },
      temporaryClosure: {
        active: { type: Boolean, default: false },
        reason: {
          type: String,
          enum: ["vacation", "festival", "emergency", "staff_unavailable", "other", ""],
          default: "",
        },
        message: { type: String, default: "", trim: true },
        restoreAt: { type: Date, default: null },
        previousPolicy: { type: mongoose.Schema.Types.Mixed, default: null },
      },
    },

    /** How many customers favorited this store — drives popularity ranking. */
    favoriteCount: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },

    /** Average of approved store reviews (1–5). */
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
  },
  { timestamps: true },
);

storeSchema.index({ location: "2dsphere" });
storeSchema.index({ isActive: 1, isVerified: 1, applicationStatus: 1 });
storeSchema.index({ favoriteCount: -1 });
storeSchema.index({ city: 1, isActive: 1, isVerified: 1 });

async function buildUniqueStoreSlug(doc, baseName) {
  const base = slugify(baseName || "store");
  if (!base) return "";

  let candidate = base;
  let attempt = 0;
  // Keep lookups cheap while still deterministic enough.
  while (attempt < 50) {
    const existing = await doc.constructor.findOne({
      slug: candidate,
      _id: { $ne: doc._id },
    })
      .select("_id")
      .lean();
    if (!existing) return candidate;
    attempt += 1;
    candidate = `${base}-${String(doc._id).slice(-6)}-${attempt}`;
  }
  return `${base}-${String(doc._id).slice(-6)}`;
}

storeSchema.pre("save", async function syncStoreSlug(next) {
  try {
    const previousSlug = this.isModified("slug") ? this.get("slug") : this.slug;
    if (this.isNew || this.isModified("shopName") || !this.slug) {
      const oldSlug = String(this.slug || "").trim().toLowerCase();
      const nextSlug = await buildUniqueStoreSlug(this, this.shopName);
      this.slug = nextSlug;

      if (oldSlug && oldSlug !== nextSlug) {
        const history = new Set([...(this.slugHistory || []), oldSlug]);
        this.slugHistory = [...history];
      }
    }

    if (previousSlug && previousSlug !== this.slug) {
      const history = new Set([...(this.slugHistory || []), String(previousSlug).toLowerCase()]);
      this.slugHistory = [...history];
    }
    next();
  } catch (error) {
    next(error);
  }
});

storeSchema.pre("save", function syncStoreCommissionFields(next) {
  try {
    const value = Math.max(0, Number(this.adminCommissionValue ?? this.adminCommission ?? 0) || 0);
    this.adminCommissionValue = value;
    if (this.adminCommissionType === "percentage") {
      this.adminCommission = value;
    } else {
      this.adminCommission = 0;
    }
    next();
  } catch (error) {
    next(error);
  }
});

export default mongoose.model("Store", storeSchema);
