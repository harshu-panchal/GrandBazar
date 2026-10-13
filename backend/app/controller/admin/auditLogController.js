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

// Dedicated feed for role/staff-access changes — every role.* (AdminRole CRUD)
// and staff.* (Admin CRUD/role-reassignment) entry recorded by roleController.js
// and staffController.js. Scoped to those two target types so this reads as a
// clean "who changed whose access, and to what" trail instead of the general
// cross-platform audit feed.
export const getRoleAccessAuditLogsController = async (req, res) => {
  try {
    const { page, limit, action, targetId } = req.query;
    const result = await getRecentAuditLogs({
      page,
      limit,
      action,
      targetId,
      targetType: ["Admin", "AdminRole"],
    });
    return handleResponse(res, 200, "Role access audit logs fetched", result);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
