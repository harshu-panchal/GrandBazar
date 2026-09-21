import mongoose from "mongoose";
import CatalogProduct from "../models/catalogProduct.js";
import Product from "../models/product.js";
import { handleResponse } from "../utils/helper.js";
import { slugify } from "../utils/slugify.js";
import getPagination from "../utils/pagination.js";
import { uploadToCloudinary } from "../services/mediaService.js";
import { resolveCategoryName } from "../services/entityNameCache.js";
import { invalidate, buildKey } from "../services/cacheService.js";
import { enqueueProductIndex } from "../services/searchSyncService.js";
import { computeCustomerPriceFieldsForWrite } from "../services/finance/customerPriceService.js";

// Helper to auto-generate SKU prefix
function makeProductSku(name, index = 1) {
  const prefix = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 5) || "item";
  return `${prefix}-${String(index).padStart(3, "0")}`;
}

function normalizeCatalogCommissionFields(data = {}) {
  const apply =
    data.applyCommission === true || data.applyCommission === "true";
  const rawValue = Number(
    data.adminCommissionValue ?? data.adminCommission ?? 0,
  );
  const value = Number.isFinite(rawValue) ? Math.max(rawValue, 0) : 0;
  const type =
    data.adminCommissionType === "fixed" ? "fixed" : "percentage";
  const fixedRule =
    data.adminCommissionFixedRule === "per_item" ? "per_item" : "per_qty";

  return {
    applyCommission: apply,
    adminCommission: apply ? value : 0,
    adminCommissionType: type,
    adminCommissionValue: apply ? value : 0,
    adminCommissionFixedRule: fixedRule,
  };
}

// --- Claiming a catalogue item with variants -------------------------------
// The admin's catalogue variants are only suggestions: a seller may price some
// of them, skip the rest, or add variants of their own. A variant without a
// price is simply not created.

function parseClaimVariants(raw) {
  let list = [];
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch (e) {}
  } else if (Array.isArray(raw)) {
    list = raw;
  }
  return Array.isArray(list) ? list.filter((v) => v && String(v.name || "").trim()) : [];
}

const claimVariantEffectivePrice = (v) => {
  const mrp = Number(v.price) || 0;
  const sale = Number(v.salePrice) || 0;
  return sale > 0 && sale < mrp ? sale : mrp;
};

// Keeps the priced variants, validates them, and derives the product-level
// price / sale price / stock (cheapest variant, total stock) unless the caller
// already supplied them. Returns { error } or the resolved values.
function resolveClaimPricing({ variants, price, salePrice, stock }) {
  const kept = variants.filter((v) => Number(v.price) > 0);

  for (const v of kept) {
    if (v.stock === undefined || v.stock === null || v.stock === "" || !(Number(v.stock) >= 0)) {
      return { error: `Valid stock is required for variant "${String(v.name).trim()}"` };
    }
  }
  const names = kept.map((v) => String(v.name).trim().toLowerCase());
  if (new Set(names).size !== names.length) {
    return { error: "Variant names must be different from each other" };
  }

  let resolvedPrice = price;
  let resolvedSalePrice = salePrice;
  let resolvedStock = stock;
  if (kept.length > 0) {
    const cheapest = kept.reduce((best, v) =>
      claimVariantEffectivePrice(v) < claimVariantEffectivePrice(best) ? v : best,
    );
    if (!resolvedPrice || Number(resolvedPrice) <= 0) {
      resolvedPrice = Number(cheapest.price);
      resolvedSalePrice = Number(cheapest.salePrice) || 0;
    }
    if (resolvedStock === undefined || resolvedStock === null || resolvedStock === "") {
      resolvedStock = kept.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
    }
  } else if (variants.length > 0 && !(Number(resolvedPrice) > 0)) {
    return { error: "Set a price for at least one variant" };
  }

  return { variants: kept, price: resolvedPrice, salePrice: resolvedSalePrice, stock: resolvedStock };
}

