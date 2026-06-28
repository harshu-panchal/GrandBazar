/**
 * Backfill businessModel for approved seller owners.
 * Existing sellers default to commission + category-scoped rates (no behavior change).
 *
 * Usage: node backend/scripts/migrate_seller_business_model.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

import Seller from "../app/models/seller.js";

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI is not configured");
  }

  await mongoose.connect(mongoUri);

  const result = await Seller.updateMany(
    {
      accountType: { $in: ["owner", null] },
      $or: [
        { businessModel: { $exists: false } },
        { businessModel: null },
      ],
      applicationStatus: "approved",
      isVerified: true,
    },
    {
      $set: {
        businessModel: "commission",
        businessModelChosenAt: new Date(),
        commissionConfig: {
          scope: "category",
          type: "percentage",
          value: 0,
          fixedRule: "per_qty",
          categoryOverrides: [],
        },
      },
    },
  );

  console.log(
    `Migration complete. Matched ${result.matchedCount}, modified ${result.modifiedCount} seller owners.`,
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Migration failed:", error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
