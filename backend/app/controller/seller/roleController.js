import SellerRole from "../../models/sellerRole.js";
import Seller from "../../models/seller.js";
import handleResponse from "../../utils/helper.js";
import { loadOwnerStores } from "../../services/storeService.js";
import { validateSellerPermissionsInput } from "../../services/sellerPermissionService.js";

const normalizeName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

// Any role either targets a specific store or is marked as cross-store
// (storeId: null). This resolves and validates the scope sent by the client.
async function resolveStoreScope(ownerId, storeIdInput) {
  if (!storeIdInput || storeIdInput === "all" || storeIdInput === "any") {
    return { storeId: null };
  }
  const ownerStores = await loadOwnerStores(ownerId);
  const match = ownerStores.find((s) => String(s._id) === String(storeIdInput));
  if (!match) {
    const err = new Error("Target store not found or access denied");
    err.statusCode = 403;
    throw err;
  }
  return { storeId: match._id, store: match };
}

export const listSellerRoles = async (req, res) => {
  try {
    const ownerId = req.user.accountId;
    if (!ownerId) return handleResponse(res, 403, "Only store owners can view roles");

    const roles = await SellerRole.find({ ownerId })
      .populate("storeId", "shopName city")
      .sort({ createdAt: -1 });
    return handleResponse(res, 200, "Roles fetched successfully", roles);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const createSellerRole = async (req, res) => {
  try {
    const ownerId = req.user.accountId;
    if (!ownerId) return handleResponse(res, 403, "Only store owners can create roles");

    const { name, label, description, permissions, storeId } = req.body || {};
    const normalized = normalizeName(name);
    if (!normalized) return handleResponse(res, 400, "Role name is required");

    const permissionCheck = validateSellerPermissionsInput(permissions || []);
    if (!permissionCheck.valid) return handleResponse(res, 400, permissionCheck.message);

    const scope = await resolveStoreScope(ownerId, storeId);

    const duplicate = await SellerRole.findOne({
      ownerId,
      storeId: scope.storeId,
      name: normalized,
    });
    if (duplicate) {
      return handleResponse(res, 409, "A role with this name already exists for this scope");
    }

    const role = await SellerRole.create({
      ownerId,
      storeId: scope.storeId,
      name: normalized,
      label: label?.trim() || normalized,
      description: description?.trim() || "",
      permissions: permissionCheck.normalized,
    });

    const populated = await role.populate("storeId", "shopName city");
    return handleResponse(res, 201, "Role created successfully", populated);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const updateSellerRole = async (req, res) => {
  try {
    const ownerId = req.user.accountId;
    if (!ownerId) return handleResponse(res, 403, "Only store owners can edit roles");

    const { id } = req.params;
    const { name, label, description, permissions, storeId } = req.body || {};

    const role = await SellerRole.findOne({ _id: id, ownerId });
    if (!role) return handleResponse(res, 404, "Role not found");

    let scopeChanged = false;
    if (storeId !== undefined) {
      const scope = await resolveStoreScope(ownerId, storeId);
      if (String(scope.storeId || "") !== String(role.storeId || "")) {
        role.storeId = scope.storeId;
        scopeChanged = true;
      }
    }

    if (name !== undefined) {
      const normalized = normalizeName(name);
      if (!normalized) return handleResponse(res, 400, "Role name cannot be empty");
      if (normalized !== role.name || scopeChanged) {
        const duplicate = await SellerRole.findOne({
          ownerId,
          storeId: role.storeId,
          name: normalized,
          _id: { $ne: role._id },
        });
        if (duplicate) {
          return handleResponse(res, 409, "A role with this name already exists for this scope");
        }
        role.name = normalized;
      }
    }

    if (label !== undefined) role.label = String(label).trim();
    if (description !== undefined) role.description = String(description).trim();

    if (Array.isArray(permissions)) {
      const permissionCheck = validateSellerPermissionsInput(permissions);
      if (!permissionCheck.valid) return handleResponse(res, 400, permissionCheck.message);
      role.permissions = permissionCheck.normalized;
    }

    await role.save();

    // Fan out permission + role-name updates to staff tied to this role so
    // they stay in sync. Role name is stored on the Seller doc as the staff
    // member's `role` string.
    const update = {};
    if (Array.isArray(permissions)) update.allowedPermissions = role.permissions;
    if (name !== undefined) update.role = role.name;
    if (Object.keys(update).length > 0) {
      await Seller.updateMany({ customRoleId: role._id }, { $set: update });
    }

    const populated = await role.populate("storeId", "shopName city");
    return handleResponse(res, 200, "Role updated successfully", populated);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const deleteSellerRole = async (req, res) => {
  try {
    const ownerId = req.user.accountId;
    if (!ownerId) return handleResponse(res, 403, "Only store owners can delete roles");

    const { id } = req.params;
    const role = await SellerRole.findOne({ _id: id, ownerId });
    if (!role) return handleResponse(res, 404, "Role not found");

    const assignedCount = await Seller.countDocuments({ customRoleId: role._id });
    if (assignedCount > 0) {
      return handleResponse(
        res,
        400,
        `Cannot delete role — ${assignedCount} assistant(s) are assigned to it. Reassign them first.`,
      );
    }

    await role.deleteOne();
    return handleResponse(res, 200, "Role deleted successfully");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
