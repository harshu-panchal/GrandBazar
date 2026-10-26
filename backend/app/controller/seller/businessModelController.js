import Store from "../../models/store.js";
import handleResponse from "../../utils/helper.js";
import {
  isOwnerAccountApproved,
} from "../../services/sellerAccountService.js";
import {
  BUSINESS_MODEL,
  COMMISSION_SCOPE,
  formatBusinessModelPayload,
  previewCommissionForStore,
  buildStoreCommissionSummary,
} from "../../services/sellerBusinessModelService.js";
import Seller from "../../models/seller.js";

// Business model is chosen per STORE now (see models/store.js). Every
// handler here operates on req.params.storeId, verified to belong to the
// calling owner.
async function requireOwnedStore(req) {
  const ownerId = req.user?.accountId;
  const storeId = req.params?.storeId;
  if (!ownerId || !storeId) return null;
  return Store.findOne({ _id: storeId, ownerId });
}

export async function getSellerBusinessModel(req, res) {
  try {
    const store = await requireOwnedStore(req);
    if (!store) {
      return handleResponse(res, 403, "Only this shop's owner can view business model settings");
    }

    return handleResponse(res, 200, "Business model fetched", {
      ...formatBusinessModelPayload(store),
      commissionSummary: await buildStoreCommissionSummary(store),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function chooseSellerBusinessModel(req, res) {
  try {
    const store = await requireOwnedStore(req);
    if (!store) {
      return handleResponse(res, 403, "Only this shop's owner can choose a business model");
    }

    const { businessModel } = req.body || {};
    if (businessModel !== BUSINESS_MODEL.COMMISSION && businessModel !== BUSINESS_MODEL.SUBSCRIPTION) {
      return handleResponse(
        res,
        400,
        "Invalid business model. Choose commission or subscription.",
      );
    }

    const owner = await Seller.findById(store.ownerId).select("applicationStatus isVerified accountType parentId").lean();
    if (!isOwnerAccountApproved(owner)) {
      return handleResponse(res, 403, "Your seller account must be approved before choosing a business model");
    }

    if (businessModel === BUSINESS_MODEL.SUBSCRIPTION) {
      if (store.businessModel && store.businessModel !== BUSINESS_MODEL.SUBSCRIPTION) {
        return handleResponse(
          res,
          400,
          "This shop's business model is already set. Use request-switch to change it.",
        );
      }
      store.businessModel = BUSINESS_MODEL.SUBSCRIPTION;
      store.businessModelChosenAt = store.businessModelChosenAt || new Date();
      await store.save();
      return handleResponse(res, 200, "Subscription model selected. Complete payment to activate.", {
        ...formatBusinessModelPayload(store),
        nextStep: `/seller/stores/${store._id}/subscription`,
      });
    }

    if (store.businessModel && store.businessModel !== businessModel) {
      return handleResponse(
        res,
        400,
        "This shop's business model is already set. Use request-switch to change it.",
      );
    }

    store.businessModel = BUSINESS_MODEL.COMMISSION;
    store.businessModelChosenAt = store.businessModelChosenAt || new Date();
    if (!store.commissionConfig?.scope) {
      store.commissionConfig = {
        scope: COMMISSION_SCOPE.CATEGORY,
        type: "percentage",
        value: 0,
        fixedRule: "per_qty",
        categoryOverrides: [],
      };
    }

    await store.save();

    return handleResponse(res, 200, "Commission model activated successfully", formatBusinessModelPayload(store));
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function requestSellerBusinessModelSwitch(req, res) {
  try {
    const store = await requireOwnedStore(req);
    if (!store) {
      return handleResponse(res, 403, "Only this shop's owner can request a model switch");
    }

    const { requestedModel } = req.body || {};
    if (
      requestedModel !== BUSINESS_MODEL.SUBSCRIPTION
      && requestedModel !== BUSINESS_MODEL.COMMISSION
    ) {
      return handleResponse(res, 400, "requestedModel must be commission or subscription");
    }

    if (store.businessModelSwitch?.status === "pending") {
      return handleResponse(res, 400, "A model switch request is already pending admin review");
    }

    if (requestedModel === BUSINESS_MODEL.SUBSCRIPTION) {
      if (store.businessModel !== BUSINESS_MODEL.COMMISSION) {
        return handleResponse(res, 400, "You can only request a switch to subscription from the commission model");
      }
    } else if (store.businessModel !== BUSINESS_MODEL.SUBSCRIPTION) {
      return handleResponse(res, 400, "You can only request a switch to commission from the subscription model");
    } else {
      const { getActiveSubscriptionForStore } = await import("../../services/subscriptionService.js");
      const active = await getActiveSubscriptionForStore(store._id);
      if (active) {
        return handleResponse(
          res,
          400,
          "Cannot switch to commission while this shop's subscription is still active. Wait until it expires or contact support.",
        );
      }
    }

    store.businessModelSwitch = {
      requestedModel,
      requestedAt: new Date(),
      effectiveAt: null,
      status: "pending",
      rejectionReason: "",
    };
    await store.save();

    const message = requestedModel === BUSINESS_MODEL.SUBSCRIPTION
      ? "Switch to subscription submitted. An admin will review your request."
      : "Switch to commission submitted. An admin will review your request.";

    return handleResponse(res, 200, message, formatBusinessModelPayload(store));
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function previewSellerCommission(req, res) {
  try {
    const store = await requireOwnedStore(req);
    if (!store) {
      return handleResponse(res, 403, "Only this shop's owner can preview commission");
    }

    const price = Number(req.query.price);
    const quantity = Number(req.query.quantity || 1);
    const categoryId = req.query.categoryId;

    if (!Number.isFinite(price) || price < 0) {
      return handleResponse(res, 400, "Valid price is required");
    }
    if (!categoryId) {
      return handleResponse(res, 400, "categoryId is required");
    }

    const preview = await previewCommissionForStore({
      store,
      price,
      quantity,
      categoryId,
    });

    return handleResponse(res, 200, "Commission preview generated", preview);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}
