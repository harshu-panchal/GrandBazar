import Admin from "../../models/admin.js";
import handleResponse from "../../utils/helper.js";
import { sendStaffWelcomeEmail } from "../../services/emailService.js";

export const getStaff = async (req, res) => {
  try {
    // Return only staff members (accountant and assistant roles)
    const staffList = await Admin.find({ role: { $in: ["accountant", "assistant"] } }).sort({ createdAt: -1 });
    return handleResponse(res, 200, "Staff members fetched successfully", staffList);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const createStaff = async (req, res) => {
  try {
    const { name, email, password, role, allowedPermissions } = req.body;

    if (!name || !email || !password || !role) {
      return handleResponse(res, 400, "Name, email, password, and role are required");
    }

    if (password.length < 6) {
      return handleResponse(res, 400, "Password must be at least 6 characters long");
    }

    const duplicate = await Admin.findOne({ email: email.toLowerCase() });
    if (duplicate) {
      return handleResponse(res, 409, "Email is already in use by another admin/staff");
    }

    const staff = await Admin.create({
      name,
      email,
      password,
      role,
      allowedPermissions: allowedPermissions || [],
      isVerified: true,
    });

    const result = staff.toObject();
    delete result.password;

    try {
      await sendStaffWelcomeEmail({
        email: staff.email,
        name: staff.name,
        password: password,
        role: staff.role,
      });
    } catch (emailErr) {
      console.error("Failed to send welcome email to sub-admin:", emailErr);
    }

    return handleResponse(res, 201, "Staff member created successfully", result);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, role, allowedPermissions } = req.body;

    const staff = await Admin.findById(id);
    if (!staff) {
      return handleResponse(res, 404, "Staff member not found");
    }

    if (email && email.toLowerCase() !== staff.email.toLowerCase()) {
      const duplicate = await Admin.findOne({ email: email.toLowerCase() });
      if (duplicate) {
        return handleResponse(res, 409, "Email is already in use");
      }
      staff.email = email;
    }

    if (name) staff.name = name;
    if (role) staff.role = role;
    if (allowedPermissions) staff.allowedPermissions = allowedPermissions;
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
    return handleResponse(res, 500, error.message);
  }
};

export const deleteStaff = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.id === id) {
      return handleResponse(res, 400, "You cannot delete your own admin account");
    }

    const staff = await Admin.findByIdAndDelete(id);
    if (!staff) {
      return handleResponse(res, 404, "Staff member not found");
    }

    return handleResponse(res, 200, "Staff member deleted successfully");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
