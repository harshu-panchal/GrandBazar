import mongoose from "mongoose";

export function buildSlugAndId(slug, id) {
  const cleanSlug = String(slug || "").trim().toLowerCase();
  const cleanId = String(id || "").trim();
  if (!cleanId) return cleanSlug;
  return cleanSlug ? `${cleanSlug}-${cleanId}` : cleanId;
}

export function parseSlugAndId(slugAndId) {
  const raw = String(slugAndId || "").trim();
  if (!raw) return { valid: false, slug: "", id: "" };
  const parts = raw.split("-");
  const id = parts[parts.length - 1] || "";
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { valid: false, slug: "", id: "" };
  }
  const slug = parts.slice(0, -1).join("-").trim().toLowerCase();
  return { valid: true, slug, id };
}
