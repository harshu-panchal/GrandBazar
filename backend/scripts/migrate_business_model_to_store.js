import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Seller from "../app/models/seller.js";
import Store from "../app/models/store.js";
import SellerSubscription from "../app/models/sellerSubscription.js";
import SellerSubscriptionPayment from "../app/models/sellerSubscriptionPayment.js";
import SubscriptionPaymentRequest from "../app/models/subscriptionPaymentRequest.js";

// Moves "business model" (commission vs subscription) from the seller's
// OWNER ACCOUNT to each individual STORE, so a seller with several shops can
// run each one independently (different model, different subscription plan,
// billed separately).
//
//   node scripts/migrate_business_model_to_store.js            # dry run (default)
//   node scripts/migrate_business_model_to_store.js --apply    # write
//
// Idempotent: only fills a Store's businessModel when it is still null, and
// only backfills storeId on subscription rows that don't have one yet. Safe
// to re-run.
//
// What it does:
//   1. For every store whose businessModel is still null, copy down the
//      owner's (deprecated) Seller.businessModel / businessModelChosenAt /
//      commissionConfig / businessModelSwitch — so already-approved sellers
//      keep behaving exactly as before once the code switches to reading
//      Store instead of Seller. A seller with multiple stores gets the SAME
//      account-level choice copied onto every one of their stores (their
//      historical reality: one model for the whole account). From this point
//      on, each store's model is independent and NEW stores pick their own
//      with no account-level default (per product decision).
//   2. SellerSubscription / SellerSubscriptionPayment / SubscriptionPaymentRequest
//      rows created before this migration only have sellerId, no storeId
//      (storeId is now a required field on the schema going forward, but
//      existing rows remain readable — only new .save() calls are validated).
//      Since historical subscriptions were billed per ACCOUNT, there's no
//      stored "which store was this for" — this backfills storeId with the
//      seller's EARLIEST-CREATED store (their original/primary shop at the
//      time), which is the only reasonable attribution for pre-migration
//      data. Flagged per seller in the dry-run output so you can review any
//      seller who already had multiple stores before this ran.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");

async function connect() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGO_URI is required");
  await mongoose.connect(mongoUri);
}

async function backfillStoreBusinessModel() {
  const sellers = await Seller.find({ businessModel: { $in: ["commission", "subscription"] } })
    .select("businessModel businessModelChosenAt businessModelSwitch commissionConfig")
    .lean();
  const sellerById = new Map(sellers.map((s) => [String(s._id), s]));
  if (!sellers.length) return { storesUpdated: 0, sellersWithChoice: 0 };

  const stores = await Store.find({
    ownerId: { $in: sellers.map((s) => s._id) },
    businessModel: null,
  }).select("_id ownerId businessModel");

  let storesUpdated = 0;
  for (const store of stores) {
    const seller = sellerById.get(String(store.ownerId));
    if (!seller) continue;
    storesUpdated += 1;
    if (!APPLY) continue;
    store.businessModel = seller.businessModel;
    store.businessModelChosenAt = seller.businessModelChosenAt || new Date();
    store.businessModelSwitch = seller.businessModelSwitch || store.businessModelSwitch;
    if (seller.commissionConfig) store.commissionConfig = seller.commissionConfig;
    await store.save();
  }
  return { storesUpdated, sellersWithChoice: sellers.length };
}

async function earliestStoreIdBySeller() {
  const stores = await Store.find({}).select("_id ownerId createdAt").sort({ createdAt: 1 }).lean();
  const map = new Map(); // sellerId -> earliest store _id
  const multiStoreSellers = new Set();
  for (const store of stores) {
    const key = String(store.ownerId);
    if (!map.has(key)) {
      map.set(key, store._id);
    } else {
      multiStoreSellers.add(key);
    }
  }
  return { map, multiStoreSellers };
}

async function backfillSubscriptionStoreId(Model, label, { map, multiStoreSellers }) {
  const rows = await Model.find({ storeId: { $exists: false } }).select("_id sellerId").lean();
  let updated = 0;
  let skippedNoStore = 0;
  const flaggedSellers = new Set();
  for (const row of rows) {
    const storeId = map.get(String(row.sellerId));
    if (!storeId) {
      skippedNoStore += 1;
      continue;
    }
    if (multiStoreSellers.has(String(row.sellerId))) {
      flaggedSellers.add(String(row.sellerId));
    }
    updated += 1;
    if (APPLY) {
      await Model.updateOne({ _id: row._id }, { $set: { storeId } });
    }
  }
  return { label, total: rows.length, updated, skippedNoStore, flaggedSellers: flaggedSellers.size };
}

async function main() {
  await connect();
  console.log(`\n=== Business model: Seller -> Store migration (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);

  const storeResult = await backfillStoreBusinessModel();
  console.log("Store.businessModel backfill:");
  console.log(`  sellers with a chosen model: ${storeResult.sellersWithChoice}`);
  console.log(`  stores ${APPLY ? "updated" : "that would be updated"}: ${storeResult.storesUpdated}`);

  console.log("\nSubscription storeId backfill (attributed to each seller's earliest store):");
  const { map, multiStoreSellers } = await earliestStoreIdBySeller();
  console.log(`  sellers with more than one store: ${multiStoreSellers.size} (review these — historical rows all get the SAME earliest store)`);

  for (const [Model, label] of [
    [SellerSubscription, "SellerSubscription"],
    [SellerSubscriptionPayment, "SellerSubscriptionPayment"],
    [SubscriptionPaymentRequest, "SubscriptionPaymentRequest"],
  ]) {
    const r = await backfillSubscriptionStoreId(Model, label, { map, multiStoreSellers });
    console.log(
      `  ${r.label}: ${r.total} missing storeId, ${APPLY ? "updated" : "would update"} ${r.updated}` +
        (r.skippedNoStore ? `, skipped ${r.skippedNoStore} (seller has no store at all)` : "") +
        (r.flaggedSellers ? `, ${r.flaggedSellers} multi-store seller(s) affected` : ""),
    );
  }

  if (!APPLY) console.log("\nDry run only. Re-run with --apply to write changes.");
  await mongoose.disconnect();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
