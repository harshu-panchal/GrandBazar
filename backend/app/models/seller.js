import mongoose from "mongoose";
import bcrypt from "bcrypt";

const sellerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    accountType: {
      type: String,
      enum: ["owner", "staff"],
      default: "owner",
    },

    role: {
      type: String,
      default: "seller",
    },

    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
    },

    allowedPermissions: {
      type: [String],
      default: [],
    },

    lastActiveStoreId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
    },

    emailVerified: {
      type: Boolean,
      default: false,
    },

    phoneVerified: {
      type: Boolean,
      default: false,
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
      default: true,
    },

    businessModel: {
      type: String,
      enum: ["commission", "subscription", null],
      default: null,
    },

    businessModelChosenAt: {
      type: Date,
    },

    businessModelSwitch: {
      requestedModel: {
        type: String,
        enum: ["commission", "subscription", null],
        default: null,
      },
      requestedAt: Date,
      effectiveAt: Date,
      status: {
        type: String,
        enum: ["none", "pending", "approved", "rejected"],
        default: "none",
      },
      rejectionReason: {
        type: String,
        trim: true,
        default: "",
      },
    },

    commissionConfig: {
      scope: {
        type: String,
        enum: ["category", "seller"],
        default: "category",
      },
      type: {
        type: String,
        enum: ["percentage", "fixed"],
        default: "percentage",
      },
      value: {
        type: Number,
        default: 0,
      },
      fixedRule: {
        type: String,
        enum: ["per_qty", "per_item"],
        default: "per_qty",
      },
      categoryOverrides: [
        {
          categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
          },
          type: {
            type: String,
            enum: ["percentage", "fixed"],
          },
          value: Number,
          fixedRule: {
            type: String,
            enum: ["per_qty", "per_item"],
          },
        },
      ],
    },

    lastLogin: Date,
  },
  { timestamps: true },
);

// Hash password before saving
sellerSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
sellerSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model("Seller", sellerSchema);
