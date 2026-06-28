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
