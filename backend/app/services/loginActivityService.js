import LoginActivity from "../models/loginActivity.js";

export const recordLogin = async (user, userModel, ipAddress, userAgent) => {
  try {
    const userId = user._id || user.id;
    
    // Set previous active sessions for this user to logged_out
    await LoginActivity.updateMany(
      { userId, status: "active" },
      { $set: { status: "logged_out" } }
    );

    let role = "customer";
    if (userModel === "Seller") {
      role = user.role || "seller";
    } else if (userModel === "Delivery") {
      role = "delivery";
    } else if (userModel === "Admin") {
      role = user.role || "admin";
    }

    await LoginActivity.create({
      userId,
      userModel,
      name: user.name || "Unknown",
      email: user.email || "",
      phone: user.phone || "",
      role,
      ipAddress,
      userAgent,
      status: "active",
    });
  } catch (error) {
    console.error("Error recording login activity:", error);
  }
};

// Was firing an unawaited write on literally every authenticated request
// (called from authMiddleware.js's verifyToken, i.e. every request, every
// role, app-wide). "Last active" only needs minute-level freshness, so
// throttle actual DB writes per user — in-memory, per-process, so worst
// case under multiple instances is a slightly-more-frequent write, never a
// correctness issue. Map stays small (userId string -> timestamp number
// per active user), acceptable to leave unpruned for a process's lifetime.
const LAST_ACTIVE_THROTTLE_MS = 3 * 60 * 1000;
const lastActiveWriteCache = new Map();

export const updateLastActive = async (userId) => {
  try {
    const key = String(userId);
    const now = Date.now();
    const lastWrite = lastActiveWriteCache.get(key);
    if (lastWrite && now - lastWrite < LAST_ACTIVE_THROTTLE_MS) {
      return;
    }
    lastActiveWriteCache.set(key, now);

    await LoginActivity.updateOne(
      { userId, status: "active" },
      { $set: { lastActiveAt: new Date() } }
    );
  } catch (error) {
    console.error("Error updating last active time:", error);
  }
};

export const recordLogout = async (userId) => {
  try {
    await LoginActivity.updateMany(
      { userId, status: "active" },
      { $set: { status: "logged_out" } }
    );
  } catch (error) {
    console.error("Error recording logout activity:", error);
  }
};