// Gives every variant a unique SKU (the seller's own if provided and free).
async function buildClaimVariantsWithSku(chosenName, variants) {
  const withSku = [];
  for (let idx = 0; idx < variants.length; idx++) {
    const v = variants[idx];
    const baseVarSku = v.sku && String(v.sku).trim() ? String(v.sku).trim() : makeProductSku(chosenName, idx + 2);
    let varSku = baseVarSku;
    let varSkuExists = await Product.findOne({ sku: varSku });
    let varSkuCounter = 1;
    while (varSkuExists || withSku.some((item) => item.sku === varSku)) {
      varSku = `${baseVarSku}-${varSkuCounter}`;
      varSkuExists = await Product.findOne({ sku: varSku });
      varSkuCounter++;
    }
    withSku.push({
      name: String(v.name).trim(),
      price: Number(v.price),
      salePrice: Number(v.salePrice) || 0,
      stock: Number(v.stock),
      sku: varSku,
    });
  }
  return withSku;
}

// Stores the customer-facing (commission-inclusive) price on a product. The
// customer app reads customerPrice / customerSalePrice (per product and per
// variant); while they are null it falls back to the seller's raw price, so a
// freshly claimed item would show WITHOUT commission until someone re-saved it.
// Non-blocking, same as createProduct / updateProduct.
async function applyCustomerPricing(product, overrides = {}) {
  try {
    const plain = typeof product.toObject === "function" ? product.toObject() : product;
    const fields = await computeCustomerPriceFieldsForWrite({ ...plain, ...overrides });
    await Product.updateOne({ _id: product._id }, { $set: fields });
  } catch (err) {
    console.error("Catalog: customerPrice computation failed (non-blocking):", err.message);
  }
}

/* ===============================
   ADMIN: CREATE CATALOG PRODUCT
   =============================== */
export const createCatalogProduct = async (req, res) => {
  try {
    const productData = { ...req.body };
    const files = req.files || [];

    // Upload files if present in multipart
    if (files.length > 0) {
      const galleryUrls = [];
      for (const file of files) {
        try {
          if (file.fieldname === "mainImage") {
            const url = await uploadToCloudinary(file.buffer, "catalog", {
              mimeType: file.mimetype,
              resourceType: "image",
            });
            productData.mainImage = url;
          } else if (file.fieldname === "galleryImages") {
            const url = await uploadToCloudinary(file.buffer, "catalog", {
              mimeType: file.mimetype,
              resourceType: "image",
            });
            galleryUrls.push(url);
          }
        } catch (err) {
          console.error("Cloudinary catalog upload failed:", err);
        }
      }
      if (galleryUrls.length > 0) {
        productData.galleryImages = galleryUrls;
      }
    }

    // Parse arrays and JSON strings if they came through FormData
    if (typeof productData.tags === "string") {
      try {
        productData.tags = JSON.parse(productData.tags);
      } catch (e) {
        productData.tags = productData.tags.split(",").map(t => t.trim()).filter(Boolean);
      }
    }
    if (typeof productData.alternativeNames === "string") {
      try {
        productData.alternativeNames = JSON.parse(productData.alternativeNames);
      } catch (e) {
        productData.alternativeNames = productData.alternativeNames.split(",").map(n => n.trim()).filter(Boolean);
      }
    }
    if (typeof productData.galleryImages === "string") {
      try {
        productData.galleryImages = JSON.parse(productData.galleryImages);
      } catch (e) {}
    }
    if (typeof productData.variants === "string") {
      try {
        productData.variants = JSON.parse(productData.variants);
      } catch (e) {
        productData.variants = [];
      }
    }
    if (Array.isArray(productData.variants)) {
      productData.variants = productData.variants
        .filter((v) => v && String(v.name || "").trim())
        .map((v) => ({
          name: String(v.name || "").trim(),
          weight: String(v.weight || "").trim(),
          sku: String(v.sku || "").trim(),
        }));
    }

    if (!productData.name) {
      return handleResponse(res, 400, "Catalog product name is required");
    }
    if (!productData.description) {
      return handleResponse(res, 400, "Catalog product description is required");
    }
    if (!productData.headerId || !productData.categoryId || !productData.subcategoryId) {
      return handleResponse(res, 400, "Category hierarchy (header, category, subcategory) is required");
    }
    if (!productData.mainImage) {
      return handleResponse(res, 400, "Catalog main image is required");
    }

    // Auto-generate slug
    productData.slug = slugify(productData.name);
    // Double-check slug uniqueness in catalog
    const existing = await CatalogProduct.findOne({ slug: productData.slug });
    if (existing) {
      productData.slug = `${productData.slug}-${Date.now().toString().slice(-4)}`;
    }

    productData.createdBy = req.user.id;
    Object.assign(productData, normalizeCatalogCommissionFields(productData));

    const catalogProduct = await CatalogProduct.create(productData);
    return handleResponse(res, 201, "Catalog product created successfully", catalogProduct);
  } catch (error) {
    console.error("Create Catalog Product Error:", error);
    return handleResponse(res, 500, error.message);
  }
};

