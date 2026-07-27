import Product from "../models/product.js";
import Store from "../models/store.js";
import Category from "../models/category.js";
import Offer from "../models/offer.js";
import handleResponse from "../utils/helper.js";
import { buildSlugAndId, parseSlugAndId } from "../utils/seoUrl.js";
import { slugify } from "../utils/slugify.js";

function toCanonicalPath(type, slug, id) {
  const slugAndId = buildSlugAndId(slug, id);
  switch (type) {
    case "product":
      return `/product/${slugAndId}`;
    case "store":
      return `/store/${slugAndId}`;
    case "category":
      return `/category/${slugAndId}`;
    case "offer":
      return `/offers/${slugAndId}`;
    default:
      return "/";
  }
}

function toSeoPayload(type, entity, req) {
  const proto = req.protocol || "https";
  const host = req.get("host") || "";
  const id = String(entity?._id || "");
  const slug = String(entity?.slug || "").trim().toLowerCase();
  const canonicalPath = toCanonicalPath(type, slug, id);
  const baseTitle = String(
    entity?.seoTitle || entity?.name || entity?.shopName || entity?.title || "",
  ).trim();
  const baseDescription = String(
    entity?.seoDescription || entity?.description || "",
  ).trim();
  return {
    id,
    slug,
    slugAndId: buildSlugAndId(slug, id),
    canonicalPath,
    canonicalUrl: `${proto}://${host}${canonicalPath}`,
    title: baseTitle,
    description: baseDescription,
    keywords: Array.isArray(entity?.seoKeywords)
      ? entity.seoKeywords
      : String(entity?.metaKeywords || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
    ogImage:
      entity?.mainImage ||
      entity?.image ||
      entity?.banners?.[0] ||
      "",
    lastModified: entity?.updatedAt || entity?.createdAt || null,
  };
}

export const getPublicProductSeo = async (req, res) => {
  try {
    const parsed = parseSlugAndId(req.params.slugAndId);
    if (!parsed.valid) return handleResponse(res, 400, "Invalid product slug format");

    const product = await Product.findById(parsed.id)
      .select("name slug description mainImage updatedAt createdAt")
      .lean();
    if (!product) return handleResponse(res, 404, "Product not found");
    return handleResponse(res, 200, "Public product SEO payload", {
      ...toSeoPayload("product", product, req),
      jsonLdType: "Product",
      isCanonicalSlugMatch: parsed.slug === String(product.slug || ""),
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getPublicStoreSeo = async (req, res) => {
  try {
    const parsed = parseSlugAndId(req.params.slugAndId);
    if (!parsed.valid) return handleResponse(res, 400, "Invalid store slug format");

    const store = await Store.findById(parsed.id)
      .select("shopName slug description banners seoTitle seoDescription seoKeywords updatedAt createdAt")
      .lean();
    if (!store) return handleResponse(res, 404, "Store not found");
    return handleResponse(res, 200, "Public store SEO payload", {
      ...toSeoPayload("store", store, req),
      jsonLdType: "Store",
      isCanonicalSlugMatch: parsed.slug === String(store.slug || ""),
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getPublicCategorySeo = async (req, res) => {
  try {
    const parsed = parseSlugAndId(req.params.slugAndId);
    if (!parsed.valid) return handleResponse(res, 400, "Invalid category slug format");

    const category = await Category.findById(parsed.id)
      .select("name slug description image updatedAt createdAt")
      .lean();
    if (!category) return handleResponse(res, 404, "Category not found");
    return handleResponse(res, 200, "Public category SEO payload", {
      ...toSeoPayload("category", category, req),
      jsonLdType: "CollectionPage",
      isCanonicalSlugMatch: parsed.slug === String(category.slug || ""),
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getPublicOfferSeo = async (req, res) => {
  try {
    const parsed = parseSlugAndId(req.params.slugAndId);
    if (!parsed.valid) return handleResponse(res, 400, "Invalid offer slug format");

    const offer = await Offer.findById(parsed.id)
      .select("title description updatedAt createdAt")
      .lean();
    if (!offer) return handleResponse(res, 404, "Offer not found");
    const syntheticOffer = {
      ...offer,
      slug: offer.title ? offer.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "",
    };
    return handleResponse(res, 200, "Public offer SEO payload", {
      ...toSeoPayload("offer", syntheticOffer, req),
      jsonLdType: "Offer",
      isCanonicalSlugMatch: parsed.slug === String(syntheticOffer.slug || ""),
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getDiscoverCityData = async (req, res) => {
  try {
    const citySlug = String(req.params.citySlug || "").trim().toLowerCase();
    const cityRegex = new RegExp(`^${citySlug.replace(/-/g, "[\\s-]*")}$`, "i");
    const stores = await Store.find({
      isActive: true,
      isVerified: true,
      applicationStatus: "approved",
      city: cityRegex,
    })
      .select("shopName slug category categories locality city pincode avgRating reviewCount favoriteCount banners")
      .sort({ favoriteCount: -1, avgRating: -1 })
      .limit(100)
      .lean();

    const categories = [...new Set(stores.flatMap((s) => s.categories?.length ? s.categories : [s.category]).filter(Boolean))];
    return handleResponse(res, 200, "Discover city data", {
      citySlug,
      cityName: stores[0]?.city || citySlug.replace(/-/g, " "),
      stores: stores.map((s) => ({
        ...s,
        canonicalPath: `/store/${buildSlugAndId(s.slug || slugify(s.shopName), s._id)}`,
      })),
      categories,
      totalStores: stores.length,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getDiscoverPincodeData = async (req, res) => {
  try {
    const citySlug = String(req.params.citySlug || "").trim().toLowerCase();
    const pincode = String(req.params.pincode || "").trim();
    if (!/^\d{4,10}$/.test(pincode)) return handleResponse(res, 400, "Invalid pincode");

    const cityRegex = new RegExp(`^${citySlug.replace(/-/g, "[\\s-]*")}$`, "i");
    const stores = await Store.find({
      isActive: true,
      isVerified: true,
      applicationStatus: "approved",
      city: cityRegex,
      pincode,
    })
      .select("shopName slug category categories locality city pincode avgRating reviewCount favoriteCount banners")
      .sort({ favoriteCount: -1, avgRating: -1 })
      .limit(100)
      .lean();

    const categories = [...new Set(stores.flatMap((s) => s.categories?.length ? s.categories : [s.category]).filter(Boolean))];
    return handleResponse(res, 200, "Discover pincode data", {
      citySlug,
      pincode,
      cityName: stores[0]?.city || citySlug.replace(/-/g, " "),
      stores: stores.map((s) => ({
        ...s,
        canonicalPath: `/store/${buildSlugAndId(s.slug || slugify(s.shopName), s._id)}`,
      })),
      categories,
      totalStores: stores.length,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
