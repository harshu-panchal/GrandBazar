import Product from "../../models/product.js";
import Store from "../../models/store.js";
import Category from "../../models/category.js";
import Offer from "../../models/offer.js";
import { parseSlugAndId, buildSlugAndId } from "../../utils/seoUrl.js";

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveRoute(pathname = "/") {
  const path = pathname.split("?")[0];
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return { type: "home" };
  if (parts[0] === "product" && parts[1]) return { type: "product", slugAndId: parts[1] };
  if (parts[0] === "store" && parts[1]) return { type: "store", slugAndId: parts[1] };
  if (parts[0] === "category" && parts[1]) return { type: "category", slugAndId: parts[1] };
  if (parts[0] === "offers" && parts[1]) return { type: "offer", slugAndId: parts[1] };
  if (parts[0] === "offers") return { type: "offers" };
  if (parts[0] === "discover" && parts[1] && parts[2]) {
    return { type: "discover-pincode", city: parts[1], pincode: parts[2] };
  }
  if (parts[0] === "discover" && parts[1]) return { type: "discover-city", city: parts[1] };
  return { type: "generic" };
}

async function loadSeoData(route) {
  if (route.type === "product") {
    const parsed = parseSlugAndId(route.slugAndId);
    if (!parsed.valid) return null;
    const entity = await Product.findById(parsed.id).lean();
    if (!entity) return null;
    const canonical = `/product/${buildSlugAndId(entity.slug, entity._id)}`;
    return {
      title: `${entity.name} | Grand Bazar`,
      description: entity.description || "Product details on Grand Bazar",
      canonical,
      image: entity.mainImage || "",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Product",
        name: entity.name || "",
        description: entity.description || "",
      },
    };
  }
  if (route.type === "store") {
    const parsed = parseSlugAndId(route.slugAndId);
    if (!parsed.valid) return null;
    const entity = await Store.findById(parsed.id).lean();
    if (!entity) return null;
    const canonical = `/store/${buildSlugAndId(entity.slug, entity._id)}`;
    return {
      title: `${entity.shopName} | Grand Bazar`,
      description: entity.description || "Store details on Grand Bazar",
      canonical,
      image: entity.banners?.[0] || "",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Store",
        name: entity.shopName || "",
      },
    };
  }
  if (route.type === "category") {
    const parsed = parseSlugAndId(route.slugAndId);
    if (!parsed.valid) return null;
    const entity = await Category.findById(parsed.id).lean();
    if (!entity) return null;
    return {
      title: `${entity.name} | Grand Bazar`,
      description: entity.description || "Category products on Grand Bazar",
      canonical: `/category/${buildSlugAndId(entity.slug, entity._id)}`,
      image: entity.image || "",
      jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: entity.name || "" },
    };
  }
  if (route.type === "offers") {
    return {
      title: "Offers & Deals | Grand Bazar",
      description: "Browse active coupons and discount offers.",
      canonical: "/offers",
      image: "",
      jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: "Offers" },
    };
  }
  if (route.type === "offer") {
    const parsed = parseSlugAndId(route.slugAndId);
    if (!parsed.valid) return null;
    const entity = await Offer.findById(parsed.id).lean();
    if (!entity) return null;
    const offerSlug = String(entity.title || "offer").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return {
      title: `${entity.title || "Offer"} | Grand Bazar`,
      description: entity.description || "Offer details",
      canonical: `/offers/${buildSlugAndId(offerSlug, entity._id)}`,
      image: "",
      jsonLd: { "@context": "https://schema.org", "@type": "Offer", name: entity.title || "" },
    };
  }
  if (route.type === "discover-city") {
    const cityName = route.city.replace(/-/g, " ");
    return {
      title: `Stores in ${cityName} | Grand Bazar`,
      description: `Discover nearby stores and products in ${cityName}.`,
      canonical: `/discover/${route.city}`,
      image: "",
      jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: cityName },
    };
  }
  if (route.type === "discover-pincode") {
    return {
      title: `Delivery in ${route.pincode} | Grand Bazar`,
      description: `Discover stores serving pincode ${route.pincode}.`,
      canonical: `/discover/${route.city}/${route.pincode}`,
      image: "",
      jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: route.pincode },
    };
  }
  return {
    title: "Grand Bazar",
    description: "Quick commerce marketplace",
    canonical: "/",
    image: "",
    jsonLd: { "@context": "https://schema.org", "@type": "WebSite", name: "Grand Bazar" },
  };
}

export async function renderSeoHtml({ pathname = "/", origin = "" }) {
  const route = resolveRoute(pathname);
  const seo = await loadSeoData(route);
  if (!seo) return null;
  const canonicalUrl = `${origin}${seo.canonical}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(seo.title)}</title>
  <meta name="description" content="${escapeHtml(seo.description)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <meta property="og:title" content="${escapeHtml(seo.title)}" />
  <meta property="og:description" content="${escapeHtml(seo.description)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  ${seo.image ? `<meta property="og:image" content="${escapeHtml(seo.image)}" />` : ""}
  <script type="application/ld+json">${escapeHtml(JSON.stringify(seo.jsonLd || {}))}</script>
</head>
<body>
  <div id="root">Loading...</div>
  <script>window.location.replace(${JSON.stringify(pathname)});</script>
</body>
</html>`;
}
