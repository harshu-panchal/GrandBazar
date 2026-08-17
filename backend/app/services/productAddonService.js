import mongoose from "mongoose";
import Product from "../models/product.js";
import ProductAddonMapping from "../models/productAddonMapping.js";
import Order from "../models/order.js";
import { getApprovedOrLegacyFilter } from "./productModerationService.js";

const ADDON_FIELDS = "name slug price salePrice mainImage stock status sellerId";

/**
 * Hydrates a product's addons[] (bare Product refs) into full addon cards,
 * overlaying any ProductAddonMapping (priceOverride/required/sortOrder).
 * Product.addons stays the seller-managed list of which products are
 * addons; the mapping is an optional per-pairing customization on top of it.
 */
export async function resolveProductAddons(product) {
  const addonIds = (product?.addons || [])
    .map((a) => (a && a._id ? a._id : a))
    .filter(Boolean);
  if (!addonIds.length) return [];

  const [addonProducts, mappings] = await Promise.all([
    Product.find({
      _id: { $in: addonIds },
      status: "active",
      stock: { $gt: 0 },
      isCurrentlyAvailable: { $ne: false },
      ...getApprovedOrLegacyFilter(),
    })
      .select(ADDON_FIELDS)
      .lean(),
    ProductAddonMapping.find({
      productId: product._id,
      addonProductId: { $in: addonIds },
    }).lean(),
  ]);

  const productById = new Map(addonProducts.map((p) => [String(p._id), p]));
  const mappingByAddonId = new Map(mappings.map((m) => [String(m.addonProductId), m]));

  return addonIds
    .map((id) => {
      const addonProduct = productById.get(String(id));
      if (!addonProduct) return null;
      const mapping = mappingByAddonId.get(String(id));
      const priceOverride = mapping?.priceOverride ?? null;
      return {
        ...addonProduct,
        priceOverride,
        effectivePrice: priceOverride ?? addonProduct.salePrice ?? addonProduct.price,
        required: mapping?.required || false,
        sortOrder: mapping?.sortOrder || 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Raw per-pairing overrides for a product's addons, for the admin edit form
 * (resolveProductAddons above is for customer-facing display, hydrated with
 * full addon product cards; this is just the mapping rows themselves).
 */
export async function getProductAddonMappings(productId) {
  if (!mongoose.Types.ObjectId.isValid(productId)) return [];
  const mappings = await ProductAddonMapping.find({ productId }).lean();
  return mappings.map((m) => ({
    addonProductId: String(m.addonProductId),
    priceOverride: m.priceOverride ?? null,
    required: Boolean(m.required),
    sortOrder: Number(m.sortOrder) || 0,
  }));
}

/**
 * Replaces the full set of addon-pairing overrides for a product — any
 * pairing not present in `mappings` is deleted, everything present is
 * upserted. Only meant to be called with the admin's complete intended set
 * (mirrors how Product.addons[] itself is saved as a full replacement).
 */
export async function syncProductAddonMappings(productId, mappings = []) {
  if (!mongoose.Types.ObjectId.isValid(productId)) return;

  const validMappings = (Array.isArray(mappings) ? mappings : [])
    .filter((m) => m && m.addonProductId && mongoose.Types.ObjectId.isValid(m.addonProductId))
    .map((m) => {
      const priceOverride =
        m.priceOverride === "" || m.priceOverride === null || m.priceOverride === undefined
          ? null
          : Number(m.priceOverride);
      return {
        addonProductId: String(m.addonProductId),
        priceOverride: Number.isFinite(priceOverride) && priceOverride >= 0 ? priceOverride : null,
        required: m.required === true || m.required === "true",
        sortOrder: Number.isFinite(Number(m.sortOrder)) ? Number(m.sortOrder) : 0,
      };
    });

  const keepIds = validMappings.map((m) => m.addonProductId);

  await Promise.all([
    ProductAddonMapping.deleteMany({ productId, addonProductId: { $nin: keepIds } }),
    ...validMappings.map((m) =>
      ProductAddonMapping.findOneAndUpdate(
        { productId, addonProductId: m.addonProductId },
        { $set: { priceOverride: m.priceOverride, required: m.required, sortOrder: m.sortOrder } },
        { upsert: true },
      ),
    ),
  ]);
}

/**
 * Data-driven "customers who bought this also bought" candidates — surfaced
 * to the seller/admin while they're picking add-ons, since Product.addons[]
 * is otherwise a fully manual pick with no signal to guide it. Counts how
 * often each other same-seller product co-occurs with `productId` across
 * past orders; products already added as addons are excluded (nothing to
 * suggest there). This only ever *suggests* — it never auto-adds anything.
 */
export async function getSuggestedAddons(productId, { limit = 8 } = {}) {
  if (!mongoose.Types.ObjectId.isValid(productId)) return [];

  const product = await Product.findById(productId).select("sellerId addons").lean();
  if (!product) return [];

  const pid = new mongoose.Types.ObjectId(productId);
  const existingAddonIds = new Set((product.addons || []).map((a) => String(a?._id || a)));

  // Orders are single-seller in this app, so any item co-occurring with
  // `productId` in the same order is already guaranteed same-seller —
  // no need to filter by seller at the aggregation stage.
  const rows = await Order.aggregate([
    { $match: { "items.product": pid, status: { $ne: "cancelled" } } },
    { $unwind: "$items" },
    { $match: { "items.product": { $ne: pid } } },
    { $group: { _id: "$items.product", coPurchaseCount: { $sum: 1 } } },
    { $sort: { coPurchaseCount: -1 } },
    { $limit: limit + existingAddonIds.size + 5 },
  ]);

  const candidateIds = rows
    .map((r) => r._id)
    .filter((id) => id && !existingAddonIds.has(String(id)));
  if (!candidateIds.length) return [];

  const candidateProducts = await Product.find({
    _id: { $in: candidateIds },
    sellerId: product.sellerId,
    status: "active",
  })
    .select("name slug mainImage price salePrice")
    .lean();

  const countByIdStr = new Map(rows.map((r) => [String(r._id), r.coPurchaseCount]));

  return candidateProducts
    .map((p) => ({
      productId: String(p._id),
      name: p.name,
      slug: p.slug,
      mainImage: p.mainImage,
      price: p.salePrice || p.price,
      coPurchaseCount: countByIdStr.get(String(p._id)) || 0,
    }))
    .sort((a, b) => b.coPurchaseCount - a.coPurchaseCount)
    .slice(0, limit);
}
