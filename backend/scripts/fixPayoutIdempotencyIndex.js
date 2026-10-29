/**
 * Replace the legacy sparse payout idempotency index. Sparse unique indexes
 * still index explicit nulls, and Payout used to default this field to null;
 * that prevented every payout after the first from being inserted.
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../app/dbConfig/dbConfig.js";
import Payout from "../app/models/payout.js";

dotenv.config();

const FIELD = "idempotencyKey";

function hasCorrectShape(index) {
  return (
    index.unique === true &&
    index.sparse !== true &&
    index.partialFilterExpression?.[FIELD]?.$type === "string"
  );
}

async function run() {
  await connectDB();
  const collection = Payout.collection;
  const duplicates = await collection
    .aggregate([
      { $match: { [FIELD]: { $type: "string" } } },
      { $group: { _id: `$${FIELD}`, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ])
    .toArray();

  if (duplicates.length > 0) {
    throw new Error(
      `Duplicate payout idempotency key found; refusing index rebuild: ${duplicates[0]._id}`,
    );
  }

  const indexes = await collection.indexes();
  const matchingIndexes = indexes.filter(
    (index) =>
      index.key &&
      Object.keys(index.key).length === 1 &&
      index.key[FIELD] === 1,
  );

  for (const index of matchingIndexes) {
    if (!hasCorrectShape(index)) {
      await collection.dropIndex(index.name);
      console.log(`[fix-payout-idempotency] Dropped legacy index "${index.name}".`);
    }
  }

  const correctedIndexExists = (await collection.indexes()).some(
    (index) =>
      index.key &&
      Object.keys(index.key).length === 1 &&
      index.key[FIELD] === 1 &&
      hasCorrectShape(index),
  );

  if (!correctedIndexExists) {
    await collection.createIndex(
      { [FIELD]: 1 },
      {
        unique: true,
        partialFilterExpression: { [FIELD]: { $type: "string" } },
      },
    );
  }

  console.log(
    "[fix-payout-idempotency] Unique index now applies only to actual string keys.",
  );
  await mongoose.connection.close();
}

run().catch(async (error) => {
  console.error("[fix-payout-idempotency] Failed", error);
  await mongoose.connection.close().catch(() => {});
  process.exitCode = 1;
});
