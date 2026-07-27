import { renderSeoHtml } from "../services/seo/dynamicRendererService.js";
import logger from "../services/logger.js";

const BOT_UA_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /yandexbot/i,
  /duckduckbot/i,
  /baiduspider/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /slackbot/i,
  /whatsapp/i,
  /telegrambot/i,
];

const cache = new Map();
const CACHE_TTL_MS = parseInt(process.env.SEO_RENDER_CACHE_TTL_MS || "120000", 10);
const stats = {
  total: 0,
  botRequests: 0,
  rendered: 0,
  cacheHits: 0,
  fallbacks: 0,
  errors: 0,
};

function isBotRequest(req) {
  const ua = req.get("user-agent") || "";
  return BOT_UA_PATTERNS.some((p) => p.test(ua));
}

function isPublicSeoPath(pathname = "") {
  if (!pathname || pathname === "/") return true;
  if (pathname.startsWith("/api")) return false;
  if (pathname.startsWith("/admin")) return false;
  if (pathname.startsWith("/seller")) return false;
  if (pathname.startsWith("/delivery")) return false;
  if (pathname.startsWith("/assets")) return false;
  return /^\/(product|store|category|offers|discover)/.test(pathname);
}

function getCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function setCache(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function maybeServeSeoRender(req, res, next) {
  try {
    stats.total += 1;
    const pathname = req.path || "/";
    if (!isPublicSeoPath(pathname)) {
      res.setHeader("x-render-mode", "skip");
      return next();
    }
    if (!isBotRequest(req)) {
      res.setHeader("x-render-mode", "spa");
      return next();
    }
    stats.botRequests += 1;

    const origin = `${req.protocol}://${req.get("host") || ""}`;
    const cacheKey = `${pathname}|${req.get("accept-language") || ""}`;
    const cached = getCache(cacheKey);
    if (cached) {
      stats.cacheHits += 1;
      res.setHeader("x-render-mode", "bot-cache");
      return res.status(200).type("html").send(cached);
    }

    const html = await renderSeoHtml({ pathname, origin });
    if (!html) {
      stats.fallbacks += 1;
      res.setHeader("x-render-mode", "bot-fallback");
      logger.warn("[SEO Render] No HTML rendered, fallback to SPA", { pathname });
      return next();
    }

    setCache(cacheKey, html);
    stats.rendered += 1;
    res.setHeader("x-render-mode", "bot");
    logger.info("[SEO Render] Bot HTML served", { pathname, cacheKey });
    return res.status(200).type("html").send(html);
  } catch (error) {
    stats.errors += 1;
    res.setHeader("x-render-mode", "bot-error");
    logger.error("[SEO Render] Middleware error", { message: error.message, stack: error.stack });
    return next();
  }
}

export function getSeoRenderStats() {
  return { ...stats, cacheEntries: cache.size };
}
