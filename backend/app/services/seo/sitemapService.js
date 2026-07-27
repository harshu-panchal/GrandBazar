import Product from "../../models/product.js";
import Store from "../../models/store.js";
import Category from "../../models/category.js";
import { buildSlugAndId } from "../../utils/seoUrl.js";

const MAX_URLS_PER_SITEMAP = 50000;

function xmlEscape(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function chunk(arr = [], size = MAX_URLS_PER_SITEMAP) {
  const parts = [];
  for (let i = 0; i < arr.length; i += size) {
    parts.push(arr.slice(i, i + size));
  }
  return parts;
}

function toUrlXml(entries = []) {
  const body = entries
    .map((item) => {
      const imageTag = item.image
        ? `<image:image><image:loc>${xmlEscape(item.image)}</image:loc></image:image>`
        : "";
      return `<url><loc>${xmlEscape(item.loc)}</loc><lastmod>${xmlEscape(item.lastmod)}</lastmod>${imageTag}</url>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${body}</urlset>`;
}

function toSitemapIndexXml(items = []) {
  const body = items
    .map((item) => `<sitemap><loc>${xmlEscape(item.loc)}</loc><lastmod>${xmlEscape(item.lastmod)}</lastmod></sitemap>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`;
}

function toIsoDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export async function buildSitemapEntries(origin) {
  const [products, stores, categories] = await Promise.all([
    Product.find({ status: "active" }).select("slug mainImage updatedAt").lean(),
    Store.find({ isActive: true, isVerified: true, applicationStatus: "approved" })
      .select("slug banners updatedAt city pincode")
      .lean(),
    Category.find({ status: "active" }).select("slug image updatedAt").lean(),
  ]);

  const productEntries = products.map((p) => ({
    loc: `${origin}/product/${buildSlugAndId(p.slug, p._id)}`,
    lastmod: toIsoDate(p.updatedAt),
    image: p.mainImage || "",
  }));
  const storeEntries = stores.map((s) => ({
    loc: `${origin}/store/${buildSlugAndId(s.slug, s._id)}`,
    lastmod: toIsoDate(s.updatedAt),
    image: s.banners?.[0] || "",
  }));
  const categoryEntries = categories.map((c) => ({
    loc: `${origin}/category/${buildSlugAndId(c.slug, c._id)}`,
    lastmod: toIsoDate(c.updatedAt),
    image: c.image || "",
  }));

  const citySet = new Set();
  const cityPincodeSet = new Set();
  for (const s of stores) {
    const city = String(s.city || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const pincode = String(s.pincode || "").trim();
    if (!city) continue;
    citySet.add(city);
    if (pincode) cityPincodeSet.add(`${city}|${pincode}`);
  }
  const discoverCityEntries = [...citySet].map((city) => ({
    loc: `${origin}/discover/${city}`,
    lastmod: new Date().toISOString(),
    image: "",
  }));
  const discoverPincodeEntries = [...cityPincodeSet].map((cp) => {
    const [city, pincode] = cp.split("|");
    return {
      loc: `${origin}/discover/${city}/${pincode}`,
      lastmod: new Date().toISOString(),
      image: "",
    };
  });

  return {
    products: chunk(productEntries),
    stores: chunk(storeEntries),
    categories: chunk(categoryEntries),
    discoverCity: chunk(discoverCityEntries),
    discoverPincode: chunk(discoverPincodeEntries),
    counts: {
      products: productEntries.length,
      stores: storeEntries.length,
      categories: categoryEntries.length,
      discoverCity: discoverCityEntries.length,
      discoverPincode: discoverPincodeEntries.length,
    },
  };
}

export { toUrlXml, toSitemapIndexXml };
