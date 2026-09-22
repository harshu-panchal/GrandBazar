import Category from "../models/category.js";
import Product from "../models/product.js";
import handleResponse from "../utils/helper.js";
import getPagination from "../utils/pagination.js";
import { buildKey, getOrSet, getTTL, invalidate } from "../services/cacheService.js";
import { uploadToCloudinary } from "../services/mediaService.js";
import mongoose from "mongoose";
import { invalidateCategoryName } from "../services/entityNameCache.js";
import { enqueueRecalcByCategory } from "../queues/pricingQueueProcessors.js";
import { ALL_GST_SLABS } from "../constants/finance.js";
import { getNearbySellerIdsForCustomer } from "../services/customerVisibilityService.js";

function normalizeUrl(value) {
  if (!value || typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized) return "";
  if (!/^https?:\/\//i.test(normalized)) {
    return "";
  }
  return normalized;
}

function categoryCacheKey({ tree = false, type = "all" } = {}) {
  return buildKey("catalog", "categories", `${tree ? "tree" : "flat"}:${type || "all"}`);
}

function normalizeParentId(parentId) {
  if (!parentId) return null;
  const raw = String(parentId).trim();
  if (!raw || raw === "null" || raw === "undefined") return null;
  if (!mongoose.Types.ObjectId.isValid(raw)) return "__INVALID__";
  return raw;
}

async function validateParentForType(type, parentId) {
  if (type === "header") return true;
  if (!parentId) return false;

  try {
    const parent = await Category.findById(parentId).select("type").lean();
    if (!parent) return false;
    
    // Strict hierarchy check
    if (type === "category" && parent.type !== "header") return false;
    if (type === "subcategory" && parent.type !== "category") return false;
    
    return true;
  } catch (err) {
    return false;
  }
}

/* ===============================
   GET ALL CATEGORIES (Hierarchy)
 ================================ */
