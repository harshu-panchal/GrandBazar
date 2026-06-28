import Product from "../models/product.js";
import { slugify } from "../utils/slugify.js";

export function makeProductSku(name, index = 1) {
  const prefix = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 5) || "item";
  return `${prefix}-${String(index).padStart(3, "0")}`;
}

export async function generateDistinctSlug(chosenName, sellerId) {
  let distinctSlug = `${slugify(chosenName)}-${sellerId.toString().slice(-6)}`;
  let slugExists = await Product.findOne({ slug: distinctSlug });
  let slugCounter = 1;
  while (slugExists) {
    distinctSlug = `${slugify(chosenName)}-${sellerId.toString().slice(-6)}-${slugCounter}`;
    slugExists = await Product.findOne({ slug: distinctSlug });
    slugCounter += 1;
  }
  return distinctSlug;
}

export async function generateDistinctSku(baseSku) {
  let finalSku = baseSku;
  let skuExists = await Product.findOne({ sku: finalSku });
  let skuCounter = 1;
  while (skuExists) {
    finalSku = `${baseSku}-${skuCounter}`;
    skuExists = await Product.findOne({ sku: finalSku });
    skuCounter += 1;
  }
  return finalSku;
}

export async function createProductFromCatalog({
  catalogProduct,
  sellerId,
  chosenName,
  price = 0,
  salePrice = 0,
  stock = 0,
  mainImage,
  galleryImages,
  variants = [],
  importSource = "catalog_claim",
  isPublished = true,
  status = "active",
}) {
  const name = chosenName || catalogProduct.name;
  const distinctSlug = await generateDistinctSlug(name, sellerId);
  const baseSku = makeProductSku(name, 1);
  const finalSku = await generateDistinctSku(baseSku);

  const variantsWithSku = [];
  for (let idx = 0; idx < variants.length; idx += 1) {
    const variant = variants[idx];
    const baseVarSku = variant.sku && String(variant.sku).trim()
      ? String(variant.sku).trim()
      : makeProductSku(name, idx + 2);
    const varSku = await generateDistinctSku(baseVarSku);
    variantsWithSku.push({ ...variant, sku: varSku });
  }

  return Product.create({
    catalogProductId: catalogProduct._id,
    sellerId,
    name,
    slug: distinctSlug,
    sku: finalSku,
    description: catalogProduct.description,
    price: Number(price),
    salePrice: Number(salePrice) || 0,
    stock: Number(stock),
    brand: catalogProduct.brand || "",
    weight: catalogProduct.weight || "",
    tags: catalogProduct.tags || [],
    mainImage: mainImage && String(mainImage).trim()
      ? String(mainImage).trim()
      : catalogProduct.mainImage,
    galleryImages: Array.isArray(galleryImages) && galleryImages.length > 0
      ? galleryImages
      : (catalogProduct.galleryImages || []),
    headerId: catalogProduct.headerId,
    categoryId: catalogProduct.categoryId,
    subcategoryId: catalogProduct.subcategoryId,
    status,
    approvalStatus: "approved",
    variants: variantsWithSku,
    importSource,
    isPublished,
  });
}

export function getCustomerVisibleProductFilter() {
  return {
    status: "active",
    isPublished: { $ne: false },
  };
}
