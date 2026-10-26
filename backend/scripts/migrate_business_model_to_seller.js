import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Seller from "../app/models/seller.js";
import SellerSubscription from "../app/models/sellerSubscription.js";

// Moves "business model" (commission vs subscription) BACK from each individual
// STORE up to the seller's OWNER ACCOUNT — one choice per seller, shared by all
// of their shops, with a single account-level subscription whose plan.shopCount
// caps how many shops they may open.
//
// This reverses scripts/migrate_business_model_to_store.js (now deleted), which
// had pushed the choice down to each store.
//
//   node scripts/migrate_business_model_to_seller.js                      # dry run (default)
//   node scripts/migrate_business_model_to_seller.js --apply              # write
//   node scripts/migrate_business_model_to_seller.js --prefer=subscription
//   node scripts/migrate_business_model_to_seller.js --apply --unset-store-fields
//
// Idempotent: only fills a Seller's businessModel when it is still unset, so a
// seller who already has an account-level choice is never overwritten. Safe to
// re-run.
//
// What it does:
//   1. Rolls each store's businessModel / businessModelChosenAt /
//      commissionConfig / businessModelSwitch up onto its owner Seller, for
//      every seller whose own account-level businessModel is still unset. The
//      Store schema no longer declares these fields, so they are read straight
//      off the raw `stores` collection rather than through the Store model.
//   2. CONFLICTS: a seller whose shops disagree (shop A on commission, shop B
//      on subscription) cannot be represented account-level — exactly one model
//      has to win. Every such seller is listed in the output. --prefer picks
//      the rule:
//        earliest (default) — the model of the shop that chose first
//                             (businessModelChosenAt, then store createdAt)
//        subscription       — subscription wins wherever any shop has it
//        commission         — commission wins wherever any shop has it
//   3. Subscription rows need no re-keying: sellerId was kept denormalized on
//      SellerSubscription / SellerSubscriptionPayment / SubscriptionPaymentRequest
//      throughout the per-store period, and the account-level code queries by
//      sellerId. The now-meaningless storeId is simply left in place (the
//      reverted schemas no longer declare it).
//      BUT a seller who bought a separate subscription per shop now has several
//      concurrent active subscriptions, while account-level code expects one —
//      every such seller is listed so the extras can be refunded/cancelled by
//      hand. This script never cancels a subscription on its own.
//   4. --unset-store-fields additionally $unsets the orphaned per-store fields
//      from the `stores` collection once they have been rolled up. Optional —
//      they are inert either way, since nothing reads them any more. Leaving
//      them lets you re-run or audit; unsetting them keeps the documents clean.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const UNSET_STORE_FIELDS = process.argv.includes("--unset-store-fields");

const PREFER = (() => {
  const arg = process.argv.find((a) => a.startsWith("--prefer="));
  const value = arg ? arg.split("=")[1] : "earliest";
  if (!["earliest", "subscription", "commission"].includes(value)) {
    throw new Error(`--prefer must be earliest, subscription or commission (got "${value}")`);
  }
  return value;
})();

const STORE_MODEL_FIELDS = [
  "businessModel",
  "businessModelChosenAt",
  "businessModelSwitch",
  "commissionConfig",
];

async function connect() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGO_URI is required");
  await mongoose.connect(mongoUri);
}

// The Store schema no longer declares these fields, so Store.find() would strip
// them — read the raw collection instead.
function storesCollection() {
  return mongoose.connection.db.collection("stores");
}

function chosenAtOf(store) {
  return store.businessModelChosenAt
    ? new Date(store.businessModelChosenAt).getTime()
    : Number.POSITIVE_INFINITY;
}

function createdAtOf(store) {
  return store.createdAt ? new Date(store.createdAt).getTime() : Number.POSITIVE_INFINITY;
}

// Which of a seller's shops decides the account-level model.
function pickWinningStore(stores) {
  const byEarliest = [...stores].sort(
    (a, b) => chosenAtOf(a) - chosenAtOf(b) || createdAtOf(a) - createdAtOf(b),
  );

  if (PREFER === "earliest") return byEarliest[0];
  return byEarliest.find((s) => s.businessModel === PREFER) || byEarliest[0];
}

