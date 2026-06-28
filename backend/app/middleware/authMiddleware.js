import jwt from "jsonwebtoken";
import handleResponse from "../utils/helper.js";
import Seller from "../models/seller.js";
import Store from "../models/store.js";
import { isStoreApproved, loadOwnerStores, pickDefaultActiveStoreId } from "../services/storeService.js";
import { hasSellerModuleAccess } from "../services/sellerPermissionService.js";

async function resolveSellerStoreRecord(req) {
  if (req.user?.role !== "seller") {
    return null;
  }

  const candidateIds = [
    req.user.activeStoreId,
    req.user.id,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  for (const storeId of candidateIds) {
    const store = await Store.findById(storeId)
      .select("isVerified isActive applicationStatus rejectionReason shopName ownerId")
      .lean();
    if (store) {
      return { store, storeId: String(store._id) };
    }
  }

  const ownerId = req.user.accountId || (req.user.subSellerId ? null : req.user.id);
  if (!ownerId) {
    return null;
  }

  const stores = await loadOwnerStores(ownerId);
  if (!stores.length) {
    return null;
  }

  const fallbackStoreId = await pickDefaultActiveStoreId(
    { lastActiveStoreId: req.user.activeStoreId },
    stores,
  );
  const fallbackStore =
    stores.find((entry) => String(entry._id) === String(fallbackStoreId)) || stores[0];

  return fallbackStore
    ? { store: fallbackStore, storeId: String(fallbackStore._id) }
    : null;
}

function applyResolvedStoreContext(req, storeId) {
  if (!storeId) return;
  req.user.id = String(storeId);
  req.user.activeStoreId = String(storeId);
}

function extractJwtFromHeaders(req) {
  const authHeader = String(req.headers.authorization || "").trim();
  if (authHeader) {
    const parts = authHeader.split(/\s+/);
    if (parts.length >= 2 && /^bearer$/i.test(parts[0])) {
      return parts[1];
    }

    if (authHeader.split(".").length === 3) {
      return authHeader;
    }
  }

  const xAccessToken = String(req.headers["x-access-token"] || "").trim();
  if (xAccessToken && xAccessToken.split(".").length === 3) {
    return xAccessToken;
  }

  return null;
}

import { updateLastActive } from "../services/loginActivityService.js";

/* ===============================
   Verify Token
================================ */
export const verifyToken = (req, res, next) => {
  try {
    const token = extractJwtFromHeaders(req);

    if (!token) {
      return handleResponse(res, 401, "Unauthorized, token missing");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    const activityId = decoded.accountId || decoded.subSellerId || decoded.id;
    if (activityId) {
      updateLastActive(activityId).catch((err) =>
        console.error("Failed to update last active timestamp:", err),
      );
    }

    next();
  } catch (error) {
    return handleResponse(res, 401, "Invalid or expired token");
  }
};

/* ===============================
   Optional Verify Token
================================ */
export const optionalVerifyToken = (req, res, next) => {
  try {
    const token = extractJwtFromHeaders(req);

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
      } catch {
        req.user = null;
      }
    }

    next();
  } catch {
    next();
  }
};

/* ===============================
   Role Based Access
================================ */
export const allowRoles = (...roles) => {
  return (req, res, next) => {
    let authorizedRoles = [...roles];
    if (roles.includes("admin")) {
      authorizedRoles = [...authorizedRoles, "superadmin", "accountant", "assistant"];
    }
    if (!authorizedRoles.includes(req.user.role)) {
      return handleResponse(res, 403, "Access denied");
    }
    next();
  };
};

export const allowSuperAdminOnly = (req, res, next) => {
  if (req.user.role !== "admin" && req.user.role !== "superadmin") {
    return handleResponse(res, 403, "Access denied. Only super-administrators can perform this action.");
  }
  next();
};

/* ===============================
   Resolve active store from header (owner multi-store)
================================ */
export const resolveActiveStore = async (req, res, next) => {
  try {
    if (req.user?.role !== "seller") {
      return next();
    }

    const headerStoreId = String(req.headers["x-active-store-id"] || "").trim();
    if (!headerStoreId || !req.user.accountId) {
      return next();
    }

    if (headerStoreId === String(req.user.accountId)) {
      return next();
    }

    if (String(req.user.activeStoreId) === headerStoreId && String(req.user.id) === headerStoreId) {
      return next();
    }

    const store = await Store.findOne({
      _id: headerStoreId,
      ownerId: req.user.accountId,
    }).lean();

    if (!store) {
      return next();
    }

    applyResolvedStoreContext(req, store._id);
    next();
  } catch (error) {
    return handleResponse(res, 500, "Unable to resolve active store");
  }
};

/* ===============================
   Ensure seller can access seller-only operational routes
================================ */
export const requireApprovedSeller = async (req, res, next) => {
  try {
    if (req.user?.role !== "seller") {
      return next();
    }

    const resolved = await resolveSellerStoreRecord(req);
    if (!resolved?.store) {
      return handleResponse(res, 403, "No store found for this seller account.", {
        applicationStatus: "pending",
      });
    }

    applyResolvedStoreContext(req, resolved.storeId);
    const store = resolved.store;

    if (!isStoreApproved(store)) {
      const applicationStatus =
        store.applicationStatus || (store.isVerified ? "approved" : "pending");
      const message =
        applicationStatus === "rejected"
          ? "Store application rejected. Please contact admin support."
          : "Store is pending admin approval.";

      return handleResponse(res, 403, message, {
        applicationStatus,
        isVerified: store.isVerified === true,
        isActive: store.isActive === true,
        rejectionReason: store.rejectionReason || "",
        shopName: store.shopName || "",
      });
    }

    next();
  } catch (error) {
    return handleResponse(res, 500, "Unable to validate store approval status");
  }
};

export const requireStoreOwner = (req, res, next) => {
  if (req.user?.subSellerId) {
    return handleResponse(res, 403, "Access denied. Only the store owner can perform this action.");
  }
  if (!req.user?.accountId) {
    return handleResponse(res, 403, "Access denied. Only the store owner can perform this action.");
  }
  next();
};

export const checkSubSellerPermission = (module, level = "read") => {
  return (req, res, next) => {
    if (!req.user?.subSellerId) {
      return next();
    }

    if (hasSellerModuleAccess(req.user.allowedPermissions || [], module, level)) {
      return next();
    }

    return handleResponse(
      res,
      403,
      `Access denied. You do not have ${level} permission for ${module}.`,
    );
  };
};
