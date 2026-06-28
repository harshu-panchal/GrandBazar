import {
  SELLER_MODULE_IDS,
  permissionKey,
  isValidSellerModule,
} from "../constants/sellerPermissions.js";

const LEVEL_RANK = { read: 1, write: 2 };

export function normalizeSellerPermissions(rawPermissions = []) {
  if (!Array.isArray(rawPermissions)) {
    return [];
  }

  const normalized = new Set();

  for (const entry of rawPermissions) {
    const value = String(entry || "").trim();
    if (!value) continue;

    if (value.includes(":")) {
      const [module, level] = value.split(":");
      if (!isValidSellerModule(module)) continue;
      if (level === "read" || level === "write") {
        normalized.add(permissionKey(module, level));
        if (level === "write") {
          normalized.add(permissionKey(module, "read"));
        }
      }
      continue;
    }

    if (isValidSellerModule(value)) {
      normalized.add(permissionKey(value, "read"));
      normalized.add(permissionKey(value, "write"));
    }
  }

  return [...normalized];
}

export function hasSellerModuleAccess(permissions = [], module, level = "read") {
  if (!isValidSellerModule(module)) {
    return false;
  }

  const normalized = normalizeSellerPermissions(permissions);
  const requiredRank = LEVEL_RANK[level] || LEVEL_RANK.read;

  if (requiredRank <= LEVEL_RANK.read) {
    return (
      normalized.includes(permissionKey(module, "read")) ||
      normalized.includes(permissionKey(module, "write"))
    );
  }

  return normalized.includes(permissionKey(module, "write"));
}

export function validateSellerPermissionsInput(rawPermissions = []) {
  if (!Array.isArray(rawPermissions)) {
    return { valid: false, message: "Permissions must be an array" };
  }

  for (const entry of rawPermissions) {
    const value = String(entry || "").trim();
    if (!value) continue;

    if (value.includes(":")) {
      const [module, level] = value.split(":");
      if (!isValidSellerModule(module) || (level !== "read" && level !== "write")) {
        return { valid: false, message: `Invalid permission entry: ${value}` };
      }
      continue;
    }

    if (!isValidSellerModule(value)) {
      return { valid: false, message: `Invalid permission module: ${value}` };
    }
  }

  return { valid: true, normalized: normalizeSellerPermissions(rawPermissions) };
}

export function summarizePermissionsForDisplay(permissions = []) {
  const normalized = normalizeSellerPermissions(permissions);
  return SELLER_MODULE_IDS.map((module) => {
    const canRead = hasSellerModuleAccess(normalized, module, "read");
    const canWrite = hasSellerModuleAccess(normalized, module, "write");
    if (!canRead && !canWrite) return null;
    return {
      module,
      read: canRead,
      write: canWrite,
    };
  }).filter(Boolean);
}
