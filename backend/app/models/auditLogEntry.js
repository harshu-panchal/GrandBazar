import mongoose from "mongoose";

// General-purpose admin-action audit trail — distinct from FinanceAuditLog
// (settlement/payout-specific) and LoginActivity (auth-specific). Unifies
// what was previously just overwritten in-place on the target record itself
// (e.g. Product.approvalStatus/reviewedBy, Store.reviewedBy/rejectionReason)
// with no history of prior states — see WS-15 item 248.
const auditLogEntrySchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    actorRole: {
      type: String,
      default: "admin",
    },
    action: {
      type: String,
      required: true,
    },
    targetType: {
      type: String,
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    before: {
      type: Object,
      default: null,
    },
    after: {
      type: Object,
      default: null,
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true },
);

auditLogEntrySchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

export default mongoose.model("AuditLogEntry", auditLogEntrySchema);
