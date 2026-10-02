import Admin from "../../models/admin.js";
import AdminRole from "../../models/adminRole.js";
import handleResponse from "../../utils/helper.js";
import { sendStaffWelcomeEmail } from "../../services/emailService.js";

const RESERVED_ROLE_NAMES = new Set(["admin", "superadmin"]);

// Resolve the (roleName, allowedPermissions) tuple to persist on an Admin
// doc from the request payload. If a customRoleId is supplied, inherit the
// role name and (unless the caller explicitly overrides) its permissions.
async function resolveRoleAssignment({ customRoleId, role, allowedPermissions }) {
  if (customRoleId) {
    const roleDoc = await AdminRole.findById(customRoleId);
    if (!roleDoc) {
      const err = new Error("Selected role no longer exists");
      err.statusCode = 404;
      throw err;
    }
    return {
      role: roleDoc.name,
      customRoleId: roleDoc._id,
      allowedPermissions: Array.isArray(allowedPermissions)
        ? allowedPermissions
        : roleDoc.permissions,
    };
  }

  // Legacy / bootstrap path: a role name provided directly, no linked
  // AdminRole document. Keep this working so existing clients and the
  // original hard-coded "accountant"/"assistant" roles still function.
  if (role && !RESERVED_ROLE_NAMES.has(String(role).toLowerCase())) {
    return {
      role: String(role).toLowerCase(),
      customRoleId: null,
      allowedPermissions: Array.isArray(allowedPermissions) ? allowedPermissions : [],
    };
  }

  const err = new Error("A valid role is required");
  err.statusCode = 400;
  throw err;
}

export const getStaff = async (_req, res) => {
  try {
    // Everyone in the Admin collection whose role is NOT one of the two
    // reserved root roles is treated as a staff member. This keeps the list
    // honest when new custom roles are added at runtime.
    const staffList = await Admin.find({
      role: { $nin: Array.from(RESERVED_ROLE_NAMES) },
    })
      .populate("customRoleId", "name label description permissions")
      .sort({ createdAt: -1 });
    return handleResponse(res, 200, "Staff members fetched successfully", staffList);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const createStaff = async (req, res) => {
  try {
    const { name, email, password, role, customRoleId, allowedPermissions } = req.body;

    if (!name || !email || !password) {
      return handleResponse(res, 400, "Name, email, and password are required");
    }
    if (password.length < 6) {
      return handleResponse(res, 400, "Password must be at least 6 characters long");
    }

    const duplicate = await Admin.findOne({ email: email.toLowerCase() });
    if (duplicate) {
      return handleResponse(res, 409, "Email is already in use by another admin/staff");
    }

    const resolved = await resolveRoleAssignment({ customRoleId, role, allowedPermissions });

    const staff = await Admin.create({
      name,
      email,
      password,
      ...resolved,
      isVerified: true,
    });

    const result = staff.toObject();
    delete result.password;

    try {
      await sendStaffWelcomeEmail({
        email: staff.email,
        name: staff.name,
        password,
        role: staff.role,
      });
    } catch (emailErr) {
      console.error("Failed to send welcome email to sub-admin:", emailErr);
    }

    return handleResponse(res, 201, "Staff member created successfully", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const updateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, role, customRoleId, allowedPermissions } = req.body;

    const staff = await Admin.findById(id);
    if (!staff) return handleResponse(res, 404, "Staff member not found");

    if (RESERVED_ROLE_NAMES.has(staff.role)) {
      return handleResponse(res, 400, "Root admin accounts cannot be edited here");
    }

    if (email && email.toLowerCase() !== staff.email.toLowerCase()) {
      const duplicate = await Admin.findOne({ email: email.toLowerCase() });
      if (duplicate) return handleResponse(res, 409, "Email is already in use");
      staff.email = email;
    }

    if (name) staff.name = name;

    if (customRoleId || role) {
      const resolved = await resolveRoleAssignment({ customRoleId, role, allowedPermissions });
      staff.role = resolved.role;
      staff.customRoleId = resolved.customRoleId;
      staff.allowedPermissions = resolved.allowedPermissions;
    } else if (Array.isArray(allowedPermissions)) {
      staff.allowedPermissions = allowedPermissions;
    }

    if (password && password.trim() !== "") {
      if (password.length < 6) {
        return handleResponse(res, 400, "Password must be at least 6 characters long");
      }
      staff.password = password;
    }

    await staff.save();

    const result = staff.toObject();
    delete result.password;
    return handleResponse(res, 200, "Staff member updated successfully", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const deleteStaff = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.id === id) {
      return handleResponse(res, 400, "You cannot delete your own admin account");
    }

    const target = await Admin.findById(id);
    if (!target) return handleResponse(res, 404, "Staff member not found");
    if (RESERVED_ROLE_NAMES.has(target.role)) {
      return handleResponse(res, 400, "Root admin accounts cannot be deleted here");
    }

    await target.deleteOne();
    return handleResponse(res, 200, "Staff member deleted successfully");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
