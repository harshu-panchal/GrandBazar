import handleResponse from "../../utils/helper.js";
import { getAnalyticsReport } from "../../services/admin/analyticsReportService.js";

export const getAnalyticsReportController = async (req, res) => {
  try {
    const rangeMap = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 };
    const days = rangeMap[req.query.range] || Number(req.query.days) || 7;
    const data = await getAnalyticsReport({ days });
    return handleResponse(res, 200, "Analytics report fetched", data);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
