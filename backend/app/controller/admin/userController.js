import handleResponse from "../../utils/helper.js";
import getPagination from "../../utils/pagination.js";
import {
  getUserByIdData,
  getUsersData,
  blockUserById,
  unblockUserById,
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

export const blockUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const user = await blockUserById(id, { reason, adminId: req.user?.id });
    return handleResponse(res, 200, "Customer account restricted", user);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const unblockUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await unblockUserById(id);
    return handleResponse(res, 200, "Customer account restored", user);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
