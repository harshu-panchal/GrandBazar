import ExperienceSection from "../models/experienceSection.js";
import HeroConfig from "../models/heroConfig.js";
import Category from "../models/category.js";
import Product from "../models/product.js";
import Store from "../models/store.js";
import Order from "../models/order.js";
import handleResponse from "../utils/helper.js";
import mongoose from "mongoose";
import { buildKey, getOrSet, getTTL, invalidate } from "../services/cacheService.js";
import { uploadToCloudinary } from "../services/mediaService.js";
import { getApprovedOrLegacyFilter } from "../services/productModerationService.js";

/* ===============================
   Helpers
================================ */
const validateBasePayload = async (body) => {
  const {
    pageType,
    headerId,
    displayType,
    title,
    order,
    status,
    config = {},
  } = body;

  if (!["home", "header"].includes(pageType)) {
    throw new Error("Invalid pageType");
  }

  if (!["banners", "categories", "subcategories", "products", "super_ads", "seller_highlights"].includes(displayType)) {
    throw new Error("Invalid displayType");
  }

  if (pageType === "header") {
    if (!headerId) {
      throw new Error("headerId is required for header pageType");
    }
    const header = await Category.findOne({ _id: headerId, type: "header" });
    if (!header) {
      throw new Error("Invalid headerId");
    }
  }

  if (["categories", "subcategories", "products", "seller_highlights"].includes(displayType)) {
    if (!title || !title.trim()) {
      throw new Error("Title is required for this displayType");
    }
  }

  if (order !== undefined && Number.isNaN(Number(order))) {
    throw new Error("order must be a number");
  }

  if (status && !["active", "inactive"].includes(status)) {
    throw new Error("Invalid status");
  }

  return {
    pageType,
    headerId: headerId || null,
    displayType,
    title: title?.trim() || "",
    order: order ?? 0,
    status: status || "active",
    config,
  };
};

const normalizeUrl = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized || !/^https?:\/\//i.test(normalized)) {
    return "";
  }
  return normalized;
};

