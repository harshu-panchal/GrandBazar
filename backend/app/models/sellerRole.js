import mongoose from "mongoose";

// Custom role defined by a store owner. Scoped either to a single store
// (storeId set) or applicable across every store the owner has (storeId null).
// Permissions are stored in the same "module:read" / "module:write" encoding
// the Seller model already uses so staff accounts can inherit the role's list
// directly.
const sellerRoleSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
      index: true,
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    label: {
      type: String,
      trim: true,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    permissions: {
      type: [String],
      default: [],
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// A role name only needs to be unique within an owner's workspace, and
// further scoped by the store it's attached to (null storeId = account-wide).
sellerRoleSchema.index({ ownerId: 1, storeId: 1, name: 1 }, { unique: true });

export default mongoose.model("SellerRole", sellerRoleSchema);
