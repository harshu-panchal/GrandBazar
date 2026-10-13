import mongoose from "mongoose";

// Unified audit trail for Operator-console actions — the mock's "Audit log,
// auto-generated: Operator, order or shop, action, old to new value, time
// and reason. Records are never deleted." Distinct from financeAuditLog.js
// (finance/payout domain) and order.modificationTimeline (price adjustments
// & store reassignment, embedded on the order itself) — this is the one
// place every operator action (rider assignment, logistics override,
// reassignment, credit/refund + its approval) gets logged consistently so
// an operator's "own audit log" and the Owner's full view can both be
// queried from a single collection.
const operatorAuditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    actorRole: {
      type: String,
      default: "",
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      default: null,
    },
    oldValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    newValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    reason: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true },
);

operatorAuditLogSchema.index({ actorId: 1, createdAt: -1 });
operatorAuditLogSchema.index({ orderId: 1, createdAt: -1 });

export default mongoose.model("OperatorAuditLog", operatorAuditLogSchema);
