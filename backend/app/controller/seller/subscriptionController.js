import handleResponse from "../../utils/helper.js";
import { uploadToCloudinary } from "../../services/mediaService.js";
import {
  createSubscriptionPaymentRequest,
  getSellerSubscriptionSummary,
  listActivePlans,
  activateFreeSubscriptionPlan,
} from "../../services/subscriptionService.js";
import SubscriptionPlan from "../../models/subscriptionPlan.js";
import {
  createSubscriptionRazorpayCheckout,
  verifySubscriptionRazorpayPayment,
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

export async function initiateSubscriptionRazorpayPayment(req, res) {
  try {
    const ownerId = resolveOwnerId(req);
    if (!ownerId) {
      return handleResponse(res, 403, "Only the store owner can pay for subscription");
    }

    const { planId, requestType } = req.body || {};
    if (!planId) {
      return handleResponse(res, 400, "planId is required");
    }

    // A ₹0 plan has nothing to pay — Razorpay checkout requires a real amount
    // (sub-₹1 is rejected), so activate it directly instead of routing
    // through the payment gateway.
    const plan = await SubscriptionPlan.findById(planId).select("price").lean();
    if (plan && Number(plan.price) <= 0) {
      const { subscription } = await activateFreeSubscriptionPlan({
        sellerId: ownerId,
        planId,
        requestType: requestType || PAYMENT_REQUEST_TYPE.NEW,
      });
      return handleResponse(res, 200, "Free plan activated", {
        activated: true,
        subscription,
      });
    }

    const result = await createSubscriptionRazorpayCheckout({
      sellerId: ownerId,
      planId,
      requestType: requestType || PAYMENT_REQUEST_TYPE.NEW,
    });

    return handleResponse(res, 200, "Razorpay checkout created", {
      razorpayOrderId: result.razorpayOrderId,
      amount: result.amount,
      currency: result.currency,
      keyId: result.keyId,
      duplicate: result.duplicate,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function verifySubscriptionRazorpayPaymentStatus(req, res) {
  try {
    const ownerId = resolveOwnerId(req);
    if (!ownerId) {
      return handleResponse(res, 403, "Only the store owner can verify subscription payment");
    }

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body || {};
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return handleResponse(res, 400, "razorpayOrderId, razorpayPaymentId and razorpaySignature are required");
    }

    const result = await verifySubscriptionRazorpayPayment({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
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
