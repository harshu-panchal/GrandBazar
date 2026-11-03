import handleResponse from "../../utils/helper.js";
import {
  assignGuestCourier,
  resendGuestCourierLink,
  revokeGuestCourier,
} from "../../services/guestCourierAssignmentService.js";
import {
  listGuestCashSettlements,
  recordGuestPhysicalCash,
} from "../../services/guestCourierFinanceService.js";

export async function assignGuestCourierController(req, res) {
  try {
    const result = await assignGuestCourier({
      adminId: req.user.id,
      actorRole: req.user.role,
      orderRef: req.params.orderId,
      taskType: req.body?.taskType,
      courier: req.body,
      reason: req.body?.reason,
    });
    const message = result.email?.success
      ? "Guest courier assigned and link emailed"
      : "Guest courier assigned, but email failed. Resend or replace the courier.";
    return handleResponse(res, 201, message, result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function resendGuestCourierLinkController(req, res) {
  try {
    const result = await resendGuestCourierLink({
      adminId: req.user.id,
      actorRole: req.user.role,
      assignmentId: req.params.assignmentId,
      reason: req.body?.reason,
    });
    return handleResponse(res, 200, result.email?.success ? "New guest link emailed; previous links were revoked" : "New link created, but email failed", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function revokeGuestCourierController(req, res) {
  try {
    const result = await revokeGuestCourier({
      adminId: req.user.id,
      actorRole: req.user.role,
      assignmentId: req.params.assignmentId,
      reason: req.body?.reason,
    });
    return handleResponse(res, 200, "Guest courier access revoked", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function replaceGuestCourierController(req, res) {
  try {
    const oldAssignment = await revokeGuestCourier({
      adminId: req.user.id,
      actorRole: req.user.role,
      assignmentId: req.params.assignmentId,
      reason: req.body?.reason || "Replaced by admin",
      replacement: true,
    });
    const result = await assignGuestCourier({
      adminId: req.user.id,
      actorRole: req.user.role,
      orderRef: oldAssignment.orderId,
      taskType: oldAssignment.taskType,
      courier: req.body,
      reason: req.body?.reason || "Replacement guest courier",
    });
    return handleResponse(res, 201, result.email?.success ? "Guest courier replaced and link emailed" : "Guest courier replaced, but email failed", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function listGuestCashSettlementsController(req, res) {
  try {
    return handleResponse(res, 200, "Guest COD settlements fetched", await listGuestCashSettlements(req.query));
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
}

export async function recordGuestPhysicalCashController(req, res) {
  try {
    const result = await recordGuestPhysicalCash({
      assignmentId: req.params.assignmentId,
      amount: req.body?.amount,
      adminId: req.user.id,
      note: req.body?.note,
      receiptNumber: req.body?.receiptNumber,
    });
    return handleResponse(res, 201, "Guest COD cash receipt recorded", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}
