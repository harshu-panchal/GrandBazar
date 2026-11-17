import GuestCourierProfile from "../models/guestCourierProfile.js";
import GuestCourierAssignment from "../models/guestCourierAssignment.js";

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSearchTerm(value) {
  return String(value || "").replace(/[^\d+]/g, "").slice(0, 20);
}

export async function saveGuestCourierProfile(courier, adminId) {
  const now = new Date();
  const update = {
    $set: {
      name: courier.name,
      email: courier.email,
      status: "active",
      lastAssignedAt: now,
      updatedByAdmin: adminId,
    },
    $setOnInsert: {
      phone: courier.phone,
      createdByAdmin: adminId,
    },
    $inc: { assignmentCount: 1 },
  };

  try {
    return await GuestCourierProfile.findOneAndUpdate(
      { phone: courier.phone },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    // Two admins can assign the same new phone at the same moment. The unique
    // phone index picks a winner; the loser safely updates that same profile.
    if (error?.code !== 11000) throw error;
    return GuestCourierProfile.findOneAndUpdate(
      { phone: courier.phone },
      {
        $set: {
          name: courier.name,
          email: courier.email,
          status: "active",
          lastAssignedAt: now,
          updatedByAdmin: adminId,
        },
        $inc: { assignmentCount: 1 },
      },
      { new: true },
    );
  }
}

export async function searchGuestCourierDirectory(phoneQuery, requestedLimit = 10) {
  const term = normalizeSearchTerm(phoneQuery);
  if (term.replace(/\D/g, "").length < 3) return [];
  const limit = Math.min(Math.max(Number(requestedLimit) || 10, 1), 20);
  const phonePattern = new RegExp(escapeRegex(term), "i");

  const [profiles, historical] = await Promise.all([
    GuestCourierProfile.find({ status: "active", phone: phonePattern })
      .sort({ lastAssignedAt: -1 })
      .limit(limit)
      .select("name phone email assignmentCount lastAssignedAt")
      .lean(),
    GuestCourierAssignment.aggregate([
      { $match: { "courier.phone": phonePattern } },
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
    ]),
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
