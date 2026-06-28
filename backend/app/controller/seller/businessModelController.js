import Seller from "../../models/seller.js";
import handleResponse from "../../utils/helper.js";
import {
  isOwnerAccountApproved,
} from "../../services/sellerAccountService.js";
import {
  BUSINESS_MODEL,
  COMMISSION_SCOPE,
  formatBusinessModelPayload,
  previewCommissionForSeller,
  buildSellerCommissionSummary,
} from "../../services/sellerBusinessModelService.js";

function resolveOwnerId(req) {
  return req.user?.accountId || (req.user?.subSellerId ? null : req.user?.id);
}

export async function getSellerBusinessModel(req, res) {
  try {
    const ownerId = resolveOwnerId(req);
    if (!ownerId) {
      return handleResponse(res, 403, "Only the store owner can view business model settings");
    }

    const seller = await Seller.findById(ownerId)
      .select("businessModel businessModelChosenAt commissionConfig businessModelSwitch applicationStatus isVerified")
      .lean();
    if (!seller) {
      return handleResponse(res, 404, "Seller account not found");
    }

    return handleResponse(res, 200, "Business model fetched", {
      ...formatBusinessModelPayload(seller),
      commissionSummary: await buildSellerCommissionSummary(seller),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function chooseSellerBusinessModel(req, res) {
  try {
    const ownerId = resolveOwnerId(req);
    if (!ownerId) {
      return handleResponse(res, 403, "Only the store owner can choose a business model");
    }

    const { businessModel } = req.body || {};
    if (businessModel !== BUSINESS_MODEL.COMMISSION && businessModel !== BUSINESS_MODEL.SUBSCRIPTION) {
      return handleResponse(
        res,
        400,
        "Invalid business model. Choose commission or subscription.",
      );
    }

    const seller = await Seller.findById(ownerId);
    if (!seller) {
      return handleResponse(res, 404, "Seller account not found");
    }

    if (!isOwnerAccountApproved(seller)) {
      return handleResponse(res, 403, "Seller account must be approved before choosing a business model");
    }

    if (businessModel === BUSINESS_MODEL.SUBSCRIPTION) {
      if (seller.businessModel && seller.businessModel !== BUSINESS_MODEL.SUBSCRIPTION) {
        return handleResponse(
          res,
          400,
          "Business model is already set. Use request-switch to change models.",
        );
      }
      seller.businessModel = BUSINESS_MODEL.SUBSCRIPTION;
      seller.businessModelChosenAt = seller.businessModelChosenAt || new Date();
      await seller.save();
      return handleResponse(res, 200, "Subscription model selected. Complete payment to activate.", {
        ...formatBusinessModelPayload(seller),
        nextStep: "/seller/subscription",
      });
    }

    if (seller.businessModel && seller.businessModel !== businessModel) {
      return handleResponse(
        res,
        400,
        "Business model is already set. Use request-switch to change models.",
      );
    }

    seller.businessModel = BUSINESS_MODEL.COMMISSION;
    seller.businessModelChosenAt = seller.businessModelChosenAt || new Date();
    if (!seller.commissionConfig?.scope) {
      seller.commissionConfig = {
        scope: COMMISSION_SCOPE.CATEGORY,
        type: "percentage",
        value: 0,
        fixedRule: "per_qty",
        categoryOverrides: [],
      };
    }

    await seller.save();

    return handleResponse(res, 200, "Commission model activated successfully", formatBusinessModelPayload(seller));
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function requestSellerBusinessModelSwitch(req, res) {
  try {
    const ownerId = resolveOwnerId(req);
    if (!ownerId) {
      return handleResponse(res, 403, "Only the store owner can request a model switch");
    }

    const { requestedModel } = req.body || {};
    if (
      requestedModel !== BUSINESS_MODEL.SUBSCRIPTION
      && requestedModel !== BUSINESS_MODEL.COMMISSION
    ) {
      return handleResponse(res, 400, "requestedModel must be commission or subscription");
    }

    const seller = await Seller.findById(ownerId);
    if (!seller) {
      return handleResponse(res, 404, "Seller account not found");
    }

    if (seller.businessModelSwitch?.status === "pending") {
      return handleResponse(res, 400, "A model switch request is already pending admin review");
    }

    if (requestedModel === BUSINESS_MODEL.SUBSCRIPTION) {
      if (seller.businessModel !== BUSINESS_MODEL.COMMISSION) {
        return handleResponse(res, 400, "You can only request a switch to subscription from the commission model");
      }
    } else if (seller.businessModel !== BUSINESS_MODEL.SUBSCRIPTION) {
      return handleResponse(res, 400, "You can only request a switch to commission from the subscription model");
    } else {
      const { getActiveSubscriptionForSeller } = await import("../../services/subscriptionService.js");
      const active = await getActiveSubscriptionForSeller(ownerId);
      if (active) {
        return handleResponse(
          res,
          400,
          "Cannot switch to commission while your subscription is still active. Wait until it expires or contact support.",
        );
      }
    }

    seller.businessModelSwitch = {
      requestedModel,
      requestedAt: new Date(),
      effectiveAt: null,
      status: "pending",
      rejectionReason: "",
    };
    await seller.save();

    const message = requestedModel === BUSINESS_MODEL.SUBSCRIPTION
      ? "Switch to subscription submitted. An admin will review your request."
      : "Switch to commission submitted. An admin will review your request.";

    return handleResponse(res, 200, message, formatBusinessModelPayload(seller));
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function previewSellerCommission(req, res) {
  try {
    const ownerId = resolveOwnerId(req);
    if (!ownerId) {
      return handleResponse(res, 403, "Only the store owner can preview commission");
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

    const seller = await Seller.findById(ownerId)
      .select("businessModel commissionConfig")
      .lean();
    if (!seller) {
      return handleResponse(res, 404, "Seller account not found");
    }

    const preview = await previewCommissionForSeller({
      seller,
      price,
      quantity,
      categoryId,
    });

    return handleResponse(res, 200, "Commission preview generated", preview);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}
