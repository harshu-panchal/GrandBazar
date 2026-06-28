import jwt from "jsonwebtoken";
import Store from "../models/store.js";

export const SELLER_DOCUMENT_FIELDS = {
  aadhar: "Aadhaar Card",
  pan: "PAN Card",
  bankProof: "Bank Proof",
};

export const REQUIRED_SELLER_DOCUMENT_FIELDS = Object.keys(SELLER_DOCUMENT_FIELDS);

export function parseDocumentsPayload(documents) {
  if (!documents) return {};
  if (typeof documents === "string") {
    try {
      return JSON.parse(documents);
    } catch {
      return {};
    }
  }
  if (typeof documents === "object") return documents;
  return {};
}

export function isValidUploadedDocumentReference(value) {
  const normalized = String(value || "").trim();
  return /^https?:\/\//i.test(normalized);
}

export function resolveSellerDocuments(body = {}, parsedDocuments = {}) {
  const resolved = { ...(parsedDocuments || {}) };
  const directFields = {
    aadhar: body.aadharUrl || body.aadhar,
    pan: body.panUrl || body.pan,
    bankProof: body.bankProofUrl || body.bankProof,
  };
  for (const [field, candidate] of Object.entries(directFields)) {
    const normalized = String(candidate || "").trim();
    if (normalized && /^https?:\/\//i.test(normalized)) {
      resolved[field] = normalized;
    }
  }
  return resolved;
}

export function getMissingRequiredSellerDocuments(documents = {}) {
  return REQUIRED_SELLER_DOCUMENT_FIELDS.filter(
    (fieldName) => !isValidUploadedDocumentReference(documents[fieldName]),
  );
}

export function isStoreApplicationApproved(store) {
  if (!store) return false;
  const applicationStatus =
    store.applicationStatus || (store.isVerified ? "approved" : "pending");
  return store.isVerified === true && applicationStatus === "approved";
}

export function isStoreApproved(store) {
  if (!store) return false;
  return isStoreApplicationApproved(store) && store.isActive === true;
}

export function generateSellerToken({ activeStoreId, accountId, staffRecord = null }) {
  const resolvedStoreId = activeStoreId || accountId;
  const payload = {
    id: String(resolvedStoreId),
    activeStoreId: activeStoreId ? String(activeStoreId) : null,
    role: "seller",
  };

  if (staffRecord) {
    payload.subSellerId = String(staffRecord._id);
    payload.subSellerRole = staffRecord.role;
    payload.allowedPermissions = staffRecord.allowedPermissions || [];
  } else if (accountId) {
    payload.accountId = String(accountId);
  }

  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });
}

export async function pickDefaultActiveStoreId(account, stores = []) {
  if (!stores.length) return null;

  if (account?.lastActiveStoreId) {
    const lastId = String(account.lastActiveStoreId);
    if (stores.some((s) => String(s._id) === lastId)) {
      return lastId;
    }
  }

  const approved = stores.find((s) => isStoreApproved(s));
  if (approved) return String(approved._id);

  return String(stores[0]._id);
}

export async function loadOwnerStores(ownerId) {
  return Store.find({ ownerId }).sort({ createdAt: 1 }).lean();
}

export function parseStoreCategoriesInput(body = {}) {
  let raw = body.categories;

  if (raw == null && body.category != null && body.category !== "") {
    raw = body.category;
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[")) {
      try {
        raw = JSON.parse(trimmed);
      } catch {
        raw = trimmed.split(",").map((entry) => entry.trim()).filter(Boolean);
      }
    } else {
      raw = trimmed.split(",").map((entry) => entry.trim()).filter(Boolean);
    }
  }

  if (!Array.isArray(raw)) {
    raw = raw != null && raw !== "" ? [String(raw)] : [];
  }

  return [...new Set(raw.map((entry) => String(entry).trim()).filter(Boolean))];
}

export function applyCategoriesToStorePayload(payload, categories = []) {
  const normalized = parseStoreCategoriesInput({ categories });
  if (normalized.length) {
    payload.categories = normalized;
    payload.category = normalized[0];
  }
  return payload;
}

export function getStoreCategoryList(store) {
  if (Array.isArray(store?.categories) && store.categories.length) {
    return store.categories.filter(Boolean);
  }
  if (store?.category) {
    return [store.category];
  }
  return [];
}

export function buildStorePayloadFromBody(body = {}, uploadedDocs = {}) {
  const {
    shopName,
    description,
    address,
    locality,
    pincode,
    city,
    state,
    documents,
    lat,
    lng,
    radius,
    aadharNumber,
    panNumber,
    accountHolder,
    accountNumber,
    ifsc,
    bankName,
    banners,
    storeVideo,
  } = body;

  const parsedLat = lat !== undefined ? Number(lat) : undefined;
  const parsedLng = lng !== undefined ? Number(lng) : undefined;
  const parsedRadius = radius !== undefined ? Number(radius) : undefined;

  const parsedDocuments = parseDocumentsPayload(documents);
  const storeDocuments = resolveSellerDocuments({ ...body, ...uploadedDocs }, parsedDocuments);

  const payload = {
    shopName,
    description,
    address,
    locality,
    pincode,
    city,
    state,
    aadharNumber,
    panNumber,
    accountHolder,
    accountNumber,
    ifsc,
    bankName,
    documents: storeDocuments,
    applicationStatus: "pending",
    isVerified: false,
    isActive: false,
  };

  if (banners !== undefined) payload.banners = banners;
  if (storeVideo !== undefined) payload.storeVideo = storeVideo;

  if (parsedLat !== undefined && parsedLng !== undefined) {
    payload.location = {
      type: "Point",
      coordinates: [parsedLng, parsedLat],
    };
  }

  if (parsedRadius !== undefined) {
    payload.serviceRadius = parsedRadius;
  }

  applyCategoriesToStorePayload(payload, parseStoreCategoriesInput(body));

  return payload;
}
