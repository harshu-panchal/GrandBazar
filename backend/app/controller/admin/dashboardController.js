import handleResponse from "../../utils/helper.js";
import { getAdminDashboardStats } from "../../services/admin/dashboardService.js";
import { getAdminDashboardOverview } from "../../services/admin/dashboardOverviewService.js";

export const getAdminStats = async (req, res) => {
  try {
    const stats = await getAdminDashboardStats();
    return handleResponse(res, 200, "Admin stats fetched successfully", stats);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getAdminDashboard = async (req, res) => {
  try {
    const overview = await getAdminDashboardOverview({
      city: req.query.city || "",
    });
    return handleResponse(res, 200, "Dashboard fetched successfully", overview);
  } catch (error) {
    console.error("getAdminDashboard error:", error);
    return handleResponse(res, 500, error.message);
  }
};
