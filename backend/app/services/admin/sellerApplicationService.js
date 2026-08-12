import Store from "../../models/store.js";
import Seller from "../../models/seller.js";
import {
  escapeRegExp,
  formatSellerApplication,
  formatSellerDocuments,
} from "./shared/sellerAdminUtils.js";
import { emitNotificationEvent } from "../../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../../modules/notifications/notification.constants.js";
import { sendVendorWelcomeEmail, sendSellerInviteEmail } from "../emailService.js";
import SellerInvite from "../../models/sellerInvite.js";
import { recordAuditLog } from "../auditTrailService.js";

function buildPendingStoreQuery(normalizedStatus) {
  if (normalizedStatus === "pending") {
    return {
      isVerified: { $ne: true },
      $or: [
        { applicationStatus: "pending" },
        { applicationStatus: { $exists: false } },
        { applicationStatus: null },
      ],
    };
  }

  if (normalizedStatus !== "all") {
    return {
      isVerified: { $ne: true },
      applicationStatus: normalizedStatus,
    };
  }

  return { isVerified: { $ne: true } };
}

function buildPendingOwnerQuery(normalizedStatus) {
  const base = {
    accountType: "owner",
    $or: [{ parentId: { $exists: false } }, { parentId: null }],
  };

  const hasExplicitApprovalState = {
    $or: [
      { applicationStatus: { $exists: true, $nin: [null, ""] } },
      { isVerified: { $exists: true } },
    ],
  };

  if (normalizedStatus === "pending") {
    return {
      ...base,
      $and: [
        hasExplicitApprovalState,
        { isVerified: { $ne: true } },
        {
          $or: [
            { applicationStatus: "pending" },
            { applicationStatus: { $exists: false } },
            { applicationStatus: null },
          ],
        },
      ],
    };
  }

  if (normalizedStatus !== "all") {
    return {
      ...base,
      isVerified: { $ne: true },
      applicationStatus: normalizedStatus,
    };
  }

  return {
    ...base,
    isVerified: { $ne: true },
  };
}

function applySearchFilter(conditions, search, fields) {
  const normalizedSearch = String(search || "").trim();
  if (!normalizedSearch) return;

  const regex = new RegExp(escapeRegExp(normalizedSearch), "i");
  conditions.push({
    $or: fields.map((field) => ({ [field]: regex })),
  });
}

export async function getPendingSellerApplications({
  q = "",
  status = "pending",
  page,
  limit,
  skip,
}) {
  const normalizedStatus = String(status || "pending").trim().toLowerCase();

  const storeConditions = [buildPendingStoreQuery(normalizedStatus)];
  applySearchFilter(storeConditions, q, ["shopName", "address", "category"]);

  const ownerConditions = [buildPendingOwnerQuery(normalizedStatus)];
  applySearchFilter(ownerConditions, q, ["name", "email", "phone"]);

  const storeQuery = storeConditions.length > 1 ? { $and: storeConditions } : storeConditions[0];
  const ownerQuery = ownerConditions.length > 1 ? { $and: ownerConditions } : ownerConditions[0];

  const [stores, owners, allPendingStores, allPendingOwners] = await Promise.all([
    Store.find(storeQuery)
      .sort({ createdAt: -1 })
      .populate("ownerId", "name email phone businessModel")
      .lean(),
    Seller.find(ownerQuery)
      .sort({ createdAt: -1 })
      .lean(),
    Store.find(buildPendingStoreQuery("pending"))
      .select("address documents createdAt")
      .lean(),
    Seller.find(buildPendingOwnerQuery("pending"))
      .select("createdAt")
      .lean(),
  ]);

  const mergedRaw = [
    ...owners.map((account) => ({ ...account, applicationType: "seller_admin" })),
    ...stores.map((store) => ({ ...store, applicationType: "store" })),
  ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const total = mergedRaw.length;
  const paginated = mergedRaw.slice(skip, skip + limit);

  const items = paginated.map((entry) => {
    if (entry.applicationType === "seller_admin") {
      return formatSellerApplication(entry);
    }

    const owner = entry.ownerId || {};
    return formatSellerApplication({
      ...entry,
      name: owner.name || "Unnamed Owner",
      email: owner.email || "",
      phone: owner.phone || "",
      businessModel: owner.businessModel || "",
      ownerId: owner._id ? String(owner._id) : "",
    });
  });

  const totalApplications = allPendingStores.length + allPendingOwners.length;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const receivedToday = [...allPendingStores, ...allPendingOwners].filter(
    (entry) => entry.createdAt && new Date(entry.createdAt) >= todayStart,
  ).length;

  const missingInfo = allPendingStores.filter((store) => {
    const docs = formatSellerDocuments(store.documents);
    return !store.address || docs.length < 3;
  }).length;

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
    stats: {
      totalApplications,
      receivedToday,
      missingInfo,
      avgReviewTimeHours: 24,
    },
  };
}

