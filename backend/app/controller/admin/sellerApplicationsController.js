import handleResponse from "../../utils/helper.js";
import getPagination from "../../utils/pagination.js";
import {
  approveSellerApplicationById,
  getPendingSellerApplications,
  rejectSellerApplicationById,
  createVendorAccountByAdmin,
  updateStoreSetupByAdmin,
  resendSellerCredentialsByAdmin,
  inviteSellerByAdmin,
  listSellerInvitesByAdmin,
} from "../../services/admin/sellerApplicationService.js";

export const getPendingSellers = async (req, res) => {
  try {
    const { q = "", status = "pending" } = req.query;
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 100,
    });

    const data = await getPendingSellerApplications({
      q,
      status,
      page,
      limit,
      skip,
    });

    return handleResponse(res, 200, "Pending seller applications fetched", data);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const approveSellerApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { businessModel, commissionConfig, subscriptionPlanId } = req.body || {};
    const seller = await approveSellerApplicationById({
      sellerId: id,
      reviewedBy: req.user.id,
      businessModel,
      commissionConfig,
      subscriptionPlanId,
    });

    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }

    return handleResponse(res, 200, "Seller approved successfully", seller);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const rejectSellerApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const seller = await rejectSellerApplicationById({
      sellerId: id,
      reviewedBy: req.user.id,
      reason,
    });

    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }

    return handleResponse(res, 200, "Seller application rejected", seller);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const createVendorAccount = async (req, res) => {
  try {
    const {
      name, email, phone, password, shopName, category, categories, city, state,
      description, address, locality, pincode, serviceRadius, lat, lng,
      aadharNumber, panNumber, gstNumber,
      packagingCharge, packagingChargeEnabled, accountHolder,
      accountNumber, ifsc, bankName, deliveryPolicy,
    } = req.body || {};

    if (!name || !email || !phone) {
      return handleResponse(res, 400, "Name, email, and phone are required");
    }

    const result = await createVendorAccountByAdmin({
      ...(req.body || {}),
      reviewedBy: req.user?.id,
    });

    return handleResponse(
      res,
      201,
      "Vendor account created and welcome email dispatched successfully",
      result,
    );
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

export const updateSellerStoreSetup = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedStore = await updateStoreSetupByAdmin(id, req.body || {});
    return handleResponse(res, 200, "Store setup updated successfully", updatedStore);
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

export const resendSellerCredentials = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await resendSellerCredentialsByAdmin(id);
    return handleResponse(res, 200, "Seller credentials & app links dispatched via email", result);
  } catch (error) {
    return handleResponse(res, 400, error.message);
  }
};

export const inviteSeller = async (req, res) => {
  try {
    const { email, phone } = req.body || {};
    const result = await inviteSellerByAdmin({ email, phone, invitedBy: req.user.id });
    return handleResponse(res, 201, "Invite sent", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 400, error.message);
  }
};

export const listSellerInvites = async (req, res) => {
  try {
    const { status } = req.query;
    const invites = await listSellerInvitesByAdmin({ status });
    return handleResponse(res, 200, "Seller invites fetched", invites);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

