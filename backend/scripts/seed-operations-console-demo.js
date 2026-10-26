import dotenv from "dotenv";
import connectDB from "../app/dbConfig/dbConfig.js";
import Admin from "../app/models/admin.js";
import Order from "../app/models/order.js";
import ApprovalRequest from "../app/models/approvalRequest.js";
import OperatorAuditLog from "../app/models/operatorAuditLog.js";

dotenv.config();

// Seeds demo rows for the admin Operations Console's "Approval Queue" and
// "Audit Log" sections, which are empty on a fresh/low-activity DB. Purely
// additive: creates new ApprovalRequest / OperatorAuditLog documents that
// reference EXISTING real Admin and Order docs already in this database —
// it never fabricates or mutates an Order, and never touches order
// workflow/delivery state (the "Unassigned Orders" section is intentionally
// left alone here; seeding it would require either fabricating a full valid
// Order or mutating a real order's live workflowStatus/deliveryBoy fields,
// both of which risk side effects like background jobs picking the order up
// for a real delivery broadcast).
//
//   node scripts/seed-operations-console-demo.js
//
// Safe to re-run: skips if any ApprovalRequest or OperatorAuditLog already
// exists (so repeat runs are no-ops once real activity accumulates).

async function seedOperationsConsoleDemo() {
  await connectDB();

  const admin = await Admin.findOne({ role: { $in: ["admin", "superadmin"] } }).sort({ createdAt: 1 });
  if (!admin) {
    console.log("[seed-operations-console-demo] No Admin found — nothing to reference, aborting.");
    process.exit(1);
  }

  const orders = await Order.find({}).sort({ createdAt: -1 }).limit(5).select("_id shortOrderId").lean();
  if (!orders.length) {
    console.log("[seed-operations-console-demo] No Order found — nothing to reference, aborting.");
    process.exit(1);
  }

  const existingApprovals = await ApprovalRequest.countDocuments({});
  const existingAuditLogs = await OperatorAuditLog.countDocuments({});

  if (existingApprovals === 0) {
    const approvalDocs = [
      {
        type: "credit",
        orderId: orders[0]._id,
        amount: 150,
        reason: "Customer reported a missing item; goodwill credit requested by support.",
        status: "pending",
        requestedBy: admin._id,
        requestedRole: admin.role,
      },
      {
        type: "refund",
        orderId: orders[Math.min(1, orders.length - 1)]._id,
        amount: 420,
        reason: "Delivered item damaged in transit; customer requested refund.",
        status: "pending",
        requestedBy: admin._id,
        requestedRole: admin.role,
      },
    ];
    await ApprovalRequest.insertMany(approvalDocs);
    console.log(`[seed-operations-console-demo] Inserted ${approvalDocs.length} ApprovalRequest docs.`);
  } else {
    console.log(`[seed-operations-console-demo] ApprovalRequest already has ${existingApprovals} docs — skipped.`);
  }

  if (existingAuditLogs === 0) {
    const auditDocs = [
      {
        action: "ORDER_CREDIT_REQUESTED",
        actorId: admin._id,
        actorRole: admin.role,
        orderId: orders[0]._id,
        newValue: { amount: 150, reason: "Missing item goodwill credit" },
        reason: "Support escalation",
      },
      {
        action: "ORDER_REFUND_REQUESTED",
        actorId: admin._id,
        actorRole: admin.role,
        orderId: orders[Math.min(1, orders.length - 1)]._id,
        newValue: { amount: 420, reason: "Damaged item" },
        reason: "Support escalation",
      },
      {
        action: "ORDER_STATUS_VIEWED",
        actorId: admin._id,
        actorRole: admin.role,
        orderId: orders[Math.min(2, orders.length - 1)]._id,
        reason: "Routine operations review",
      },
    ];
    await OperatorAuditLog.insertMany(auditDocs);
    console.log(`[seed-operations-console-demo] Inserted ${auditDocs.length} OperatorAuditLog docs.`);
  } else {
    console.log(`[seed-operations-console-demo] OperatorAuditLog already has ${existingAuditLogs} docs — skipped.`);
  }

  console.log("[seed-operations-console-demo] Done");
  process.exit(0);
}

seedOperationsConsoleDemo().catch((error) => {
  console.error("[seed-operations-console-demo] Failed:", error);
  process.exit(1);
});