const validateAndNormalizeConfig = async (displayType, config = {}) => {
  const normalized = {};

  if (displayType === "banners") {
    const items = Array.isArray(config.items) ? config.items : [];
    normalized.banners = {
      items: items
        .filter((b) => b && b.imageUrl)
        .map((b) => ({
          imageUrl: b.imageUrl,
          title: b.title,
          subtitle: b.subtitle,
          linkType: b.linkType || "none",
          linkValue: b.linkValue || "",
          status: b.status || "active",
        })),
    };
    return normalized;
  }

  if (displayType === "categories") {
    const maxItems = Number(config.maxItems) || undefined;
    const rows = Number(config.rows) || 1;
    const categoryIds = Array.isArray(config.categoryIds)
      ? config.categoryIds.filter(Boolean)
      : [];

    if (!categoryIds.length) {
      throw new Error("At least one categoryId is required");
    }

    const categories = await Category.find({
      _id: { $in: categoryIds },
      type: "category",
    }).select("_id");

    if (!categories.length) {
      throw new Error("Provided categoryIds are invalid");
    }

    normalized.categories = {
      maxItems,
      categoryIds: categories.map((c) => c._id),
      rows: rows < 1 ? 1 : rows,
    };
    return normalized;
  }

  if (displayType === "subcategories") {
    const rows = Number(config.rows) || 1;
    const categoryIds = Array.isArray(config.categoryIds)
      ? config.categoryIds.filter(Boolean)
      : [];
    const subcategoryIds = Array.isArray(config.subcategoryIds)
      ? config.subcategoryIds.filter(Boolean)
      : [];

    if (!categoryIds.length || !subcategoryIds.length) {
      throw new Error("categoryIds and subcategoryIds are required");
    }

    const categories = await Category.find({
      _id: { $in: categoryIds },
      type: "category",
    }).select("_id");
    const subcategories = await Category.find({
      _id: { $in: subcategoryIds },
      type: "subcategory",
    }).select("_id");

    if (!categories.length || !subcategories.length) {
      throw new Error("Provided categoryIds or subcategoryIds are invalid");
    }

    normalized.subcategories = {
      categoryIds: categories.map((c) => c._id),
      subcategoryIds: subcategories.map((s) => s._id),
      rows: rows < 1 ? 1 : rows,
    };
    return normalized;
  }

  if (displayType === "products") {
    const rows = Number(config.rows) || 1;
    const columns = Number(config.columns) || 2;
    const singleRowScrollable = Boolean(config.singleRowScrollable);

    const categoryIds = Array.isArray(config.categoryIds)
      ? config.categoryIds.filter(Boolean)
      : [];
    const subcategoryIds = Array.isArray(config.subcategoryIds)
      ? config.subcategoryIds.filter(Boolean)
      : [];
    const productIds = Array.isArray(config.productIds)
      ? config.productIds.filter(Boolean)
      : [];

    const normalizedRows = singleRowScrollable ? 1 : rows < 1 ? 1 : rows;
    const normalizedColumns = columns < 1 ? 1 : columns;

    const categories = categoryIds.length
      ? await Category.find({ _id: { $in: categoryIds }, type: "category" }).select("_id")
      : [];
    const subcategories = subcategoryIds.length
      ? await Category.find({
          _id: { $in: subcategoryIds },
          type: "subcategory",
        }).select("_id")
      : [];
    const products = productIds.length
      ? await Product.find({ _id: { $in: productIds } }).select("_id")
      : [];

    normalized.products = {
      categoryIds: categories.map((c) => c._id),
      subcategoryIds: subcategories.map((s) => s._id),
      productIds: products.map((p) => p._id),
      rows: normalizedRows,
      columns: normalizedColumns,
      singleRowScrollable,
    };
    return normalized;
  }

  if (displayType === "super_ads") {
    const items = Array.isArray(config.items) ? config.items : [];
    const validItems = items.filter((a) => a && a.sellerId && a.imageUrl);
    if (!validItems.length) {
      throw new Error("At least one ad slot (seller + image) is required");
    }

    const sellerIds = [...new Set(validItems.map((a) => String(a.sellerId)))];
    const productIds = [...new Set(validItems.filter((a) => a.productId).map((a) => String(a.productId)))];

    const [sellers, products] = await Promise.all([
      Store.find({ _id: { $in: sellerIds } }).select("_id"),
      productIds.length ? Product.find({ _id: { $in: productIds } }).select("_id") : [],
    ]);
    const validSellerIds = new Set(sellers.map((s) => String(s._id)));
    const validProductIds = new Set(products.map((p) => String(p._id)));

    const finalItems = validItems
      .filter((a) => validSellerIds.has(String(a.sellerId)))
      .map((a) => ({
        // Preserved (if present) so updateExperienceSection can carry
        // impressions/clicks forward for items the admin is editing, not
        // adding fresh — a brand-new item simply won't have an _id yet.
        _id: a._id || undefined,
        sellerId: a.sellerId,
        productId: a.productId && validProductIds.has(String(a.productId)) ? a.productId : null,
        title: a.title || "",
        imageUrl: a.imageUrl,
        linkType: a.linkType || "store",
        linkValue: a.linkValue || "",
        priority: Number(a.priority) || 0,
      }));

    if (!finalItems.length) {
      throw new Error("Provided sellerId(s) are invalid");
    }

    normalized.superAds = { items: finalItems.sort((a, b) => b.priority - a.priority) };
    return normalized;
  }

  if (displayType === "seller_highlights") {
    const sellerIds = Array.isArray(config.sellerIds) ? config.sellerIds.filter(Boolean) : [];
    if (!sellerIds.length) {
      throw new Error("At least one sellerId is required");
    }

    const sellers = await Store.find({ _id: { $in: sellerIds } }).select("_id");
    if (!sellers.length) {
      throw new Error("Provided sellerIds are invalid");
    }

    normalized.sellerHighlights = { sellerIds: sellers.map((s) => s._id) };
    return normalized;
  }

  return normalized;
};

