import mongoose from "mongoose";
import Store from "../models/store.js";
import Product from "../models/product.js";
import StorefrontLayout, {
  STOREFRONT_SECTION_LAYOUTS,
} from "../models/storefrontLayout.js";
import handleResponse from "../utils/helper.js";
import { recordAuditLog } from "../services/auditTrailService.js";

const asId = (value) => String(value?._id || value || "").trim();

export function normalizeStorefrontSections(rawSections, allowedProductIds) {
  if (!Array.isArray(rawSections)) {
    const error = new Error("sections must be an array");
    error.statusCode = 400;
    throw error;
  }

  const allowed = new Set((allowedProductIds || []).map(String));

  return rawSections.map((rawSection, index) => {
    const title = String(rawSection?.title || "").trim();
    const layout = String(rawSection?.layout || "").trim();

    if (!title) {
      const error = new Error(`Section ${index + 1} requires a title`);
      error.statusCode = 400;
      throw error;
    }
    if (title.length > 120) {
      const error = new Error(`Section ${index + 1} title cannot exceed 120 characters`);
      error.statusCode = 400;
      throw error;
    }
    if (!STOREFRONT_SECTION_LAYOUTS.includes(layout)) {
      const error = new Error(`Section ${index + 1} has an invalid layout`);
      error.statusCode = 400;
      throw error;
    }

    const seen = new Set();
    const productIds = [];
    for (const candidate of Array.isArray(rawSection?.productIds) ? rawSection.productIds : []) {
      const productId = asId(candidate);
      if (!mongoose.Types.ObjectId.isValid(productId) || !allowed.has(productId)) {
        const error = new Error(`Section ${index + 1} contains a product outside this store`);
        error.statusCode = 400;
        throw error;
      }
      if (!seen.has(productId)) {
        seen.add(productId);
        productIds.push(productId);
      }
    }

    const normalized = { title, layout, productIds };
    const sectionId = asId(rawSection?._id || rawSection?.id);
    if (mongoose.Types.ObjectId.isValid(sectionId)) normalized._id = sectionId;
    return normalized;
  });
}

async function resolveAdminStore(storeOrSellerId) {
  if (!mongoose.Types.ObjectId.isValid(storeOrSellerId)) return null;
  return (
    (await Store.findById(storeOrSellerId).select("_id shopName ownerId").lean()) ||
    (await Store.findOne({ ownerId: storeOrSellerId }).select("_id shopName ownerId").lean())
  );
}

async function getOwnedProductIds(storeId) {
  const products = await Product.find({ sellerId: storeId }).select("_id").lean();
  return products.map((product) => String(product._id));
}

function serializeLayout(layout, storeId) {
  if (!layout) {
    return {
      storeId: String(storeId),
      draftSections: [],
      publishedSections: [],
      draftRevision: 0,
      publishedRevision: 0,
      hasUnpublishedChanges: false,
      publishedAt: null,
    };
  }
  const value = layout.toObject ? layout.toObject() : layout;
  return {
    ...value,
    storeId: String(value.storeId || storeId),
    hasUnpublishedChanges:
      Number(value.draftRevision || 0) !== Number(value.publishedRevision || 0),
  };
}

async function fetchLayout(storeId) {
  const layout = await StorefrontLayout.findOne({ storeId }).lean();
  return serializeLayout(layout, storeId);
}

async function saveDraft({ storeId, sections, actorType, actorId }) {
  const allowedProductIds = await getOwnedProductIds(storeId);
  const draftSections = normalizeStorefrontSections(sections, allowedProductIds);
  const layout = await StorefrontLayout.findOneAndUpdate(
    { storeId },
    {
      $set: {
        draftSections,
        lastEditedBy: { actorType, actorId: actorId || null },
      },
      $inc: { draftRevision: 1 },
      $setOnInsert: { publishedSections: [], publishedRevision: 0 },
    },
    { new: true, upsert: true, runValidators: true },
  );
  return serializeLayout(layout, storeId);
}

