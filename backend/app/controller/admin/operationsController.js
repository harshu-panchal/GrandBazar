import handleResponse from "../../utils/helper.js";
import {
  requestCreditOrEscalate,
  listApprovalRequests,
  approveApprovalRequest,
  rejectApprovalRequest,
} from "../../services/finance/approvalRequestService.js";
import { listOperatorAuditLogs } from "../../services/operatorAuditLogService.js";

export const createCreditController = async (req, res) => {
  try {
    const { orderId, amount, reason, type } = req.body || {};
    const result = await requestCreditOrEscalate({
      orderId,
      amount,
      reason,
      type,
      actor: req.user,
    });
    const message = result.executed
      ? "Credit issued successfully"
      : "Amount exceeds your limit — sent for approval";
    return handleResponse(res, result.executed ? 200 : 202, message, result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const getApprovalsController = async (req, res) => {
  try {
    const { status, page, limit } = req.query;
    const result = await listApprovalRequests({ status, page, limit });
    return handleResponse(res, 200, "Approval requests fetched successfully", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const approveApprovalController = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body || {};
    const result = await approveApprovalRequest(id, req.user, note);
    return handleResponse(res, 200, "Request approved and credit issued", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const rejectApprovalController = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body || {};
    if (!note || !note.trim()) {
      return handleResponse(res, 400, "A reason is required to reject a request");
    }
    const result = await rejectApprovalRequest(id, req.user, note);
    return handleResponse(res, 200, "Request rejected", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const getOperatorAuditLogController = async (req, res) => {
  try {
    const { orderId, page, limit } = req.query;
    const isOwner = req.user?.role === "admin" || req.user?.role === "superadmin";
    const result = await listOperatorAuditLogs({
      actorId: isOwner ? undefined : req.user.id,
      orderId,
      page,
      limit,
    });
    return handleResponse(res, 200, "Audit log fetched successfully", result);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
