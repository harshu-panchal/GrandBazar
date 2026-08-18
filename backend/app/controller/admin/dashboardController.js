import handleResponse from "../../utils/helper.js";
import { getAdminDashboardStats } from "../../services/admin/dashboardService.js";
import { getAdminDashboardOverview } from "../../services/admin/dashboardOverviewService.js";
import { buildKey, getOrSet, getTTL } from "../../services/cacheService.js";

export const getAdminStats = async (req, res) => {
  try {
    // Was recomputing ~5 aggregations (some unbounded, full-collection
    // scans) from scratch on every admin dashboard load — a 5-minute cache
    // is a normal, well-established tradeoff for overview-style dashboard
    // numbers (same TTL preset "orders"/"product" list caching already
    // uses elsewhere in this codebase).
    const stats = await getOrSet(
      buildKey("admin", "dashboardStats"),
      () => getAdminDashboardStats(),
      getTTL("dashboard"),
    );
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
