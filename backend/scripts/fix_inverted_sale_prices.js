/**
 * Clear sale prices that are not a genuine discount (salePrice >= price), at
 * both product and variant level. Such a pair made the listing card advertise
 * the HIGHER figure while the cart and order total used the lower one.
 *
 * A sale price that is equal to or above the base price means "no discount",
 * so it is reset to 0 rather than guessed at.
 *
 * Dry run by default; pass --apply to write.
 * Usage: node backend/scripts/fix_inverted_sale_prices.js [--apply]
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

import Product from "../app/models/product.js";
import { computeCustomerPriceFieldsForWrite } from "../app/services/finance/customerPriceService.js";
import { invalidate, buildKey } from "../app/services/cacheService.js";
import { enqueueProductIndex } from "../app/services/searchSyncService.js";

const APPLY = process.argv.includes("--apply");
const isInverted = (price, salePrice) => {
  const base = Number(price || 0);
  const sale = Number(salePrice || 0);
  return sale > 0 && base > 0 && sale >= base;
};

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGO_URI is not set");
  await mongoose.connect(mongoUri);

  const products = await Product.find({ salePrice: { $gt: 0 } }).select(
    "name price salePrice variants",
  );

  let productLevel = 0;
  let variantLevel = 0;
  const touched = [];

  for (const product of products) {
    let changed = false;
    const notes = [];

    if (isInverted(product.price, product.salePrice)) {
      notes.push(`product ${product.price}/${product.salePrice} -> salePrice 0`);
      product.salePrice = 0;
      productLevel += 1;
      changed = true;
    }

    for (const variant of product.variants || []) {
      if (isInverted(variant.price, variant.salePrice)) {
        notes.push(`variant "${variant.name}" ${variant.price}/${variant.salePrice} -> salePrice 0`);
        variant.salePrice = 0;
        variantLevel += 1;
        changed = true;
      }
    }

    if (changed) {
      touched.push(`${product.name} (${product._id}): ${notes.join("; ")}`);
      if (APPLY) await product.save();
    }
  }

  // Clearing salePrice leaves the commission-inclusive customerSalePrice stale
  // (a 0 sale price with a 115 customerSalePrice still on record), so every
  // product whose two disagree gets its customer-facing prices recomputed.
  const stale = await Product.find({
    salePrice: { $lte: 0 },
    customerSalePrice: { $gt: 0 },
  });
  for (const product of stale) {
    console.log(
      `${APPLY ? "Recomputing" : "Would recompute"} customer price for ${product.name} (${product._id})`,
    );
    if (APPLY) {
      const fields = await computeCustomerPriceFieldsForWrite(product.toObject());
      await Product.updateOne({ _id: product._id }, { $set: fields });
    }
  }
  console.log(`${stale.length} product(s) with a stale customerSalePrice.`);

  // Writing straight to Mongo bypasses the invalidation the API controllers do
  // on every price change, so cached listings keep serving the old prices (a
  // cleared sale price still showing its strikethrough). Clear them here.
  if (APPLY) {
    const changedIds = new Set([
      ...touched.map((line) => line.split("(")[1]?.split(")")[0]).filter(Boolean),
      ...stale.map((product) => String(product._id)),
    ]);
    for (const id of changedIds) {
      await invalidate(`cache:catalog:product:${id}`);
      await enqueueProductIndex(id);
    }
    await invalidate(buildKey("catalog", "productList", "*"));
    await invalidate("cache:offersections:public:*");
    console.log(`Invalidated caches for ${changedIds.size} product(s) and the product listings.`);
  }

  touched.forEach((line) => console.log(`${APPLY ? "Fixed" : "Would fix"} ${line}`));
  console.log(
    `\n${touched.length} product(s) affected — ${productLevel} product-level, ${variantLevel} variant-level sale price(s).`,
  );
  console.log(APPLY ? "Applied." : "Dry run only — re-run with --apply to write.");

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
