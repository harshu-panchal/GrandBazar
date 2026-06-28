import LoginActivity from "../../models/loginActivity.js";
import handleResponse from "../../utils/helper.js";

export const getLoginActivities = async (req, res) => {
  try {
    const { role, status, search } = req.query;

    const query = {};

    if (role) {
      if (role === "user" || role === "customer") {
        query.userModel = "Customer";
      } else if (role === "seller") {
        query.userModel = "Seller";
      } else if (role === "delivery") {
        query.userModel = "Delivery";
      } else if (role === "admin") {
        query.userModel = "Admin";
      }
    }

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    // Fetch the 100 most recent activities
    const activities = await LoginActivity.find(query)
      .sort({ lastActiveAt: -1 })
      .limit(100)
      .lean();

    return handleResponse(res, 200, "Login activities fetched successfully", activities);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const terminateSession = async (req, res) => {
  try {
    const { id } = req.params;

    const session = await LoginActivity.findById(id);
    if (!session) {
      return handleResponse(res, 404, "Session not found");
    }

    session.status = "logged_out";
    await session.save();

    return handleResponse(res, 200, "Session terminated successfully");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
