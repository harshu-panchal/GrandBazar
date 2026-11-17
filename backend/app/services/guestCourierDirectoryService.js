import mongoose from "mongoose";
import GuestCourierProfile from "../models/guestCourierProfile.js";
import GuestCourierAssignment from "../models/guestCourierAssignment.js";

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSearchTerm(value) {
  return String(value || "").replace(/[^\d+]/g, "").slice(0, 20);
}

export async function saveGuestCourierProfile(courier, actorId, storeId = null, actorRole = "admin") {
  const now = new Date();
  const update = {
    $set: {
      name: courier.name,
      email: courier.email,
      status: "active",
      lastAssignedAt: now,
      updatedByActor: actorId,
      updatedByRole: actorRole,
    },
    $setOnInsert: {
      phone: courier.phone,
      createdByActor: actorId,
      createdByRole: actorRole,
    },
    $inc: { assignmentCount: 1 },
  };
  if (["admin", "superadmin"].includes(actorRole)) {
    update.$set.updatedByAdmin = actorId;
    update.$setOnInsert.createdByAdmin = actorId;
  }
  if (storeId) update.$addToSet = { stores: storeId };

  try {
    return await GuestCourierProfile.findOneAndUpdate(
      { phone: courier.phone },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    // Two users can assign the same new phone at the same moment. The unique
    // phone index picks a winner; the loser safely updates that same profile.
    if (error?.code !== 11000) throw error;
    const retryUpdate = {
      $set: {
        name: courier.name,
        email: courier.email,
        status: "active",
        lastAssignedAt: now,
        updatedByActor: actorId,
        updatedByRole: actorRole,
      },
      $inc: { assignmentCount: 1 },
    };
    if (["admin", "superadmin"].includes(actorRole)) retryUpdate.$set.updatedByAdmin = actorId;
    if (storeId) retryUpdate.$addToSet = { stores: storeId };
    return GuestCourierProfile.findOneAndUpdate(
      { phone: courier.phone },
      retryUpdate,
      { new: true },
    );
  }
}

export async function searchGuestCourierDirectory(phoneQuery, requestedLimit = 10, storeIds = null) {
  const term = normalizeSearchTerm(phoneQuery);
  if (term.replace(/\D/g, "").length < 3) return [];
  const limit = Math.min(Math.max(Number(requestedLimit) || 10, 1), 20);
  const phonePattern = new RegExp(escapeRegex(term), "i");

  const scopedStoreIds = Array.isArray(storeIds)
    ? storeIds.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id))
    : null;
  const historyPipeline = [
      { $match: { "courier.phone": phonePattern } },
  ];
  if (scopedStoreIds) historyPipeline.push(
    { $lookup: { from: "orders", localField: "order", foreignField: "_id", as: "scopedOrder" } },
    { $match: { "scopedOrder.seller": { $in: scopedStoreIds } } },
  );
  historyPipeline.push(
      { $sort: { assignedAt: -1, createdAt: -1 } },
      {
        $group: {
          _id: "$courier.phone",
          name: { $first: "$courier.name" },
          email: { $first: "$courier.email" },
          lastAssignedAt: { $first: "$assignedAt" },
          assignmentCount: { $sum: 1 },
        },
      },
      { $sort: { lastAssignedAt: -1 } },
      { $limit: limit },
  );

  const [profiles, historical] = await Promise.all([
    scopedStoreIds
      // Profiles are global by phone; scoped history preserves each seller's own saved name and email.
      ? Promise.resolve([])
      : GuestCourierProfile.find({ status: "active", phone: phonePattern })
        .sort({ lastAssignedAt: -1 })
        .limit(limit)
        .select("name phone email assignmentCount lastAssignedAt")
        .lean(),
    GuestCourierAssignment.aggregate(historyPipeline),
  ]);

  const results = new Map();
  for (const profile of profiles) {
    results.set(profile.phone, { ...profile, source: "directory" });
  }
  for (const item of historical) {
    if (!results.has(item._id)) {
      results.set(item._id, {
        name: item.name,
        phone: item._id,
        email: item.email,
        assignmentCount: item.assignmentCount,
        lastAssignedAt: item.lastAssignedAt,
        source: "history",
      });
    }
  }
  return [...results.values()]
    .sort((a, b) => new Date(b.lastAssignedAt || 0) - new Date(a.lastAssignedAt || 0))
    .slice(0, limit);
}
