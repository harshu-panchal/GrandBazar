import handleResponse from "../utils/helper.js";
import {
  listCatalogBundles,
  getCatalogBundleById,
  createCatalogBundle,
  updateCatalogBundle,
  deactivateCatalogBundle,
  getAvailableBundlesForStore,
  getBundleImportStatus,
  importBundlesForStore,
} from "../services/catalogBundleService.js";

export const getCatalogBundles = async (req, res) => {
  try {
    const { headerId, isActive } = req.query;
    const bundles = await listCatalogBundles({ headerId, isActive });
    return handleResponse(res, 200, "Catalog bundles fetched successfully", bundles);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getCatalogBundle = async (req, res) => {
  try {
    const bundle = await getCatalogBundleById(req.params.id);
    if (!bundle) {
      return handleResponse(res, 404, "Catalog bundle not found");
    }
    return handleResponse(res, 200, "Catalog bundle fetched successfully", bundle);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const createCatalogBundleHandler = async (req, res) => {
  try {
    const { name, headerId, catalogProductIds, description, isActive } = req.body;

    if (!name || !String(name).trim()) {
      return handleResponse(res, 400, "Bundle name is required");
    }

    const bundle = await createCatalogBundle({
      payload: { name, headerId, catalogProductIds, description, isActive },
      adminId: req.user.id,
    });

    return handleResponse(res, 201, "Catalog bundle created successfully", bundle);
  } catch (error) {
    const status = error.message.includes("already exists") ? 409 : 400;
    return handleResponse(res, status, error.message);
  }
};

export const updateCatalogBundleHandler = async (req, res) => {
  try {
    const bundle = await updateCatalogBundle(req.params.id, req.body);
    return handleResponse(res, 200, "Catalog bundle updated successfully", bundle);
  } catch (error) {
    const status = error.message === "Catalog bundle not found" ? 404 : 400;
    return handleResponse(res, status, error.message);
  }
};

export const deleteCatalogBundleHandler = async (req, res) => {
  try {
    const bundle = await deactivateCatalogBundle(req.params.id);
    return handleResponse(res, 200, "Catalog bundle deactivated successfully", bundle);
  } catch (error) {
    const status = error.message === "Catalog bundle not found" ? 404 : 400;
    return handleResponse(res, status, error.message);
  }
};

export const getAvailableCatalogBundles = async (req, res) => {
  try {
    const storeId = req.user.id;
    const result = await getAvailableBundlesForStore(storeId);
    return handleResponse(res, 200, "Available catalog bundles fetched successfully", result);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getCatalogBundleImportStatus = async (req, res) => {
  try {
    const storeId = req.user.id;
    const records = await getBundleImportStatus(storeId);
    return handleResponse(res, 200, "Bundle import status fetched successfully", records);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const importCatalogBundles = async (req, res) => {
  try {
    const { bundleIds } = req.body;
    const storeId = req.user.id;
    const accountId = req.user.accountId || req.user.subSellerId;

    const result = await importBundlesForStore({
      storeId,
      bundleIds,
      accountId,
    });

    return handleResponse(
      res,
      201,
      `${result.imported} products imported. Set prices to publish them.`,
      result,
    );
  } catch (error) {
    const status = error.message.includes("approved") ? 403 : 400;
    return handleResponse(res, status, error.message);
  }
};
