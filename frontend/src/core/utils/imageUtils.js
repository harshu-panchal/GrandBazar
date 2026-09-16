import categoryPlaceholder from "../../assets/category-placeholder.svg";
import productPlaceholder from "../../assets/product-placeholder.svg";
import avatarPlaceholder from "../../assets/avatar-placeholder.svg";
import documentPlaceholder from "../../assets/document-placeholder.svg";

const CLOUDINARY_REGEX = /res\.cloudinary\.com/i;
const CLOUDINARY_UPLOAD_SEGMENT_REGEX = /\/upload\/([^/]+)\//i;

/**
 * Shared local placeholders shown across the app (customer-facing and
 * admin panel alike) when a photo an admin/seller/delivery partner was
 * meant to upload is missing or empty — replaces the several divergent
 * third-party CDN fallback URLs, bare "hide the image" onError handlers,
 * and unguarded <img> tags that used to leave a raw broken-image icon.
 */
export const CATEGORY_PLACEHOLDER_IMAGE = categoryPlaceholder;
export const PRODUCT_PLACEHOLDER_IMAGE = productPlaceholder;
export const AVATAR_PLACEHOLDER_IMAGE = avatarPlaceholder;
export const DOCUMENT_PLACEHOLDER_IMAGE = documentPlaceholder;

function getImageUrlWithFallback(image, placeholder) {
  return image && String(image).trim() ? image : placeholder;
}

/**
 * Returns an <img onError={...}> handler that swaps a dead/broken image URL
 * for the given local placeholder — catches URLs that are non-empty but
 * 404/fail to load, which a falsy check on the source value alone can't
 * catch. Guards against an infinite error loop if the placeholder itself
 * ever fails to load.
 */
function makeImageErrorHandler(placeholder) {
  return function handleImageError(event) {
    const img = event.currentTarget;
    if (img.dataset.fallbackApplied) return;
    img.dataset.fallbackApplied = "true";
    img.src = placeholder;
  };
}

export function getCategoryImageUrl(image) {
  return getImageUrlWithFallback(image, CATEGORY_PLACEHOLDER_IMAGE);
}
export const handleCategoryImageError = makeImageErrorHandler(CATEGORY_PLACEHOLDER_IMAGE);

export function getProductImageUrl(image) {
  return getImageUrlWithFallback(image, PRODUCT_PLACEHOLDER_IMAGE);
}
export const handleProductImageError = makeImageErrorHandler(PRODUCT_PLACEHOLDER_IMAGE);

export function getAvatarImageUrl(image) {
  return getImageUrlWithFallback(image, AVATAR_PLACEHOLDER_IMAGE);
}
export const handleAvatarImageError = makeImageErrorHandler(AVATAR_PLACEHOLDER_IMAGE);

export function getDocumentImageUrl(image) {
  return getImageUrlWithFallback(image, DOCUMENT_PLACEHOLDER_IMAGE);
}
export const handleDocumentImageError = makeImageErrorHandler(DOCUMENT_PLACEHOLDER_IMAGE);

/**
 * Appends Cloudinary optimisation transforms to a URL.
 * Safe to call on any URL — non-Cloudinary URLs are returned unchanged.
 */
export function applyCloudinaryTransform(url, params = "f_auto,q_auto,w_400,dpr_auto") {
  if (!url || !CLOUDINARY_REGEX.test(url)) return url;
  const match = url.match(CLOUDINARY_UPLOAD_SEGMENT_REGEX);
  if (!match) return url;

  const segmentAfterUpload = match[1] || "";
  const alreadyHasTransforms =
    segmentAfterUpload.includes(",") ||
    /^[a-z]{1,4}_[^/]+$/i.test(segmentAfterUpload);

  if (alreadyHasTransforms) return url;

  // Insert transform before the segment after `/upload/` (often `v123...`).
  return url.replace(CLOUDINARY_UPLOAD_SEGMENT_REGEX, `/upload/${params}/$1/`);
}

export function isCloudinaryUrl(url) {
  return !!url && CLOUDINARY_REGEX.test(url);
}

export function buildCloudinarySrcSet(
  url,
  entries,
  baseParams = "f_auto,q_auto,c_fill,g_auto",
) {
  if (!isCloudinaryUrl(url) || !Array.isArray(entries) || entries.length === 0)
    return undefined;

  return entries
    .map(({ w, h }) => {
      const params = [
        baseParams,
        typeof w === "number" ? `w_${w}` : null,
        typeof h === "number" ? `h_${h}` : null,
      ]
        .filter(Boolean)
        .join(",");

      const href = applyCloudinaryTransform(url, params) || url;
      const descriptor = typeof w === "number" ? `${w}w` : "";
      return descriptor ? `${href} ${descriptor}` : href;
    })
    .join(", ");
}
