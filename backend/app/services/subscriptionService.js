import Seller from "../models/seller.js";
import Store from "../models/store.js";
import Product from "../models/product.js";
import Setting from "../models/setting.js";
import SubscriptionPlan from "../models/subscriptionPlan.js";
import SellerSubscription from "../models/sellerSubscription.js";
import SubscriptionPaymentRequest from "../models/subscriptionPaymentRequest.js";
import SellerSubscriptionPayment from "../models/sellerSubscriptionPayment.js";
import {
  PAYMENT_REQUEST_STATUS,
  PAYMENT_REQUEST_TYPE,
  SUBSCRIPTION_STATUS,
} from "../constants/subscription.js";
import { PAYMENT_STATUS } from "../constants/payment.js";
import { BUSINESS_MODEL } from "./sellerBusinessModelService.js";

function buildPlanSnapshot(plan) {
  return {
    name: plan.name,
    shopCount: plan.shopCount,
    productCountPerShop: plan.productCountPerShop,
    durationDays: plan.durationDays,
    price: plan.price,
    sortOrder: plan.sortOrder || 0,
    billingCycle: plan.billingCycle || "monthly",
  };
}

export async function getSubscriptionPaymentSettings() {
  const settings = await Setting.findOne({
    $or: [{ tenantId: null }, { tenantId: { $exists: false } }],
  })
    .select("subscriptionPayment currencySymbol")
    .lean();
  return {
    ...(settings?.subscriptionPayment || {}),
    currencySymbol: settings?.currencySymbol || "₹",
  };
}

export async function getActiveSubscriptionForSeller(sellerId) {
  if (!sellerId) return null;
  const now = new Date();
  return SellerSubscription.findOne({
    sellerId,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    currentPeriodEnd: { $gt: now },
  })
    .sort({ currentPeriodEnd: -1 })
    .lean();
}

export async function isSellerSubscriptionOperational(sellerId) {
  const seller = await Seller.findById(sellerId).select("businessModel").lean();
  if (!seller) return false;
  if (seller.businessModel === BUSINESS_MODEL.COMMISSION) return true;
  if (seller.businessModel === BUSINESS_MODEL.SUBSCRIPTION) {
    const active = await getActiveSubscriptionForSeller(sellerId);
    return Boolean(active);
  }
  return false;
}

export async function getSubscriptionOperationalOwnerIds(ownerIds = []) {
  const normalized = Array.from(
    new Set(ownerIds.map((id) => String(id || "")).filter(Boolean)),
  );
  if (!normalized.length) return new Set();

  const owners = await Seller.find({ _id: { $in: normalized } })
    .select("_id businessModel")
    .lean();

  const commissionIds = owners
    .filter((o) => o.businessModel === BUSINESS_MODEL.COMMISSION)
    .map((o) => String(o._id));

  const subscriptionOwnerIds = owners
    .filter((o) => o.businessModel === BUSINESS_MODEL.SUBSCRIPTION)
    .map((o) => o._id);

  const now = new Date();
  const activeSubs = subscriptionOwnerIds.length
    ? await SellerSubscription.find({
        sellerId: { $in: subscriptionOwnerIds },
        status: SUBSCRIPTION_STATUS.ACTIVE,
        currentPeriodEnd: { $gt: now },
      })
        .select("sellerId")
        .lean()
    : [];

  const subscriptionIds = activeSubs.map((s) => String(s.sellerId));
  return new Set([...commissionIds, ...subscriptionIds]);
}

