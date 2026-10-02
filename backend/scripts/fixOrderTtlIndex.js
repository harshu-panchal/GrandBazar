/**
 * ONE-TIME FIX — run this once against every environment that has ever
 * booted an older Order model.
 *
 * Two separate TTL indexes have historically caused customer orders to
 * self-destruct:
 *
 *   1. placement.idempotencyKeyExpiry_1  (expireAfterSeconds: 0) —
 *      deleted every customer-app order 24 h after placement.
 *   2. expiresAt_1                       (expireAfterSeconds: 0) —
 *      deleted every order whenever its stock-reservation or seller-
 *      pending window elapsed, which for COD orders happens within
 *      ~10-15 minutes of placement.
 *
 * Mongoose only creates missing indexes; it never modifies or removes
 * an index whose options changed in code. So updating the model files
 * alone does not remove either TTL from a live database. This script
 * drops both TTL indexes and recreates plain (non-TTL) replacements
 * suitable for query use.
 *
 * Safe to run multiple times — dropping a missing or already-plain
 * index is a no-op.
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../app/dbConfig/dbConfig.js";
import Order from "../app/models/order.js";

dotenv.config();

function keysMatch(a, b) {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

async function dropTtlOn(coll, keyDescriptor, replacementOpts = {}) {
  const label = Object.keys(keyDescriptor).join("+");
  const indexes = await coll.indexes();
  // Find every index whose KEY EXACTLY matches this descriptor (same
  // set of fields, same direction). A single-field key like { expiresAt: 1 }
  // must NOT match a compound like { status: 1, expiresAt: 1 } — which
  // the previous version of this script incorrectly did, causing the
  // real TTL to be skipped.
  const matches = indexes.filter((i) => i.key && keysMatch(i.key, keyDescriptor));

  if (matches.length === 0) {
    console.log(`  · No exact-shape index for {${label}}. Nothing to drop.`);
  } else {
    for (const idx of matches) {
      if (idx.expireAfterSeconds === undefined) {
        console.log(
          `  · Existing index "${idx.name}" already has no TTL. Leaving as-is.`,
        );
      } else {
        console.log(
          `  · Dropping TTL index "${idx.name}" (expireAfterSeconds=${idx.expireAfterSeconds})…`,
        );
        await coll.dropIndex(idx.name);
        console.log("  · Dropped.");
      }
    }
  }

  console.log(`  · Ensuring plain replacement index on {${label}}…`);
  await coll.createIndex(keyDescriptor, replacementOpts);
}

async function run() {
  await connectDB();
  const coll = Order.collection;

  console.log("[fix-ttl] placement.idempotencyKeyExpiry:");
  await dropTtlOn(
    coll,
    { "placement.idempotencyKeyExpiry": 1 },
    {
      partialFilterExpression: {
        "placement.idempotencyKeyExpiry": { $type: "date" },
      },
    },
  );

  console.log("[fix-ttl] expiresAt:");
  // Compound (status, expiresAt) index in the model still exists and
  // covers most query needs; a plain single-field index kept here for
  // ad-hoc queries against expiresAt.
  await dropTtlOn(coll, { expiresAt: 1 });

  console.log("\n[fix-ttl] Done. Final indexes:");
  const finalIndexes = await coll.indexes();
  for (const idx of finalIndexes) {
    const ttl =
      idx.expireAfterSeconds !== undefined
        ? ` [TTL=${idx.expireAfterSeconds}]`
        : "";
    console.log(`  · ${idx.name}${ttl}`);
  }

  const remainingTtl = finalIndexes.filter(
    (i) => i.expireAfterSeconds !== undefined,
  );
  if (remainingTtl.length) {
    console.log(
      `\n[fix-ttl] WARNING — ${remainingTtl.length} TTL index(es) still present on Order:`,
    );
    for (const t of remainingTtl) console.log(`   - ${t.name}`);
  } else {
    console.log("\n[fix-ttl] ✓ No TTL indexes remain on Order. Orders will no longer auto-delete.");
  }

  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error("[fix-ttl] Failed", err);
  process.exit(1);
});