/* ===================================
   ADMIN: CREATE CATALOG PRODUCTS BULK
   =================================== */
export const createCatalogProductsBulk = async (req, res) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      return handleResponse(res, 400, "An array of products is required");
    }

    const createdBy = req.user.id;
    const validatedProducts = [];

    for (const item of products) {
      if (!item.name || !item.description || !item.mainImage || !item.headerId || !item.categoryId || !item.subcategoryId) {
        return handleResponse(
          res,
          400,
          `Validation failed for item: ${item.name || "Unnamed"}. Missing name, description, mainImage, or category fields.`
        );
      }

      let slug = slugify(item.name);
      // We check uniqueness within current iteration and DB
      const existingInDb = await CatalogProduct.findOne({ slug });
      const duplicateInBatch = validatedProducts.some(v => v.slug === slug);
      if (existingInDb || duplicateInBatch) {
        slug = `${slug}-${Math.random().toString(36).substring(2, 6)}`;
      }

      validatedProducts.push({
        name: item.name.trim(),
        slug,
        description: item.description.trim(),
        brand: item.brand ? item.brand.trim() : "",
        weight: item.weight ? item.weight.trim() : "",
        tags: Array.isArray(item.tags) ? item.tags : [],
        alternativeNames: Array.isArray(item.alternativeNames) ? item.alternativeNames : [],
        mainImage: item.mainImage,
        galleryImages: Array.isArray(item.galleryImages) ? item.galleryImages : [],
        headerId: item.headerId,
        categoryId: item.categoryId,
        subcategoryId: item.subcategoryId,
        status: item.status || "active",
        ...normalizeCatalogCommissionFields(item),
        createdBy
      });
    }

    const result = await CatalogProduct.insertMany(validatedProducts);
    return handleResponse(res, 201, `${result.length} catalog products created in bulk`, result);
  } catch (error) {
    console.error("Bulk Create Catalog Error:", error);
    return handleResponse(res, 500, error.message);
  }
};

/* ======================================
   ADMIN/SELLER: GET ALL CATALOG PRODUCTS
   ====================================== */
export const getCatalogProducts = async (req, res) => {
  try {
    const { search, headerId, categoryId, subcategoryId, status, page: qPage, limit: qLimit } = req.query;

    const query = {};
    if (status) {
      query.status = status;
    } else {
      query.status = "active"; // Sellers browse active by default
    }

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }
    if (headerId && headerId !== "all") query.headerId = headerId;
    if (categoryId && categoryId !== "all") query.categoryId = categoryId;
    if (subcategoryId && subcategoryId !== "all") query.subcategoryId = subcategoryId;

    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 24,
      maxLimit: 100,
    });

    const [items, total] = await Promise.all([
      CatalogProduct.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CatalogProduct.countDocuments(query),
    ]);

    // Enrich items category names
    let enrichedItems = await Promise.all(
      items.map(async (item) => {
        const [headerName, categoryName, subcategoryName] = await Promise.all([
          item.headerId ? resolveCategoryName(item.headerId.toString()) : null,
          item.categoryId ? resolveCategoryName(item.categoryId.toString()) : null,
          item.subcategoryId ? resolveCategoryName(item.subcategoryId.toString()) : null,
        ]);
        return {
          ...item,
          headerId: item.headerId ? { _id: item.headerId, name: headerName } : null,
          categoryId: item.categoryId ? { _id: item.categoryId, name: categoryName } : null,
          subcategoryId: item.subcategoryId ? { _id: item.subcategoryId, name: subcategoryName } : null,
        };
      })
    );

    // If user is seller, mark which ones are already claimed
    if (req.user && req.user.role === "seller" && enrichedItems.length > 0) {
      const catalogIds = enrichedItems.map((item) => item._id);
      const claimedProducts = await Product.find({
        sellerId: req.user.id,
        catalogProductId: { $in: catalogIds },
      })
        .select("catalogProductId")
        .lean();
      
      const claimedSet = new Set(
        claimedProducts.map((p) => p.catalogProductId.toString())
      );

      enrichedItems = enrichedItems.map((item) => ({
        ...item,
        isClaimed: claimedSet.has(item._id.toString()),
      }));
    }

    return handleResponse(res, 200, "Catalog products fetched successfully", {
      items: enrichedItems,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error("Get Catalog Products Error:", error);
    return handleResponse(res, 500, error.message);
  }
};

