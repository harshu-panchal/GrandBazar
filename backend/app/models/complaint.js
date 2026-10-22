import mongoose from "mongoose";
import {
  ALL_COMPLAINT_STATUSES,
  ALL_COMPLAINT_CULPRITS,
  ALL_COMPLAINT_SUBMIT_TYPES,
  ALL_CALL_OUTCOMES,
  COMPLAINT_STATUS,
  COMPLAINT_SUBMIT_TYPE,
} from "../constants/complaint.js";

// Complaint Window ticket. One per complained order (feedback does not create a
// ticket — it only flips `submitType` semantics via a lightweight feedback flow;
// see complaintService). Replaces the legacy Dispute model (migrated in Phase 8).
//
// Money note: amounts are stored in rupees (Number) to stay consistent with the
// existing Order/Payout/pricing money fields this workstream extends, rather
// than the BRD's paise suggestion — mixing units across the Order boundary would
// invite conversion bugs. A platform-wide paise migration is tracked separately.
const sellerDecisionSchema = new mongoose.Schema(
  {
    decision: { type: String, enum: ["approved", "rejected"], default: null },
    amount: { type: Number, default: 0, min: 0 },
    reason: { type: String, default: "" },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", default: null },
  },
  { _id: false },
);

const complaintSchema = new mongoose.Schema(
  {
    complaintId: { type: String, required: true, unique: true, index: true }, // C-xxxx
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    orderPublicId: { type: String, required: true, index: true },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Order.seller refs Store (not Seller) — keep the same beneficiary semantics.
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "Store", default: null, index: true },

    submitType: {
      type: String,
      enum: ALL_COMPLAINT_SUBMIT_TYPES,
      default: COMPLAINT_SUBMIT_TYPE.COMPLAINT,
    },
    status: {
      type: String,
      enum: ALL_COMPLAINT_STATUSES,
      default: COMPLAINT_STATUS.NEW,
      index: true,
    },

    culprit: { type: String, enum: [...ALL_COMPLAINT_CULPRITS, null], default: null },
    // Refund to customer / deduction amount decided for this complaint (rupees).
    amount: { type: Number, default: 0, min: 0 },

    sellerDecision: { type: sellerDecisionSchema, default: () => ({}) },

    // SLA timers (BRD: opened_at + 7 days; alert day 5; OVERDUE flag after day 7).
    openedAt: { type: Date, default: Date.now },
    dueAt: { type: Date, required: true, index: true },
    isOverdue: { type: Boolean, default: false, index: true },
    overdueAt: { type: Date, default: null },
    day5AlertSentAt: { type: Date, default: null },

    // Settlement hold (BRD: a complaint, not feedback, holds the order's
    // settlement until Admin closes it). Scope defaults to the whole order per
    // the BRD assumption; schema supports a future "complained amount only" mode.
    settlementHeld: { type: Boolean, default: false, index: true },
    settlementHoldScope: {
      type: String,
      enum: ["whole_order", "complained_amount"],
      default: "whole_order",
    },

    // Refund record (customer refunded with amount + transaction number).
    refundTxnNo: { type: String, default: "" },
    refundedAt: { type: Date, default: null },

    // Feedback acknowledgement loop (no refund, no hold).
    feedbackAcknowledgedAt: { type: Date, default: null },
    feedbackAcknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },

    // Recovery ticket raised when logistics is at fault (platform pays now).
    recoveryTicketRef: { type: String, default: "" },

    // Reassignment bookkeeping (full history lives in complaint_events).
    reassignCount: { type: Number, default: 0 },

    // Closing (Admin only, ≥1 culprit + final summary).
    summary: { type: String, default: "" },
    closedAt: { type: Date, default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },

    // Last admin call outcome convenience mirror (authoritative log in call_logs).
    lastCallOutcome: { type: String, enum: [...ALL_CALL_OUTCOMES, null], default: null },
    lastCallAt: { type: Date, default: null },
  },
  { timestamps: true },
);

complaintSchema.index({ status: 1, dueAt: 1 });
complaintSchema.index({ seller: 1, status: 1 });

export default mongoose.model("Complaint", complaintSchema);
