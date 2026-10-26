import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import AdminRole from "../app/models/adminRole.js";

// Grants the new "sellers.admin_requests" permission to every admin role that
// already holds "sellers.pending", so nobody loses sight of seller admin
// registrations when they move onto their own screen.
//
//   node scripts/grant_seller_admin_requests_permission.js            # dry run (default)
//   node scripts/grant_seller_admin_requests_permission.js --apply    # write
//
// Idempotent: a role that already has the new key is left alone, so this is
// safe to re-run. Super admins bypass permission checks entirely and are
// unaffected either way.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");

const SOURCE_PERMISSION = "sellers.pending";
const NEW_PERMISSION = "sellers.admin_requests";

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGO_URI is required");
  await mongoose.connect(mongoUri);

  console.log(`\n=== Grant ${NEW_PERMISSION} (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);

  const roles = await AdminRole.find({ permissions: SOURCE_PERMISSION })
    .select("name label permissions")
    .lean();

  const needing = roles.filter((r) => !(r.permissions || []).includes(NEW_PERMISSION));

  console.log(`roles holding ${SOURCE_PERMISSION}: ${roles.length}`);
  console.log(`roles ${APPLY ? "updated" : "that would be updated"}: ${needing.length}`);
  console.log(`roles already holding ${NEW_PERMISSION}: ${roles.length - needing.length}`);

  for (const role of needing) {
    console.log(`  + ${role.name}${role.label ? ` (${role.label})` : ""}`);
  }

  if (APPLY && needing.length) {
    const result = await AdminRole.updateMany(
      { _id: { $in: needing.map((r) => r._id) } },
      { $addToSet: { permissions: NEW_PERMISSION } },
    );
    console.log(`\nmodified ${result.modifiedCount} role document(s)`);
  }

  if (!APPLY) console.log("\nDry run only. Re-run with --apply to write changes.");
  await mongoose.disconnect();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