export async function approveSellerApplicationById({
  sellerId,
  reviewedBy,
  businessModel = "commission",
  commissionConfig = {},
  subscriptionPlanId = null,
}) {
  const storeUpdateData = {
    isVerified: true,
    isActive: true,
    isOpen: true,
    applicationStatus: "approved",
    reviewedAt: new Date(),
    reviewedBy,
    rejectionReason: null,
  };

  if (businessModel === "commission" || commissionConfig?.applyCommission !== undefined) {
    storeUpdateData.applyCommission = Boolean(commissionConfig.applyCommission);
    storeUpdateData.adminCommissionType = commissionConfig.adminCommissionType || "percentage";
    storeUpdateData.adminCommissionValue = Number(commissionConfig.adminCommissionValue ?? 0);
    storeUpdateData.adminCommissionFixedRule = commissionConfig.adminCommissionFixedRule || "per_qty";
    storeUpdateData.adminCommission = Number(commissionConfig.adminCommissionValue ?? 0);
  }

  const store = await Store.findByIdAndUpdate(
    sellerId,
    { $set: storeUpdateData },
    { new: true }
  ).populate("ownerId", "name email phone");

  let ownerId = store ? (store.ownerId?._id || store.ownerId) : sellerId;

  const account = await Seller.findOneAndUpdate(
    {
      _id: ownerId,
      accountType: "owner",
    },
    {
      $set: {
        isVerified: true,
        isActive: true,
        applicationStatus: "approved",
        reviewedAt: new Date(),
        reviewedBy,
        rejectionReason: null,
        businessModel: businessModel || "commission",
        businessModelChosenAt: new Date(),
      },
    },
    { new: true }
  );

  if (account && businessModel === "subscription" && subscriptionPlanId) {
    try {
      const { assignComplimentarySubscription } = await import("../subscriptionService.js");
      await assignComplimentarySubscription({
        sellerId: account._id,
        planId: subscriptionPlanId,
        adminId: reviewedBy,
        note: "Assigned by admin during seller approval",
      });
    } catch (err) {
      console.warn("Failed to assign subscription during approval:", err.message);
    }
  }

  void recordAuditLog({
    actorId: reviewedBy,
    action: "SELLER_APPLICATION_APPROVED",
    targetType: store ? "Store" : "Seller",
    targetId: store ? store._id : ownerId,
    after: { applicationStatus: "approved", businessModel },
    metadata: { subscriptionPlanId },
  });

  if (store) {
    const owner = store.ownerId || {};
    emitNotificationEvent(NOTIFICATION_EVENTS.STORE_APPLICATION_APPROVED, {
      sellerId: owner._id || store.ownerId,
      shopName: store.shopName,
    }).catch(() => {});
    if (owner.email) {
      sendVendorWelcomeEmail({
        email: owner.email,
        name: owner.name || "Seller Partner",
        storeName: store.shopName,
      }).catch(() => {});
    }
    return formatSellerApplication({
      ...store.toObject(),
      applicationType: "store",
      name: owner.name || "Unnamed Owner",
      email: owner.email || "",
      phone: owner.phone || "",
    });
  }

  if (!account) {
    return null;
  }

  emitNotificationEvent(NOTIFICATION_EVENTS.SELLER_ACCOUNT_APPROVED, {
    sellerId: account._id,
  }).catch(() => {});

  if (account.email) {
    sendVendorWelcomeEmail({
      email: account.email,
      name: account.name || "Seller Partner",
    }).catch(() => {});
  }

  return formatSellerApplication({
    ...account.toObject(),
    applicationType: "seller_admin",
  });
}

