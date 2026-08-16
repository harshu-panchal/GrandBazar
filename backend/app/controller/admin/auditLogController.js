import handleResponse from "../../utils/helper.js";
import { getRecentAuditLogs } from "../../services/auditTrailService.js";

export const getAuditLogsController = async (req, res) => {
  try {
    const { page, limit, actorRole, action, targetType, targetId } = req.query;
    const result = await getRecentAuditLogs({
      page,
      limit,
      actorRole,
      action,
      targetType,
      targetId,
    });
    return handleResponse(res, 200, "Audit logs fetched", result);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
