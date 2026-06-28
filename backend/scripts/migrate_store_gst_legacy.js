/**
 * Legacy stores created before GST was required can remain exempt.
 * Usage: node backend/scripts/migrate_store_gst_legacy.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

import Store from "../app/models/store.js";

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(mongoUri);

  const result = await Store.updateMany(
    {
      $or: [{ gstNumber: { $exists: false } }, { gstNumber: null }, { gstNumber: "" }],
      applicationStatus: "approved",
    },
    { $set: { gstExempt: true } },
  );

  console.log(`Marked ${result.modifiedCount} approved legacy stores as gstExempt`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
