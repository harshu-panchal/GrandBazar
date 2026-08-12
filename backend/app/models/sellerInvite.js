import mongoose from "mongoose";
import crypto from "crypto";

// A pre-application invite an admin sends to a prospective seller (before
// any Seller account exists) — distinct from the post-approval credentials
// email sendVendorWelcomeEmail already sends. See emailService.js
// sendSellerInviteEmail and sellerApplicationService.js.
const sellerInviteSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => crypto.randomBytes(24).toString("hex"),
    },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, default: "", trim: true },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "used", "expired"],
      default: "pending",
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
    },
    usedAt: { type: Date, default: null },
    // Set once the invited prospect actually signs up through this link.
    resultingSeller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      default: null,
    },
  },
  { timestamps: true },
);

sellerInviteSchema.index({ email: 1, status: 1 });

export default mongoose.model("SellerInvite", sellerInviteSchema);
