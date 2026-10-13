import mongoose from "mongoose";

const adminRoleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
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
    // ₹ ceiling on credits/refunds a staff member under this role can issue
    // without escalation (see approvalRequestService.js). null/undefined =
    // unlimited (root admin/superadmin bypass this entirely regardless).
    moneyLimit: {
      type: Number,
      default: null,
      min: 0,
    },
    // When true, staff under this role must complete an email-OTP step at
    // login before a usable session token is issued (see
    // adminLoginTwoFactorService.js).
    requiresTwoFactor: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  { timestamps: true },
);

export default mongoose.model("AdminRole", adminRoleSchema);
