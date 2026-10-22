import mongoose from "mongoose";
import { ALL_CALL_OUTCOMES } from "../constants/complaint.js";

// Admin's call to the customer (BRD CMP-11). A call log is REQUIRED before Admin
// can route (assign a culprit) or close a complaint. Records who/time/duration/
// facts/photos checked/outcome/next step.
const callLogSchema = new mongoose.Schema(
  {
    complaint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Complaint",
      required: true,
      index: true,
    },
    // Party spoken to (usually the customer; kept flexible for rider/seller calls).
    party: { type: String, default: "customer" },
    outcome: { type: String, enum: ALL_CALL_OUTCOMES, required: true },
    facts: { type: String, required: true }, // what the customer said
    photosChecked: { type: Boolean, default: false },
    nextStep: { type: String, default: "" },
    durationSeconds: { type: Number, default: 0, min: 0 },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    byName: { type: String, default: "" },
  },
  { timestamps: true },
);

callLogSchema.index({ complaint: 1, createdAt: -1 });

export default mongoose.model("CallLog", callLogSchema);
