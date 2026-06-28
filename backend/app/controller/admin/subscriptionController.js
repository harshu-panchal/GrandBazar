import SubscriptionPlan from "../../models/subscriptionPlan.js";
import SubscriptionPaymentRequest from "../../models/subscriptionPaymentRequest.js";
import SellerSubscriptionPayment from "../../models/sellerSubscriptionPayment.js";
import SellerSubscription from "../../models/sellerSubscription.js";
import Seller from "../../models/seller.js";
import handleResponse from "../../utils/helper.js";
import {
  approvePaymentRequest,
  rejectPaymentRequest,
  getSubscriptionPaymentSettings,
} from "../../services/subscriptionService.js";
import { SUBSCRIPTION_STATUS } from "../../constants/subscription.js";
import Setting from "../../models/setting.js";
import { invalidate } from "../../services/cacheService.js";

export async function listSubscriptionPlans(req, res) {
  try {
    const plans = await SubscriptionPlan.find().sort({ sortOrder: 1, price: 1 }).lean();
    return handleResponse(res, 200, "Subscription plans fetched", plans);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function createSubscriptionPlan(req, res) {
  try {
    const plan = await SubscriptionPlan.create(req.body || {});
    return handleResponse(res, 201, "Subscription plan created", plan);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function updateSubscriptionPlan(req, res) {
  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(
      req.params.id,
      req.body || {},
      { new: true, runValidators: true },
    );
    if (!plan) {
      return handleResponse(res, 404, "Plan not found");
    }
    return handleResponse(res, 200, "Subscription plan updated", plan);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function deleteSubscriptionPlan(req, res) {
  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true },
    );
    if (!plan) {
      return handleResponse(res, 404, "Plan not found");
    }
    return handleResponse(res, 200, "Subscription plan deactivated", plan);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function listPaymentRequests(req, res) {
  try {
    const status = req.query.status || "pending";
    const filter = status === "all" ? {} : { status };
    const requests = await SubscriptionPaymentRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const sellerIds = [...new Set(requests.map((r) => String(r.sellerId)))];
    const sellers = await Seller.find({ _id: { $in: sellerIds } })
      .select("name email phone")
      .lean();
    const sellerMap = new Map(sellers.map((s) => [String(s._id), s]));

    const enriched = requests.map((request) => ({
      ...request,
      seller: sellerMap.get(String(request.sellerId)) || null,
    }));

    return handleResponse(res, 200, "Payment requests fetched", enriched);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function approveSubscriptionPaymentRequest(req, res) {
  try {
    const result = await approvePaymentRequest(req.params.id, req.user?.id);
    return handleResponse(res, 200, "Payment approved and subscription activated", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function rejectSubscriptionPaymentRequest(req, res) {
  try {
    const { rejectionReason } = req.body || {};
    const request = await rejectPaymentRequest(
      req.params.id,
      req.user?.id,
      rejectionReason,
    );
    return handleResponse(res, 200, "Payment request rejected", request);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function getSubscriptionPaymentSettingsAdmin(req, res) {
  try {
    const settings = await getSubscriptionPaymentSettings();
    return handleResponse(res, 200, "Subscription payment settings fetched", settings);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function updateSubscriptionPaymentSettings(req, res) {
  try {
    const filter = { $or: [{ tenantId: null }, { tenantId: { $exists: false } }] };
    const payload = req.body || {};
    const settings = await Setting.findOneAndUpdate(
      filter,
      {
        $set: {
          subscriptionPayment: {
            bankName: payload.bankName || "",
            accountHolder: payload.accountHolder || "",
            accountNumber: payload.accountNumber || "",
            ifsc: payload.ifsc || "",
            upiId: payload.upiId || "",
            paymentInstructions: payload.paymentInstructions || "",
          },
        },
      },
      { new: true, upsert: true },
    );
    await invalidate("cache:platform:settings:*");
    return handleResponse(res, 200, "Subscription payment settings updated", settings.subscriptionPayment);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function getSubscriptionOverview(req, res) {
  try {
    const [
      planCount,
      activePlanCount,
      activeSubscriptions,
      pendingRequests,
      capturedPhonePePayments,
    ] = await Promise.all([
      SubscriptionPlan.countDocuments(),
      SubscriptionPlan.countDocuments({ isActive: true }),
      SellerSubscription.countDocuments({ status: SUBSCRIPTION_STATUS.ACTIVE }),
      SubscriptionPaymentRequest.countDocuments({ status: "pending" }),
      SellerSubscriptionPayment.countDocuments({ status: "CAPTURED" }),
    ]);

    return handleResponse(res, 200, "Subscription overview fetched", {
      planCount,
      activePlanCount,
      activeSubscriptions,
      pendingRequests,
      capturedPhonePePayments,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function listSubscriptionPayments(req, res) {
  try {
    const status = req.query.status || "all";
    const filter = status === "all" ? {} : { status };
    const payments = await SellerSubscriptionPayment.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const sellerIds = [...new Set(payments.map((p) => String(p.sellerId)))];
    const sellers = await Seller.find({ _id: { $in: sellerIds } })
      .select("name email phone")
      .lean();
    const sellerMap = new Map(sellers.map((s) => [String(s._id), s]));

    const enriched = payments.map((payment) => ({
      ...payment,
      seller: sellerMap.get(String(payment.sellerId)) || null,
    }));

    return handleResponse(res, 200, "Subscription payments fetched", enriched);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}
