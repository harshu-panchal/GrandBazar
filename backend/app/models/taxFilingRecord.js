import mongoose from "mongoose";

const FILING_TYPES = ["GSTR-1", "GSTR-3B", "GSTR-8", "OTHER"];
const FILING_STATUSES = ["pending", "filed"];

// There is no GSTN e-filing API integration anywhere in this codebase, so
// this is a record of what the accountant has actually filed outside the
// platform (amount, date, reference) — used purely for reconciliation
// against what this platform's own data says should have been filed.
const taxFilingRecordSchema = new mongoose.Schema(
  {
    period: {
      // "YYYY-MM"
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: FILING_TYPES,
      required: true,
    },
    dueDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: FILING_STATUSES,
      default: "pending",
    },
    filedAmount: {
      type: Number,
      default: null,
    },
    filedDate: {
      type: Date,
      default: null,
    },
    referenceNumber: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true },
);

taxFilingRecordSchema.index({ period: 1, type: 1 }, { unique: true });

export const ALL_FILING_TYPES = FILING_TYPES;
export const ALL_FILING_STATUSES = FILING_STATUSES;
export default mongoose.model("TaxFilingRecord", taxFilingRecordSchema);
