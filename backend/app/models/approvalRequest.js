import mongoose from "mongoose";

const APPROVAL_TYPES = ["credit", "refund"];
const APPROVAL_STATUSES = ["pending", "approved", "rejected"];

// A credit/refund request an Operator role submitted that exceeded their
// role's moneyLimit (see adminRole.js), waiting for a higher tier to review.
// No push notification is wired to this — the pending queue itself (GET
// /admin/operations/approvals) is the "next tier" surface, same pull-based
// pattern already used by subscription payment requests elsewhere in this
// codebase, rather than integrating with the much heavier FCM notification
// pipeline for one more event type.
const approvalRequestSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: APPROVAL_TYPES,
      required: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: APPROVAL_STATUSES,
      default: "pending",
      index: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    requestedRole: {
      type: String,
      default: "",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewNote: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true },
);

approvalRequestSchema.index({ status: 1, createdAt: -1 });

export const ALL_APPROVAL_TYPES = APPROVAL_TYPES;
export const ALL_APPROVAL_STATUSES = APPROVAL_STATUSES;
export default mongoose.model("ApprovalRequest", approvalRequestSchema);
