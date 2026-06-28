import CatalogBundle from "../models/catalogBundle.js";
import CatalogProduct from "../models/catalogProduct.js";
import Category from "../models/category.js";
import Product from "../models/product.js";
import Store from "../models/store.js";
import StoreBundleImport from "../models/storeBundleImport.js";
import { resolveCategoryName } from "./entityNameCache.js";
import { isStoreApplicationApproved } from "./storeService.js";
import { getStoreCategoryList } from "./storeService.js";
import { createProductFromCatalog } from "./catalogClaimService.js";
import { invalidate, buildKey } from "./cacheService.js";

export async function resolveStoreHeaderIds(store) {
  const headerNames = getStoreCategoryList(store);
  if (!headerNames.length) return [];

  const headers = await Category.find({
    type: "header",
    status: "active",
    name: { $in: headerNames },
  }).lean();

  return headers;
}

export async function formatBundleRecord(bundle, options = {}) {
  const headerName = bundle.headerId
    ? await resolveCategoryName(String(bundle.headerId))
    : null;

  const productIds = (bundle.catalogProductIds || []).map((id) => String(id));
  let imported = false;
  if (options.storeId) {
    const importRecord = await StoreBundleImport.findOne({
      storeId: options.storeId,
      bundleId: bundle._id,
    }).lean();
    imported = Boolean(importRecord);
  }

  return {
    id: String(bundle._id),
    _id: bundle._id,
    name: bundle.name,
    description: bundle.description || "",
    headerId: bundle.headerId,
    headerName: headerName || "Unknown",
    catalogProductIds: productIds,
    productCount: productIds.length,
    isActive: bundle.isActive !== false,
    imported,
    createdAt: bundle.createdAt,
    updatedAt: bundle.updatedAt,
  };
}

export async function listCatalogBundles({ headerId, isActive } = {}) {
  const query = {};
  if (headerId && headerId !== "all") {
    query.headerId = headerId;
  }
  if (isActive !== undefined && isActive !== "all") {
    query.isActive = isActive === true || isActive === "true";
  }

  const bundles = await CatalogBundle.find(query).sort({ updatedAt: -1 }).lean();
  return Promise.all(bundles.map((bundle) => formatBundleRecord(bundle)));
}

export async function getCatalogBundleById(bundleId) {
  const bundle = await CatalogBundle.findById(bundleId).lean();
  if (!bundle) return null;

  const formatted = await formatBundleRecord(bundle);
  const products = await CatalogProduct.find({
    _id: { $in: bundle.catalogProductIds || [] },
  }).lean();

  return { ...formatted, products };
}

export async function validateBundlePayload({ headerId, catalogProductIds, excludeBundleId }) {
  if (!headerId) {
    throw new Error("headerId is required");
  }

  const header = await Category.findOne({ _id: headerId, type: "header" });
  if (!header) {
    throw new Error("Invalid header category");
  }

  const ids = Array.isArray(catalogProductIds) ? catalogProductIds : [];
  if (!ids.length) {
    throw new Error("At least one catalog product is required");
  }

  const products = await CatalogProduct.find({ _id: { $in: ids } }).lean();
  if (products.length !== ids.length) {
    throw new Error("One or more catalog products were not found");
  }

  const invalidHeader = products.find(
    (product) => String(product.headerId) !== String(headerId),
  );
  if (invalidHeader) {
    throw new Error("All catalog products must belong to the selected header category");
  }

  if (excludeBundleId) {
    return { header, products };
  }

  const duplicateActive = await CatalogBundle.findOne({
    headerId,
    isActive: true,
  }).lean();
  if (duplicateActive) {
    throw new Error("An active bundle already exists for this header category");
  }

  return { header, products };
}

export async function createCatalogBundle({ payload, adminId }) {
  const { header, products } = await validateBundlePayload(payload);
  const bundle = await CatalogBundle.create({
    name: payload.name.trim(),
    description: payload.description?.trim() || "",
    headerId: header._id,
    catalogProductIds: products.map((product) => product._id),
    isActive: payload.isActive !== false,
    createdBy: adminId,
  });

  return formatBundleRecord(bundle.toObject());
}

export async function updateCatalogBundle(bundleId, payload) {
  const bundle = await CatalogBundle.findById(bundleId);
  if (!bundle) {
    throw new Error("Catalog bundle not found");
  }

  const headerId = payload.headerId || bundle.headerId;
  const catalogProductIds = payload.catalogProductIds || bundle.catalogProductIds;

  await validateBundlePayload({
    headerId,
    catalogProductIds,
    excludeBundleId: bundleId,
  });

  if (payload.isActive === true) {
    const duplicateActive = await CatalogBundle.findOne({
      _id: { $ne: bundleId },
      headerId,
      isActive: true,
    }).lean();
    if (duplicateActive) {
      throw new Error("Another active bundle already exists for this header category");
    }
  }

  if (payload.name !== undefined) bundle.name = String(payload.name).trim();
  if (payload.description !== undefined) bundle.description = String(payload.description).trim();
  if (payload.headerId !== undefined) bundle.headerId = headerId;
  if (payload.catalogProductIds !== undefined) {
    bundle.catalogProductIds = catalogProductIds;
  }
  if (payload.isActive !== undefined) bundle.isActive = payload.isActive !== false;

  await bundle.save();
  return formatBundleRecord(bundle.toObject());
}

