import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Store from "../app/models/store.js";
import Product from "../app/models/product.js";
import Category from "../app/models/category.js";
import { slugify } from "../app/utils/slugify.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function connect() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGO_URI is required");
  await mongoose.connect(mongoUri);
}

async function ensureUniqueSlug(model, value, docId, fallback = "item") {
  const base = slugify(value || fallback) || fallback;
  let candidate = base;
  let attempt = 0;
  while (attempt < 100) {
    const exists = await model.exists({ slug: candidate, _id: { $ne: docId } });
    if (!exists) return candidate;
    attempt += 1;
    candidate = `${base}-${String(docId).slice(-6)}-${attempt}`;
  }
  return `${base}-${String(docId).slice(-6)}`;
}

async function backfillStores() {
  const cursor = Store.find({ $or: [{ slug: { $exists: false } }, { slug: "" }] }).cursor();
  let updated = 0;
  for await (const store of cursor) {
    store.slug = await ensureUniqueSlug(Store, store.shopName || "store", store._id, "store");
    await store.save();
    updated += 1;
  }
  return updated;
}

async function normalizeEntitySlugs(model, labelField, fallback) {
  const cursor = model.find({}).cursor();
  let updated = 0;
  for await (const doc of cursor) {
    const expected = await ensureUniqueSlug(model, doc[labelField] || fallback, doc._id, fallback);
    if (doc.slug !== expected) {
      doc.slug = expected;
      await doc.save();
      updated += 1;
    }
  }
  return updated;
}

async function run() {
  await connect();
  const stores = await backfillStores();
  const products = await normalizeEntitySlugs(Product, "name", "product");
  const categories = await normalizeEntitySlugs(Category, "name", "category");
  console.log(`[seo] store slugs backfilled: ${stores}`);
  console.log(`[seo] product slugs normalized: ${products}`);
  console.log(`[seo] category slugs normalized: ${categories}`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("[seo] migration failed", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
