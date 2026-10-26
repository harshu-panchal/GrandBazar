/**
 * Seed the master catalogue with Bengali sweets.
 *
 * Hierarchy used (must already exist as Category docs):
 *   Veg Food (header) > Sweets (category) > Bengoli (subcategory)
 *
 * Idempotent: an item is matched by slug and updated in place, so re-running
 * refreshes copy/images without creating duplicates or breaking sellers who
 * have already claimed the item.
 *
 * Usage: node backend/scripts/seed_catalog_bengali_sweets.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

import Category from "../app/models/category.js";
import CatalogProduct from "../app/models/catalogProduct.js";
import Admin from "../app/models/admin.js";
import { slugify } from "../app/utils/slugify.js";

const HEADER_NAME = "Veg Food";
const CATEGORY_NAME = "Sweets";
const SUBCATEGORY_NAME = "Bengoli";

const SWEETS = [
  {
    name: "Rosogolla",
    description:
      "Soft chhena dumplings simmered in light sugar syrup until they turn spongy and soak up every drop. The classic Bengali mishti, served chilled or at room temperature.",
    brand: "Zinto Mishti",
    weight: "500g",
    tags: ["bengali sweets", "mishti", "rosogolla", "chhena", "vegetarian"],
    alternativeNames: ["Rasgulla", "Roshogolla", "Rasagola"],
    mainImage: "https://upload.wikimedia.org/wikipedia/commons/3/39/Rasgulla.jpg",
    galleryImages: [
      "https://upload.wikimedia.org/wikipedia/commons/a/aa/Chhena_Ball_-_Rasgulla_Preparation_-_Digha_-_East_Midnapore_-_2015-05-02_9555.JPG",
    ],
    productDisclaimer:
      "Fresh chhena sweet with no preservatives. Keep refrigerated and consume within 24 hours of delivery.",
    variants: [
      { name: "4 pieces", weight: "250g", sku: "rosog-250" },
      { name: "8 pieces", weight: "500g", sku: "rosog-500" },
      { name: "16 pieces", weight: "1kg", sku: "rosog-1000" },
    ],
  },
  {
    name: "Sandesh",
    description:
      "Fresh chhena kneaded with sugar and gently cooked, then pressed into delicate moulds. Light, milky and not overly sweet — the everyday pride of a Bengali sweet shop.",
    brand: "Zinto Mishti",
    weight: "400g",
    tags: ["bengali sweets", "mishti", "sandesh", "chhena", "vegetarian"],
    alternativeNames: ["Shondesh", "Sondesh", "Kacha Golla"],
    mainImage: "https://upload.wikimedia.org/wikipedia/commons/5/55/Sandesh_3.jpg",
    galleryImages: [],
    productDisclaimer:
      "Fresh chhena sweet with no preservatives. Keep refrigerated and consume within 24 hours of delivery.",
    variants: [
      { name: "6 pieces", weight: "400g", sku: "sande-400" },
      { name: "12 pieces", weight: "800g", sku: "sande-800" },
    ],
  },
  {
    name: "Mishti Doi",
    description:
      "Slow-reduced milk sweetened with jaggery and set in earthen pots, giving a thick caramel-toned curd with a gentle tang. Best served straight from the clay pot.",
    brand: "Zinto Mishti",
    weight: "400g",
    tags: ["bengali sweets", "mishti", "mishti doi", "curd", "vegetarian"],
    alternativeNames: ["Misti Doi", "Sweet Curd", "Payodhi"],
    mainImage: "https://upload.wikimedia.org/wikipedia/commons/3/34/Mishti_Doi.jpg",
    galleryImages: [],
    productDisclaimer:
      "Set in a traditional earthen pot. Keep refrigerated and consume within 48 hours of delivery.",
    variants: [
      { name: "Single pot", weight: "200g", sku: "mdoi-200" },
      { name: "Family pot", weight: "400g", sku: "mdoi-400" },
    ],
  },
  {
    name: "Chomchom",
    description:
      "Oblong chhena sweets poached in syrup and finished with a dusting of khoya and coconut. Denser than a rosogolla, with a rich, chewy bite.",
    brand: "Zinto Mishti",
    weight: "500g",
    tags: ["bengali sweets", "mishti", "chomchom", "chhena", "vegetarian"],
    alternativeNames: ["Cham Cham", "Chum Chum", "Chamcham"],
    mainImage: "https://upload.wikimedia.org/wikipedia/commons/c/c5/BD_Porabarir_Chamcham.JPG",
    galleryImages: [],
    productDisclaimer:
      "Fresh chhena sweet with no preservatives. Keep refrigerated and consume within 24 hours of delivery.",
    variants: [
      { name: "4 pieces", weight: "250g", sku: "chomc-250" },
      { name: "8 pieces", weight: "500g", sku: "chomc-500" },
    ],
  },
  {
    name: "Rasmalai",
    description:
      "Flattened chhena patties resting in saffron and cardamom thickened milk, topped with slivered pistachio and almond. Served chilled.",
    brand: "Zinto Mishti",
    weight: "500g",
    tags: ["bengali sweets", "mishti", "rasmalai", "chhena", "vegetarian"],
    alternativeNames: ["Ras Malai", "Rossomalai", "Roshmalai"],
    mainImage: "https://upload.wikimedia.org/wikipedia/commons/a/ae/Ras_Malai_2.JPG",
    galleryImages: [],
    productDisclaimer:
      "Contains tree nuts (pistachio, almond). Keep refrigerated and consume within 24 hours of delivery.",
    variants: [
      { name: "4 pieces", weight: "250g", sku: "rasma-250" },
      { name: "8 pieces", weight: "500g", sku: "rasma-500" },
    ],
  },
];

async function resolveCategory(name, type, expectedParentId) {
  const doc = await Category.findOne({ name, type }).lean();
  if (!doc) {
    throw new Error(`Category not found: "${name}" (type: ${type}). Create it in the admin panel first.`);
  }
  if (expectedParentId && String(doc.parentId) !== String(expectedParentId)) {
    throw new Error(
      `Category "${name}" (${doc._id}) is not a child of the expected parent ${expectedParentId}.`,
    );
  }
  return doc;
}

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGO_URI is not set");
  await mongoose.connect(mongoUri);

  const admin = await Admin.findOne({}).sort({ createdAt: 1 }).lean();
  if (!admin) throw new Error("No admin found — catalog items need a createdBy admin.");

  const header = await resolveCategory(HEADER_NAME, "header");
  const category = await resolveCategory(CATEGORY_NAME, "category", header._id);
  const subcategory = await resolveCategory(SUBCATEGORY_NAME, "subcategory", category._id);

  console.log(
    `Seeding into ${header.name} (${header._id}) > ${category.name} (${category._id}) > ${subcategory.name} (${subcategory._id})`,
  );

  let created = 0;
  let updated = 0;

  for (const sweet of SWEETS) {
    const slug = slugify(sweet.name);
    const payload = {
      ...sweet,
      slug,
      headerId: header._id,
      categoryId: category._id,
      subcategoryId: subcategory._id,
      status: "active",
      // Commission is inherited from the Sweets category unless an admin
      // overrides it per item in the panel.
      applyCommission: false,
      adminCommission: 0,
      adminCommissionType: "percentage",
      adminCommissionValue: 0,
      adminCommissionFixedRule: "per_qty",
      createdBy: admin._id,
    };

    const existing = await CatalogProduct.findOne({ slug });
    if (existing) {
      existing.set(payload);
      await existing.save();
      updated++;
      console.log(`Updated: ${sweet.name} (${existing._id})`);
    } else {
      const doc = await CatalogProduct.create(payload);
      created++;
      console.log(`Created: ${sweet.name} (${doc._id})`);
    }
  }

  console.log(`Done. ${created} created, ${updated} updated.`);
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
