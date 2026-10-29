const ARRAY_FIELDS = [
  "tags",
  "searchSynonyms",
  "alternativeNames",
  "localizedNames",
  "variants",
  "addons",
  "relatedProducts",
  "galleryImages",
];

const OBJECT_FIELDS = ["legal", "dimensions", "handlingFlags", "deliveryOptions"];

const BOOLEAN_FIELDS = [
  "isFeatured",
  "isSignatureProduct",
  "isPreorderEligible",
  "variableWeight",
  "isTaxInclusive",
];

const OPTIONAL_NUMBER_FIELDS = [
  "netQuantity",
  "lowStockAlert",
  "minOrderQuantity",
  "maxOrderQuantity",
  "preparationTimeMinutes",
  "gstSlabOverride",
  "packagingCharge",
];

const CATALOG_CANONICAL_FIELDS = [
  "name",
  "description",
  "brand",
  "weight",
  "unit",
  "netQuantity",
  "barcode",
  "hsnCode",
  "foodType",
  "productDisclaimer",
  "tags",
  "searchSynonyms",
  "localizedNames",
  "mainImage",
  "galleryImages",
  "headerId",
  "categoryId",
  "subcategoryId",
  "gstStatus",
  "gstSlabOverride",
  "isTaxInclusive",
  "variableWeight",
  "legal",
  "preparationTimeMinutes",
  "dimensions",
  "returnPolicy",
  "handlingFlags",
  "deliveryOptions",
];

const ADMIN_ONLY_PRODUCT_FIELDS = [
  "isFeatured",
  "marketingFlag",
  "isSignatureProduct",
  "applyCommission",
  "adminCommission",
  "adminCommissionType",
  "adminCommissionValue",
  "adminCommissionFixedRule",
  "commissionOverrideReason",
  "commissionEffectiveFrom",
];

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function parseJson(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("[") && !trimmed.startsWith("{"))) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function normalizeStringArray(value) {
  const parsed = parseJson(value);
  const list = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "string"
      ? parsed.split(",")
      : [];
  return [...new Set(list.map((entry) => String(entry || "").trim()).filter(Boolean))];
}

function optionalNumber(value, { min = 0 } = {}) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min ? number : null;
}

export function normalizeProductFormPayload(input = {}) {
  const output = { ...input };

  for (const field of ARRAY_FIELDS) {
    if (hasOwn(output, field)) output[field] = parseJson(output[field]);
  }
  for (const field of OBJECT_FIELDS) {
    if (hasOwn(output, field)) {
      const parsed = parseJson(output[field]);
      output[field] = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    }
  }

  if (hasOwn(output, "tags")) output.tags = normalizeStringArray(output.tags);
  if (hasOwn(output, "searchSynonyms")) output.searchSynonyms = normalizeStringArray(output.searchSynonyms);
  if (hasOwn(output, "alternativeNames")) output.alternativeNames = normalizeStringArray(output.alternativeNames);
  if (hasOwn(output, "localizedNames")) {
    output.localizedNames = (Array.isArray(output.localizedNames) ? output.localizedNames : [])
      .map((entry) => ({
        languageCode: String(entry?.languageCode || entry?.language || "").trim().toLowerCase(),
        name: String(entry?.name || "").trim(),
      }))
      .filter((entry) => entry.languageCode && entry.name);
  }

  for (const field of BOOLEAN_FIELDS) {
    if (hasOwn(output, field)) output[field] = output[field] === true || output[field] === "true";
  }
  for (const field of OPTIONAL_NUMBER_FIELDS) {
    if (hasOwn(output, field)) output[field] = optionalNumber(output[field], { min: field === "minOrderQuantity" ? 1 : 0 });
  }

  if (hasOwn(output, "unit")) output.unit = String(output.unit || "").trim().toLowerCase();
  if (hasOwn(output, "barcode")) output.barcode = String(output.barcode || "").trim();
  if (hasOwn(output, "hsnCode")) output.hsnCode = String(output.hsnCode || "").trim();
  if (hasOwn(output, "foodType")) output.foodType = String(output.foodType || "").trim().toLowerCase();
  if (hasOwn(output, "gstStatus")) output.gstStatus = String(output.gstStatus || "").trim().toLowerCase();
  if (hasOwn(output, "isTaxInclusive")) output.isTaxInclusive = false;

  if (output.legal && typeof output.legal === "object") {
    output.legal = {
      ...output.legal,
      allergens: normalizeStringArray(output.legal.allergens),
      inheritStoreFssai: output.legal.inheritStoreFssai !== false && output.legal.inheritStoreFssai !== "false",
      ageRestricted: output.legal.ageRestricted === true || output.legal.ageRestricted === "true",
      prescriptionOnly: output.legal.prescriptionOnly === true || output.legal.prescriptionOnly === "true",
    };
  }

  if (Array.isArray(output.variants)) {
    output.variants = output.variants.map((variant) => ({
      ...variant,
      name: String(variant?.name || "").trim(),
      sku: String(variant?.sku || "").trim(),
      barcode: String(variant?.barcode || "").trim(),
      unit: String(variant?.unit || "").trim().toLowerCase(),
      netQuantity: optionalNumber(variant?.netQuantity),
      price: optionalNumber(variant?.price) ?? 0,
      salePrice: optionalNumber(variant?.salePrice) ?? 0,
      stock: optionalNumber(variant?.stock) ?? 0,
    }));
  }

  return output;
}

