import mongoose from "mongoose";

const guestCourierAssignmentSchema = new mongoose.Schema(
  {
    taskType: {
      type: String,
      enum: ["forward_delivery", "return_pickup"],
      required: true,
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    orderId: { type: String, required: true, index: true },
    courier: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      email: { type: String, required: true, trim: true, lowercase: true },
    },
    status: {
      type: String,
      enum: [
        "email_pending",
        "active",
        "email_failed",
        "completed",
        "cancelled",
        "revoked",
        "replaced",
      ],
      default: "email_pending",
      index: true,
    },
    tokenHash: { type: String, required: true, unique: true, index: true, select: false },
    tokenVersion: { type: Number, default: 1 },
    assignedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    assignmentReason: { type: String, required: true, trim: true },
    assignedAt: { type: Date, default: Date.now },
    emailStatus: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
    },
    emailSentAt: { type: Date, default: null },
    emailFailureReason: { type: String, default: "" },
    lastAccessedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    revocationReason: { type: String, default: "" },
  },
  { timestamps: true },
);

guestCourierAssignmentSchema.index({ order: 1, taskType: 1, createdAt: -1 });
guestCourierAssignmentSchema.index({ status: 1, updatedAt: -1 });

export default mongoose.model("GuestCourierAssignment", guestCourierAssignmentSchema);
