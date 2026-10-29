const idOf = (value) => value?._id || value?.id || value || "";

export const PRODUCT_FORM_TABS = [
  ["general", "General info"],
  ["search", "Search & names"],
  ["price", "Price & tax"],
  ["stock", "Stock & unit"],
  ["legal", "Food & legal"],
  ["delivery", "Delivery & policy"],
  ["variants", "Item variants"],
  ["addons", "Add-ons"],
  ["groups", "Groups"],
  ["photos", "Photos"],
];

export function createProductFormState(source = {}) {
  const variants = Array.isArray(source.variants) && source.variants.length
    ? source.variants
    : [{ name: "Standard", price: source.price || "", salePrice: source.salePrice || "", stock: source.stock ?? 0, sku: source.sku || "", barcode: "", unit: source.unit || "", netQuantity: source.netQuantity || "" }];
  return {
    sellerId: idOf(source.sellerId),
    name: source.name || "", slug: source.slug || "", sku: source.sku || "",
    description: source.description || "", brand: source.brand || "", barcode: source.barcode || "",
    productDisclaimer: source.productDisclaimer || "", status: source.status || "active",
    headerId: idOf(source.headerId), categoryId: idOf(source.categoryId), subcategoryId: idOf(source.subcategoryId),
    foodType: source.foodType || "", tags: Array.isArray(source.tags) ? source.tags.join(", ") : (source.tags || ""),
    searchSynonyms: (source.searchSynonyms || source.alternativeNames || []).join?.(", ") || "",
    localizedNames: Array.isArray(source.localizedNames) ? source.localizedNames : [],
    hsnCode: source.hsnCode || "", gstStatus: source.gstStatus || "taxable",
    gstSlabOverride: source.gstSlabOverride ?? "", isTaxInclusive: false,
    unit: source.unit || "", netQuantity: source.netQuantity || "", lowStockAlert: source.lowStockAlert ?? 5,
    minOrderQuantity: source.minOrderQuantity ?? 1, maxOrderQuantity: source.maxOrderQuantity ?? "",
    variableWeight: Boolean(source.variableWeight), isPreorderEligible: Boolean(source.isPreorderEligible),
    preorderExpectedDate: source.preorderExpectedDate?.slice?.(0, 10) || "",
    packagingCharge: source.packagingCharge ?? "", variants,
    legal: {
      inheritStoreFssai: source.legal?.inheritStoreFssai !== false,
      fssaiLicenseNumber: source.legal?.fssaiLicenseNumber || "", fssaiLicenseExpiry: source.legal?.fssaiLicenseExpiry?.slice?.(0, 10) || "",
      manufactureDate: source.legal?.manufactureDate?.slice?.(0, 10) || "", batchNumber: source.legal?.batchNumber || "",
      countryOfOrigin: source.legal?.countryOfOrigin || "India", manufacturerPacker: source.legal?.manufacturerPacker || "",
      storageInstructions: source.legal?.storageInstructions || "", ingredients: source.legal?.ingredients || "",
      allergens: source.legal?.allergens || [], ageRestricted: Boolean(source.legal?.ageRestricted), prescriptionOnly: Boolean(source.legal?.prescriptionOnly),
      expiryDate: source.legal?.expiryDate?.slice?.(0, 10) || source.expiryDate?.slice?.(0, 10) || "",
    },
    preparationTimeMinutes: source.preparationTimeMinutes ?? "", dimensions: source.dimensions || {},
    returnPolicy: source.returnPolicy || "inherit", handlingFlags: source.handlingFlags || {},
    deliveryOptions: source.deliveryOptions || { mode: "inherit", customerPickup: false, sellerDelivery: false, platformLogistics: true },
    addons: (source.addons || []).map(idOf), relatedProducts: (source.relatedProducts || []).map(idOf),
    mainImage: source.mainImage || "", galleryImages: source.galleryImages || [], mainImageFile: null, galleryFiles: [],
    applyCommission: Boolean(source.applyCommission), adminCommissionType: source.adminCommissionType || "percentage",
    adminCommissionValue: source.adminCommissionValue ?? source.adminCommission ?? "", adminCommissionFixedRule: source.adminCommissionFixedRule || "per_qty",
    commissionOverrideReason: source.commissionOverrideReason || "", commissionEffectiveFrom: source.commissionEffectiveFrom?.slice?.(0, 10) || "",
    marketingFlag: source.marketingFlag || "none", isFeatured: Boolean(source.isFeatured),
    syncToSellers: false,
  };
}

