import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Order from "../app/models/order.js";
import Dispute from "../app/models/dispute.js";
import Complaint from "../app/models/complaint.js";
import ComplaintItem from "../app/models/complaintItem.js";
import ComplaintEvent from "../app/models/complaintEvent.js";
import { nextComplaintId } from "../app/utils/sequenceIds.js";
import { COMPLAINT_STATUS, COMPLAINT_SUBMIT_TYPE, COMPLAINT_CULPRIT, COMPLAINT_REASON } from "../app/constants/complaint.js";

// Phase 8 — move legacy Dispute rows into the new Complaint module.
//
//   node scripts/migrate_phase8_dispute_to_complaint.js          # dry run (default)
//   node scripts/migrate_phase8_dispute_to_complaint.js --apply  # write
//
// Idempotent: skips any order that already has a complaintRef, so re-running is
// safe. Historical data is written directly (bypassing service guards) — closed
// disputes become CLOSED complaints with a migration summary. Culprit is only
// inferred where unambiguous (rejected → CUSTOMER); otherwise left null.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");

const STATUS_MAP = {
  open: COMPLAINT_STATUS.NEW,
  under_review: COMPLAINT_STATUS.UNDER_REVIEW,
  resolved: COMPLAINT_STATUS.CLOSED,
  rejected: COMPLAINT_STATUS.CLOSED,
};
const REASON_MAP = {
  wrong_item: COMPLAINT_REASON.WRONG_ITEM,
  missing_item: COMPLAINT_REASON.ITEM_MISSING,
  quality_issue: COMPLAINT_REASON.QUALITY_NOT_AS_SHOWN,
  late_delivery: COMPLAINT_REASON.ITEM_DELAYED,
  billing_issue: COMPLAINT_REASON.OVERCHARGED,
  other: COMPLAINT_REASON.OTHER,
};

async function connect() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGO_URI is required");
  await mongoose.connect(mongoUri);
}

async function migrateOne(dispute) {
  const order = await Order.findById(dispute.order).select("_id orderId complaintRef items deliveredAt").lean();
  if (!order) return { skipped: "order-missing" };
  if (order.complaintRef) return { skipped: "already-has-complaint" };
  if (await Complaint.findOne({ orderPublicId: dispute.orderPublicId }).lean()) return { skipped: "complaint-exists" };

  const isClosed = ["resolved", "rejected"].includes(dispute.status);
  const toStatus = STATUS_MAP[dispute.status] || COMPLAINT_STATUS.NEW;
  const culprit = dispute.status === "rejected" ? COMPLAINT_CULPRIT.CUSTOMER : null;

  if (!APPLY) return { wouldCreate: dispute.disputeId, toStatus };

  const complaintId = await nextComplaintId();
  const openedAt = dispute.createdAt || new Date();
  const [complaint] = await Complaint.create([
    {
      complaintId,
      order: order._id,
      orderPublicId: dispute.orderPublicId,
      customer: dispute.customer,
      seller: dispute.seller,
      submitType: COMPLAINT_SUBMIT_TYPE.COMPLAINT,
      status: toStatus,
      culprit,
      amount: dispute.refundAmount || 0,
      openedAt,
      dueAt: new Date(openedAt.getTime() + 7 * 24 * 3600 * 1000),
      settlementHeld: !isClosed,
      summary: isClosed ? `Migrated from dispute ${dispute.disputeId}: ${dispute.resolutionNote || dispute.resolution || ""}`.trim() : "",
      closedAt: isClosed ? dispute.resolvedAt || new Date() : null,
      closedBy: isClosed ? dispute.resolvedBy || null : null,
      refundedAt: dispute.refundAmount > 0 ? dispute.resolvedAt || null : null,
    },
  ]);

  // One representative complaint item from the dispute reason.
  const firstItem = order.items?.[0];
  await ComplaintItem.create([
    {
      complaint: complaint._id,
      orderItemId: firstItem?._id || new mongoose.Types.ObjectId(),
      product: firstItem?.product || null,
      productName: firstItem?.name || "",
      quantity: firstItem?.quantity || 1,
      unitPrice: firstItem?.price || 0,
      reason: REASON_MAP[dispute.reasonCategory] || COMPLAINT_REASON.OTHER,
      reasonText: dispute.reason || "",
      photos: [],
    },
  ]);

  // Carry the dispute audit trail across as append-only complaint events.
  const events = [
    { action: "migrated_from_dispute", actorRole: "system", toStatus, note: `From ${dispute.disputeId}`, createdAt: openedAt },
    ...(dispute.auditLog || []).map((a) => ({
      action: a.action || "legacy_event",
      actorRole: a.actorRole || "system",
      note: JSON.stringify(a.meta || {}),
      createdAt: a.at || openedAt,
    })),
  ].map((e) => ({ ...e, complaint: complaint._id }));
  await ComplaintEvent.create(events);

  await Order.updateOne({ _id: order._id }, { $set: { complaintRef: complaint._id } });
  return { created: complaintId, toStatus };
}

async function main() {
  await connect();
  console.log(`\n=== Phase 8 Dispute → Complaint migration (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);

  const disputes = await Dispute.find({}).sort({ createdAt: 1 });
  const tally = { created: 0, wouldCreate: 0, skipped: {} };
  for (const d of disputes) {
    const r = await migrateOne(d);
    if (r.created) tally.created += 1;
    else if (r.wouldCreate) tally.wouldCreate += 1;
    else tally.skipped[r.skipped] = (tally.skipped[r.skipped] || 0) + 1;
  }

  console.log(`Disputes scanned: ${disputes.length}`);
  console.log(`${APPLY ? "Created" : "Would create"}: ${APPLY ? tally.created : tally.wouldCreate}`);
  console.log(`Skipped: ${JSON.stringify(tally.skipped)}`);
  if (!APPLY) console.log("\nDry run only. Re-run with --apply to write.");
  await mongoose.disconnect();
  console.log("\nDone.");
}

main().catch((err) => { console.error(err); process.exit(1); });