/* ==================================
   ADMIN/SELLER: GET CATALOG BY ID
   ================================== */
export const getCatalogProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await CatalogProduct.findById(id).lean();
    if (!item) {
      return handleResponse(res, 404, "Catalog product not found");
    }

    const [headerName, categoryName, subcategoryName] = await Promise.all([
      item.headerId ? resolveCategoryName(item.headerId.toString()) : null,
      item.categoryId ? resolveCategoryName(item.categoryId.toString()) : null,
      item.subcategoryId ? resolveCategoryName(item.subcategoryId.toString()) : null,
    ]);

    const enriched = {
      ...item,
      headerId: item.headerId ? { _id: item.headerId, name: headerName } : null,
      categoryId: item.categoryId ? { _id: item.categoryId, name: categoryName } : null,
      subcategoryId: item.subcategoryId ? { _id: item.subcategoryId, name: subcategoryName } : null,
    };

    return handleResponse(res, 200, "Catalog product details fetched", enriched);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===================================
   ADMIN: UPDATE CATALOG PRODUCT
   =================================== */
export const updateCatalogProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { syncToSellers, ...updateData } = req.body;
    const files = req.files || [];

    const catalogProduct = await CatalogProduct.findById(id);
    if (!catalogProduct) {
      return handleResponse(res, 404, "Catalog product not found");
    }

    // Upload new files if provided
    if (files.length > 0) {
      const galleryUrls = [];
      for (const file of files) {
        try {
          if (file.fieldname === "mainImage") {
            const url = await uploadToCloudinary(file.buffer, "catalog", {
              mimeType: file.mimetype,
              resourceType: "image",
            });
            updateData.mainImage = url;
          } else if (file.fieldname === "galleryImages") {
            const url = await uploadToCloudinary(file.buffer, "catalog", {
              mimeType: file.mimetype,
              resourceType: "image",
            });
            galleryUrls.push(url);
          }
        } catch (err) {
          console.error("Cloudinary update failed:", err);
        }
      }
      if (galleryUrls.length > 0) {
        updateData.galleryImages = galleryUrls;
      }
    }

    // Parse array variables if strings
    if (typeof updateData.tags === "string") {
      try {
        updateData.tags = JSON.parse(updateData.tags);
      } catch (e) {
        updateData.tags = updateData.tags.split(",").map(t => t.trim()).filter(Boolean);
      }
    }
    if (typeof updateData.alternativeNames === "string") {
      try {
        updateData.alternativeNames = JSON.parse(updateData.alternativeNames);
      } catch (e) {
        updateData.alternativeNames = updateData.alternativeNames.split(",").map(n => n.trim()).filter(Boolean);
      }
    }
    if (typeof updateData.variants === "string") {
      try {
        updateData.variants = JSON.parse(updateData.variants);
      } catch (e) {
        updateData.variants = [];
      }
    }
    if (Array.isArray(updateData.variants)) {
      updateData.variants = updateData.variants
        .filter((v) => v && String(v.name || "").trim())
        .map((v) => ({
          name: String(v.name || "").trim(),
          weight: String(v.weight || "").trim(),
          sku: String(v.sku || "").trim(),
        }));
    }

    // Update slug if name is changing
    if (updateData.name && updateData.name !== catalogProduct.name) {
      updateData.slug = slugify(updateData.name);
      const existing = await CatalogProduct.findOne({ slug: updateData.slug, _id: { $ne: id } });
      if (existing) {
        updateData.slug = `${updateData.slug}-${Date.now().toString().slice(-4)}`;
      }
    }

    if (
      updateData.applyCommission !== undefined ||
      updateData.adminCommission !== undefined ||
      updateData.adminCommissionValue !== undefined ||
      updateData.adminCommissionType !== undefined ||
      updateData.adminCommissionFixedRule !== undefined
    ) {
      Object.assign(
        updateData,
        normalizeCatalogCommissionFields({
          applyCommission:
            updateData.applyCommission !== undefined
              ? updateData.applyCommission
              : catalogProduct.applyCommission,
          adminCommission:
            updateData.adminCommission !== undefined
              ? updateData.adminCommission
              : catalogProduct.adminCommission,
          adminCommissionValue:
            updateData.adminCommissionValue !== undefined
              ? updateData.adminCommissionValue
              : catalogProduct.adminCommissionValue,
          adminCommissionType:
            updateData.adminCommissionType !== undefined
              ? updateData.adminCommissionType
              : catalogProduct.adminCommissionType,
          adminCommissionFixedRule:
            updateData.adminCommissionFixedRule !== undefined
              ? updateData.adminCommissionFixedRule
              : catalogProduct.adminCommissionFixedRule,
        }),
      );
    }

    const updated = await CatalogProduct.findByIdAndUpdate(id, updateData, { new: true });

    // Commission fields always propagate to already-claimed seller products —
    // a catalogue commission edit must never silently diverge from what's charged at checkout.
    const commissionFieldsChanged =
      updateData.applyCommission !== undefined ||
      updateData.adminCommission !== undefined ||
      updateData.adminCommissionValue !== undefined ||
      updateData.adminCommissionType !== undefined ||
      updateData.adminCommissionFixedRule !== undefined;

    const fieldsToSync = {};
    if (commissionFieldsChanged) {
      Object.assign(fieldsToSync, {
        applyCommission: updated.applyCommission === true,
        adminCommission: updated.adminCommission || 0,
        adminCommissionType: updated.adminCommissionType || "percentage",
        adminCommissionValue: updated.adminCommissionValue || 0,
        adminCommissionFixedRule: updated.adminCommissionFixedRule || "per_qty",
      });
    }

    // Remaining catalogue fields (display/catalog data) still sync only when requested.
    if (syncToSellers === "true" || syncToSellers === true) {
      Object.assign(fieldsToSync, {
        name: updated.name,
        description: updated.description,
        brand: updated.brand,
        weight: updated.weight,
        tags: updated.tags,
        mainImage: updated.mainImage,
        galleryImages: updated.galleryImages,
        headerId: updated.headerId,
        categoryId: updated.categoryId,
        subcategoryId: updated.subcategoryId,
      });
    }

    if (Object.keys(fieldsToSync).length > 0) {
      const affectedProducts = await Product.find({ catalogProductId: id });
      await Product.updateMany({ catalogProductId: id }, { $set: fieldsToSync });

      // Enqueue search indexing for all sync-updated products
      for (const prod of affectedProducts) {
        if (commissionFieldsChanged) {
          // affectedProducts was read before the update, so apply the new commission on top.
          await applyCustomerPricing(prod, fieldsToSync);
        }
        await enqueueProductIndex(prod._id.toString());
        await invalidate(`cache:catalog:product:${prod._id.toString()}`);
      }
    }

    try {
      await invalidate(buildKey("catalog", "productList", "*"));
    } catch (e) {}

    return handleResponse(res, 200, "Catalog product updated successfully", updated);
  } catch (error) {
    console.error("Update Catalog Product Error:", error);
    return handleResponse(res, 500, error.message);
  }
};

