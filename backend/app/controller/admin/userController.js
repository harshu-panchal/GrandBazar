import handleResponse from "../../utils/helper.js";
import getPagination from "../../utils/pagination.js";
import {
  getUserByIdData,
  getUsersData,
  updateUserData,
  updateUserStatusData,
  sendCustomerNotificationData,
} from "../../services/admin/userAdminService.js";

export const getUsers = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const data = await getUsersData({ page, limit, skip });
    return handleResponse(res, 200, "Users fetched successfully", data);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await getUserByIdData(id);

    if (!user) {
      return handleResponse(res, 404, "Customer not found");
    }

    return handleResponse(
      res,
      200,
      "Customer details fetched successfully",
      user,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await updateUserData(id, req.body || {});
    if (!updated) {
      return handleResponse(res, 404, "Customer not found");
    }
    return handleResponse(res, 200, "Customer updated successfully", updated);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await updateUserStatusData(id, req.body || {});
    if (!updated) {
      return handleResponse(res, 404, "Customer not found");
    }
    return handleResponse(res, 200, "Customer status updated successfully", updated);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const sendCustomerNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const notif = await sendCustomerNotificationData(id, req.body || {});
    return handleResponse(res, 200, "Notification sent successfully", notif);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
