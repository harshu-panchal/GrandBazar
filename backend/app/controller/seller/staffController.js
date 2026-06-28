import Seller from "../../models/seller.js";
import Store from "../../models/store.js";
import handleResponse from "../../utils/helper.js";
import { sendSellerStaffWelcomeEmail } from "../../services/emailService.js";
import { loadOwnerStores } from "../../services/storeService.js";
import {
  validateSellerPermissionsInput,
  summarizePermissionsForDisplay,
} from "../../services/sellerPermissionService.js";

async function resolveTargetStoreId(req, res, storeIdFromBody) {
  const accountId = req.user.accountId;
  if (!accountId) {
    return { error: handleResponse(res, 403, "Only store owners can manage assistants") };
  }

  const targetStoreId = storeIdFromBody || req.user.id;
  const store = await Store.findOne({ _id: targetStoreId, ownerId: accountId }).lean();
  if (!store) {
    return { error: handleResponse(res, 404, "Store not found or access denied") };
  }

  return { storeId: String(store._id), store };
}

function attachPermissionSummary(staffMembers = []) {
  return staffMembers.map((member) => {
    const plain = member.toObject ? member.toObject() : { ...member };
    return {
      ...plain,
      permissionSummary: summarizePermissionsForDisplay(plain.allowedPermissions || []),
    };
  });
}

export const getSellerStaffOverview = async (req, res) => {
  try {
    const accountId = req.user.accountId;
    if (!accountId) {
      return handleResponse(res, 403, "Only store owners can view assistants");
    }

    const stores = await loadOwnerStores(accountId);
    const storeIds = stores.map((store) => store._id);

    const staffList = await Seller.find({
      parentId: { $in: storeIds },
      accountType: "staff",
    })
      .sort({ createdAt: -1 })
      .lean();

    const storeMap = Object.fromEntries(
      stores.map((store) => [String(store._id), store]),
    );

    const grouped = stores.map((store) => ({
      store: {
        _id: store._id,
        shopName: store.shopName,
        city: store.city,
        applicationStatus: store.applicationStatus,
        isVerified: store.isVerified,
        isActive: store.isActive,
      },
      assistants: attachPermissionSummary(
        staffList.filter((member) => String(member.parentId) === String(store._id)),
      ),
    }));

    const unassignedCount = staffList.filter(
      (member) => !storeMap[String(member.parentId)],
    ).length;

    return handleResponse(res, 200, "Assistants fetched successfully", {
      stores: grouped,
      totalAssistants: staffList.length,
      unassignedCount,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getSellerStaff = async (req, res) => {
  try {
    const storeId = req.user.id;
    const staffList = await Seller.find({ parentId: storeId, accountType: "staff" }).sort({
      createdAt: -1,
    });
    return handleResponse(
      res,
      200,
      "Staff members fetched successfully",
      attachPermissionSummary(staffList),
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const createSellerStaff = async (req, res) => {
  try {
    const { name, email, password, phone, role, allowedPermissions, storeId } = req.body;

    if (!name || !email || !password || !phone || !role) {
      return handleResponse(res, 400, "Name, email, password, phone and role are required");
    }

    const permissionValidation = validateSellerPermissionsInput(allowedPermissions || []);
    if (!permissionValidation.valid) {
      return handleResponse(res, 400, permissionValidation.message);
    }

    if (!permissionValidation.normalized.length) {
      return handleResponse(res, 400, "At least one read or write permission is required");
    }

    const resolved = await resolveTargetStoreId(req, res, storeId);
    if (resolved.error) return resolved.error;

    const existing = await Seller.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      return handleResponse(res, 400, "An account with this email or phone already exists");
    }

    const staff = await Seller.create({
      name,
      email,
      phone,
      password,
      role: role || "helper",
      accountType: "staff",
      parentId: resolved.storeId,
      allowedPermissions: permissionValidation.normalized,
      emailVerified: true,
      phoneVerified: true,
    });

    try {
      await sendSellerStaffWelcomeEmail({
        email: staff.email,
        name: staff.name,
        password,
        role: staff.role,
        shopName: resolved.store.shopName,
      });
    } catch (emailErr) {
      console.error("Failed to send welcome email to sub-seller:", emailErr);
    }

    return handleResponse(res, 201, "Assistant onboarded successfully", {
      ...staff.toObject(),
      permissionSummary: summarizePermissionsForDisplay(staff.allowedPermissions || []),
      store: {
        _id: resolved.store._id,
        shopName: resolved.store.shopName,
      },
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateSellerStaff = async (req, res) => {
  try {
    const accountId = req.user.accountId;
    const { id } = req.params;
    const { name, email, password, phone, role, allowedPermissions, storeId } = req.body;

    const staff = await Seller.findOne({ _id: id, accountType: "staff" });
    if (!staff) {
      return handleResponse(res, 404, "Assistant not found");
    }

    const ownerStores = await loadOwnerStores(accountId);
    const ownedStoreIds = new Set(ownerStores.map((store) => String(store._id)));
    if (!ownedStoreIds.has(String(staff.parentId))) {
      return handleResponse(res, 403, "You cannot modify assistants for this store");
    }

    if (storeId && String(storeId) !== String(staff.parentId)) {
      if (!ownedStoreIds.has(String(storeId))) {
        return handleResponse(res, 403, "Target store not found or access denied");
      }
      staff.parentId = storeId;
    }

    if (name) staff.name = name;
    if (email) {
      const existing = await Seller.findOne({ email, _id: { $ne: id } });
      if (existing) return handleResponse(res, 400, "Email already in use");
      staff.email = email;
    }
    if (phone) {
      const existing = await Seller.findOne({ phone, _id: { $ne: id } });
      if (existing) return handleResponse(res, 400, "Phone number already in use");
      staff.phone = phone;
    }
    if (password) {
      staff.password = password;
    }
    if (role) staff.role = role;

    if (allowedPermissions !== undefined) {
      const permissionValidation = validateSellerPermissionsInput(allowedPermissions);
      if (!permissionValidation.valid) {
        return handleResponse(res, 400, permissionValidation.message);
      }
      if (!permissionValidation.normalized.length) {
        return handleResponse(res, 400, "At least one read or write permission is required");
      }
      staff.allowedPermissions = permissionValidation.normalized;
    }

    await staff.save();

    const store = ownerStores.find((entry) => String(entry._id) === String(staff.parentId));

    return handleResponse(res, 200, "Assistant updated successfully", {
      ...staff.toObject(),
      permissionSummary: summarizePermissionsForDisplay(staff.allowedPermissions || []),
      store: store
        ? { _id: store._id, shopName: store.shopName }
        : null,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const deleteSellerStaff = async (req, res) => {
  try {
    const accountId = req.user.accountId;
    const { id } = req.params;

    const staff = await Seller.findOne({ _id: id, accountType: "staff" });
    if (!staff) {
      return handleResponse(res, 404, "Assistant not found");
    }

    const ownerStores = await loadOwnerStores(accountId);
    const ownedStoreIds = new Set(ownerStores.map((store) => String(store._id)));
    if (!ownedStoreIds.has(String(staff.parentId))) {
      return handleResponse(res, 403, "You cannot remove assistants for this store");
    }

    await Seller.deleteOne({ _id: id });

    return handleResponse(res, 200, "Assistant removed successfully");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