export const getCategories = async (req, res) => {
  try {
    const { flat, tree, type } = req.query;

    if (tree === "true") {
      const cacheKey = categoryCacheKey({ tree: true, type: "header" });
      let categories = await getOrSet(
        cacheKey,
        async () => {
          const selectFields = "name slug image iconId type parentId headerColor headerFontColor headerIconColor";
          return Category.find({ type: "header" })
            .select(selectFields)
            .populate({
              path: "children",
              select: selectFields,
              populate: {
                path: "children",
                select: selectFields,
              },
            })
            .sort({ name: 1, _id: 1 })
            .lean();
        },
        getTTL("categories"),
      );

      // Clone so cached structure is not mutated across requests
      categories = JSON.parse(JSON.stringify(categories));

      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        try {
          const nearbySellerIds = await getNearbySellerIdsForCustomer(lat, lng, { includeClosed: true });
          if (nearbySellerIds && nearbySellerIds.length > 0) {
            const activeCategoryIds = await Product.distinct("categoryId", {
              sellerId: { $in: nearbySellerIds },
              status: "active",
              isCurrentlyAvailable: { $ne: false },
              isPublished: { $ne: false },
            });
            const activeSet = new Set(activeCategoryIds.map(String));

            categories.forEach((header) => {
              if (Array.isArray(header.children)) {
                header.children.sort((a, b) => {
                  const aActive = activeSet.has(String(a._id)) ? 1 : 0;
                  const bActive = activeSet.has(String(b._id)) ? 1 : 0;
                  return bActive - aActive;
                });
              }
            });

            categories.sort((a, b) => {
              const aCount = (a.children || []).filter((c) => activeSet.has(String(c._id))).length;
              const bCount = (b.children || []).filter((c) => activeSet.has(String(c._id))).length;
              return bCount - aCount;
            });
          }
        } catch {
          // Graceful fallback on location ranking
        }
      }

      return handleResponse(res, 200, "Category tree fetched", categories);
    }

    const pageParam = req.query.page;
    const limitParam = req.query.limit;
    if (pageParam != null || limitParam != null) {
      const { page, limit, skip } = getPagination(req, {
        defaultLimit: 25,
        maxLimit: 100,
      });
      const query = {};
      if (type === "header" || type === "category" || type === "subcategory") {
        query.type = type;
      }
      const search = (req.query.search || "").trim();
      const parentId = req.query.parentId || req.query.parentId; // Support both naming variants

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { slug: { $regex: search, $options: "i" } },
        ];
      }
      
      if (parentId && parentId !== "all") {
        query.parentId = parentId;
      }

      const [items, total] = await Promise.all([
        Category.find(query).sort({ name: 1 }).skip(skip).limit(limit).lean(),
        Category.countDocuments(query),
      ]);
      return handleResponse(res, 200, "Categories fetched successfully", {
        items,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      });
    }

    const query = {};
    if (type === "header" || type === "category" || type === "subcategory") {
      query.type = type;
    }
    const cacheKey = categoryCacheKey({ tree: false, type: query.type || "all" });
    const categories = await getOrSet(
      cacheKey,
      async () => Category.find(query).sort({ name: 1, _id: 1 }).lean(),
      getTTL("categories"),
    );
    return handleResponse(
      res,
      200,
      "Categories fetched successfully",
      categories,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   CREATE CATEGORY
 ================================ */
export const createCategory = async (req, res) => {
  try {
    const categoryData = {};
    const allowedKeys = ["name", "slug", "description", "type", "parentId", "status", "iconId", "headerColor", "headerFontColor", "headerIconColor", "applyCommission", "adminCommission", "adminCommissionType", "adminCommissionValue", "handlingFees", "handlingFeeType", "handlingFeeValue", "packingFees", "packingFeeType", "packingFeeValue", "returnEligible", "refundWindowHours", "restockFeePercent", "gstSlab", "packagingType"];
    
    // Strict Whitelisting and Sanitization
    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        const val = req.body[key];
        // Stripping objects {} that could cause cast errors in Mongoose
        if (val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof mongoose.Types.ObjectId)) {
           continue;
        }
        if (key === "applyCommission") {
          categoryData[key] = val === true || val === "true" || val === "1" || val === 1;
          continue;
        }
        if (key === "returnEligible") {
          categoryData[key] = val === true || val === "true" || val === "1" || val === 1;
          continue;
        }
        categoryData[key] = val;
      }
    }
    
    // Handle Images
    if (req.file) {
      try {
        const url = await uploadToCloudinary(req.file.buffer, "categories", {
          mimeType: req.file.mimetype,
          resourceType: "image",
        });
        categoryData.image = url;
      } catch (err) {
        console.error("Cloudinary upload failed for category:", err);
      }
    } else if (typeof req.body.image === 'string' && req.body.image.startsWith('http')) {
      categoryData.image = req.body.image;
    } else {
       // FORCED FIX: Ensure no phantom object remains
       delete categoryData.image; 
    }

    // Explicitly validate Parent ID hierarchy
    const normalizedParentId = normalizeParentId(categoryData.parentId);
    if (normalizedParentId === "__INVALID__") {
      return handleResponse(res, 400, "The Parent ID format is invalid");
    }
    categoryData.parentId = normalizedParentId;

    const type = String(categoryData.type || "").trim();
    if (!["header", "category", "subcategory"].includes(type)) {
      return handleResponse(res, 400, `The category type is invalid: ${type}`);
    }

    const parentOk = await validateParentForType(type, categoryData.parentId);
    if (!parentOk) {
      if (type === "category") return handleResponse(res, 400, "Level 2 Category must be linked to a Level 1 Header category");
      if (type === "subcategory") return handleResponse(res, 400, "Level 3 Subcategory must be linked to a Level 2 Category");
    }

    // Final sanity check for unique slug to prevent catch block late failure
    const existing = await Category.findOne({ slug: categoryData.slug }).lean();
    if (existing) {
        return handleResponse(res, 400, "The URL Slug already exists; please use a unique name");
    }

    const category = await Category.create(categoryData);
    
    invalidate("cache:catalog:categories:*").catch(err => {
      console.warn("[Category] Cache invalidation failed:", err.message);
    });

    return handleResponse(res, 201, "Category created successfully", category);
  } catch (error) {
    if (error.code === 11000) return handleResponse(res, 400, "Duplicate record found; Slug must be unique");
    if (error?.name === "ValidationError" || error?.name === "CastError") return handleResponse(res, 400, error.message);
    return handleResponse(res, 500, `Category operation failed: ${error.message}`);
  }
};