/* ===================================
   ADMIN: BULK SET COMMISSION
   Sets (or turns off) the percentage commission on many catalogue items at
   once, and propagates it to already-claimed seller products exactly like the
   single-item update does.
   =================================== */
export const bulkUpdateCatalogCommission = async (req, res) => {
  try {
    const { ids, applyCommission, adminCommission } = req.body || {};

    if (!Array.isArray(ids) || ids.length === 0) {
      return handleResponse(res, 400, "Select at least one catalog item");
    }
    if (ids.length > 100) {
      return handleResponse(res, 400, "Too many items in one request (max 100)");
    }
    const uniqueIds = [...new Set(ids.map((id) => String(id)))];
    if (uniqueIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
      return handleResponse(res, 400, "Invalid catalog item ID in selection");
    }
    if (applyCommission === undefined) {
      return handleResponse(res, 400, "Nothing to update");
    }

    const apply = applyCommission === true || applyCommission === "true";
    let percent = 0;
    if (apply) {
      percent = Number(adminCommission);
      if (
        adminCommission === undefined ||
        adminCommission === null ||
        adminCommission === "" ||
        !Number.isFinite(percent) ||
        percent < 0 ||
        percent > 100
      ) {
        return handleResponse(res, 400, "Commission must be a number between 0 and 100");
      }
    }

    const commissionFields = {
      applyCommission: apply,
      adminCommission: percent,
      adminCommissionType: "percentage",
      adminCommissionValue: percent,
    };

    const result = await CatalogProduct.updateMany(
      { _id: { $in: uniqueIds } },
      { $set: commissionFields },
    );
    const claimed = await Product.updateMany(
      { catalogProductId: { $in: uniqueIds } },
      { $set: commissionFields },
    );

    try {
      await invalidate(buildKey("catalog", "productList", "*"));
    } catch (e) {}

    // Claimed seller products carry a stored customerPrice that depends on the
    // commission; refresh those (and their search index) off the request path,
    // since one catalogue item can be claimed by many sellers.
    (async () => {
      const affected = await Product.find({ catalogProductId: { $in: uniqueIds } }).lean();
      for (let i = 0; i < affected.length; i += 10) {
        await Promise.all(
          affected.slice(i, i + 10).map(async (product) => {
            try {
              const priceFields = await computeCustomerPriceFieldsForWrite({ ...product, ...commissionFields });
              await Product.updateOne({ _id: product._id }, { $set: priceFields });
              await enqueueProductIndex(String(product._id));
              await invalidate(`cache:catalog:product:${product._id}`);
            } catch (err) {
              console.error("Catalog bulk commission: product refresh failed", product._id, err.message);
            }
          }),
        );
      }
    })().catch((err) => console.error("Catalog bulk commission background refresh failed:", err.message));

    return handleResponse(res, 200, "Catalog commission updated", {
      matched: result.matchedCount ?? result.n ?? 0,
      modified: result.modifiedCount ?? result.nModified ?? 0,
      sellerProductsUpdated: claimed.modifiedCount ?? claimed.nModified ?? 0,
    });
  } catch (error) {
    console.error("Bulk Catalog Commission Error:", error);
    return handleResponse(res, 500, error.message);
  }
};

