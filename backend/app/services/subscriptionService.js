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

// ---------------------------------------------------------------------------
// Subscriptions are per STORE, not per seller account (see
// sellerBusinessModelService.js) — a seller with several shops can run each
// on a different plan, billed independently. Every function here is keyed by
// storeId. SellerSubscription/SellerSubscriptionPayment/
// SubscriptionPaymentRequest still carry a denormalized sellerId (derived
// from store.ownerId) purely for "all of this seller's billing" admin
// listings — it is never the authoritative key.
// ---------------------------------------------------------------------------

function buildPlanSnapshot(plan) {
  return {
    name: plan.name,
    productCountPerShop: plan.productCountPerShop,
    durationDays: plan.durationDays,
    price: plan.price,
    sortOrder: plan.sortOrder || 0,
    billingCycle: plan.billingCycle || "monthly",
  };
}

async function requireStore(storeId, select = "ownerId") {
  const store = await Store.findById(storeId).select(select).lean();
  if (!store) {
    const err = new Error("Store not found");
    err.statusCode = 404;
    throw err;
  }
  return store;
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

export async function getActiveSubscriptionForStore(storeId) {
  if (!storeId) return null;
  const now = new Date();
  return SellerSubscription.findOne({
    storeId,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    currentPeriodEnd: { $gt: now },
  })
    .sort({ currentPeriodEnd: -1 })
    .lean();
}

export async function isStoreSubscriptionOperational(storeId) {
  const store = await Store.findById(storeId).select("businessModel").lean();
  if (!store) return false;
  if (store.businessModel === BUSINESS_MODEL.COMMISSION) return true;
  if (store.businessModel === BUSINESS_MODEL.SUBSCRIPTION) {
    const active = await getActiveSubscriptionForStore(storeId);
    return Boolean(active);
  }
  return false;
}

export async function getSubscriptionOperationalStoreIds(storeIds = []) {
  const normalized = Array.from(
    new Set(storeIds.map((id) => String(id || "")).filter(Boolean)),
  );
  if (!normalized.length) return new Set();

  const stores = await Store.find({ _id: { $in: normalized } })
    .select("_id businessModel")
    .lean();

  const commissionIds = stores
    .filter((s) => s.businessModel === BUSINESS_MODEL.COMMISSION)
    .map((s) => String(s._id));

  const subscriptionStoreIds = stores
    .filter((s) => s.businessModel === BUSINESS_MODEL.SUBSCRIPTION)
    .map((s) => s._id);

  const now = new Date();
  const activeSubs = subscriptionStoreIds.length
    ? await SellerSubscription.find({
        storeId: { $in: subscriptionStoreIds },
        status: SUBSCRIPTION_STATUS.ACTIVE,
        currentPeriodEnd: { $gt: now },
      })
        .select("storeId")
        .lean()
    : [];

  const activeIds = activeSubs.map((s) => String(s.storeId));
  return new Set([...commissionIds, ...activeIds]);
}

export async function getStoreSubscriptionSummary(storeId) {
  const [active, pendingRequest, pendingPhonePePayment] = await Promise.all([
    getActiveSubscriptionForStore(storeId),
    SubscriptionPaymentRequest.findOne({
      storeId,
      status: PAYMENT_REQUEST_STATUS.PENDING,
    })
      .sort({ createdAt: -1 })
      .lean(),
    SellerSubscriptionPayment.findOne({
      storeId,
      status: { $in: [PAYMENT_STATUS.CREATED, PAYMENT_STATUS.PENDING] },
    })
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  let activePlan = null;
  if (active?.planId) {
    activePlan = await SubscriptionPlan.findById(active.planId).lean();
  }

  const publishedProductCount = await Product.countDocuments({
    sellerId: storeId,
    status: "active",
    isPublished: { $ne: false },
  });

  const limits = active?.planSnapshot || activePlan || {};
  const productLimit = Number(limits.productCountPerShop || 0) || null;

  return {
    activeSubscription: active,
    pendingPaymentRequest: pendingRequest,
    pendingPhonePePayment,
    usage: {
      publishedProductCount,
      productLimit,
    },
    paymentSettings: await getSubscriptionPaymentSettings(),
  };
}

export async function assertCanPublishProduct(storeId, additionalCount = 1) {
  const store = await requireStore(storeId, "businessModel").catch(() => null);
  if (!store || store.businessModel !== BUSINESS_MODEL.SUBSCRIPTION) return;

  const active = await getActiveSubscriptionForStore(storeId);
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

/**
 * Free-tier product cap for commission-model stores (checklist items 92-94).
 * Unlike `assertCanPublishProduct` (subscription-tier, hard block), this
 * limit's enforcement is itself admin-configurable via
 * Setting.freeTierEnforcementMode:
 *  - "soft" (default): publishing past it is always allowed, but line items
 *    sold by an over-limit commission-model store pay an admin-configurable
 *    commission surcharge on top of their normally-resolved rate.
 *  - "hard": creating further products is blocked once the limit is
 *    reached — see assertCanCreateFreeTierProduct below.
 * Computed live (not a stored flag) so it can never drift out of sync with
 * the store's actual published-product count.
 */
export async function resolveFreeTierStatus(storeId) {
  const store = await Store.findById(storeId).select("businessModel").lean();
  if (!store || store.businessModel !== BUSINESS_MODEL.COMMISSION) {
    return { applicable: false, isOverLimit: false, publishedCount: 0, limit: 0, surchargePercent: 0, enforcementMode: "soft" };
  }

  const settings = await Setting.findOne({})
    .select("freeTierProductLimit overLimitCommissionSurchargePercent freeTierEnforcementMode")
    .lean();
  const limit = Number(settings?.freeTierProductLimit ?? 30);
  const surchargePercent = Number(settings?.overLimitCommissionSurchargePercent ?? 5);
  const enforcementMode = settings?.freeTierEnforcementMode === "hard" ? "hard" : "soft";

  const publishedCount = await Product.countDocuments({
    sellerId: storeId,
    status: "active",
    isPublished: { $ne: false },
  });

  return {
    applicable: true,
    isOverLimit: limit > 0 && publishedCount > limit,
    publishedCount,
    limit,
    surchargePercent,
    enforcementMode,
  };
}

/**
 * Called from productController.createProduct. A no-op unless the admin has
 * switched freeTierEnforcementMode to "hard" — in soft mode (the default)
 * creation is never blocked, only surcharged at checkout (see
 * resolveFreeTierStatus above).
 */
export async function assertCanCreateFreeTierProduct(storeId) {
  const status = await resolveFreeTierStatus(storeId);
  if (!status.applicable || status.enforcementMode !== "hard") return status;
  if (status.limit > 0 && status.publishedCount >= status.limit) {
    const err = new Error(
      `Free product limit reached (${status.limit}). Choose a subscription plan to publish more products.`,
    );
    err.statusCode = 403;
    throw err;
  }
  return status;
}

export async function createSubscriptionPaymentRequest({
  storeId,
  planId,
  paymentMethod,
  transactionRef,
  proofDocumentUrl,
  sellerNote,
  requestType = PAYMENT_REQUEST_TYPE.NEW,
}) {
  const store = await requireStore(storeId, "ownerId");
  const plan = await SubscriptionPlan.findOne({ _id: planId, isActive: true }).lean();
  if (!plan) {
    const err = new Error("Subscription plan not found or inactive");
    err.statusCode = 404;
    throw err;
  }

  const existingPending = await SubscriptionPaymentRequest.findOne({
    storeId,
    status: PAYMENT_REQUEST_STATUS.PENDING,
  }).lean();
  if (existingPending) {
    const err = new Error("This shop already has a pending payment request");
    err.statusCode = 400;
    throw err;
  }

  const active = await getActiveSubscriptionForStore(storeId);
  const resolvedType = resolveSubscriptionRequestType({
    activeSubscription: active,
    selectedPlan: plan,
    explicitType: requestType,
  });

  const request = await SubscriptionPaymentRequest.create({
    sellerId: store.ownerId,
    storeId,
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

  await Store.findByIdAndUpdate(storeId, {
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
  const storeId = request.storeId;
  if (!storeId) {
    throw new Error("Payment request has no storeId (pre-migration row?)");
  }

  const now = new Date();
  const existingActive = await getActiveSubscriptionForStore(storeId);
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
      storeId,
      planId: plan._id,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      planSnapshot: buildPlanSnapshot(plan),
      activatedAt: now,
      lastPaymentRequestId: request._id,
    });
  }

  await Store.findByIdAndUpdate(storeId, {
    businessModel: BUSINESS_MODEL.SUBSCRIPTION,
    businessModelChosenAt: new Date(),
    "businessModelSwitch.status": "none",
  });

  await restoreStoreVisibility(storeId);
  await enforceSubscriptionLimits(storeId, subscription.planSnapshot);

  return subscription;
}

/** Re-activates ONE store (the one whose subscription just activated). */
export async function restoreStoreVisibility(storeId) {
  await Store.updateOne(
    { _id: storeId, isVerified: true, applicationStatus: "approved" },
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

/**
 * Keeps ONE store's published-product count within its new plan's limit.
 * Each store now has its own independent subscription — there is no more
 * "N shops covered by one plan" to enforce across an account.
 */
export async function enforceSubscriptionLimits(storeId, planSnapshot) {
  const perShop = Number(planSnapshot?.productCountPerShop || 0);
  if (perShop <= 0) return;

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

/** Deactivates ONE store + unpublishes its products when its subscription expires. */
export async function hideStoreOnExpiry(storeId) {
  await Store.updateOne({ _id: storeId }, { $set: { isActive: false } });
  await Product.updateMany(
    { sellerId: storeId },
    { $set: { isPublished: false } },
  );
}

export async function activateSubscriptionFromPhonePePayment({
  storeId,
  planId,
  requestType = PAYMENT_REQUEST_TYPE.NEW,
  gatewayOrderId,
  amount,
}) {
  const store = await requireStore(storeId, "ownerId");
  const plan = await SubscriptionPlan.findById(planId).lean();
  if (!plan) {
    throw new Error("Plan not found for subscription payment");
  }

  const active = await getActiveSubscriptionForStore(storeId);
  const resolvedType = resolveSubscriptionRequestType({
    activeSubscription: active,
    selectedPlan: plan,
    explicitType: requestType,
  });

  const request = await SubscriptionPaymentRequest.create({
    sellerId: store.ownerId,
    storeId,
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

/**
 * A ₹0 plan has nothing to pay — routing it through PhonePe checkout throws
 * ("Invalid plan price for payment", PhonePe rejects sub-₹1 amounts) since
 * that path assumes a real payment. Activates immediately instead, the same
 * way an approved manual/PhonePe payment does, just with no money involved.
 */
export async function activateFreeSubscriptionPlan({
  storeId,
  planId,
  requestType = PAYMENT_REQUEST_TYPE.NEW,
}) {
  const store = await requireStore(storeId, "ownerId");
  const plan = await SubscriptionPlan.findById(planId).lean();
  if (!plan) {
    const err = new Error("Subscription plan not found");
    err.statusCode = 404;
    throw err;
  }
  if (Number(plan.price) > 0) {
    const err = new Error("This plan requires payment");
    err.statusCode = 400;
    throw err;
  }

  const active = await getActiveSubscriptionForStore(storeId);
  const resolvedType = resolveSubscriptionRequestType({
    activeSubscription: active,
    selectedPlan: plan,
    explicitType: requestType,
  });

  const request = await SubscriptionPaymentRequest.create({
    sellerId: store.ownerId,
    storeId,
    planId: plan._id,
    requestType: resolvedType,
    amount: 0,
    paymentMethod: "free_plan",
    transactionRef: "",
    proofDocumentUrl: "",
    sellerNote: "Auto-approved — free plan, no payment required",
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
    if (sub.storeId) {
      await hideStoreOnExpiry(sub.storeId);
    }
    expiredCount += 1;
  }
  return expiredCount;
}

export async function listActivePlans() {
  return SubscriptionPlan.find({ isActive: true })
    .sort({ sortOrder: 1, price: 1 })
    .lean();
}

async function ensureFreePlan({
  productCountPerShop = 50,
  durationDays = 30,
} = {}) {
  let plan = await SubscriptionPlan.findOne({
    isActive: true,
    price: 0,
    name: { $regex: /^free$/i },
  }).lean();

  if (!plan) {
    plan = await SubscriptionPlan.findOne({ isActive: true, price: 0 })
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();
  }

  if (!plan) {
    plan = await SubscriptionPlan.create({
      name: "Free",
      description: "Complimentary plan assigned by admin",
      productCountPerShop: Math.max(1, Number(productCountPerShop) || 50),
      durationDays: Math.max(1, Number(durationDays) || 30),
      price: 0,
      isActive: true,
      sortOrder: 0,
      billingCycle: "monthly",
    });
    plan = plan.toObject ? plan.toObject() : plan;
  }

  return plan;
}

/**
 * Admin grants a free/complimentary subscription to ONE store.
 * Creates a Free plan (price 0) if none exists, unless planId is provided.
 */
export async function assignComplimentarySubscription({
  storeId,
  planId,
  durationDays,
  productCountPerShop,
  adminId,
  note = "",
} = {}) {
  if (!storeId) {
    const err = new Error("Store is required");
    err.statusCode = 400;
    throw err;
  }

  const store = await Store.findById(storeId).select("_id ownerId shopName").lean();
  if (!store) {
    const err = new Error("Store not found");
    err.statusCode = 404;
    throw err;
  }

  let plan;
  if (planId) {
    plan = await SubscriptionPlan.findById(planId).lean();
    if (!plan || plan.isActive === false) {
      const err = new Error("Selected plan not found or inactive");
      err.statusCode = 404;
      throw err;
    }
  } else {
    plan = await ensureFreePlan({ productCountPerShop, durationDays });
  }

  const days = Math.max(
    1,
    Number(durationDays) || Number(plan.durationDays) || 30,
  );
  const now = new Date();
  const periodEnd = addDays(now, days);
  const snapshot = {
    ...buildPlanSnapshot(plan),
    price: 0,
    durationDays: days,
  };

  const existingActive = await getActiveSubscriptionForStore(storeId);
  let subscription;

  if (existingActive) {
    subscription = await SellerSubscription.findByIdAndUpdate(
      existingActive._id,
      {
        planId: plan._id,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        planSnapshot: snapshot,
        activatedAt: existingActive.activatedAt || now,
        expiredAt: null,
        isComplimentary: true,
        grantedBy: adminId || null,
        grantNote: String(note || "").trim(),
        lastPaymentRequestId: null,
      },
      { new: true },
    );
  } else {
    subscription = await SellerSubscription.create({
      sellerId: store.ownerId,
      storeId,
      planId: plan._id,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      planSnapshot: snapshot,
      activatedAt: now,
      isComplimentary: true,
      grantedBy: adminId || null,
      grantNote: String(note || "").trim(),
    });
  }

  await Store.findByIdAndUpdate(storeId, {
    businessModel: BUSINESS_MODEL.SUBSCRIPTION,
    businessModelChosenAt: new Date(),
    "businessModelSwitch.status": "none",
  });

  await restoreStoreVisibility(storeId);
  await enforceSubscriptionLimits(storeId, snapshot);

  return {
    subscription,
    plan,
    store,
  };
}

export async function listComplimentarySubscriptions({ limit = 200 } = {}) {
  const subs = await SellerSubscription.find({ isComplimentary: true })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 200, 500))
    .lean();

  const storeIds = [...new Set(subs.map((s) => String(s.storeId)).filter(Boolean))];
  const planIds = [...new Set(subs.map((s) => String(s.planId)))];

  const [stores, plans] = await Promise.all([
    Store.find({ _id: { $in: storeIds } })
      .select("shopName ownerId businessModel")
      .lean(),
    SubscriptionPlan.find({ _id: { $in: planIds } })
      .select("name price durationDays productCountPerShop")
      .lean(),
  ]);

  const storeMap = new Map(stores.map((s) => [String(s._id), s]));
  const planMap = new Map(plans.map((p) => [String(p._id), p]));
  const now = new Date();

  return subs.map((sub) => ({
    ...sub,
    store: storeMap.get(String(sub.storeId)) || null,
    plan: planMap.get(String(sub.planId)) || null,
    isActiveNow:
      sub.status === SUBSCRIPTION_STATUS.ACTIVE
      && sub.currentPeriodEnd
      && new Date(sub.currentPeriodEnd) > now,
  }));
}

export async function listStoresForComplimentaryAssign() {
  return Store.find({
    applicationStatus: "approved",
    isActive: { $ne: false },
  })
    .select("shopName ownerId businessModel")
    .sort({ shopName: 1 })
    .limit(500)
    .lean();
}