/* ===============================
   UPDATE CATEGORY
 ================================ */
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(id || ""))) {
      return handleResponse(res, 400, "Invalid category ID");
    }

    const categoryData = {};
    const allowedKeys = ["name", "slug", "description", "type", "parentId", "status", "iconId", "headerColor", "headerFontColor", "headerIconColor", "applyCommission", "adminCommission", "adminCommissionType", "adminCommissionValue", "handlingFees", "handlingFeeType", "handlingFeeValue", "packingFees", "packingFeeType", "packingFeeValue", "returnEligible", "refundWindowHours", "restockFeePercent", "gstSlab", "packagingType"];
    
    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        const val = req.body[key];
        if (val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof mongoose.Types.ObjectId)) {
           continue;
        }
        if (key === "applyCommission") {
          categoryData[key] = val === true || val === "true" || val === "1" || val === 1;
          continue;
        }
        if (key === "returnEligible") {
          categoryData[key] = val === true || val === "true" || val === "1" || val === 1;
          continue;
        }
        categoryData[key] = val;
      }
    }

    if (req.file) {
      try {
        const url = await uploadToCloudinary(req.file.buffer, "categories", {
          mimeType: req.file.mimetype,
          resourceType: "image",
        });
        categoryData.image = url;
      } catch (err) {
        console.error("Cloudinary upload failed for category update:", err);
        return handleResponse(res, 400, `Image update failed: ${err.message}`);
      }
    } else if (typeof req.body.image === 'string' && req.body.image.startsWith('http')) {
      categoryData.image = req.body.image;
    } else if (req.body.image === "") {
        categoryData.image = "";
    } else {
        if (req.body.image && typeof req.body.image === 'object') delete categoryData.image;
    }

    const existing = await Category.findById(id).select("type parentId").lean();
    if (!existing) return handleResponse(res, 404, "Category not found");

    const hasParentId = Object.prototype.hasOwnProperty.call(categoryData, "parentId");
    if (hasParentId) {
      const normalizedParentId = normalizeParentId(categoryData.parentId);
      if (normalizedParentId === "__INVALID__") return handleResponse(res, 400, "Invalid parentId format");
      categoryData.parentId = normalizedParentId;
    }

    const type = String(categoryData.type || existing.type || "").trim();
    const parentToValidate = hasParentId ? categoryData.parentId : existing.parentId;
    
    const parentOk = await validateParentForType(type, parentToValidate);
    if (!parentOk) {
      if (type === "category") return handleResponse(res, 400, "Level 2 Category must be linked to a Level 1 Header category");
      if (type === "subcategory") return handleResponse(res, 400, "Level 3 Subcategory must be linked to a Level 2 Category");
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      { $set: categoryData },
      { new: true, runValidators: true },
    );

    if (!updatedCategory) return handleResponse(res, 404, "Category not found");

    invalidate("cache:catalog:categories:*").catch(err => {
      console.warn("[Category] Cache invalidation failed:", err.message);
    });
    invalidate("cache:catalog:product:*").catch(() => {});
    invalidate(buildKey("catalog", "productList", "*")).catch(() => {});
    invalidateCategoryName(id).catch(err => {
      console.warn("[Category] Name cache invalidation failed:", err.message);
    });

    const commissionFieldsChanged = ["applyCommission", "adminCommission", "adminCommissionType", "adminCommissionValue"]
      .some((key) => Object.prototype.hasOwnProperty.call(categoryData, key));
    if (commissionFieldsChanged) {
      enqueueRecalcByCategory(id);
    }

    return handleResponse(res, 200, "Category updated successfully", updatedCategory);
  } catch (error) {
    if (error.code === 11000) return handleResponse(res, 400, "Slug already exists");
    if (error?.name === "ValidationError" || error?.name === "CastError") return handleResponse(res, 400, error.message);
    return handleResponse(res, 500, `Category operation failed: ${error.message}`);
  }
};

/* ===============================
   BULK UPDATE CHARGES
   Sets status, commission %, handling fee, packing fee and/or GST slab on one
   or many categories in a single call. Only the fields present in the body are
   changed. Used by the inline table edit (1 id) and the bulk-select action.
 ================================ */
