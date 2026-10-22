import dotenv from "dotenv";
import connectDB from "../app/dbConfig/dbConfig.js";
import Setting from "../app/models/setting.js";

dotenv.config();

// Seeds Setting.complaint / Setting.razorpay / Setting.settlement with the
// BRD's documented defaults (Complaint Window + Seller Settlement + Bulk
// Settlement). Mirrors seed-finance-settings.js's pattern.
//
//   node scripts/seed-complaint-settlement-settings.js
//
// Safe to re-run: upserts the single platform Setting doc and only touches
// these three blocks — every other field (branding, delivery pricing, etc.)
// is left exactly as it is. Without this script the same defaults already
// apply via the Mongoose schema (see models/setting.js) the first time the
// doc is read or saved; running it just materializes them into the stored
// document now, so they're visible directly in the DB and in the Admin
// Settings > Complaints & Settlement tab immediately.
//
// photosRequired / settlementHoldScope / the gateway fee % are BRD open
// questions (see zintoDoc/seller_bulk_settlement/) — the values below are
// the documented defaults/assumptions, not a confirmed final policy. Adjust
// here, or later from Admin Settings, once the client confirms.

const payload = {
  complaint: {
    windowHours: 24, // BRD: 24h from delivery to raise feedback/a complaint
    slaDays: 7, // BRD: must be closed within 7 days
    day5AlertEnabled: true, // BRD CMP-04: alert Admin + Owner on day 5
    day5AlertDay: 5,
    photosRequired: false, // open question — BRD doesn't confirm photos are mandatory
    maxPhotosPerItem: 4, // BRD CMP-07: up to 3-4 photos per product
    settlementHoldScope: "whole_order", // open question — BRD's working assumption
  },
  razorpay: {
    enabled: false, // flip on once RAZORPAY_* env vars + webhook are configured
    keyId: "",
    payoutAccountNumber: "",
    payoutMode: "IMPS",
    webhookEnabled: false,
    payoutFeePercent: 2.35, // open question — BRD notes gave ~2.35% and also ₹200; confirm with Razorpay
  },
  settlement: {
    requireDifferentReviewerAndPayer: false, // open question (SEC-05, "Should"); opt-in
  },
};

async function seedComplaintSettlementSettings() {
  await connectDB();

  const setting = await Setting.findOneAndUpdate(
    {},
    { $set: payload },
    { new: true, upsert: true },
  );

  console.log("[seed-complaint-settlement-settings] Done");
  console.log({
    complaint: setting.complaint,
    razorpay: setting.razorpay,
    settlement: setting.settlement,
  });
  process.exit(0);
}

seedComplaintSettlementSettings().catch((error) => {
  console.error("[seed-complaint-settlement-settings] Failed:", error);
  process.exit(1);
});
