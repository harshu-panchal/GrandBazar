/**
 * Backfill a default variant onto catalogue-onboarded products that were
 * created before claims auto-created one (they were stored with variants: []
 * and showed "None" in the seller panel until an edit+save materialised a row).
 *
 * Scope: products claimed/imported from the master catalogue (catalogProductId
 * set) that currently have no variants. Seller-authored products are untouched.
 *
 * Dry run by default; pass --apply to write.
 * Usage: node backend/scripts/backfill_default_product_variant.js [--apply]
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

import Product from "../app/models/product.js";
import { ensureDefaultVariant } from "../app/services/catalogClaimService.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGO_URI is not set");
  await mongoose.connect(mongoUri);

  const products = await Product.find({
    catalogProductId: { $ne: null },
    $or: [{ variants: { $size: 0 } }, { variants: { $exists: false } }],
  });

  console.log(`${products.length} catalogue product(s) without a variant${APPLY ? "" : " (dry run)"}`);

  let changed = 0;
  for (const product of products) {
    const [variant] = await ensureDefaultVariant([], {
      name: product.name,
      weight: product.weight,
      price: product.price,
      salePrice: product.salePrice,
      stock: product.stock,
    });

    console.log(
      `${APPLY ? "Adding to" : "Would add to"} ${product.name} (${product._id}): ` +
        `name="${variant.name}" sku=${variant.sku} price=${variant.price} stock=${variant.stock}`,
    );

    if (APPLY) {
      product.variants = [variant];
      await product.save();
      changed += 1;
    }
  }

  console.log(APPLY ? `Done. ${changed} product(s) updated.` : "Dry run only — re-run with --apply to write.");
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
