import Seller from "../../models/seller.js";
import handleResponse from "../../utils/helper.js";
import { sendSellerStaffWelcomeEmail } from "../../services/emailService.js";

// Fetch staff list for the logged-in seller store
export const getSellerStaff = async (req, res) => {
  try {
    const parentId = req.user.id; // Since req.user.id is the active store's seller ID (parent)
    // Find all sellers whose parentId is this seller
    const staffList = await Seller.find({ parentId }).sort({ createdAt: -1 });
    return handleResponse(res, 200, "Staff members fetched successfully", staffList);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Create staff member
export const createSellerStaff = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { name, email, password, phone, role, allowedPermissions } = req.body;

    if (!name || !email || !password || !phone || !role) {
      return handleResponse(res, 400, "Name, email, password, phone and role are required");
    }

    // Check if user already exists
    const existing = await Seller.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      return handleResponse(res, 400, "Staff/Seller with this email or phone already exists");
    }

    // Fetch the parent store details to inherit some fields (like shopName)
    const parentStore = await Seller.findById(parentId);
    if (!parentStore) {
      return handleResponse(res, 404, "Parent store not found");
    }

    const staff = await Seller.create({
      name,
      email,
      phone,
      password,
      role: role || "staff",
      parentId,
      allowedPermissions: allowedPermissions || [],
      shopName: parentStore.shopName,
      isVerified: true,
      emailVerified: true,
      phoneVerified: true,
      applicationStatus: "approved",
      isActive: true,
    });

    try {
      await sendSellerStaffWelcomeEmail({
        email: staff.email,
        name: staff.name,
        password: password,
        role: staff.role,
        shopName: parentStore.shopName,
      });
    } catch (emailErr) {
      console.error("Failed to send welcome email to sub-seller:", emailErr);
    }

    return handleResponse(res, 201, "Staff member onboarded successfully", staff);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Update staff member
export const updateSellerStaff = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { id } = req.params;
    const { name, email, password, phone, role, allowedPermissions } = req.body;

    const staff = await Seller.findOne({ _id: id, parentId });
    if (!staff) {
      return handleResponse(res, 404, "Staff member not found or access denied");
    }

    if (name) staff.name = name;
    if (email) {
      // Check if email already used
      const existing = await Seller.findOne({ email, _id: { $ne: id } });
      if (existing) return handleResponse(res, 400, "Email already in use");
      staff.email = email;
    }
    if (phone) {
      // Check if phone already used
      const existing = await Seller.findOne({ phone, _id: { $ne: id } });
      if (existing) return handleResponse(res, 400, "Phone number already in use");
      staff.phone = phone;
    }
    if (password) {
      staff.password = password; // Pre-save hook will hash it
    }
    if (role) staff.role = role;
    if (allowedPermissions) staff.allowedPermissions = allowedPermissions;

    await staff.save();
    return handleResponse(res, 200, "Staff member details updated successfully", staff);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// Delete staff member
export const deleteSellerStaff = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { id } = req.params;

    const result = await Seller.deleteOne({ _id: id, parentId });
    if (result.deletedCount === 0) {
      return handleResponse(res, 404, "Staff member not found or access denied");
    }

    return handleResponse(res, 200, "Staff member removed successfully");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
