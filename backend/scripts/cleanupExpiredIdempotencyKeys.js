/**
 * Nulls out expired idempotency-key fields on Order without deleting
 * the order itself. Safe replacement for the buggy TTL index that
 * previously wiped whole documents.
 *
 * Runs in one bulk update; safe to schedule via cron or run ad-hoc.
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../app/dbConfig/dbConfig.js";
import Order from "../app/models/order.js";

dotenv.config();

async function run() {
  await connectDB();
  const now = new Date();
  const res = await Order.updateMany(
    { "placement.idempotencyKeyExpiry": { $lte: now } },
    {
      $set: {
        "placement.idempotencyKey": null,
        "placement.idempotencyKeyExpiry": null,
      },
    },
  );
  console.log(
    `[cleanup-idempotency] Cleared ${res.modifiedCount} expired idempotency keys.`,
  );
  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error("[cleanup-idempotency] Failed", err);
  process.exit(1);
});
