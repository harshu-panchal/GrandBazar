import Product from "../models/product.js";
import { slugify } from "../utils/slugify.js";
import { catalogFieldsForProduct } from "./productFormService.js";

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

// A product claimed without any priced variant used to be stored with an empty
// `variants` array, so the seller panel showed "None" until they opened the
// edit form (which silently materialises a default row) and saved. Every
// onboarded product now gets one default variant up front, carrying the
// product-level price/stock, so what the seller sees right after onboarding is
// what is actually stored.
export const DEFAULT_VARIANT_NAME = "Standard";

export async function ensureDefaultVariant(
  variants,
  { name, weight, price, salePrice, stock } = {},
) {
  if (Array.isArray(variants) && variants.length > 0) return variants;

  // Name it after the pack size when the catalogue defines one ("500g"), so the
  // customer-facing variant chip reads as a real choice rather than a label.
  const variantName = String(weight || "").trim() || DEFAULT_VARIANT_NAME;
  const sku = await generateDistinctSku(makeProductSku(name, 2));

  return [
    {
      name: variantName,
      price: Number(price) || 0,
      salePrice: Number(salePrice) || 0,
      stock: Number(stock) || 0,
      sku,
    },
  ];
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

  const resolvedVariants = await ensureDefaultVariant(variantsWithSku, {
    name,
    weight: catalogProduct.weight,
    price,
    salePrice,
    stock,
  });

  return Product.create({
    ...catalogFieldsForProduct(
      typeof catalogProduct.toObject === "function" ? catalogProduct.toObject() : catalogProduct,
    ),
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
    productDisclaimer: catalogProduct.productDisclaimer || "",
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
    applyCommission: catalogProduct.applyCommission === true,
    adminCommission: Number(catalogProduct.adminCommission ?? 0) || 0,
    adminCommissionType: catalogProduct.adminCommissionType || "percentage",
    adminCommissionValue: Number(
      catalogProduct.adminCommissionValue ?? catalogProduct.adminCommission ?? 0,
    ) || 0,
    adminCommissionFixedRule: catalogProduct.adminCommissionFixedRule || "per_qty",
    status,
    approvalStatus: "approved",
    variants: resolvedVariants,
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
