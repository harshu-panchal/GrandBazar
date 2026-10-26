/**
 * ONE-TIME FIX — run this once against every environment that has ever
 * booted an Order model with the broken sellerSettlement.idempotencyKey
 * index (introduced in the Zinto Settlement/Complaint commit, 2371ce6).
 *
 * The live index is `{ "sellerSettlement.idempotencyKey": 1 }` with
 * `{ unique: true, sparse: true }`. sparse only excludes a document where
 * the field is truly ABSENT — not one where it is present with value null.
 * sellerSettlement has nested-field defaults (idempotencyKey: null among
 * them), so Mongoose auto-vivifies the whole subdocument on every order and
 * writes idempotencyKey: null literally. The first order ever created after
 * this index existed got indexed fine; every order since has collided with
 * it on the shared null key:
 *
 *   E11000 duplicate key error ... sellerSettlement.idempotencyKey_1
 *   dup key: { sellerSettlement.idempotencyKey: null }
 *
 * This is a CHECKOUT-BLOCKING bug, not a cosmetic one — confirmed on a live
 * order attempt. Mongoose only creates missing indexes; it never modifies or
 * removes an index whose options changed in code (see fixOrderTtlIndex.js for
 * the identical class of problem), so updating app/models/order.js alone
 * does not fix a database that already has the broken index. This script
 * drops it and recreates it with a partialFilterExpression that only applies
 * uniqueness among real string keys — the same pattern the model already
 * uses correctly for placement.idempotencyKey.
 *
 * Purely an index rebuild: no document data is read, written, or deleted.
 * Safe to run multiple times — dropping a missing index, or one that already
 * has the partialFilterExpression, is a no-op.
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../app/dbConfig/dbConfig.js";
import Order from "../app/models/order.js";

dotenv.config();

const FIELD = "sellerSettlement.idempotencyKey";
const CORRECT_OPTS = {
  unique: true,
  partialFilterExpression: { [FIELD]: { $type: "string" } },
};

function hasCorrectShape(idx) {
  return (
    idx.unique === true &&
    idx.sparse !== true &&
    idx.partialFilterExpression?.[FIELD]?.$type === "string"
  );
}

async function run() {
  await connectDB();
  const coll = Order.collection;

  console.log(`[fix-settlement-idempotency] Checking indexes on {${FIELD}}:`);
  const indexes = await coll.indexes();
  const matches = indexes.filter((i) => i.key && Object.keys(i.key).length === 1 && i.key[FIELD] === 1);

  if (matches.length === 0) {
    console.log("  · No existing index on this field. Creating the correct one.");
  } else {
    for (const idx of matches) {
      if (hasCorrectShape(idx)) {
        console.log(`  · "${idx.name}" already has the correct partialFilterExpression. Leaving as-is.`);
      } else {
        console.log(
          `  · Dropping broken index "${idx.name}" (unique=${idx.unique}, sparse=${idx.sparse})…`,
        );
        await coll.dropIndex(idx.name);
        console.log("  · Dropped.");
      }
    }
  }

  const stillCorrect = (await coll.indexes()).some(
    (i) => i.key && Object.keys(i.key).length === 1 && i.key[FIELD] === 1 && hasCorrectShape(i),
  );

  if (!stillCorrect) {
    console.log(`  · Creating corrected unique+partial index on {${FIELD}}…`);
    await coll.createIndex({ [FIELD]: 1 }, CORRECT_OPTS);
    console.log("  · Created.");
  }

  console.log("\n[fix-settlement-idempotency] Done. Final matching index(es):");
  const finalIndexes = (await coll.indexes()).filter(
    (i) => i.key && Object.keys(i.key).length === 1 && i.key[FIELD] === 1,
  );
  for (const idx of finalIndexes) {
    console.log(`  · ${JSON.stringify(idx)}`);
  }

  const stillBroken = finalIndexes.some((i) => !hasCorrectShape(i));
  if (stillBroken) {
    console.log("\n[fix-settlement-idempotency] WARNING — a broken-shaped index still remains.");
  } else {
    console.log(
      "\n[fix-settlement-idempotency] ✓ Index now only enforces uniqueness among real settlement keys. Orders will no longer collide on null.",
    );
  }

  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error("[fix-settlement-idempotency] Failed", err);
  process.exit(1);
});