/* ===================================
   ADMIN: DELETE CATALOG PRODUCT
   =================================== */
export const deleteCatalogProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const catalogProduct = await CatalogProduct.findById(id);
    if (!catalogProduct) {
      return handleResponse(res, 404, "Catalog product not found");
    }

    await CatalogProduct.findByIdAndDelete(id);

    // Unlink catalogProductId in active listings so sellers don't break
    await Product.updateMany({ catalogProductId: id }, { $set: { catalogProductId: null } });

    return handleResponse(res, 200, "Catalog product deleted successfully");
  } catch (error) {
    console.error("Delete Catalog Product Error:", error);
    return handleResponse(res, 500, error.message);
  }
};

/* ===================================
   SELLER: CLAIM/PICK PRODUCT FROM CATALOG
   =================================== */
export const claimCatalogProduct = async (req, res) => {
  try {
    const {
      catalogProductId,
      price: bodyPrice,
      salePrice: bodySalePrice,
      stock: bodyStock,
      sku,
      variants,
      name,
      mainImage,
      galleryImages,
      addons,
      isSignatureProduct,
    } = req.body;
    const sellerId = req.user.id;

    if (!catalogProductId) {
      return handleResponse(res, 400, "catalogProductId is required");
    }

    const parsedVariants = parseClaimVariants(variants);
    const resolved = resolveClaimPricing({
      variants: parsedVariants,
      price: bodyPrice,
      salePrice: bodySalePrice,
      stock: bodyStock,
    });
    if (resolved.error) {
      return handleResponse(res, 400, resolved.error);
    }
    const { price, salePrice, stock } = resolved;
    const claimVariants = resolved.variants;

    if (!price || Number(price) < 0) {
      return handleResponse(res, 400, "Valid price is required");
    }
    if (stock === undefined || Number(stock) < 0) {
      return handleResponse(res, 400, "Valid stock quantity is required");
    }

    // Check if seller already claimed this product
    const alreadyClaimed = await Product.findOne({ catalogProductId, sellerId });
    if (alreadyClaimed) {
      return handleResponse(res, 400, "You have already added this catalog product to your store.");
    }

    // Fetch Catalog Product details
    const catalogProduct = await CatalogProduct.findById(catalogProductId);
    if (!catalogProduct || catalogProduct.status !== "active") {
      return handleResponse(res, 404, "Catalog product not found or inactive.");
    }

    // Choose name (custom or canonical catalog product name)
    const chosenName = name && String(name).trim() ? String(name).trim() : catalogProduct.name;

    // Parse addons if they are sent as JSON string or array
    let parsedAddons = [];
    if (typeof addons === "string") {
      try {
        parsedAddons = JSON.parse(addons);
      } catch (e) {}
    } else if (Array.isArray(addons)) {
      parsedAddons = addons;
    }

    // Validate manual/custom main SKU uniqueness if provided
    if (sku && String(sku).trim()) {
      const customSkuExists = await Product.findOne({ sku: String(sku).trim() });
      if (customSkuExists) {
        return handleResponse(res, 400, `The SKU "${sku}" is already in use by another product. Please choose a different SKU.`);
      }
    }

    // Validate manual/custom variant SKU uniqueness if provided
    for (const v of claimVariants) {
      if (v.sku && String(v.sku).trim()) {
        const customVarSkuExists = await Product.findOne({ sku: String(v.sku).trim() });
        if (customVarSkuExists) {
          return handleResponse(res, 400, `The variant SKU "${v.sku}" is already in use. Please choose a different SKU.`);
        }
      }
    }

    // Auto-generate distinct slug to ensure Mongoose index works
    let distinctSlug = `${slugify(chosenName)}-${sellerId.toString().slice(-6)}`;
    let slugExists = await Product.findOne({ slug: distinctSlug });
    let slugCounter = 1;
    while (slugExists) {
      distinctSlug = `${slugify(chosenName)}-${sellerId.toString().slice(-6)}-${slugCounter}`;
      slugExists = await Product.findOne({ slug: distinctSlug });
      slugCounter++;
    }

    // Auto-generate unique main SKU if not provided, or ensure uniqueness if conflict
    const baseSku = sku && String(sku).trim() ? String(sku).trim() : makeProductSku(chosenName, 1);
    let finalSku = baseSku;
    let skuExists = await Product.findOne({ sku: finalSku });
    let skuCounter = 1;
    while (skuExists) {
      finalSku = `${baseSku}-${skuCounter}`;
      skuExists = await Product.findOne({ sku: finalSku });
      skuCounter++;
    }

    const variantsWithSku = await buildClaimVariantsWithSku(chosenName, claimVariants);

    // Create the Product instance owned by the seller
    const newProduct = await Product.create({
      catalogProductId: catalogProduct._id,
      sellerId,
      name: chosenName,
      slug: distinctSlug,
      sku: finalSku,
      description: catalogProduct.description,
      price: Number(price),
      salePrice: Number(salePrice) || 0,
      stock: Number(stock),
      brand: catalogProduct.brand || "",
      weight: catalogProduct.weight || "",
      tags: catalogProduct.tags || [],
      mainImage: mainImage && String(mainImage).trim() ? String(mainImage).trim() : catalogProduct.mainImage,
      galleryImages: Array.isArray(galleryImages) && galleryImages.length > 0 ? galleryImages : (catalogProduct.galleryImages || []),
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
      status: "active",
      approvalStatus: "approved", // Pre-approved catalog items
      importSource: "catalog_claim",
      isPublished: true,
      variants: variantsWithSku,
      isSignatureProduct: isSignatureProduct === true || isSignatureProduct === "true",
      addons: parsedAddons
    });

    if (newProduct && newProduct._id) {
      await applyCustomerPricing(newProduct);
      await enqueueProductIndex(newProduct._id.toString());
      await invalidate(`cache:catalog:product:${newProduct._id.toString()}`);
    }

    try {
      await invalidate(buildKey("catalog", "productList", "*"));
      await invalidate("cache:offersections:public:*");
    } catch (e) {}

    return handleResponse(res, 201, "Product added to your store successfully", newProduct);
  } catch (error) {
    console.error("Claim Product Error:", error);
    if (error.code === 11000) {
      return handleResponse(res, 400, "Slug or SKU already exists for your store listings.");
    }
    return handleResponse(res, 500, error.message);
  }
};

