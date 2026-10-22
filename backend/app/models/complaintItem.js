import mongoose from "mongoose";
import { ALL_COMPLAINT_REASONS, COMPLAINT_REASON } from "../constants/complaint.js";

// One row per product the customer flagged in a complaint (BRD CMP-05/06/07).
// Up to MAX_PHOTOS_PER_ITEM photos each; "other" reason carries free text.
const complaintItemSchema = new mongoose.Schema(
  {
    complaint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Complaint",
      required: true,
      index: true,
    },
    // _id of the embedded order item (order.items[]._id) plus a snapshot so the
    // complaint stays readable even if the order line later changes.
    orderItemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    productName: { type: String, default: "" },
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, default: 0 },

    reason: {
      type: String,
      enum: ALL_COMPLAINT_REASONS,
      default: COMPLAINT_REASON.OTHER,
    },
    reasonText: { type: String, default: "" },

    // Uploaded photo URLs (validated for type/size/count in the service).
    photos: { type: [String], default: [] },
  },
  { timestamps: true },
);

export default mongoose.model("ComplaintItem", complaintItemSchema);
