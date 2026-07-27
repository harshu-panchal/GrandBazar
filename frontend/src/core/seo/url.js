const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

export function slugifyText(value = "") {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

export function extractObjectIdFromSlugAndId(slugAndId = "") {
  const raw = String(slugAndId || "").trim();
  if (OBJECT_ID_REGEX.test(raw)) return raw;
  const parts = raw.split("-");
  const tail = parts[parts.length - 1] || "";
  return OBJECT_ID_REGEX.test(tail) ? tail : "";
}

export function buildProductPath(product = {}) {
  const id = product?.id || product?._id || "";
  const slug = product?.slug || slugifyText(product?.name || "product");
  return `/product/${slug}-${id}`;
}

export function buildStorePath(store = {}) {
  const id = store?.id || store?._id || "";
  const slug = store?.slug || slugifyText(store?.shopName || store?.name || "store");
  return `/store/${slug}-${id}`;
}

export function buildCategoryPath(category = {}) {
  const id = category?.id || category?._id || "";
  const slug = category?.slug || slugifyText(category?.name || "category");
  return `/category/${slug}-${id}`;
}