/* ===================================
   SELLER: BULK CLAIM/PICK CATALOG PRODUCTS
   =================================== */
export const bulkClaimCatalogProducts = async (req, res) => {
  try {
    const { products } = req.body;
    const sellerId = req.user.id;

    if (!Array.isArray(products) || products.length === 0) {
      return handleResponse(res, 400, "An array of products is required for bulk claim.");
    }

    const claimedCount = [];
    const errors = [];

    for (const p of products) {
      const { catalogProductId, price: itemPrice, salePrice: itemSalePrice, stock: itemStock, name, mainImage } = p;

      if (!catalogProductId) {
        errors.push({ name: name || "Unknown", error: "catalogProductId is required" });
        continue;
      }

      // Check if already claimed
      const alreadyClaimed = await Product.findOne({ catalogProductId, sellerId });
      if (alreadyClaimed) {
        continue; // silently skip if already claimed
      }

      const catalogProduct = await CatalogProduct.findById(catalogProductId);
      if (!catalogProduct || catalogProduct.status !== "active") {
        errors.push({ name: name || "Unknown", error: "Catalog product not found or inactive." });
        continue;
      }

      const chosenName = name && String(name).trim() ? String(name).trim() : catalogProduct.name;

      // Same variant rules as a single claim: unpriced variants are skipped,
      // and the product-level price/stock come from the priced ones.
      const resolved = resolveClaimPricing({
        variants: parseClaimVariants(p.variants),
        price: itemPrice,
        salePrice: itemSalePrice,
        stock: itemStock,
      });
      if (resolved.error) {
        errors.push({ name: chosenName, error: resolved.error });
        continue;
      }
      const { price, salePrice, stock } = resolved;
      const variantsWithSku = await buildClaimVariantsWithSku(chosenName, resolved.variants);

      let distinctSlug = `${slugify(chosenName)}-${sellerId.toString().slice(-6)}`;
      let slugExists = await Product.findOne({ slug: distinctSlug });
      let slugCounter = 1;
      while (slugExists) {
        distinctSlug = `${slugify(chosenName)}-${sellerId.toString().slice(-6)}-${slugCounter}`;
        slugExists = await Product.findOne({ slug: distinctSlug });
        slugCounter++;
      }

      const baseSku = makeProductSku(chosenName, 1);
      let finalSku = baseSku;
      let skuExists = await Product.findOne({ sku: finalSku });
      let skuCounter = 1;
      while (skuExists) {
        finalSku = `${baseSku}-${skuCounter}`;
        skuExists = await Product.findOne({ sku: finalSku });
        skuCounter++;
      }

      const newProduct = await Product.create({
        catalogProductId: catalogProduct._id,
        sellerId,
        name: chosenName,
        slug: distinctSlug,
        sku: finalSku,
        description: catalogProduct.description,
        price: Number(price) || 0,
        salePrice: Number(salePrice) || 0,
        stock: Number(stock) || 0,
        brand: catalogProduct.brand || "",
        weight: catalogProduct.weight || "",
        tags: catalogProduct.tags || [],
        mainImage: mainImage && String(mainImage).trim() ? String(mainImage).trim() : catalogProduct.mainImage,
        galleryImages: catalogProduct.galleryImages || [],
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
        status: "active",
        approvalStatus: "approved",
        importSource: "catalog_claim",
        isPublished: true,
        variants: variantsWithSku
      });

      if (newProduct && newProduct._id) {
        await applyCustomerPricing(newProduct);
        await enqueueProductIndex(newProduct._id.toString());
        claimedCount.push(newProduct._id);
      }
    }

    try {
      await invalidate(buildKey("catalog", "productList", "*"));
      await invalidate("cache:offersections:public:*");
    } catch (e) {}

    return handleResponse(res, 201, `${claimedCount.length} products added to your store.`, { claimed: claimedCount, errors });
  } catch (error) {
    console.error("Bulk Claim Product Error:", error);
    return handleResponse(res, 500, error.message);
  }
};