export async function getSellerSubscriptionSummary(sellerId) {
  const [active, pendingRequest, pendingPhonePePayment] = await Promise.all([
    getActiveSubscriptionForSeller(sellerId),
    SubscriptionPaymentRequest.findOne({
      sellerId,
      status: PAYMENT_REQUEST_STATUS.PENDING,
    })
      .sort({ createdAt: -1 })
      .lean(),
    SellerSubscriptionPayment.findOne({
      sellerId,
      status: { $in: [PAYMENT_STATUS.CREATED, PAYMENT_STATUS.PENDING] },
    })
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  let activePlan = null;
  if (active?.planId) {
    activePlan = await SubscriptionPlan.findById(active.planId).lean();
  }

  const stores = await Store.find({ ownerId: sellerId }).select("_id").lean();
  const storeIds = stores.map((s) => s._id);
  const publishedProductCount = storeIds.length
    ? await Product.countDocuments({
        sellerId: { $in: storeIds },
        status: "active",
        isPublished: { $ne: false },
      })
    : 0;

  const limits = active?.planSnapshot || activePlan || {};
  const shopLimit = Number(limits.shopCount || 0);
  const productLimitPerShop = Number(limits.productCountPerShop || 0);
  const totalProductLimit = shopLimit * productLimitPerShop;

  return {
    activeSubscription: active,
    pendingPaymentRequest: pendingRequest,
    pendingPhonePePayment,
    usage: {
      shopCount: stores.length,
      shopLimit,
      publishedProductCount,
      productLimit: totalProductLimit || null,
    },
    paymentSettings: await getSubscriptionPaymentSettings(),
  };
}

export async function assertCanCreateStore(ownerId) {
  const seller = await Seller.findById(ownerId).select("businessModel").lean();
  if (seller?.businessModel !== BUSINESS_MODEL.SUBSCRIPTION) return;

  const active = await getActiveSubscriptionForSeller(ownerId);
  if (!active) {
    const err = new Error("Active subscription required to create shops");
    err.statusCode = 403;
    throw err;
  }

  const limit = Number(active.planSnapshot?.shopCount || 0);
  const currentCount = await Store.countDocuments({ ownerId });
  if (limit > 0 && currentCount >= limit) {
    const err = new Error(`Shop limit reached (${limit}). Upgrade your subscription plan.`);
    err.statusCode = 403;
    throw err;
  }
}

export async function assertCanPublishProduct(storeId, additionalCount = 1) {
  const store = await Store.findById(storeId).select("ownerId").lean();
  if (!store?.ownerId) return;

  const seller = await Seller.findById(store.ownerId).select("businessModel").lean();
  if (seller?.businessModel !== BUSINESS_MODEL.SUBSCRIPTION) return;

  const active = await getActiveSubscriptionForSeller(store.ownerId);
  if (!active) {
    const err = new Error("Active subscription required to publish products");
    err.statusCode = 403;
    throw err;
  }

  const perShop = Number(active.planSnapshot?.productCountPerShop || 0);
  if (perShop <= 0) return;

  const publishedCount = await Product.countDocuments({
    sellerId: storeId,
    status: "active",
    isPublished: { $ne: false },
  });

  if (publishedCount + additionalCount > perShop) {
    const err = new Error(
      `Product limit reached for this shop (${perShop}). Upgrade your subscription plan.`,
    );
    err.statusCode = 403;
    throw err;
  }
}

export async function createSubscriptionPaymentRequest({
  sellerId,
  planId,
  paymentMethod,
  transactionRef,
  proofDocumentUrl,
  sellerNote,
  requestType = PAYMENT_REQUEST_TYPE.NEW,
}) {
  const plan = await SubscriptionPlan.findOne({ _id: planId, isActive: true }).lean();
  if (!plan) {
    const err = new Error("Subscription plan not found or inactive");
    err.statusCode = 404;
    throw err;
  }

  const existingPending = await SubscriptionPaymentRequest.findOne({
    sellerId,
    status: PAYMENT_REQUEST_STATUS.PENDING,
  }).lean();
  if (existingPending) {
    const err = new Error("You already have a pending payment request");
    err.statusCode = 400;
    throw err;
  }

  const active = await getActiveSubscriptionForSeller(sellerId);
  const resolvedType = resolveSubscriptionRequestType({
    activeSubscription: active,
    selectedPlan: plan,
    explicitType: requestType,
  });

  const request = await SubscriptionPaymentRequest.create({
    sellerId,
    planId: plan._id,
    requestType: resolvedType,
    amount: plan.price,
    paymentMethod: paymentMethod || "bank_transfer",
    transactionRef: String(transactionRef || "").trim(),
    proofDocumentUrl: proofDocumentUrl || "",
    sellerNote: String(sellerNote || "").trim(),
    planSnapshot: buildPlanSnapshot(plan),
    status: PAYMENT_REQUEST_STATUS.PENDING,
  });

  await Seller.findByIdAndUpdate(sellerId, {
    businessModel: BUSINESS_MODEL.SUBSCRIPTION,
    businessModelChosenAt: new Date(),
  });

  return request;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + Number(days || 0));
  return result;
}

export async function activateSubscriptionFromPaymentRequest(request) {
  const plan = await SubscriptionPlan.findById(request.planId).lean();
  if (!plan) {
    throw new Error("Plan not found for payment request");
  }

  const now = new Date();
  const existingActive = await getActiveSubscriptionForSeller(request.sellerId);
  let periodStart = now;
  let periodEnd = addDays(now, plan.durationDays);

  if (
    existingActive
    && request.requestType === PAYMENT_REQUEST_TYPE.RENEWAL
    && existingActive.currentPeriodEnd > now
  ) {
    periodStart = existingActive.currentPeriodStart || now;
    periodEnd = addDays(existingActive.currentPeriodEnd, plan.durationDays);
  } else if (
    existingActive
    && request.requestType === PAYMENT_REQUEST_TYPE.UPGRADE
    && existingActive.currentPeriodEnd > now
  ) {
    periodStart = existingActive.currentPeriodStart || now;
    periodEnd = existingActive.currentPeriodEnd;
  }

  let subscription;
  if (existingActive) {
    subscription = await SellerSubscription.findByIdAndUpdate(
      existingActive._id,
      {
        planId: plan._id,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        planSnapshot: buildPlanSnapshot(plan),
        activatedAt: existingActive.activatedAt || now,
        expiredAt: null,
        lastPaymentRequestId: request._id,
      },
      { new: true },
    );
  } else {
    subscription = await SellerSubscription.create({
      sellerId: request.sellerId,
      planId: plan._id,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      planSnapshot: buildPlanSnapshot(plan),
      activatedAt: now,
      lastPaymentRequestId: request._id,
    });
  }

  await Seller.findByIdAndUpdate(request.sellerId, {
    businessModel: BUSINESS_MODEL.SUBSCRIPTION,
    businessModelChosenAt: new Date(),
    "businessModelSwitch.status": "none",
  });

  await restoreSellerVisibility(request.sellerId);
  await enforceSubscriptionLimits(request.sellerId, subscription.planSnapshot);

  return subscription;
}

export async function restoreSellerVisibility(ownerId) {
  await Store.updateMany(
    {
      ownerId,
      isVerified: true,
      applicationStatus: "approved",
    },
    { $set: { isActive: true } },
  );
}

export function resolveSubscriptionRequestType({
  activeSubscription,
  selectedPlan,
  explicitType,
}) {
  if (!activeSubscription) {
    return PAYMENT_REQUEST_TYPE.NEW;
  }
  if (explicitType === PAYMENT_REQUEST_TYPE.UPGRADE || explicitType === PAYMENT_REQUEST_TYPE.RENEWAL) {
    return explicitType;
  }
  const currentPrice = Number(activeSubscription.planSnapshot?.price || 0);
  const currentSort = Number(activeSubscription.planSnapshot?.sortOrder || 0);
  const selectedPrice = Number(selectedPlan?.price || 0);
  const selectedSort = Number(selectedPlan?.sortOrder || 0);
  const isHigherTier = selectedPrice > currentPrice || selectedSort > currentSort;
  return isHigherTier ? PAYMENT_REQUEST_TYPE.UPGRADE : PAYMENT_REQUEST_TYPE.RENEWAL;
}

export async function enforceSubscriptionLimits(sellerId, planSnapshot) {
  const limits = planSnapshot || {};
  const shopLimit = Number(limits.shopCount || 0);
  const perShop = Number(limits.productCountPerShop || 0);

  const stores = await Store.find({ ownerId: sellerId })
    .sort({ createdAt: 1 })
    .select("_id isActive")
    .lean();

  if (shopLimit > 0 && stores.length > shopLimit) {
    const keepIds = stores.slice(0, shopLimit).map((s) => s._id);
    const disableIds = stores.slice(shopLimit).map((s) => s._id);
    await Store.updateMany({ _id: { $in: disableIds } }, { $set: { isActive: false } });
    await Store.updateMany(
      { _id: { $in: keepIds }, isVerified: true, applicationStatus: "approved" },
      { $set: { isActive: true } },
    );
  }

  if (perShop > 0) {
    const activeStoreIds = stores.slice(0, shopLimit || stores.length).map((s) => s._id);
    for (const storeId of activeStoreIds) {
      const products = await Product.find({
        sellerId: storeId,
        status: "active",
        isPublished: { $ne: false },
      })
        .sort({ createdAt: 1 })
        .select("_id")
        .lean();

      if (products.length > perShop) {
        const unpublishIds = products.slice(perShop).map((p) => p._id);
        await Product.updateMany({ _id: { $in: unpublishIds } }, { $set: { isPublished: false } });
      }
    }
  }
}

export async function hideSellerOnExpiry(ownerId) {
  const stores = await Store.find({ ownerId }).select("_id").lean();
  const storeIds = stores.map((s) => s._id);

  await Store.updateMany({ ownerId }, { $set: { isActive: false } });

  if (storeIds.length) {
    await Product.updateMany(
      { sellerId: { $in: storeIds } },
      { $set: { isPublished: false } },
    );
  }
}

export async function activateSubscriptionFromPhonePePayment({
  sellerId,
  planId,
  requestType = PAYMENT_REQUEST_TYPE.NEW,
  gatewayOrderId,
  amount,
}) {
  const plan = await SubscriptionPlan.findById(planId).lean();
  if (!plan) {
    throw new Error("Plan not found for subscription payment");
  }

  const active = await getActiveSubscriptionForSeller(sellerId);
  const resolvedType = resolveSubscriptionRequestType({
    activeSubscription: active,
    selectedPlan: plan,
    explicitType: requestType,
  });

  const request = await SubscriptionPaymentRequest.create({
    sellerId,
    planId: plan._id,
    requestType: resolvedType,
    amount: Number(amount ?? plan.price),
    paymentMethod: "phonepe",
    transactionRef: String(gatewayOrderId || ""),
    proofDocumentUrl: "",
    sellerNote: "Auto-approved via PhonePe",
    planSnapshot: buildPlanSnapshot(plan),
    status: PAYMENT_REQUEST_STATUS.APPROVED,
    reviewedAt: new Date(),
  });

  const subscription = await activateSubscriptionFromPaymentRequest(request);
  return { request, subscription };
}

export async function approvePaymentRequest(requestId, adminId) {
  const request = await SubscriptionPaymentRequest.findById(requestId);
  if (!request) {
    const err = new Error("Payment request not found");
    err.statusCode = 404;
    throw err;
  }
  if (request.status !== PAYMENT_REQUEST_STATUS.PENDING) {
    const err = new Error("Payment request is not pending");
    err.statusCode = 400;
    throw err;
  }

  request.status = PAYMENT_REQUEST_STATUS.APPROVED;
  request.reviewedAt = new Date();
  request.reviewedBy = adminId;
  await request.save();

  const subscription = await activateSubscriptionFromPaymentRequest(request);
  return { request, subscription };
}

export async function rejectPaymentRequest(requestId, adminId, rejectionReason = "") {
  const request = await SubscriptionPaymentRequest.findById(requestId);
  if (!request) {
    const err = new Error("Payment request not found");
    err.statusCode = 404;
    throw err;
  }
  if (request.status !== PAYMENT_REQUEST_STATUS.PENDING) {
    const err = new Error("Payment request is not pending");
    err.statusCode = 400;
    throw err;
  }

  request.status = PAYMENT_REQUEST_STATUS.REJECTED;
  request.reviewedAt = new Date();
  request.reviewedBy = adminId;
  request.rejectionReason = String(rejectionReason || "").trim();
  await request.save();
  return request;
}

export async function expireDueSubscriptions() {
  const now = new Date();
  const due = await SellerSubscription.find({
    status: SUBSCRIPTION_STATUS.ACTIVE,
    currentPeriodEnd: { $lte: now },
  }).lean();

  let expiredCount = 0;
  for (const sub of due) {
    await SellerSubscription.updateOne(
      { _id: sub._id },
      {
        $set: {
          status: SUBSCRIPTION_STATUS.EXPIRED,
          expiredAt: now,
        },
      },
    );
    await hideSellerOnExpiry(sub.sellerId);
    expiredCount += 1;
  }
  return expiredCount;
}

export async function listActivePlans() {
  return SubscriptionPlan.find({ isActive: true })
    .sort({ sortOrder: 1, price: 1 })
    .lean();
}
