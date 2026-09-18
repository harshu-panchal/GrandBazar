import handleResponse from "../../utils/helper.js";
import getPagination from "../../utils/pagination.js";
import {
  getActiveSellersData,
  getActiveSellerByIdData,
  getSellerLocationsData,
  getSellerOptions,
  suspendStoreById,
  reactivateStoreById,
} from "../../services/admin/sellerDirectoryService.js";
import SellerMessage from "../../models/sellerMessage.js";

export const getSellerLocations = async (req, res) => {
  try {
    const {
      q = "",
      category = "all",
      city = "all",
      lifecycle = "all",
      mapLimit: rawMapLimit = "500",
      sort = "orders_desc",
    } = req.query;

    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 100,
    });

    const data = await getSellerLocationsData({
      q,
      category,
      city,
      lifecycle,
      mapLimit: rawMapLimit,
      sort,
      page,
      limit,
      skip,
    });

    return handleResponse(res, 200, "Seller locations fetched successfully", data);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getActiveSellers = async (req, res) => {
  try {
    const { q = "", category = "all", sort = "recent" } = req.query;
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const data = await getActiveSellersData({
      q,
      category,
      sort,
      page,
      limit,
      skip,
    });

    return handleResponse(res, 200, "Active sellers fetched successfully", data);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getActiveSellerById = async (req, res) => {
  try {
    const data = await getActiveSellerByIdData(req.params.id);
    if (!data) {
      return handleResponse(res, 404, "Active seller not found");
    }
    return handleResponse(res, 200, "Active seller fetched successfully", data);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const suspendStore = async (req, res) => {
  try {
    const { reason } = req.body || {};
    const store = await suspendStoreById(req.params.id, { reason });
    return handleResponse(res, 200, "Store suspended", store);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const reactivateStore = async (req, res) => {
  try {
    const store = await reactivateStoreById(req.params.id);
    return handleResponse(res, 200, "Store reactivated", store);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const sendMessageToSeller = async (req, res) => {
    try {
        const sellerId = req.params.id;
        const { message, title } = req.body || {};
        if (!sellerId) {
            return handleResponse(res, 400, "Seller id is required");
        }
        if (!message || !String(message).trim()) {
            return handleResponse(res, 400, "Message text is required");
        }

        const seller = await getActiveSellerByIdData(sellerId);
        if (!seller) {
            return handleResponse(res, 404, "Active seller not found");
        }

        const doc = await SellerMessage.create({
            sellerId,
            fromAdminId: req.user?.id,
            fromAdminName: req.user?.name || "Admin",
            title: title || `Message from ${req.user?.name || "Admin"}`,
            message: String(message).trim(),
        });

        return handleResponse(res, 200, "Message sent — the seller will see it in their inbox", doc);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

export const getSellers = async (req, res) => {
  try {
    const sellers = await getSellerOptions();
    return handleResponse(res, 200, "Sellers fetched", sellers);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
