import Product from "../models/product.js";
import ProductAddonMapping from "../models/productAddonMapping.js";

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
    Product.find({ _id: { $in: addonIds }, status: "active" })
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