async function rollUpBusinessModel() {
  const rawStores = await storesCollection()
    .find(
      { businessModel: { $in: ["commission", "subscription"] } },
      {
        projection: {
          _id: 1,
          ownerId: 1,
          shopName: 1,
          createdAt: 1,
          businessModel: 1,
          businessModelChosenAt: 1,
          businessModelSwitch: 1,
          commissionConfig: 1,
        },
      },
    )
    .toArray();

  const storesByOwner = new Map();
  for (const store of rawStores) {
    if (!store.ownerId) continue;
    const key = String(store.ownerId);
    if (!storesByOwner.has(key)) storesByOwner.set(key, []);
    storesByOwner.get(key).push(store);
  }

  const sellers = await Seller.find({ _id: { $in: [...storesByOwner.keys()] } })
    .select("businessModel name phone")
    .lean();
  const sellerById = new Map(sellers.map((s) => [String(s._id), s]));

  const conflicts = [];
  const updates = [];
  let alreadySet = 0;
  let missingSeller = 0;

  for (const [ownerId, stores] of storesByOwner) {
    const seller = sellerById.get(ownerId);
    if (!seller) {
      missingSeller += 1;
      continue;
    }

    const distinct = [...new Set(stores.map((s) => s.businessModel))];
    const winner = pickWinningStore(stores);

    if (distinct.length > 1) {
      conflicts.push({
        ownerId,
        sellerName: seller.name || "(unnamed)",
        stores: stores.map((s) => ({
          shopName: s.shopName || String(s._id),
          businessModel: s.businessModel,
          chosenAt: s.businessModelChosenAt || null,
        })),
        winningModel: winner.businessModel,
        winningShop: winner.shopName || String(winner._id),
      });
    }

    // Never overwrite a seller who already has an account-level choice.
    if (seller.businessModel === "commission" || seller.businessModel === "subscription") {
      alreadySet += 1;
      continue;
    }

    const $set = { businessModel: winner.businessModel };
    for (const field of STORE_MODEL_FIELDS) {
      if (field === "businessModel") continue;
      if (winner[field] !== undefined && winner[field] !== null) $set[field] = winner[field];
    }
    if (!$set.businessModelChosenAt) $set.businessModelChosenAt = winner.createdAt || new Date();

    updates.push({ ownerId, $set, winningShop: winner.shopName || String(winner._id) });
  }

  if (APPLY) {
    for (const u of updates) {
      await Seller.updateOne({ _id: u.ownerId }, { $set: u.$set });
    }
  }

  return {
    storesScanned: rawStores.length,
    sellersAffected: storesByOwner.size,
    updates,
    conflicts,
    alreadySet,
    missingSeller,
  };
}

async function findMultipleActiveSubscriptions() {
  const rows = await SellerSubscription.aggregate([
    { $match: { status: "active" } },
    { $group: { _id: "$sellerId", count: { $sum: 1 }, subs: { $push: "$_id" } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return rows;
}

async function unsetStoreFields() {
  const filter = { $or: STORE_MODEL_FIELDS.map((f) => ({ [f]: { $exists: true } })) };
  const matched = await storesCollection().countDocuments(filter);
  if (APPLY) {
    await storesCollection().updateMany(filter, {
      $unset: Object.fromEntries(STORE_MODEL_FIELDS.map((f) => [f, ""])),
    });
  }
  return matched;
}

async function main() {
  await connect();
  console.log(
    `\n=== Business model: Store -> Seller account migration (${APPLY ? "APPLY" : "DRY RUN"}) ===`,
  );
  console.log(`Conflict rule: --prefer=${PREFER}\n`);

  const result = await rollUpBusinessModel();
  console.log("Seller.businessModel roll-up:");
  console.log(`  stores carrying a per-store model: ${result.storesScanned}`);
  console.log(`  sellers involved: ${result.sellersAffected}`);
  console.log(`  sellers ${APPLY ? "updated" : "that would be updated"}: ${result.updates.length}`);
  console.log(`  sellers skipped (account-level model already set): ${result.alreadySet}`);
  if (result.missingSeller) {
    console.log(`  stores skipped (owner Seller not found): ${result.missingSeller}`);
  }

  if (result.updates.length) {
    console.log("\n  Per-seller detail:");
    for (const u of result.updates) {
      console.log(`    ${u.ownerId} -> ${u.$set.businessModel}  (from shop "${u.winningShop}")`);
    }
  }

  if (result.conflicts.length) {
    console.log(
      `\n  !! ${result.conflicts.length} seller(s) whose shops DISAGREE — one model had to win:`,
    );
    for (const c of result.conflicts) {
      console.log(`\n    seller ${c.ownerId} (${c.sellerName})`);
      for (const s of c.stores) {
        console.log(
          `      - "${s.shopName}": ${s.businessModel}` +
            (s.chosenAt ? ` (chosen ${new Date(s.chosenAt).toISOString().slice(0, 10)})` : ""),
        );
      }
      console.log(`      => "${c.winningShop}" wins: ${c.winningModel}`);
    }
    console.log(
      "\n    Re-run with --prefer=subscription or --prefer=commission to change who wins.",
    );
  } else {
    console.log("\n  No conflicting sellers (every seller's shops agree).");
  }

  const multiActive = await findMultipleActiveSubscriptions();
  console.log("\nConcurrent active subscriptions (account-level billing expects one per seller):");
  if (multiActive.length) {
    console.log(`  !! ${multiActive.length} seller(s) hold more than one active subscription:`);
    for (const row of multiActive) {
      console.log(`    seller ${row._id}: ${row.count} active -> ${row.subs.join(", ")}`);
    }
    console.log(
      "    Cancel/refund the extras by hand — this script never touches subscription rows.",
    );
  } else {
    console.log("  None — every seller has at most one active subscription.");
  }

  console.log("\nOrphaned per-store fields on the stores collection:");
  if (UNSET_STORE_FIELDS) {
    const matched = await unsetStoreFields();
    console.log(`  ${APPLY ? "unset from" : "would unset from"} ${matched} store document(s)`);
  } else {
    console.log("  left in place (pass --unset-store-fields to clear them)");
  }

  if (!APPLY) console.log("\nDry run only. Re-run with --apply to write changes.");
  await mongoose.disconnect();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