/**
 * Creates a new vendor/seller account directly from Admin Panel and dispatches welcome email with credentials.
 */
export async function createVendorAccountByAdmin({
  name,
  email,
  phone,
  password,
  shopName,
  category,
  categories,
  description,
  address,
  locality,
  city,
  state,
  pincode,
  serviceRadius,
  lat,
  lng,
  aadharNumber,
  panNumber,
  gstNumber,
  packagingCharge,
  packagingChargeEnabled,
  accountHolder,
  accountNumber,
  ifsc,
  bankName,
  deliveryPolicy,
  reviewedBy,
  businessModel = "commission",
  applyCommission,
  adminCommissionType,
  adminCommissionValue,
  adminCommissionFixedRule,
  commissionConfig,
  subscriptionPlanId,
}) {
  const existingSeller = await Seller.findOne({
    $or: [{ email: email.toLowerCase() }, { phone }],
  });

  if (existingSeller) {
    throw new Error("Seller with this email or phone already exists");
  }

  const generatedPassword = password || Math.random().toString(36).slice(-8) + "@Gb1";

  const seller = await Seller.create({
    name,
    email: email.toLowerCase(),
    phone,
    password: generatedPassword,
    accountType: "owner",
    role: "seller",
    isVerified: true,
    isActive: true,
    applicationStatus: "approved",
    reviewedAt: new Date(),
    reviewedBy,
    businessModel: businessModel || "commission",
    businessModelChosenAt: new Date(),
  });

  if (seller && businessModel === "subscription" && subscriptionPlanId) {
    try {
      const { assignComplimentarySubscription } = await import("../subscriptionService.js");
      await assignComplimentarySubscription({
        sellerId: seller._id,
        planId: subscriptionPlanId,
        adminId: reviewedBy,
        note: "Assigned by admin during vendor account creation",
      });
    } catch (err) {
      console.warn("Failed to assign subscription during vendor creation:", err.message);
    }
  }

  let store = null;
  if (shopName) {
    const formattedCategories = Array.isArray(categories)
      ? categories
      : (typeof categories === 'string' && categories.trim())
        ? categories.split(',').map((c) => c.trim())
        : category ? [category] : ["General"];

    const coordinates = (lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng)))
      ? [Number(lng), Number(lat)]
      : [0, 0];

    const isApplyCommission = applyCommission !== undefined 
      ? Boolean(applyCommission) 
      : commissionConfig?.applyCommission !== undefined 
        ? Boolean(commissionConfig.applyCommission) 
        : Boolean(deliveryPolicy?.applyCommission);

    const commType = adminCommissionType || commissionConfig?.adminCommissionType || "percentage";
    const commValue = Number(adminCommissionValue ?? commissionConfig?.adminCommissionValue ?? 0);
    const commRule = adminCommissionFixedRule || commissionConfig?.adminCommissionFixedRule || "per_qty";

    store = await Store.create({
      ownerId: seller._id,
      shopName,
      category: category || formattedCategories[0] || "General",
      categories: formattedCategories,
      description: description || "",
      address: address || "",
      locality: locality || "",
      city: city || "",
      state: state || "",
      pincode: pincode || "",
      location: {
        type: "Point",
        coordinates,
      },
      serviceRadius: Number(serviceRadius) || 5,
      aadharNumber: aadharNumber || "",
      panNumber: panNumber ? String(panNumber).toUpperCase().trim() : "",
      gstNumber: gstNumber ? String(gstNumber).toUpperCase().trim() : "",
      packagingCharge: Number(packagingCharge) || 0,
      packagingChargeEnabled: Boolean(packagingChargeEnabled),
      applyCommission: isApplyCommission,
      adminCommissionType: commType,
      adminCommissionValue: commValue,
      adminCommissionFixedRule: commRule,
      adminCommission: commValue,
      accountHolder: accountHolder || "",
      accountNumber: accountNumber || "",
      ifsc: ifsc ? String(ifsc).toUpperCase().trim() : "",
      bankName: bankName || "",
      deliveryPolicy: {
        customerPickup: Boolean(deliveryPolicy?.customerPickup),
        sellerDelivery: Boolean(deliveryPolicy?.sellerDelivery),
        platformLogistics: deliveryPolicy?.platformLogistics !== undefined ? Boolean(deliveryPolicy.platformLogistics) : true,
        autoSwitchToPlatform: Boolean(deliveryPolicy?.autoSwitchToPlatform),
        platformLogisticsEnabledByAdmin: true,
      },
      isVerified: true,
      isActive: true,
      isOpen: true,
      applicationStatus: "approved",
    });
  }

  sendVendorWelcomeEmail({
    email: seller.email,
    name: seller.name,
    password: generatedPassword,
    storeName: shopName || "",
  }).catch(() => {});

  return {
    seller: {
      id: seller._id,
      name: seller.name,
      email: seller.email,
      phone: seller.phone,
    },
    store: store ? { id: store._id, shopName: store.shopName } : null,
    credentials: {
      email: seller.email,
      password: generatedPassword,
    },
  };
}