export function validateProductForm(state, { draft = false, catalog = false } = {}) {
  if (!state.name.trim()) return "Product title is required";
  if (draft) return "";
  const required = [
    [state.description, "Description"], [state.headerId, "Main group"], [state.categoryId, "Category"],
    [state.subcategoryId, "Sub-category"], [state.foodType, "Food type"], [state.unit, "Unit"],
    [state.netQuantity, "Net quantity"], [state.hsnCode, "HSN code"], [state.gstStatus, "GST status"],
    [state.mainImage || state.mainImageFile, "Main image"], [state.returnPolicy, "Return policy"],
  ];
  const missing = required.find(([value]) => value === "" || value === null || value === undefined);
  if (missing) return `${missing[1]} is required`;
  if (!catalog && !state.variants.some((variant) => Number(variant.price) > 0)) return "At least one priced variant is required";
  if (state.galleryImages.length + state.galleryFiles.length > 6) return "Only six gallery images are allowed";
  if (state.maxOrderQuantity && Number(state.maxOrderQuantity) < Number(state.minOrderQuantity || 1)) return "Maximum quantity cannot be below minimum quantity";
  const food = ["veg", "non_veg", "egg"].includes(state.foodType);
  if (food && !state.legal.inheritStoreFssai && !state.legal.fssaiLicenseNumber) return "FSSAI licence is required";
  if (food && !state.legal.ingredients) return "Ingredients are required";
  if (food && !state.legal.expiryDate) return "Expiry or best-before date is required";
  return "";
}

export function productPayload(state, { catalog = false, intent = "publish" } = {}) {
  const variants = state.variants.map((variant) => {
    const normalized = { ...variant };
    delete normalized.id;
    return normalized;
  });
  const first = variants.find((variant) => Number(variant.price) > 0) || variants[0] || {};
  return {
    ...state,
    formVersion: "v2", saveIntent: intent,
    price: Number(first.price || 0), salePrice: Number(first.salePrice || 0), stock: Number(first.stock || 0),
    tags: String(state.tags || "").split(",").map((v) => v.trim()).filter(Boolean),
    searchSynonyms: String(state.searchSynonyms || "").split(",").map((v) => v.trim()).filter(Boolean),
    alternativeNames: String(state.searchSynonyms || "").split(",").map((v) => v.trim()).filter(Boolean),
    variants, isTaxInclusive: false,
    expiryDate: state.legal.expiryDate || null,
    status: intent === "draft" ? "inactive" : "active",
    ...(catalog ? { legal: { ...state.legal, expiryDate: state.legal.expiryDate || null } } : {}),
  };
}

export function toProductFormData(state, options = {}) {
  const payload = productPayload(state, options);
  const data = new FormData();
  const jsonFields = new Set(["tags", "searchSynonyms", "alternativeNames", "localizedNames", "variants", "addons", "relatedProducts", "legal", "dimensions", "handlingFlags", "deliveryOptions", "galleryImages"]);
  Object.entries(payload).forEach(([key, value]) => {
    if (["mainImageFile", "galleryFiles"].includes(key) || value === undefined || value === null) return;
    if (key === "mainImage" && state.mainImageFile) return;
    data.append(key, jsonFields.has(key) ? JSON.stringify(value) : String(value));
  });
  if (state.mainImageFile) data.append("mainImage", state.mainImageFile);
  state.galleryFiles.forEach((file) => data.append("galleryImages", file));
  data.set("retainedGalleryImages", JSON.stringify(state.galleryImages));
  return data;
}
