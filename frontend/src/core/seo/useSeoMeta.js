import { useEffect } from "react";

function upsertMeta(attr, key, content) {
  if (!key) return;
  const selector = `meta[${attr}="${key}"]`;
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute(attr, key);
    document.head.appendChild(node);
  }
  node.setAttribute("content", content || "");
}

function upsertLink(rel, href) {
  const selector = `link[rel="${rel}"]`;
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement("link");
    node.setAttribute("rel", rel);
    document.head.appendChild(node);
  }
  node.setAttribute("href", href || "");
}

function upsertJsonLd(id, payload) {
  if (!id) return;
  let node = document.head.querySelector(`script[data-seo-jsonld="${id}"]`);
  if (!node) {
    node = document.createElement("script");
    node.setAttribute("type", "application/ld+json");
    node.setAttribute("data-seo-jsonld", id);
    document.head.appendChild(node);
  }
  node.textContent = JSON.stringify(payload || {});
}

export function useSeoMeta({
  title,
  description,
  keywords,
  canonicalUrl,
  ogImage,
  ogType = "website",
  twitterCard = "summary_large_image",
  jsonLd,
  jsonLdId = "default",
  robots,
}) {
  useEffect(() => {
    if (title) document.title = title;
    if (description != null) upsertMeta("name", "description", description);
    if (keywords != null) {
      const value = Array.isArray(keywords) ? keywords.join(", ") : String(keywords || "");
      upsertMeta("name", "keywords", value);
    }

    if (canonicalUrl) upsertLink("canonical", canonicalUrl);
    if (robots != null) upsertMeta("name", "robots", robots);

    upsertMeta("property", "og:title", title || "");
    upsertMeta("property", "og:description", description || "");
    upsertMeta("property", "og:type", ogType || "website");
    if (canonicalUrl) upsertMeta("property", "og:url", canonicalUrl);
    if (ogImage) upsertMeta("property", "og:image", ogImage);

    upsertMeta("name", "twitter:card", twitterCard);
    upsertMeta("name", "twitter:title", title || "");
    upsertMeta("name", "twitter:description", description || "");
    if (ogImage) upsertMeta("name", "twitter:image", ogImage);

    if (jsonLd) {
      upsertJsonLd(jsonLdId, jsonLd);
    }
  }, [
    title,
    description,
    keywords,
    canonicalUrl,
    ogImage,
    ogType,
    twitterCard,
    jsonLd,
    jsonLdId,
    robots,
  ]);
}