export function stripAdminOnlyProductFields(payload = {}) {
  for (const field of ADMIN_ONLY_PRODUCT_FIELDS) delete payload[field];
  return payload;
}

export function validateProductFormPayload(payload = {}, { draft = false, catalog = false } = {}) {
  const errors = {};
  const required = (field, message) => {
    if (!payload[field] || !String(payload[field]).trim()) errors[field] = message;
  };

  required("name", "Product title is required");
  if (!draft) {
    required("description", "Product description is required");
    required("headerId", "Main group is required");
    required("categoryId", "Category is required");
    required("subcategoryId", "Sub-category is required");
    required("foodType", "Food type is required");
    required("unit", "Unit is required");
    required("hsnCode", "HSN code is required");
    required("gstStatus", "GST status is required");
    if (!(Number(payload.netQuantity) > 0)) errors.netQuantity = "Net quantity must be greater than zero";
    if (!payload.mainImage) errors.mainImage = "A main product image is required";
    if (!(Number(payload.preparationTimeMinutes) >= 0)) errors.preparationTimeMinutes = "Preparation time is required";
    if (!payload.returnPolicy) errors.returnPolicy = "Return policy is required";
    if (!payload.legal?.countryOfOrigin) errors["legal.countryOfOrigin"] = "Country of origin is required";
  }

  if (!catalog && !draft) {
    const variants = Array.isArray(payload.variants) ? payload.variants : [];
    const first = variants[0];
    if (!first || !(Number(first.price) > 0)) errors.variants = "At least one priced variant is required";
    if (first && !(Number(first.stock) >= 0)) errors.variants = "Variant stock must be zero or greater";
  }

  const minimum = Number(payload.minOrderQuantity || 1);
  const maximum = payload.maxOrderQuantity === null || payload.maxOrderQuantity === undefined
    ? null
    : Number(payload.maxOrderQuantity);
  if (maximum !== null && maximum < minimum) {
    errors.maxOrderQuantity = "Maximum order quantity cannot be below the minimum";
  }

  if (Array.isArray(payload.galleryImages) && payload.galleryImages.length > 6) {
    errors.galleryImages = "A maximum of six gallery images is allowed";
  }

  const isFood = ["veg", "non_veg", "egg"].includes(payload.foodType);
  if (!draft && isFood) {
    if (!payload.legal?.inheritStoreFssai && !payload.legal?.fssaiLicenseNumber) {
      errors["legal.fssaiLicenseNumber"] = "FSSAI licence is required for food products";
    }
    if (!payload.legal?.ingredients) errors["legal.ingredients"] = "Ingredients are required for food products";
    if (!payload.expiryDate && !payload.legal?.expiryDate) errors.expiryDate = "Expiry or best-before date is required for food products";
  }

  return errors;
}

export function catalogFieldsForProduct(catalogProduct = {}) {
  const fields = {};
  for (const field of CATALOG_CANONICAL_FIELDS) {
    if (catalogProduct[field] !== undefined) fields[field] = catalogProduct[field];
  }
  fields.searchSynonyms = catalogProduct.searchSynonyms || catalogProduct.alternativeNames || [];
  if (catalogProduct.legal?.expiryDate) fields.expiryDate = catalogProduct.legal.expiryDate;
  return fields;
}

export function catalogSyncFields(catalogProduct = {}) {
  return catalogFieldsForProduct(catalogProduct);
}

export { CATALOG_CANONICAL_FIELDS, ADMIN_ONLY_PRODUCT_FIELDS };
