import Store from "../../models/store.js";
import Seller from "../../models/seller.js";
import {
  escapeRegExp,
  formatSellerApplication,
  formatSellerDocuments,
} from "./shared/sellerAdminUtils.js";
import { emitNotificationEvent } from "../../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../../modules/notifications/notification.constants.js";

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
      .populate("ownerId", "name email phone")
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

export async function approveSellerApplicationById({ sellerId, reviewedBy }) {
  const store = await Store.findByIdAndUpdate(
    sellerId,
    {
      $set: {
        isVerified: true,
        isActive: true,
        applicationStatus: "approved",
        reviewedAt: new Date(),
        reviewedBy,
        rejectionReason: null,
      },
    },
    { new: true },
  ).populate("ownerId", "name email phone");

  if (store) {
    const owner = store.ownerId || {};
    emitNotificationEvent(NOTIFICATION_EVENTS.STORE_APPLICATION_APPROVED, {
      sellerId: owner._id || store.ownerId,
      shopName: store.shopName,
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
        isVerified: true,
        isActive: true,
        applicationStatus: "approved",
        reviewedAt: new Date(),
        reviewedBy,
        rejectionReason: null,
      },
    },
    { new: true },
  );

  if (!account) {
    return null;
  }

  emitNotificationEvent(NOTIFICATION_EVENTS.SELLER_ACCOUNT_APPROVED, {
    sellerId: account._id,
  }).catch(() => {});

  return formatSellerApplication({
    ...account.toObject(),
    applicationType: "seller_admin",
  });
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

  emitNotificationEvent(NOTIFICATION_EVENTS.SELLER_ACCOUNT_REJECTED, {
    sellerId: account._id,
    reason: reason || "",
  }).catch(() => {});

  return formatSellerApplication({
    ...account.toObject(),
    applicationType: "seller_admin",
  });
}
