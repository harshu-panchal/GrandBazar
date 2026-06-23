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

export const updateLastActive = async (userId) => {
  try {
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
