import handleResponse from "../../utils/helper.js";
import { uploadToCloudinary } from "../../services/mediaService.js";
import {
  createSubscriptionPaymentRequest,
  getSellerSubscriptionSummary,
  listActivePlans,
} from "../../services/subscriptionService.js";
import {
  createSubscriptionPhonePeCheckout,
  verifySubscriptionPhonePePayment,
} from "../../services/subscriptionPaymentService.js";
import { PAYMENT_REQUEST_TYPE } from "../../constants/subscription.js";

function resolveOwnerId(req) {
  return req.user?.accountId || null;
}

export async function getSellerSubscriptionPlans(req, res) {
  try {
    const ownerId = resolveOwnerId(req);
    if (!ownerId) {
      return handleResponse(res, 403, "Only the store owner can view subscription plans");
    }

    const [plans, summary] = await Promise.all([
      listActivePlans(),
      getSellerSubscriptionSummary(ownerId),
    ]);

    return handleResponse(res, 200, "Subscription plans fetched", {
      plans,
      ...summary,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function getSellerSubscriptionStatus(req, res) {
  try {
    const ownerId = resolveOwnerId(req);
    if (!ownerId) {
      return handleResponse(res, 403, "Only the store owner can view subscription status");
    }

    const summary = await getSellerSubscriptionSummary(ownerId);
    return handleResponse(res, 200, "Subscription status fetched", summary);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function submitSubscriptionPaymentRequest(req, res) {
  try {
    const ownerId = resolveOwnerId(req);
    if (!ownerId) {
      return handleResponse(res, 403, "Only the store owner can submit payment proof");
    }

    const { planId, paymentMethod, transactionRef, sellerNote, requestType } = req.body || {};

    let proofDocumentUrl = req.body?.proofDocumentUrl || "";
    if (req.file?.buffer) {
      proofDocumentUrl = await uploadToCloudinary(req.file.buffer, "subscription-payments", {
        mimeType: req.file.mimetype,
      });
    }

    if (!planId) {
      return handleResponse(res, 400, "planId is required");
    }
    if (!transactionRef?.trim() && !proofDocumentUrl) {
      return handleResponse(res, 400, "Transaction reference or payment proof is required");
    }

    const request = await createSubscriptionPaymentRequest({
      sellerId: ownerId,
      planId,
      paymentMethod,
      transactionRef,
      proofDocumentUrl,
      sellerNote,
      requestType: requestType || PAYMENT_REQUEST_TYPE.NEW,
    });

    return handleResponse(res, 201, "Payment request submitted for admin review", request);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function initiateSubscriptionPhonePePayment(req, res) {
  try {
    const ownerId = resolveOwnerId(req);
    if (!ownerId) {
      return handleResponse(res, 403, "Only the store owner can pay for subscription");
    }

    const { planId, requestType } = req.body || {};
    if (!planId) {
      return handleResponse(res, 400, "planId is required");
    }

    const result = await createSubscriptionPhonePeCheckout({
      sellerId: ownerId,
      planId,
      requestType: requestType || PAYMENT_REQUEST_TYPE.NEW,
    });

    return handleResponse(res, 200, "PhonePe checkout created", {
      redirectUrl: result.redirectUrl,
      merchantOrderId: result.payment.gatewayOrderId,
      duplicate: result.duplicate,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function verifySubscriptionPhonePePaymentStatus(req, res) {
  try {
    const ownerId = resolveOwnerId(req);
    if (!ownerId) {
      return handleResponse(res, 403, "Only the store owner can verify subscription payment");
    }

    const merchantOrderId = req.query.merchantOrderId || req.params.merchantOrderId;
    if (!merchantOrderId) {
      return handleResponse(res, 400, "merchantOrderId is required");
    }

    const result = await verifySubscriptionPhonePePayment({
      merchantOrderId,
      sellerId: ownerId,
    });

    return handleResponse(res, 200, "Subscription payment status", {
      status: result.status,
      payment: result.payment,
      alreadyCaptured: result.alreadyCaptured || false,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}