async function publishDraft({ storeId, sections, actorType, actorId }) {
  if (sections !== undefined) {
    await saveDraft({ storeId, sections, actorType, actorId });
  }

  const current = await StorefrontLayout.findOne({ storeId });
  if (!current) {
    const created = await StorefrontLayout.create({
      storeId,
      draftSections: [],
      publishedSections: [],
      draftRevision: 1,
      publishedRevision: 1,
      publishedAt: new Date(),
      lastEditedBy: { actorType, actorId: actorId || null },
    });
    return serializeLayout(created, storeId);
  }

  current.publishedSections = current.draftSections.map((section) => ({
    _id: section._id,
    title: section.title,
    layout: section.layout,
    productIds: section.productIds,
  }));
  current.publishedRevision = current.draftRevision;
  current.publishedAt = new Date();
  current.lastEditedBy = { actorType, actorId: actorId || null };
  await current.save();
  return serializeLayout(current, storeId);
}

export const getSellerStorefrontLayout = async (req, res) => {
  try {
    return handleResponse(res, 200, "Storefront layout fetched", await fetchLayout(req.user.id));
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const saveSellerStorefrontLayoutDraft = async (req, res) => {
  try {
    const result = await saveDraft({
      storeId: req.user.id,
      sections: req.body?.sections,
      actorType: "seller",
      actorId: req.user.subSellerId || req.user.accountId || req.user.id,
    });
    return handleResponse(res, 200, "Storefront draft saved", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 400, error.message);
  }
};

export const publishSellerStorefrontLayout = async (req, res) => {
  try {
    const result = await publishDraft({
      storeId: req.user.id,
      sections: req.body?.sections,
      actorType: "seller",
      actorId: req.user.subSellerId || req.user.accountId || req.user.id,
    });
    return handleResponse(res, 200, "Storefront layout published", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 400, error.message);
  }
};

export const getAdminStorefrontLayout = async (req, res) => {
  try {
    const store = await resolveAdminStore(req.params.id);
    if (!store) return handleResponse(res, 404, "Store not found");
    return handleResponse(res, 200, "Storefront layout fetched", await fetchLayout(store._id));
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const saveAdminStorefrontLayoutDraft = async (req, res) => {
  try {
    const store = await resolveAdminStore(req.params.id);
    if (!store) return handleResponse(res, 404, "Store not found");
    const before = await fetchLayout(store._id);
    const result = await saveDraft({
      storeId: store._id,
      sections: req.body?.sections,
      actorType: "admin",
      actorId: req.user.id,
    });
    void recordAuditLog({
      actorId: req.user.id,
      action: "STOREFRONT_LAYOUT_DRAFT_UPDATED_BY_ADMIN",
      targetType: "Store",
      targetId: store._id,
      before: { draftRevision: before.draftRevision },
      after: { draftRevision: result.draftRevision },
    });
    return handleResponse(res, 200, "Storefront draft saved", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 400, error.message);
  }
};

export const publishAdminStorefrontLayout = async (req, res) => {
  try {
    const store = await resolveAdminStore(req.params.id);
    if (!store) return handleResponse(res, 404, "Store not found");
    const result = await publishDraft({
      storeId: store._id,
      sections: req.body?.sections,
      actorType: "admin",
      actorId: req.user.id,
    });
    void recordAuditLog({
      actorId: req.user.id,
      action: "STOREFRONT_LAYOUT_PUBLISHED_BY_ADMIN",
      targetType: "Store",
      targetId: store._id,
      after: { publishedRevision: result.publishedRevision },
    });
    return handleResponse(res, 200, "Storefront layout published", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 400, error.message);
  }
};

export const getPublicStorefrontLayout = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return handleResponse(res, 400, "Invalid store ID format");
    }
    const store = await Store.findOne({
      _id: id,
      isActive: true,
      isVerified: true,
      applicationStatus: "approved",
    }).select("_id").lean();
    if (!store) return handleResponse(res, 404, "Store not found or is currently inactive");

    const layout = await StorefrontLayout.findOne({ storeId: id })
      .select("storeId publishedSections publishedRevision publishedAt")
      .lean();
    return handleResponse(res, 200, "Published storefront layout fetched", {
      storeId: id,
      sections: layout?.publishedSections || [],
      publishedRevision: layout?.publishedRevision || 0,
      publishedAt: layout?.publishedAt || null,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
