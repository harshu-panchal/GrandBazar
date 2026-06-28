import Store from "../../models/store.js";
import Seller from "../../models/seller.js";
import handleResponse from "../../utils/helper.js";
import { uploadToCloudinary } from "../../services/mediaService.js";
import {
  buildStorePayloadFromBody,
  generateSellerToken,
  getMissingRequiredSellerDocuments,
  isStoreApproved,
  isStoreApplicationApproved,
  loadOwnerStores,
  parseStoreCategoriesInput,
  REQUIRED_SELLER_DOCUMENT_FIELDS,
  SELLER_DOCUMENT_FIELDS,
} from "../../services/storeService.js";
import { invalidateSellerName } from "../../services/entityNameCache.js";
import { isOwnerAccountApproved } from "../../services/sellerAccountService.js";

async function resolveUploadedDocs(req) {
  const documentFiles = req.files || [];
  const uploadedDocs = {};
  if (Array.isArray(documentFiles) && documentFiles.length > 0) {
    for (const file of documentFiles) {
      try {
        const fieldName = file.fieldname;
        if (fieldName && REQUIRED_SELLER_DOCUMENT_FIELDS.includes(fieldName)) {
          uploadedDocs[fieldName] = await uploadToCloudinary(file.buffer, "docs", {
            mimeType: file.mimetype,
          });
        }
      } catch (err) {
        console.error("Failed to upload document to Cloudinary", err);
      }
    }
  }
  return uploadedDocs;
}

export const listOwnerStores = async (req, res) => {
  try {
    const accountId = req.user.accountId;
    if (!accountId) {
      return handleResponse(res, 403, "Only store owners can list stores");
    }

    const stores = await loadOwnerStores(accountId);
    return handleResponse(res, 200, "Stores fetched successfully", stores);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const createStore = async (req, res) => {
  try {
    const accountId = req.user.accountId;
    if (!accountId) {
      return handleResponse(res, 403, "Only store owners can create stores");
    }

    const ownerAccount = await Seller.findById(accountId).lean();
    if (!isOwnerAccountApproved(ownerAccount)) {
      return handleResponse(
        res,
        403,
        "Your seller admin account must be approved before adding shops",
        { accountApplicationStatus: ownerAccount?.applicationStatus || "pending" },
      );
    }

    const uploadedDocs = await resolveUploadedDocs(req);
    const body = { ...req.body, ...uploadedDocs };
    const {
      shopName,
      aadharNumber,
      panNumber,
      accountHolder,
      accountNumber,
      ifsc,
      bankName,
    } = body;

    if (!shopName || !aadharNumber || !panNumber || !accountHolder || !accountNumber || !ifsc || !bankName) {
      return handleResponse(res, 400, "All store fields (including KYC and bank details) are required");
    }

    const storePayload = buildStorePayloadFromBody(body, uploadedDocs);
    if (!storePayload.categories?.length) {
      return handleResponse(res, 400, "At least one store category is required");
    }
    const missingDocs = getMissingRequiredSellerDocuments(storePayload.documents || {});
    if (missingDocs.length > 0) {
      const readableMissing = missingDocs
        .map((field) => SELLER_DOCUMENT_FIELDS[field] || field)
        .join(", ");
      return handleResponse(res, 400, `All required documents must be uploaded: ${readableMissing}`);
    }

    storePayload.ownerId = accountId;
    const store = await Store.create(storePayload);

    return handleResponse(res, 201, "Store created and pending admin approval", store);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getStoreById = async (req, res) => {
  try {
    const accountId = req.user.accountId;
    const { storeId } = req.params;

    const store = await Store.findOne({ _id: storeId, ownerId: accountId }).lean();
    if (!store) {
      return handleResponse(res, 404, "Store not found");
    }

    return handleResponse(res, 200, "Store fetched successfully", store);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateStoreById = async (req, res) => {
  try {
    const accountId = req.user.accountId;
    const { storeId } = req.params;

    const store = await Store.findOne({ _id: storeId, ownerId: accountId });
    if (!store) {
      return handleResponse(res, 404, "Store not found");
    }

    const {
      shopName,
      category,
      categories,
      description,
      address,
      locality,
      pincode,
      city,
      state,
      lat,
      lng,
      radius,
      banners,
      storeVideo,
    } = req.body;

    if (shopName) store.shopName = shopName;
    const parsedCategories = parseStoreCategoriesInput({ category, categories });
    if (parsedCategories.length) {
      store.categories = parsedCategories;
      store.category = parsedCategories[0];
    } else if (category !== undefined) {
      store.category = category;
      store.categories = category ? [category] : [];
    }
    if (description !== undefined) store.description = description;
    if (address !== undefined) store.address = address;
    if (locality !== undefined) store.locality = locality;
    if (pincode !== undefined) store.pincode = pincode;
    if (city !== undefined) store.city = city;
    if (state !== undefined) store.state = state;
    if (banners !== undefined) store.banners = banners;
    if (storeVideo !== undefined) store.storeVideo = storeVideo;

    if (lat !== undefined && lng !== undefined) {
      const parsedLat = Number(lat);
      const parsedLng = Number(lng);
      if (parsedLat < -90 || parsedLat > 90) {
        return handleResponse(res, 400, "Invalid latitude");
      }
      if (parsedLng < -180 || parsedLng > 180) {
        return handleResponse(res, 400, "Invalid longitude");
      }
      store.location = { type: "Point", coordinates: [parsedLng, parsedLat] };
    }

    if (radius !== undefined) {
      const parsedRadius = Number(radius);
      if (parsedRadius < 1 || parsedRadius > 100) {
        return handleResponse(res, 400, "Radius must be between 1 and 100 km");
      }
      store.serviceRadius = parsedRadius;
    }

    await store.save();

    invalidateSellerName(store._id).catch((err) => {
      console.warn("[Store] Name cache invalidation failed:", err.message);
    });

    return handleResponse(res, 200, "Store updated successfully", store);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const switchActiveStore = async (req, res) => {
  try {
    const accountId = req.user.accountId;
    if (!accountId) {
      return handleResponse(res, 403, "Only store owners can switch stores");
    }

    const { storeId } = req.body;
    if (!storeId) {
      return handleResponse(res, 400, "storeId is required");
    }

    const store = await Store.findOne({ _id: storeId, ownerId: accountId });
    if (!store) {
      return handleResponse(res, 404, "Store not found or access denied");
    }

    await Seller.findByIdAndUpdate(accountId, { lastActiveStoreId: store._id });

    const token = generateSellerToken({
      activeStoreId: store._id,
      accountId,
    });

    return handleResponse(res, 200, "Active store switched", {
      token,
      activeStoreId: String(store._id),
      store,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const toggleStoreActive = async (req, res) => {
  try {
    const accountId = req.user.accountId;
    const { storeId } = req.params;

    const store = await Store.findOne({ _id: storeId, ownerId: accountId });
    if (!store) {
      return handleResponse(res, 404, "Store not found");
    }

    if (!isStoreApplicationApproved(store)) {
      return handleResponse(res, 403, "Store must be approved before toggling open/closed status");
    }

    store.isActive = !store.isActive;
    await store.save();

    return handleResponse(res, 200, `Store ${store.isActive ? "opened" : "closed"} successfully`, store);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
