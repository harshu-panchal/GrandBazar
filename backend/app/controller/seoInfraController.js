import { buildSitemapEntries, toSitemapIndexXml, toUrlXml } from "../services/seo/sitemapService.js";
import { getSeoRenderStats } from "../middleware/seoRenderMiddleware.js";

let lastSitemapBuildAt = null;
let lastSitemapCounts = {};

function getOrigin(req) {
  return `${req.protocol}://${req.get("host") || ""}`;
}

export async function getRobotsTxt(req, res) {
  const origin = getOrigin(req);
  const lines = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /seller",
    "Disallow: /delivery",
    "Disallow: /api/private",
    "Disallow: /login",
    "Disallow: /signup",
    `Sitemap: ${origin}/sitemap.xml`,
  ];
  res.type("text/plain").send(lines.join("\n"));
}

async function getAllMaps(req) {
  const maps = await buildSitemapEntries(getOrigin(req));
  lastSitemapBuildAt = new Date().toISOString();
  lastSitemapCounts = maps.counts;
  return maps;
}

export async function getSitemapIndex(req, res) {
  const origin = getOrigin(req);
  const maps = await getAllMaps(req);
  const nowIso = new Date().toISOString();
  const indexEntries = [];
  for (const key of ["products", "stores", "categories", "discoverCity", "discoverPincode"]) {
    const chunks = maps[key] || [];
    for (let i = 0; i < chunks.length; i += 1) {
      const name = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      indexEntries.push({
        loc: `${origin}/sitemaps/${name}-${i + 1}.xml`,
        lastmod: nowIso,
      });
    }
  }
  res.type("application/xml").send(toSitemapIndexXml(indexEntries));
}

export async function getSitemapChunk(req, res) {
  const { mapType, page } = req.params;
  const maps = await getAllMaps(req);
  const normalized = {
    products: "products",
    stores: "stores",
    categories: "categories",
    "discover-city": "discoverCity",
    "discover-pincode": "discoverPincode",
  }[mapType];
  if (!normalized) return res.status(404).type("text/plain").send("Unknown sitemap type");

  const index = Math.max(1, parseInt(page || "1", 10)) - 1;
  const chunk = maps[normalized]?.[index] || [];
  res.type("application/xml").send(toUrlXml(chunk));
}

export async function getSeoHealth(req, res) {
  return res.status(200).json({
    success: true,
    error: false,
    result: {
      renderer: {
        mode: process.env.SEO_RENDER_MODE || "inline",
        cacheTtlMs: parseInt(process.env.SEO_RENDER_CACHE_TTL_MS || "120000", 10),
        stats: getSeoRenderStats(),
      },
      sitemap: {
        lastBuildAt: lastSitemapBuildAt,
        counts: lastSitemapCounts,
      },
      now: new Date().toISOString(),
    },
  });
}
