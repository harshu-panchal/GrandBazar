import AdminRole from "../../models/adminRole.js";
import Admin from "../../models/admin.js";
import handleResponse from "../../utils/helper.js";

const RESERVED_ROLE_NAMES = new Set(["admin", "superadmin"]);

const normalizeName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

export const listAdminRoles = async (_req, res) => {
  try {
    const roles = await AdminRole.find().sort({ isSystem: -1, name: 1 });
    return handleResponse(res, 200, "Roles fetched successfully", roles);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const createAdminRole = async (req, res) => {
  try {
    const { name, label, description, permissions } = req.body || {};

    const normalized = normalizeName(name);
    if (!normalized) {
      return handleResponse(res, 400, "Role name is required");
    }
    if (RESERVED_ROLE_NAMES.has(normalized)) {
      return handleResponse(res, 400, "This role name is reserved");
    }

    const duplicate = await AdminRole.findOne({ name: normalized });
    if (duplicate) {
      return handleResponse(res, 409, "A role with this name already exists");
    }

    const role = await AdminRole.create({
      name: normalized,
      label: label?.trim() || normalized,
      description: description?.trim() || "",
      permissions: Array.isArray(permissions) ? permissions : [],
      isSystem: false,
      createdBy: req.user?.id,
    });

    return handleResponse(res, 201, "Role created successfully", role);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateAdminRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { label, description, permissions, name } = req.body || {};

    const role = await AdminRole.findById(id);
    if (!role) return handleResponse(res, 404, "Role not found");

    const previousName = role.name;

    if (name !== undefined) {
      const normalized = normalizeName(name);
      if (!normalized) {
        return handleResponse(res, 400, "Role name cannot be empty");
      }
      if (RESERVED_ROLE_NAMES.has(normalized)) {
        return handleResponse(res, 400, "This role name is reserved");
      }
      if (role.isSystem && normalized !== role.name) {
        return handleResponse(res, 400, "System role names cannot be changed");
      }
      if (normalized !== role.name) {
        const duplicate = await AdminRole.findOne({ name: normalized });
        if (duplicate) {
          return handleResponse(res, 409, "A role with this name already exists");
        }
        role.name = normalized;
      }
    }

    if (label !== undefined) role.label = String(label).trim();
    if (description !== undefined) role.description = String(description).trim();
    if (Array.isArray(permissions)) role.permissions = permissions;

    await role.save();

    // Keep every staff account tied to this role in sync with the new name
    // and permission matrix. Without this, renaming or editing permissions
    // on a role would leave existing staff on the stale snapshot.
    if (role.name !== previousName || Array.isArray(permissions)) {
      const update = {};
      if (role.name !== previousName) update.role = role.name;
      if (Array.isArray(permissions)) update.allowedPermissions = role.permissions;
      await Admin.updateMany({ customRoleId: role._id }, { $set: update });
    }

    return handleResponse(res, 200, "Role updated successfully", role);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const deleteAdminRole = async (req, res) => {
  try {
    const { id } = req.params;
    const role = await AdminRole.findById(id);
    if (!role) return handleResponse(res, 404, "Role not found");
    if (role.isSystem) {
      return handleResponse(res, 400, "System roles cannot be deleted");
    }

    const staffCount = await Admin.countDocuments({ customRoleId: role._id });
    if (staffCount > 0) {
      return handleResponse(
        res,
        400,
        `Cannot delete role — ${staffCount} staff member(s) are assigned to it. Reassign them first.`,
      );
    }

    await role.deleteOne();
    return handleResponse(res, 200, "Role deleted successfully");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
