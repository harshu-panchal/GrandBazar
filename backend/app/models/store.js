import mongoose from "mongoose";

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

    category: {
      type: String,
      trim: true,
    },

    categories: {
      type: [String],
      default: [],
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
  },
  { timestamps: true },
);

storeSchema.index({ location: "2dsphere" });
storeSchema.index({ isActive: 1, isVerified: 1, applicationStatus: 1 });

export default mongoose.model("Store", storeSchema);