/**
 * Updates full store / shop profile on behalf of seller by Super Admin.
 */
export async function updateStoreSetupByAdmin(sellerOrStoreId, storePayload = {}) {
  let store = await Store.findById(sellerOrStoreId);
  if (!store) {
    store = await Store.findOne({ ownerId: sellerOrStoreId });
  }

  if (!store) {
    throw new Error("Store profile not found for this seller");
  }

  const updateFields = {};
  const allowed = [
    "shopName", "description", "category", "categories", "address", "locality",
    "city", "state", "pincode", "serviceRadius", "packagingCharge",
    "packagingChargeEnabled", "isOpen", "isActive", "accountHolder",
    "accountNumber", "ifsc", "bankName", "gstNumber", "panNumber", "isVerified",
    "banners", "storeVideo", "logoUrl", "excludeFromAlternatives"
  ];

  allowed.forEach((key) => {
    if (storePayload[key] !== undefined) {
      updateFields[key] = storePayload[key];
    }
  });

  if (storePayload.lat != null && storePayload.lng != null && !isNaN(Number(storePayload.lat)) && !isNaN(Number(storePayload.lng))) {
    updateFields.location = {
      type: "Point",
      coordinates: [Number(storePayload.lng), Number(storePayload.lat)],
    };
  }

  if (storePayload.schedulingSettings) {
    updateFields.schedulingSettings = storePayload.schedulingSettings;
  }

  const updatedStore = await Store.findByIdAndUpdate(
    store._id,
    { $set: updateFields },
    { new: true, runValidators: true }
  );

  return updatedStore;
}

/**
 * Resends credentials and portal links via email to seller.
 */
export async function resendSellerCredentialsByAdmin(sellerOrStoreId) {
  let seller = await Seller.findById(sellerOrStoreId);
  let store = null;
  if (!seller) {
    store = await Store.findById(sellerOrStoreId);
    if (store) {
      seller = await Seller.findById(store.ownerId);
    }
  } else {
    store = await Store.findOne({ ownerId: seller._id });
  }

  if (!seller) {
    throw new Error("Seller account not found");
  }

  const res = await sendVendorWelcomeEmail({
    email: seller.email,
    name: seller.name,
    password: null, // Prompt to use registered password / reset link
    storeName: store ? store.shopName : "",
  });

  return { sellerId: seller._id, email: seller.email, dispatch: res };
}

