import Store from "../../models/store.js";
import {
  escapeRegExp,
  formatSellerApplication,
  formatSellerDocuments,
} from "./shared/sellerAdminUtils.js";

export async function getPendingSellerApplications({
  q = "",
  status = "pending",
  page,
  limit,
  skip,
}) {
  const normalizedStatus = String(status || "pending").trim().toLowerCase();
  let baseStatusQuery = { isVerified: { $ne: true } };

  if (normalizedStatus === "pending") {
    baseStatusQuery = {
      isVerified: { $ne: true },
      $or: [
        { applicationStatus: "pending" },
        { applicationStatus: { $exists: false } },
        { applicationStatus: null },
      ],
    };
  } else if (normalizedStatus !== "all") {
    baseStatusQuery = {
      isVerified: { $ne: true },
      applicationStatus: normalizedStatus,
    };
  }

  const conditions = [baseStatusQuery];
  const search = String(q || "").trim();
  if (search) {
    const regex = new RegExp(escapeRegExp(search), "i");
    conditions.push({
      $or: [
        { shopName: regex },
        { address: regex },
        { category: regex },
      ],
    });
  }

  const query = conditions.length > 1 ? { $and: conditions } : conditions[0];

  const [stores, total, allPendingForStats] = await Promise.all([
    Store.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("ownerId", "name email phone")
      .lean(),
    Store.countDocuments(query),
    Store.find({
      isVerified: { $ne: true },
      $or: [
        { applicationStatus: "pending" },
        { applicationStatus: { $exists: false } },
      ],
    })
      .select("address documents createdAt")
      .lean(),
  ]);

  const items = stores.map((store) => {
    const owner = store.ownerId || {};
    return formatSellerApplication({
      ...store,
      name: owner.name || "Unnamed Owner",
      email: owner.email || "",
      phone: owner.phone || "",
      ownerId: owner._id ? String(owner._id) : "",
    });
  });

  const totalApplications = allPendingForStats.length;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const receivedToday = allPendingForStats.filter(
    (store) => store.createdAt && new Date(store.createdAt) >= todayStart,
  ).length;

  const missingInfo = allPendingForStats.filter((store) => {
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

  if (!store) {
    return null;
  }

  const owner = store.ownerId || {};
  return formatSellerApplication({
    ...store.toObject(),
    name: owner.name || "Unnamed Owner",
    email: owner.email || "",
    phone: owner.phone || "",
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

  if (!store) {
    return null;
  }

  const owner = store.ownerId || {};
  return formatSellerApplication({
    ...store.toObject(),
    name: owner.name || "Unnamed Owner",
    email: owner.email || "",
    phone: owner.phone || "",
  });
}
