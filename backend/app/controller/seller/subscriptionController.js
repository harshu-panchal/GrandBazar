import handleResponse from "../../utils/helper.js";
import { uploadToCloudinary } from "../../services/mediaService.js";
import Store from "../../models/store.js";
import {
  createSubscriptionPaymentRequest,
  getStoreSubscriptionSummary,
  listActivePlans,
  activateFreeSubscriptionPlan,
} from "../../services/subscriptionService.js";
import SubscriptionPlan from "../../models/subscriptionPlan.js";
import {
  createSubscriptionPhonePeCheckout,
  verifySubscriptionPhonePePayment,
} from "../../services/subscriptionPaymentService.js";
import { PAYMENT_REQUEST_TYPE } from "../../constants/subscription.js";

// Subscriptions are per STORE now — every handler below requires :storeId in
// the route and verifies it belongs to the calling owner before touching it.
async function requireOwnedStore(req) {
  const ownerId = req.user?.accountId;
  const storeId = req.params?.storeId;
  if (!ownerId || !storeId) return null;
  const store = await Store.findOne({ _id: storeId, ownerId }).select("_id ownerId").lean();
  return store;
}

export async function getSellerSubscriptionPlans(req, res) {
  try {
    const store = await requireOwnedStore(req);
    if (!store) {
      return handleResponse(res, 403, "Only this shop's owner can view subscription plans");
    }

    const [plans, summary] = await Promise.all([
      listActivePlans(),
      getStoreSubscriptionSummary(store._id),
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
    const store = await requireOwnedStore(req);
    if (!store) {
      return handleResponse(res, 403, "Only this shop's owner can view subscription status");
    }

    const summary = await getStoreSubscriptionSummary(store._id);
    return handleResponse(res, 200, "Subscription status fetched", summary);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function submitSubscriptionPaymentRequest(req, res) {
  try {
    const store = await requireOwnedStore(req);
    if (!store) {
      return handleResponse(res, 403, "Only this shop's owner can submit payment proof");
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
      storeId: store._id,
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
    const store = await requireOwnedStore(req);
    if (!store) {
      return handleResponse(res, 403, "Only this shop's owner can pay for subscription");
    }

    const { planId, requestType } = req.body || {};
    if (!planId) {
      return handleResponse(res, 400, "planId is required");
    }

    // A ₹0 plan has nothing to pay — PhonePe checkout requires a real amount
    // (sub-₹1 is rejected), so activate it directly instead of routing
    // through the payment gateway.
    const plan = await SubscriptionPlan.findById(planId).select("price").lean();
    if (plan && Number(plan.price) <= 0) {
      const { subscription } = await activateFreeSubscriptionPlan({
        storeId: store._id,
        planId,
        requestType: requestType || PAYMENT_REQUEST_TYPE.NEW,
      });
      return handleResponse(res, 200, "Free plan activated", {
        activated: true,
        subscription,
      });
    }

    const result = await createSubscriptionPhonePeCheckout({
      storeId: store._id,
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
    const store = await requireOwnedStore(req);
    if (!store) {
      return handleResponse(res, 403, "Only this shop's owner can verify subscription payment");
    }

    const merchantOrderId = req.query.merchantOrderId || req.params.merchantOrderId;
    if (!merchantOrderId) {
      return handleResponse(res, 400, "merchantOrderId is required");
    }

    const result = await verifySubscriptionPhonePePayment({
      merchantOrderId,
      sellerId: req.user.accountId,
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