export async function rejectSellerApplicationById({
  sellerId,
  reviewedBy,
  reason,
}) {
  const store = await Store.findByIdAndUpdate(
    sellerId,
    {
      $set: {
        isVerified: false,
        isActive: false,
        applicationStatus: "rejected",
        reviewedAt: new Date(),
        reviewedBy,
        rejectionReason: reason || "",
      },
    },
    { new: true },
  ).populate("ownerId", "name email phone");

  if (store) {
    void recordAuditLog({
      actorId: reviewedBy,
      action: "SELLER_APPLICATION_REJECTED",
      targetType: "Store",
      targetId: store._id,
      after: { applicationStatus: "rejected" },
      metadata: { reason: reason || "" },
    });
    const owner = store.ownerId || {};
    emitNotificationEvent(NOTIFICATION_EVENTS.STORE_APPLICATION_REJECTED, {
      sellerId: owner._id || store.ownerId,
      shopName: store.shopName,
      reason: reason || "",
    }).catch(() => {});
    return formatSellerApplication({
      ...store.toObject(),
      applicationType: "store",
      name: owner.name || "Unnamed Owner",
      email: owner.email || "",
      phone: owner.phone || "",
    });
  }

  const account = await Seller.findOneAndUpdate(
    {
      _id: sellerId,
      accountType: "owner",
      $or: [{ parentId: { $exists: false } }, { parentId: null }],
    },
    {
      $set: {
        isVerified: false,
        isActive: false,
        applicationStatus: "rejected",
        reviewedAt: new Date(),
        reviewedBy,
        rejectionReason: reason || "",
      },
    },
    { new: true },
  );

  if (!account) {
    return null;
  }

  void recordAuditLog({
    actorId: reviewedBy,
    action: "SELLER_APPLICATION_REJECTED",
    targetType: "Seller",
    targetId: account._id,
    after: { applicationStatus: "rejected" },
    metadata: { reason: reason || "" },
  });

  emitNotificationEvent(NOTIFICATION_EVENTS.SELLER_ACCOUNT_REJECTED, {
    sellerId: account._id,
    reason: reason || "",
  }).catch(() => {});

  return formatSellerApplication({
    ...account.toObject(),
    applicationType: "seller_admin",
  });
}

/**
 * Invite a prospective seller to apply — before any Seller account exists.
 * Distinct from resendSellerCredentialsByAdmin, which re-sends credentials
 * for an already-created account.
 */
export async function inviteSellerByAdmin({ email, phone = "", invitedBy }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    const err = new Error("Email is required to send an invite");
    err.statusCode = 400;
    throw err;
  }

  const existingSeller = await Seller.findOne({ email: normalizedEmail }).select("_id").lean();
  if (existingSeller) {
    const err = new Error("A seller account with this email already exists");
    err.statusCode = 409;
    throw err;
  }

  const invite = await SellerInvite.create({
    email: normalizedEmail,
    phone: String(phone || "").trim(),
    invitedBy,
  });

  const baseUrl = process.env.FRONTEND_URL || "https://grandbazar.com";
  const inviteLink = `${baseUrl.replace(/\/$/, "")}/seller/auth?invite=${invite.token}`;

  const emailResult = await sendSellerInviteEmail({ email: normalizedEmail, inviteLink });

  return { invite: invite.toObject(), emailDispatched: Boolean(emailResult?.success) };
}

export async function listSellerInvitesByAdmin({ status } = {}) {
  const query = {};
  if (status) query.status = status;
  const now = new Date();
  // Lazily flip anything past its expiry rather than running a separate job
  // for what's a low-volume, read-mostly list.
  await SellerInvite.updateMany(
    { status: "pending", expiresAt: { $lt: now } },
    { $set: { status: "expired" } },
  );
  return SellerInvite.find(query).sort({ createdAt: -1 }).limit(200).lean();
}

/**
 * Validates an invite token for the public signup page (no auth) — returns
 * just enough to pre-fill the form, never the full invite record.
 */
export async function validateSellerInviteToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return { valid: false };

  const invite = await SellerInvite.findOne({ token: raw });
  if (!invite) return { valid: false };
  if (invite.status === "used") return { valid: false, reason: "already_used" };
  if (invite.status === "expired" || invite.expiresAt < new Date()) {
    if (invite.status !== "expired") {
      await SellerInvite.updateOne({ _id: invite._id }, { $set: { status: "expired" } });
    }
    return { valid: false, reason: "expired" };
  }

  return { valid: true, email: invite.email, phone: invite.phone };
}

/** Marks an invite used once the invited prospect completes signup. */
export async function markSellerInviteUsed(token, sellerId) {
  const raw = String(token || "").trim();
  if (!raw) return;
  await SellerInvite.updateOne(
    { token: raw, status: "pending" },
    { $set: { status: "used", usedAt: new Date(), resultingSeller: sellerId } },
  );
}
