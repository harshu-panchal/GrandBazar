import CatalogProduct from "../models/catalogProduct.js";
import Product from "../models/product.js";
import { handleResponse } from "../utils/helper.js";
import { slugify } from "../utils/slugify.js";
import getPagination from "../utils/pagination.js";
import { uploadToCloudinary } from "../services/mediaService.js";
import { resolveCategoryName } from "../services/entityNameCache.js";
import { invalidate, buildKey } from "../services/cacheService.js";
import { enqueueProductIndex } from "../services/searchSyncService.js";

// Helper to auto-generate SKU prefix
function makeProductSku(name, index = 1) {
  const prefix = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 5) || "item";
  return `${prefix}-${String(index).padStart(3, "0")}`;
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
    const enrichedItems = await Promise.all(
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

    // Update slug if name is changing
    if (updateData.name && updateData.name !== catalogProduct.name) {
      updateData.slug = slugify(updateData.name);
      const existing = await CatalogProduct.findOne({ slug: updateData.slug, _id: { $ne: id } });
      if (existing) {
        updateData.slug = `${updateData.slug}-${Date.now().toString().slice(-4)}`;
      }
    }

    const updated = await CatalogProduct.findByIdAndUpdate(id, updateData, { new: true });

    // Sync changes to all claimed seller products if requested
    if (syncToSellers === "true" || syncToSellers === true) {
      const fieldsToSync = {
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
      };

      const affectedProducts = await Product.find({ catalogProductId: id });
      await Product.updateMany({ catalogProductId: id }, { $set: fieldsToSync });

      // Enqueue search indexing for all sync-updated products
      for (const prod of affectedProducts) {
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
    const { catalogProductId, price, salePrice, stock, sku, variants, name, mainImage, galleryImages } = req.body;
    const sellerId = req.user.id;

    if (!catalogProductId) {
      return handleResponse(res, 400, "catalogProductId is required");
    }
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

    // Parse variants if they are sent as JSON string
    let parsedVariants = [];
    if (typeof variants === "string") {
      try {
        parsedVariants = JSON.parse(variants);
      } catch (e) {}
    } else if (Array.isArray(variants)) {
      parsedVariants = variants;
    }

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
    for (const v of parsedVariants) {
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

    // Map and generate unique variant SKUs
    const variantsWithSku = [];
    for (let idx = 0; idx < parsedVariants.length; idx++) {
      const v = parsedVariants[idx];
      const baseVarSku = v.sku && String(v.sku).trim() ? String(v.sku).trim() : makeProductSku(chosenName, idx + 2);
      let varSku = baseVarSku;
      let varSkuExists = await Product.findOne({ sku: varSku });
      let varSkuCounter = 1;
      while (varSkuExists || variantsWithSku.some(item => item.sku === varSku)) {
        varSku = `${baseVarSku}-${varSkuCounter}`;
        varSkuExists = await Product.findOne({ sku: varSku });
        varSkuCounter++;
      }
      variantsWithSku.push({
        ...v,
        sku: varSku
      });
    }

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
      status: "active",
      approvalStatus: "approved", // Pre-approved catalog items
      variants: variantsWithSku,
      isSignatureProduct: isSignatureProduct === true || isSignatureProduct === "true",
      addons: parsedAddons
    });

    if (newProduct && newProduct._id) {
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