/* ===============================
   ADMIN: List sections
================================ */
export const getAdminExperienceSections = async (req, res) => {
  try {
    const { pageType, headerId } = req.query;
    const query = {};

    if (pageType) query.pageType = pageType;
    if (headerId) query.headerId = headerId;

    const sections = await ExperienceSection.find(query)
      .sort({ order: 1, createdAt: 1 })
      .lean();

    return handleResponse(res, 200, "Experience sections fetched", sections);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ADMIN: Create section
================================ */
export const createExperienceSection = async (req, res) => {
  try {
    const base = await validateBasePayload(req.body);
    const config = await validateAndNormalizeConfig(base.displayType, base.config);

    const count = await ExperienceSection.countDocuments({
      pageType: base.pageType,
      headerId: base.headerId,
    });

    const section = await ExperienceSection.create({
      ...base,
      order: base.order ?? count,
      config,
    });
    await invalidate("cache:experience:public:*");

    return handleResponse(res, 201, "Experience section created", section);
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

/* ===============================
   ADMIN: Update section
================================ */
export const updateExperienceSection = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await ExperienceSection.findById(id);
    if (!existing) {
      return handleResponse(res, 404, "Section not found");
    }

    const merged = {
      ...existing.toObject(),
      ...req.body,
      config: { ...(existing.config || {}), ...(req.body.config || {}) },
    };

    const base = await validateBasePayload(merged);
    const config = await validateAndNormalizeConfig(base.displayType, base.config);

    // super_ads: carry impressions/clicks forward for items being edited
    // (matched by _id) — validateBasePayload rebuilds the array fresh each
    // save and has no counters to preserve on its own.
    if (base.displayType === "super_ads" && config?.superAds?.items?.length) {
      const existingById = new Map(
        (existing.config?.superAds?.items || [])
          .filter((item) => item._id)
          .map((item) => [String(item._id), item]),
      );
      config.superAds.items = config.superAds.items.map((item) => {
        const prior = item._id ? existingById.get(String(item._id)) : null;
        return {
          ...item,
          impressions: prior?.impressions || 0,
          clicks: prior?.clicks || 0,
        };
      });
    }

    existing.pageType = base.pageType;
    existing.headerId = base.headerId;
    existing.displayType = base.displayType;
    existing.title = base.title;
    existing.order = base.order;
    existing.status = base.status;
    existing.config = config;

    await existing.save();
    await invalidate("cache:experience:public:*");

    return handleResponse(res, 200, "Experience section updated", existing);
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

/* ===============================
   ADMIN: Delete section
================================ */
export const deleteExperienceSection = async (req, res) => {
  try {
    const { id } = req.params;
    const section = await ExperienceSection.findByIdAndDelete(id);

    if (!section) {
      return handleResponse(res, 404, "Section not found");
    }
    await invalidate("cache:experience:public:*");

    return handleResponse(res, 200, "Experience section deleted");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ADMIN: Reorder sections
================================ */
export const reorderExperienceSections = async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) {
      // Nothing to reorder – treat as success to avoid noisy errors
      return handleResponse(res, 200, "No sections to reorder");
    }

    const bulkOps = items
      .filter(
        (it) => it && it.id && mongoose.Types.ObjectId.isValid(it.id)
      )
      .map((it) => ({
        updateOne: {
          filter: { _id: it.id },
          update: { $set: { order: it.order } },
        },
      }));

    if (!bulkOps.length) {
      // If all items were empty / malformed, avoid throwing and just ack
      return handleResponse(res, 200, "No valid sections to reorder");
    }

    await ExperienceSection.bulkWrite(bulkOps);
    await invalidate("cache:experience:public:*");

    return handleResponse(res, 200, "Sections reordered");
  } catch (error) {
    console.error("Error while reordering experience sections:", error);
    // Fail gracefully so the admin UI doesn't break on partial reorder issues
    return handleResponse(res, 200, "Sections reordered (best-effort)");
  }
};

/* ===============================
   PUBLIC: Get sections for page
================================ */
export const getPublicExperienceSections = async (req, res) => {
  try {
    const { pageType, headerId } = req.query;

    if (!pageType) {
      return handleResponse(res, 400, "pageType is required");
    }

    const query = { pageType, status: "active" };
    if (pageType === "header") {
      if (!headerId) {
        return handleResponse(res, 400, "headerId is required for header pageType");
      }
      query.headerId = headerId;
    }

    const cacheKey = buildKey(
      "experience",
      "public",
      `${pageType}:${headerId || "root"}`,
    );
    const sections = await getOrSet(
      cacheKey,
      async () =>
        ExperienceSection.find(query)
          .sort({ order: 1, createdAt: 1, _id: 1 })
          .populate("config.superAds.items.sellerId", "shopName slug")
          .populate({
            path: "config.superAds.items.productId",
            select: "name slug mainImage stock status isCurrentlyAvailable approvalStatus",
            match: {
              status: "active",
              stock: { $gt: 0 },
              isCurrentlyAvailable: { $ne: false },
              ...getApprovedOrLegacyFilter(),
            },
          })
          .populate("config.sellerHighlights.sellerIds", "shopName slug avgRating category")
          .lean(),
      getTTL("homepage"),
    );

    return handleResponse(res, 200, "Experience sections fetched", sections);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ADMIN: Upload banner image
================================ */
export const uploadBannerImage = async (req, res) => {
  try {
    if (req.file) {
      const uploadedUrl = await uploadToCloudinary(req.file.buffer, "banners", {
        mimeType: req.file.mimetype,
        resourceType: "image",
      });
      await invalidate("cache:experience:public:*");
      return handleResponse(res, 200, "Banner image uploaded", { url: uploadedUrl });
    }

    const url = normalizeUrl(req.body?.url || req.body?.imageUrl);
    if (!url) {
      return handleResponse(res, 400, "A valid image URL is required");
    }
    await invalidate("cache:experience:public:*");
    return handleResponse(res, 200, "Banner image uploaded", { url });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   HERO CONFIG (separate from experience sections)
   Public: get hero config for a page (with fallback to home)
   Admin: get one / list, upsert
================================ */

export const getPublicHeroConfig = async (req, res) => {
  try {
    const { pageType, headerId } = req.query;

    if (!pageType) {
      return handleResponse(res, 400, "pageType is required");
    }

    if (pageType === "header" && !headerId) {
      return handleResponse(res, 400, "headerId is required for header pageType");
    }

    const cacheKey = buildKey(
      "experience",
      "hero",
      `${pageType}:${headerId || "root"}`,
    );
    const config = await getOrSet(
      cacheKey,
      async () => {
        let resolved = null;
        if (pageType === "header") {
          resolved = await HeroConfig.findOne({
            pageType: "header",
            headerId,
          }).lean();
        }
        if (!resolved && (pageType === "home" || pageType === "header")) {
          resolved = await HeroConfig.findOne({
            pageType: "home",
            headerId: null,
          }).lean();
        }
        return resolved || null;
      },
      getTTL("homepage"),
    );

    const payload = config
      ? {
          banners: config.banners || { items: [] },
          categoryIds: config.categoryIds || [],
        }
      : { banners: { items: [] }, categoryIds: [] };

    return handleResponse(res, 200, "Hero config fetched", payload);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getAdminHeroConfig = async (req, res) => {
  try {
    const { pageType, headerId } = req.query;

    if (!pageType) {
      return handleResponse(res, 400, "pageType is required");
    }

    if (pageType === "header" && !headerId) {
      return handleResponse(res, 400, "headerId is required for header pageType");
    }

    const config = await HeroConfig.findOne({
      pageType,
      headerId: pageType === "header" ? headerId : null,
    }).lean();

    return handleResponse(
      res,
      200,
      "Hero config fetched",
      config || { banners: { items: [] }, categoryIds: [] }
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const upsertHeroConfig = async (req, res) => {
  try {
    const { pageType, headerId, banners, categoryIds } = req.body;

    if (!["home", "header"].includes(pageType)) {
      return handleResponse(res, 400, "Invalid pageType");
    }

    if (pageType === "header" && !headerId) {
      return handleResponse(res, 400, "headerId is required for header pageType");
    }

    if (pageType === "header") {
      const header = await Category.findOne({ _id: headerId, type: "header" });
      if (!header) {
        return handleResponse(res, 400, "Invalid headerId");
      }
    }

    const bannerItems = Array.isArray(banners?.items)
      ? banners.items
        .filter((b) => b && b.imageUrl)
        .map((b) => ({
          imageUrl: b.imageUrl,
          title: b.title || "",
          subtitle: b.subtitle || "",
          linkType: b.linkType || "none",
          linkValue: b.linkValue || "",
          status: b.status || "active",
        }))
      : [];

    const ids = Array.isArray(categoryIds) ? categoryIds.filter(Boolean) : [];

    const filter = {
      pageType,
      headerId: pageType === "header" ? headerId : null,
    };

    const update = {
      banners: { items: bannerItems },
      categoryIds: ids,
    };

    const config = await HeroConfig.findOneAndUpdate(
      filter,
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    ).lean();
    await invalidate("cache:experience:hero:*");

    return handleResponse(res, 200, "Hero config saved", config);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET RECOMMENDED STORES (Order History + Ratings)
================================ */
export const getRecommendedStoresForUser = async (req, res) => {
  try {
    const customerId = req.user?.id;
    let recommendedStores = [];
    const storeSelect = "shopName slug category description banners storeVideo address locality city state location serviceRadius isActive isOpen isVerified avgRating reviewCount favoriteCount logoUrl";

    if (customerId) {
      // Pull stores from customer's past orders
      const userOrders = await Order.find({ customer: customerId, status: { $ne: "cancelled" } })
        .select("seller")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      const orderedStoreIds = [...new Set(userOrders.map((o) => o.seller).filter(Boolean))];

      if (orderedStoreIds.length > 0) {
        recommendedStores = await Store.find({
          _id: { $in: orderedStoreIds },
          isActive: true,
          isVerified: true,
          applicationStatus: "approved",
          excludeFromAlternatives: { $ne: true },
        })
          .select(storeSelect)
          .lean();
      }
    }

    // Top-rated fallback if few or no order history stores. This shared,
    // parameter-free pool is the same for every customer/guest, so it's
    // cached — this is the path every guest home-page load hits (no order
    // history), and it previously re-ran an unindexed avgRating/reviewCount
    // sort on every request. Fetch a fixed, generous pool size (independent
    // of any single request's exclude list) so cache hits stay correct
    // regardless of how many stores that particular request needs to skip.
    if (recommendedStores.length < 8) {
      const TOP_RATED_POOL_SIZE = 40;
      const excludeSet = new Set(recommendedStores.map((s) => String(s._id)));
      const topRatedPool = await getOrSet(
        buildKey("stores", "topRatedFallback", ""),
        () =>
          Store.find({
            isActive: true,
            isVerified: true,
            applicationStatus: "approved",
            excludeFromAlternatives: { $ne: true },
          })
            .select(storeSelect)
            .sort({ avgRating: -1, reviewCount: -1 })
            .limit(TOP_RATED_POOL_SIZE)
            .lean(),
        getTTL("homepage"),
      );

      const topRated = topRatedPool
        .filter((s) => !excludeSet.has(String(s._id)))
        .slice(0, 10 - recommendedStores.length);

      recommendedStores = [...recommendedStores, ...topRated];
    }

    return handleResponse(res, 200, "Recommended stores fetched successfully", recommendedStores);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   PUBLIC: Track a Super AD impression/click
================================ */
export const trackSuperAdEvent = async (req, res) => {
  try {
    const { sectionId, itemId } = req.params;
    const { event } = req.body || {};

    if (!["impression", "click"].includes(event)) {
      return handleResponse(res, 400, "event must be 'impression' or 'click'");
    }
    if (!mongoose.Types.ObjectId.isValid(sectionId) || !mongoose.Types.ObjectId.isValid(itemId)) {
      return handleResponse(res, 400, "Invalid sectionId or itemId");
    }

    const field = event === "impression" ? "impressions" : "clicks";
    await ExperienceSection.updateOne(
      { _id: sectionId, "config.superAds.items._id": itemId },
      { $inc: { [`config.superAds.items.$.${field}`]: 1 } },
    );

    return handleResponse(res, 200, "Tracked");
  } catch (error) {
    // Passive tracking — never let a tracking failure surface as a user-facing error.
    return handleResponse(res, 200, "Tracked");
  }
};
