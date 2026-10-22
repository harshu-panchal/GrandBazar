import mongoose from "mongoose";
import { ALL_COMPLAINT_STATUSES } from "../constants/complaint.js";

// Append-only audit trail for a complaint (BRD CMP-19 / SEC-03/04):
// who, role, what, when, old and new status, note, device/IP. Written in the
// SAME db transaction as every status change. Never updated or deleted —
// corrections are new rows.
const complaintEventSchema = new mongoose.Schema(
  {
    complaint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Complaint",
      required: true,
      index: true,
    },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    actorRole: { type: String, default: "" }, // customer | seller | admin | system
    action: { type: String, required: true }, // e.g. "raised", "call_logged", "assigned", "refunded", "closed", "reassigned"
    fromStatus: { type: String, enum: [...ALL_COMPLAINT_STATUSES, null], default: null },
    toStatus: { type: String, enum: [...ALL_COMPLAINT_STATUSES, null], default: null },
    note: { type: String, default: "" },
    meta: { type: Object, default: {} },
    device: { type: String, default: "" }, // user-agent / device
    ip: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

complaintEventSchema.index({ complaint: 1, createdAt: 1 });

// Guard against accidental mutation of the append-only log.
complaintEventSchema.pre("findOneAndUpdate", function blockUpdate(next) {
  next(new Error("complaint_events are append-only and cannot be updated"));
});
complaintEventSchema.pre("updateOne", function blockUpdate(next) {
  next(new Error("complaint_events are append-only and cannot be updated"));
});

export default mongoose.model("ComplaintEvent", complaintEventSchema);
