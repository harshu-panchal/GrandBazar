import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Order from "../app/models/order.js";
import Setting from "../app/models/setting.js";
import Dispute from "../app/models/dispute.js";
import { SETTLEMENT_STATE } from "../app/constants/finance.js";
import { COMPLAINT_STATUS } from "../app/constants/complaint.js";

// Phase 1 migration for the Complaint Window + Seller Settlement workstream.
//
//   node scripts/migrate_phase1_settlement_complaint.js            # dry run (default)
//   node scripts/migrate_phase1_settlement_complaint.js --apply    # write changes
//
// What it does (all idempotent — only fills fields that are still empty):
//   1. complaintWindowClosesAt = deliveredAt + Setting.complaint.windowHours
//      for delivered orders where it is null.
//   2. settlementStatus.settlementState backfilled from the existing coarse
//      sellerPayout status, so the new BRD state machine has a sane start point.
//   3. Reports (read-only) how legacy Dispute rows would map to the new
//      Complaint statuses — the actual data move happens in Phase 8.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");

async function connect() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGO_URI is required");
  await mongoose.connect(mongoUri);
}

// Map legacy coarse sellerPayout -> new settlement state. Conservative: never
// marks something SETTLED/READY that the 4-check engine should decide later.
function settlementStateFromSellerPayout(order, windowClosesAt, now) {
  const sp = order.settlementStatus?.sellerPayout;
  if (sp === "COMPLETED") return SETTLEMENT_STATE.SETTLED;
  if (sp === "FAILED") return SETTLEMENT_STATE.FAILED;
  if (sp === "HOLD") return SETTLEMENT_STATE.HELD;
  // PENDING / PROCESSING / NOT_APPLICABLE: if the complaint window is still
  // open, it's WINDOW_OPEN; otherwise leave null so the live engine computes
  // READY/HELD from the real checks on next run.
  if (windowClosesAt && now < windowClosesAt) return SETTLEMENT_STATE.WINDOW_OPEN;
  return null;
}

async function backfillOrders({ windowHours }) {
  const now = new Date();
  const cursor = Order.find({
    deliveredAt: { $ne: null },
    $or: [
      { complaintWindowClosesAt: null },
      { "settlementStatus.settlementState": null },
    ],
  }).cursor();

  let scanned = 0;
  let windowSet = 0;
  let stateSet = 0;
  const stateCounts = {};

  for await (const order of cursor) {
    scanned += 1;
    const updates = {};

    if (!order.complaintWindowClosesAt && order.deliveredAt) {
      const closes = new Date(order.deliveredAt.getTime() + windowHours * 3600 * 1000);
      updates.complaintWindowClosesAt = closes;
      windowSet += 1;
    }

    if (!order.settlementStatus?.settlementState) {
      const closes = updates.complaintWindowClosesAt || order.complaintWindowClosesAt;
      const state = settlementStateFromSellerPayout(order, closes, now);
      if (state) {
        updates["settlementStatus.settlementState"] = state;
        stateCounts[state] = (stateCounts[state] || 0) + 1;
        stateSet += 1;
      }
    }

    if (APPLY && Object.keys(updates).length) {
      await Order.updateOne({ _id: order._id }, { $set: updates });
    }
  }

  return { scanned, windowSet, stateSet, stateCounts };
}

const DISPUTE_TO_COMPLAINT = {
  open: COMPLAINT_STATUS.NEW,
  under_review: COMPLAINT_STATUS.UNDER_REVIEW,
  resolved: COMPLAINT_STATUS.CLOSED,
  rejected: COMPLAINT_STATUS.CLOSED,
};

async function analyzeDisputes() {
  const rows = await Dispute.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  return rows.map((r) => ({
    disputeStatus: r._id,
    count: r.count,
    mapsTo: DISPUTE_TO_COMPLAINT[r._id] || "(needs manual review)",
  }));
}

async function main() {
  await connect();
  const setting = await Setting.findOne({}).lean();
  const windowHours = setting?.complaint?.windowHours ?? setting?.refundWindowHours ?? 24;

  console.log(`\n=== Phase 1 migration (${APPLY ? "APPLY" : "DRY RUN"}) ===`);
  console.log(`complaint window hours: ${windowHours}\n`);

  const orderResult = await backfillOrders({ windowHours });
  console.log("Orders:");
  console.log(`  scanned (delivered, missing a field): ${orderResult.scanned}`);
  console.log(`  complaintWindowClosesAt to set:       ${orderResult.windowSet}`);
  console.log(`  settlementState to set:               ${orderResult.stateSet}`);
  console.log(`  settlementState breakdown:            ${JSON.stringify(orderResult.stateCounts)}`);

  console.log("\nLegacy Dispute -> Complaint mapping (read-only, Phase 8 move):");
  for (const row of await analyzeDisputes()) {
    console.log(`  ${row.disputeStatus} (${row.count}) -> ${row.mapsTo}`);
  }

  if (!APPLY) console.log("\nDry run only. Re-run with --apply to write changes.");
  await mongoose.disconnect();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
