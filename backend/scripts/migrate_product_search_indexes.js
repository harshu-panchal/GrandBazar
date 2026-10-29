import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Product from "../app/models/product.js";
import CatalogProduct from "../app/models/catalogProduct.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function replaceTextIndex(model, keys, name) {
  const indexes = await model.collection.indexes();
  for (const index of indexes) {
    if (index.name !== "_id_" && Object.values(index.key || {}).includes("text")) {
      await model.collection.dropIndex(index.name);
    }
  }
  await model.collection.createIndex(keys, { name, default_language: "english" });
}

async function run() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGO_URI is required");
  await mongoose.connect(mongoUri);
  await replaceTextIndex(Product, {
    name: "text", tags: "text", searchSynonyms: "text", "localizedNames.name": "text",
  }, "product_search_v2");
  await replaceTextIndex(CatalogProduct, {
    name: "text", tags: "text", alternativeNames: "text", "localizedNames.name": "text",
  }, "catalog_search_v2");
  await mongoose.disconnect();
  console.log("[search] product and catalogue text indexes upgraded");
}

run().catch(async (error) => {
  console.error("[search] migration failed", error.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
