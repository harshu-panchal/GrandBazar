import mongoose from "mongoose";
import bcrypt from "bcrypt";

const adminSchema = new mongoose.Schema(
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
      trim: true,
      unique: true,
      sparse: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    // Role is a free-form string so admins can define custom staff roles at
    // runtime. "admin" and "superadmin" remain reserved for root-level
    // accounts; anything else is a custom staff role whose capabilities are
    // governed by allowedPermissions (optionally inherited from customRoleId).
    role: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      default: "admin",
    },
    customRoleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminRole",
      default: null,
    },
    allowedPermissions: {
      type: [String],
      default: [],
    },
    isVerified: {
      type: Boolean,
      default: true, // Internal admins might be verified by default or via admin code
    },

    lastLogin: Date,
  },
  { timestamps: true },
);

// Hash password before saving
adminSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password
adminSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model("Admin", adminSchema);
