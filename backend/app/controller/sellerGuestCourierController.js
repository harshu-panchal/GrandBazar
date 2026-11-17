import handleResponse from "../utils/helper.js";
import { resolveSiblingStoreIds } from "../services/storeService.js";
import {
  assignGuestCourier,
  resendGuestCourierLink,
  revokeGuestCourier,
} from "../services/guestCourierAssignmentService.js";
import { searchGuestCourierDirectory } from "../services/guestCourierDirectoryService.js";

async function sellerStoreIds(req) {
  return resolveSiblingStoreIds(req.user.activeStoreId || req.user.id);
}

function actorId(req) {
  return req.user.subSellerId || req.user.accountId || req.user.id;
}

function requireReason(req) {
  const reason = String(req.body?.reason || "").trim();
  if (reason.length < 3) throw Object.assign(new Error("Reason is required"), { statusCode: 400 });
  return reason;
}

function taskType(req) {
  return req.path.includes("/returns/") ? "return_pickup" : "forward_delivery";
}

export async function searchSellerGuestCouriers(req, res) {
  try {
    const results = await searchGuestCourierDirectory(req.query?.phone, req.query?.limit, await sellerStoreIds(req));
    return handleResponse(res, 200, "Temporary courier directory fetched", results);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function assignSellerGuestCourier(req, res) {
  try {
    const result = await assignGuestCourier({
      adminId: actorId(req),
      actorRole: "seller",
      orderRef: req.params.orderId,
      taskType: taskType(req),
      courier: req.body,
      reason: requireReason(req),
      allowedSellerIds: await sellerStoreIds(req),
    });
    return handleResponse(res, 201, result.email?.success
      ? "Temporary courier assigned and link emailed"
      : "Temporary courier assigned, but email failed. Resend or replace the courier.", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function resendSellerGuestCourier(req, res) {
  try {
    const result = await resendGuestCourierLink({
      adminId: actorId(req),
      actorRole: "seller",
      assignmentId: req.params.assignmentId,
      reason: requireReason(req),
      allowedSellerIds: await sellerStoreIds(req),
      expectedTaskType: taskType(req),
    });
    return handleResponse(res, 200, result.email?.success ? "New link emailed; previous links were revoked" : "New link created, but email failed", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function revokeSellerGuestCourier(req, res) {
  try {
    const result = await revokeGuestCourier({
      adminId: actorId(req),
      actorRole: "seller",
      assignmentId: req.params.assignmentId,
      reason: requireReason(req),
      allowedSellerIds: await sellerStoreIds(req),
      expectedTaskType: taskType(req),
    });
    return handleResponse(res, 200, "Temporary courier access revoked", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}

export async function replaceSellerGuestCourier(req, res) {
  try {
    const reason = requireReason(req);
    const allowedSellerIds = await sellerStoreIds(req);
    const expectedTaskType = taskType(req);
    const oldAssignment = await revokeGuestCourier({
      adminId: actorId(req),
      actorRole: "seller",
      assignmentId: req.params.assignmentId,
      reason,
      replacement: true,
      allowedSellerIds,
      expectedTaskType,
    });
    const result = await assignGuestCourier({
      adminId: actorId(req),
      actorRole: "seller",
      orderRef: oldAssignment.orderId,
      taskType: expectedTaskType,
      courier: req.body,
      reason,
      allowedSellerIds,
    });
    return handleResponse(res, 201, result.email?.success ? "Temporary courier replaced and link emailed" : "Temporary courier replaced, but email failed", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
}