export async function deactivateCatalogBundle(bundleId) {
  const bundle = await CatalogBundle.findByIdAndUpdate(
    bundleId,
    { $set: { isActive: false } },
    { new: true },
  );
  if (!bundle) {
    throw new Error("Catalog bundle not found");
  }
  return formatBundleRecord(bundle.toObject());
}

export async function getAvailableBundlesForStore(storeId) {
  const store = await Store.findById(storeId).lean();
  if (!store) {
    throw new Error("Store not found");
  }

  const headers = await resolveStoreHeaderIds(store);
  if (!headers.length) {
    return { storeId: String(storeId), bundles: [], importedBundles: [] };
  }

  const headerIds = headers.map((header) => header._id);
  const bundles = await CatalogBundle.find({
    headerId: { $in: headerIds },
    isActive: true,
  }).lean();

  const importRecords = await StoreBundleImport.find({ storeId }).lean();
  const importedBundleIds = new Set(importRecords.map((record) => String(record.bundleId)));

  const formatted = await Promise.all(
    bundles.map((bundle) => formatBundleRecord(bundle, { storeId })),
  );

  return {
    storeId: String(storeId),
    isStoreApproved: isStoreApplicationApproved(store),
    bundles: formatted.filter((bundle) => !importedBundleIds.has(String(bundle.id))),
    importedBundles: formatted.filter((bundle) => importedBundleIds.has(String(bundle.id))),
  };
}

export async function getBundleImportStatus(storeId) {
  const records = await StoreBundleImport.find({ storeId })
    .sort({ createdAt: -1 })
    .lean();

  return records.map((record) => ({
    bundleId: String(record.bundleId),
    importedCount: record.importedCount,
    skippedCount: record.skippedCount,
    importedAt: record.createdAt,
  }));
}

export async function importBundlesForStore({
  storeId,
  bundleIds,
  accountId,
}) {
  const store = await Store.findById(storeId).lean();
  if (!store) {
    throw new Error("Store not found");
  }

  if (!isStoreApplicationApproved(store)) {
    throw new Error("Store must be approved before importing catalog bundles");
  }

  if (!Array.isArray(bundleIds) || !bundleIds.length) {
    throw new Error("At least one bundleId is required");
  }

  const headers = await resolveStoreHeaderIds(store);
  const allowedHeaderIds = new Set(headers.map((header) => String(header._id)));

  const bundles = await CatalogBundle.find({
    _id: { $in: bundleIds },
    isActive: true,
  }).lean();

  if (!bundles.length) {
    throw new Error("No valid active bundles found");
  }

  const results = [];
  const productIds = [];
  let totalImported = 0;
  let totalSkipped = 0;

  for (const bundle of bundles) {
    if (!allowedHeaderIds.has(String(bundle.headerId))) {
      throw new Error(`Bundle "${bundle.name}" does not match this store's header categories`);
    }

    const existingImport = await StoreBundleImport.findOne({
      storeId,
      bundleId: bundle._id,
    }).lean();
    if (existingImport) {
      throw new Error(`Bundle "${bundle.name}" has already been imported for this store`);
    }

    const catalogProducts = await CatalogProduct.find({
      _id: { $in: bundle.catalogProductIds || [] },
      status: "active",
    }).lean();

    let importedCount = 0;
    let skippedCount = 0;
    const bundleProductIds = [];

    for (const catalogProduct of catalogProducts) {
      const alreadyClaimed = await Product.findOne({
        catalogProductId: catalogProduct._id,
        sellerId: storeId,
      }).lean();

      if (alreadyClaimed) {
        skippedCount += 1;
        continue;
      }

      const newProduct = await createProductFromCatalog({
        catalogProduct,
        sellerId: storeId,
        chosenName: catalogProduct.name,
        price: 0,
        salePrice: 0,
        stock: 0,
        importSource: "bundle_import",
        isPublished: false,
        status: "inactive",
      });

      importedCount += 1;
      bundleProductIds.push(String(newProduct._id));
      productIds.push(String(newProduct._id));
    }

    await StoreBundleImport.create({
      storeId,
      bundleId: bundle._id,
      importedBy: accountId,
      importedCount,
      skippedCount,
    });

    totalImported += importedCount;
    totalSkipped += skippedCount;
    results.push({
      bundleId: String(bundle._id),
      bundleName: bundle.name,
      importedCount,
      skippedCount,
      productIds: bundleProductIds,
    });
  }

  try {
    await invalidate(buildKey("catalog", "productList", "*"));
    await invalidate("cache:offersections:public:*");
  } catch {
    // non-fatal cache invalidation
  }

  return {
    imported: totalImported,
    skipped: totalSkipped,
    productIds,
    bundles: results,
  };
}