export const bulkUpdateCategoryCharges = async (req, res) => {
  try {
    const body = req.body || {};
    const { ids } = body;
    const has = (key) => body[key] !== undefined && body[key] !== null && body[key] !== "";

    if (!Array.isArray(ids) || ids.length === 0) {
      return handleResponse(res, 400, "Select at least one category");
    }
    if (ids.length > 200) {
      return handleResponse(res, 400, "Too many categories in one request (max 200)");
    }
    const uniqueIds = [...new Set(ids.map((id) => String(id)))];
    if (uniqueIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
      return handleResponse(res, 400, "Invalid category ID in selection");
    }

    // updateMany bypasses the model's legacy-field sync hooks, so every
    // paired field (legacy + canonical value + type) is written explicitly.
    const set = {};

    if (body.status !== undefined) {
      if (!["active", "inactive"].includes(body.status)) {
        return handleResponse(res, 400, "Status must be active or inactive");
      }
      set.status = body.status;
    }

    if (body.applyCommission !== undefined) {
      const apply = body.applyCommission === true || body.applyCommission === "true";
      let percent = 0;
      if (apply) {
        percent = Number(body.adminCommission);
        if (!has("adminCommission") || !Number.isFinite(percent) || percent < 0 || percent > 100) {
          return handleResponse(res, 400, "Commission must be a number between 0 and 100");
        }
      }
      Object.assign(set, {
        applyCommission: apply,
        adminCommissionType: "percentage",
        adminCommission: percent,
        adminCommissionValue: percent,
      });
    }

    for (const [field, valueField, typeField, label] of [
      ["handlingFees", "handlingFeeValue", "handlingFeeType", "Handling fee"],
      ["packingFees", "packingFeeValue", "packingFeeType", "Packing fee"],
    ]) {
      if (body[field] === undefined) continue;
      const amount = has(field) ? Number(body[field]) : 0;
      if (!Number.isFinite(amount) || amount < 0) {
        return handleResponse(res, 400, `${label} must be a non-negative number`);
      }
      Object.assign(set, { [field]: amount, [valueField]: amount, [typeField]: "fixed" });
    }

    if (has("gstSlab")) {
      const slab = Number(body.gstSlab);
      if (!ALL_GST_SLABS.includes(slab)) {
        return handleResponse(res, 400, `GST slab must be one of: ${ALL_GST_SLABS.join(", ")}`);
      }
      set.gstSlab = slab;
    }

    if (Object.keys(set).length === 0) {
      return handleResponse(res, 400, "Nothing to update");
    }

    const result = await Category.updateMany({ _id: { $in: uniqueIds } }, { $set: set });

    invalidate("cache:catalog:categories:*").catch((err) => {
      console.warn("[Category] Cache invalidation failed:", err.message);
    });
    invalidate("cache:catalog:product:*").catch(() => {});
    invalidate(buildKey("catalog", "productList", "*")).catch(() => {});
    uniqueIds.forEach((id) => {
      invalidateCategoryName(id).catch((err) => {
        console.warn("[Category] Name cache invalidation failed:", err.message);
      });
    });

    // Only commission feeds the cached customer price. Recompute one category
    // at a time, off the request path.
    if (Object.prototype.hasOwnProperty.call(set, "adminCommission")) {
      (async () => {
        for (const id of uniqueIds) {
          await enqueueRecalcByCategory(id);
        }
      })().catch((err) => {
        console.warn("[Category] Bulk commission recalc failed:", err.message);
      });
    }

    return handleResponse(res, 200, "Category charges updated", {
      matched: result.matchedCount ?? result.n ?? 0,
      modified: result.modifiedCount ?? result.nModified ?? 0,
    });
  } catch (error) {
    return handleResponse(res, 500, `Bulk category update failed: ${error.message}`);
  }
};

/* ===============================
   DELETE CATEGORY
 ================================ */
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const deleteWithChildren = async (parentId) => {
      const children = await Category.find({ parentId });
      for (const child of children) {
        await deleteWithChildren(child._id);
      }
      await Category.findByIdAndDelete(parentId);
    };

    await deleteWithChildren(id);
    
    invalidate("cache:catalog:categories:*").catch(err => {
      console.warn("[Category] Cache invalidation failed:", err.message);
    });
    invalidateCategoryName(id).catch(err => {
      console.warn("[Category] Name cache invalidation failed:", err.message);
    });

    return handleResponse(res, 200, "Category and all descendants deleted");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
