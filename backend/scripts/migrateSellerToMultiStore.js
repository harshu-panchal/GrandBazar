/*
 * Multi-store rollout:
 * 1. Deploy backend + frontend with Store model (backward compatible).
 * 2. Run: node scripts/migrateSellerToMultiStore.js (dry-run), then --apply.
 * 3. Verify pending admin queue shows stores; approve a test store.
 * 4. Owner login → My Stores → create/switch stores.
 */
 * Preserves Store._id = legacy owner Seller._id so product/order URLs stay valid.
 *
 * Run (dry-run): node scripts/migrateSellerToMultiStore.js
 * Run (apply):    node scripts/migrateSellerToMultiStore.js --apply
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../app/dbConfig/dbConfig.js";
import Store from "../app/models/store.js";
import Seller from "../app/models/seller.js";

dotenv.config();

const STORE_FIELDS = [
  "shopName", "category", "description", "banners", "storeVideo",
  "address", "locality", "pincode", "city", "state",
  "documents", "aadharNumber", "panNumber", "accountHolder", "accountNumber", "ifsc", "bankName",
  "isVerified", "applicationStatus", "reviewedAt", "reviewedBy", "rejectionReason", "isActive",
  "location", "serviceRadius",
];

function isLegacyOwner(doc) {
  if (!doc || doc.parentId) return false;
  if (doc.accountType === "owner" || doc.accountType === "staff") return false;
  return Boolean(doc.shopName);
}

function isLegacyStaff(doc) {
  if (!doc || !doc.parentId) return false;
  if (doc.accountType === "staff") return false;
  return true;
}

function extractStoreFields(doc) {
  const store = { ownerId: null };
  for (const field of STORE_FIELDS) {
    if (doc[field] !== undefined) {
      store[field] = doc[field];
    }
  }
  return store;
}

async function run() {
  const apply = process.argv.includes("--apply");
  await connectDB();

  const db = mongoose.connection.db;
  const sellersCol = db.collection("sellers");

  const allSellers = await sellersCol.find({}).toArray();
  let ownersMigrated = 0;
  let staffUpdated = 0;
  let skipped = 0;

  for (const doc of allSellers) {
    if (isLegacyOwner(doc)) {
      const storeId = doc._id;
      const existingStore = await Store.findById(storeId).lean();
      if (existingStore) {
        skipped += 1;
        continue;
      }

      const accountId = new mongoose.Types.ObjectId();
      const storeData = extractStoreFields(doc);
      storeData._id = storeId;
      storeData.ownerId = accountId;

      const accountData = {
        _id: accountId,
        name: doc.name,
        email: doc.email,
        phone: doc.phone,
        password: doc.password,
        accountType: "owner",
        role: doc.role || "seller",
        emailVerified: doc.emailVerified ?? false,
        phoneVerified: doc.phoneVerified ?? false,
        lastLogin: doc.lastLogin || null,
        lastActiveStoreId: storeId,
        createdAt: doc.createdAt || new Date(),
        updatedAt: doc.updatedAt || new Date(),
      };

      console.log(`[migrate] Owner "${doc.email}" → account ${accountId}, store ${storeId} (${doc.shopName})`);

      if (apply) {
        await Store.create(storeData);
        await sellersCol.deleteOne({ _id: storeId });
        await sellersCol.insertOne(accountData);
      }
      ownersMigrated += 1;
    } else if (isLegacyStaff(doc)) {
      console.log(`[migrate] Staff "${doc.email}" → accountType staff, parentId store ${doc.parentId}`);
      if (apply) {
        await sellersCol.updateOne(
          { _id: doc._id },
          {
            $set: {
              accountType: "staff",
              role: doc.role || "staff",
            },
            $unset: {
              shopName: "",
              category: "",
              description: "",
              banners: "",
              storeVideo: "",
              address: "",
              locality: "",
              pincode: "",
              city: "",
              state: "",
              documents: "",
              aadharNumber: "",
              panNumber: "",
              accountHolder: "",
              accountNumber: "",
              ifsc: "",
              bankName: "",
              isVerified: "",
              applicationStatus: "",
              reviewedAt: "",
              reviewedBy: "",
              rejectionReason: "",
              isActive: "",
              location: "",
              serviceRadius: "",
            },
          },
        );
      }
      staffUpdated += 1;
    } else {
      skipped += 1;
    }
  }

  console.log(`\n[migrateSellerToMultiStore] ${apply ? "APPLIED" : "DRY-RUN"}`);
  console.log(`  Owners migrated: ${ownersMigrated}`);
  console.log(`  Staff updated:   ${staffUpdated}`);
  console.log(`  Skipped:         ${skipped}`);
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
