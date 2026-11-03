import crypto from "crypto";
import mongoose from "mongoose";
import Order from "../models/order.js";
import DeliveryAssignment from "../models/deliveryAssignment.js";
import GuestCourierAssignment from "../models/guestCourierAssignment.js";
import { normalizePhoneNumber, isValidE164Phone } from "../utils/phone.js";
import { requireCanonicalOrderId } from "../utils/orderLookup.js";
import { WORKFLOW_STATUS, legacyStatusFromWorkflow } from "../constants/orderWorkflow.js";
import {
  removeDeliveryTimeoutJob,
  scheduleDeliveryTimeoutJob,
  sellerResendDeliverySearchAtomic,
} from "./orderWorkflowService.js";
import { retractDeliveryBroadcastForOrder, emitOrderStatusUpdate, emitReturnStatusUpdate } from "./orderSocketEmitter.js";
import { sendGuestCourierAssignmentEmail } from "./emailService.js";
import { createOperatorAuditLog } from "./operatorAuditLogService.js";

const ACTIVE_STATUSES = ["email_pending", "active", "email_failed"];

export function hashGuestToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function createToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function assignmentPublicView(assignment) {
  const plain = assignment?.toObject ? assignment.toObject() : assignment;
  if (!plain) return null;
  delete plain.tokenHash;
  return plain;
}

function validateCourier(input = {}) {
  const name = String(input.name || "").trim();
  const phone = normalizePhoneNumber(input.phone);
  const email = String(input.email || "").trim().toLowerCase();
  if (name.length < 2 || name.length > 120) throw Object.assign(new Error("Courier name must be 2-120 characters"), { statusCode: 400 });
  if (!isValidE164Phone(phone)) throw Object.assign(new Error("A valid courier phone number is required"), { statusCode: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw Object.assign(new Error("A valid courier email is required"), { statusCode: 400 });
  }
  return { name, phone, email };
}

async function dispatchAssignmentEmail(assignment, rawToken) {
  const result = await sendGuestCourierAssignmentEmail({
    email: assignment.courier.email,
    name: assignment.courier.name,
    orderId: assignment.orderId,
    taskType: assignment.taskType,
    accessToken: rawToken,
  });
  const sent = result?.success === true;
  assignment.emailStatus = sent ? "sent" : "failed";
  assignment.status = sent ? "active" : "email_failed";
  assignment.emailSentAt = sent ? new Date() : null;
  assignment.emailFailureReason = sent ? "" : String(result?.error || "Email delivery failed");
  await assignment.save();
  return result;
}

export async function assignGuestCourier({ adminId, actorRole, orderRef, taskType, courier, reason }) {
  const orderId = await requireCanonicalOrderId(orderRef);
  const normalizedCourier = validateCourier(courier);
  const assignmentReason = String(reason || "").trim();
  if (assignmentReason.length < 3) throw Object.assign(new Error("Assignment reason is required"), { statusCode: 400 });
  if (!["forward_delivery", "return_pickup"].includes(taskType)) {
    throw Object.assign(new Error("Invalid guest courier task type"), { statusCode: 400 });
  }

  const order = await Order.findOne({ orderId });
  if (!order) throw Object.assign(new Error("Order not found"), { statusCode: 404 });

  const rawToken = createToken();
  const assignment = await GuestCourierAssignment.create({
    taskType,
    order: order._id,
    orderId,
    courier: normalizedCourier,
    tokenHash: hashGuestToken(rawToken),
    assignedByAdmin: adminId,
    assignmentReason,
  });

  const now = new Date();
  let updated;
  if (taskType === "forward_delivery") {
    updated = await Order.findOneAndUpdate(
      {
        _id: order._id,
        workflowStatus: WORKFLOW_STATUS.DELIVERY_SEARCH,
        deliveryBoy: null,
        guestCourierAssignment: null,
        $or: [
          { deliveryAssigneeType: { $exists: false } },
          { deliveryAssigneeType: "none" },
          { deliveryAssigneeType: null },
        ],
      },
      {
        $set: {
          deliveryAssigneeType: "guest",
          guestCourierAssignment: assignment._id,
          workflowStatus: WORKFLOW_STATUS.DELIVERY_ASSIGNED,
          status: legacyStatusFromWorkflow(WORKFLOW_STATUS.DELIVERY_ASSIGNED),
          orderStatus: legacyStatusFromWorkflow(WORKFLOW_STATUS.DELIVERY_ASSIGNED),
          assignedAt: now,
          assignedByAdmin: adminId,
          deliveryRiderStep: 1,
        },
        $inc: { assignmentVersion: 1 },
      },
      { new: true },
    );
  } else {
    updated = await Order.findOneAndUpdate(
      {
        _id: order._id,
        returnStatus: { $in: ["return_approved", "return_pickup_assigned"] },
        returnDeliveryBoy: null,
        returnGuestCourierAssignment: null,
        $or: [
          { returnDeliveryAssigneeType: { $exists: false } },
          { returnDeliveryAssigneeType: "none" },
          { returnDeliveryAssigneeType: null },
        ],
      },
      {
        $set: {
          returnDeliveryAssigneeType: "guest",
          returnGuestCourierAssignment: assignment._id,
          returnStatus: "return_pickup_assigned",
        },
      },
      { new: true },
    );
  }

  if (!updated) {
    await GuestCourierAssignment.deleteOne({ _id: assignment._id });
    throw Object.assign(new Error("This task is no longer unassigned or is not eligible for guest assignment"), { statusCode: 409 });
  }

  if (taskType === "forward_delivery") {
    await removeDeliveryTimeoutJob(orderId, order.deliverySearchMeta?.attempt || 1);
    await DeliveryAssignment.updateMany({ orderId, status: "broadcasting" }, { $set: { status: "superseded", "meta.supersededBy": "guest_courier" } });
    await retractDeliveryBroadcastForOrder(orderId, null);
    emitOrderStatusUpdate(orderId, { workflowStatus: WORKFLOW_STATUS.DELIVERY_ASSIGNED, deliveryAssigneeType: "guest" }, updated.customer, updated.seller);
  } else {
    emitReturnStatusUpdate(updated, { returnDeliveryAssigneeType: "guest" });
  }

  await createOperatorAuditLog({
    action: taskType === "forward_delivery" ? "guest_courier_assigned" : "guest_return_courier_assigned",
    actorId: adminId,
    actorRole,
    orderId: updated._id,
    newValue: { assignmentId: assignment._id, courier: normalizedCourier, taskType },
    reason: assignmentReason,
  });

  const email = await dispatchAssignmentEmail(assignment, rawToken);
  return { order: updated, assignment: assignmentPublicView(assignment), email };
}

export async function resendGuestCourierLink({ adminId, actorRole, assignmentId, reason }) {
  const assignment = await GuestCourierAssignment.findOne({ _id: assignmentId, status: { $in: ACTIVE_STATUSES } }).select("+tokenHash");
  if (!assignment) throw Object.assign(new Error("Active guest assignment not found"), { statusCode: 404 });
  const rawToken = createToken();
  assignment.tokenHash = hashGuestToken(rawToken);
  assignment.tokenVersion += 1;
  assignment.status = "email_pending";
  assignment.emailStatus = "pending";
  assignment.emailFailureReason = "";
  await assignment.save();
  const email = await dispatchAssignmentEmail(assignment, rawToken);
  await createOperatorAuditLog({
    action: "guest_courier_link_resent",
    actorId: adminId,
    actorRole,
    orderId: assignment.order,
    newValue: { assignmentId: assignment._id, tokenVersion: assignment.tokenVersion },
    reason: String(reason || "Link resent").trim(),
  });
  return { assignment: assignmentPublicView(assignment), email };
}

export async function revokeGuestCourier({ adminId, actorRole, assignmentId, reason, replacement = false }) {
  const assignment = await GuestCourierAssignment.findOneAndUpdate(
    { _id: assignmentId, status: { $in: ACTIVE_STATUSES } },
    {
      $set: {
        status: replacement ? "replaced" : "revoked",
        revokedAt: new Date(),
        revokedByAdmin: adminId,
        revocationReason: String(reason || (replacement ? "Replaced by admin" : "Revoked by admin")).trim(),
      },
      $inc: { tokenVersion: 1 },
    },
    { new: true },
  );
  if (!assignment) throw Object.assign(new Error("Active guest assignment not found"), { statusCode: 404 });

  if (assignment.taskType === "forward_delivery") {
    const order = await Order.findOneAndUpdate(
      { _id: assignment.order, guestCourierAssignment: assignment._id },
      {
        $set: {
          deliveryAssigneeType: "none",
          guestCourierAssignment: null,
          workflowStatus: WORKFLOW_STATUS.DELIVERY_SEARCH,
          status: legacyStatusFromWorkflow(WORKFLOW_STATUS.DELIVERY_SEARCH),
          orderStatus: legacyStatusFromWorkflow(WORKFLOW_STATUS.DELIVERY_SEARCH),
          assignedAt: null,
          assignedByAdmin: null,
        },
        $inc: { assignmentVersion: 1 },
      },
      { new: true },
    );
    if (order && !replacement) {
      await DeliveryAssignment.create({ orderMongoId: order._id, orderId: order.orderId, status: "broadcasting", attempt: (order.deliverySearchMeta?.attempt || 1) + 1 });
      await scheduleDeliveryTimeoutJob(order.orderId, (order.deliverySearchMeta?.attempt || 1) + 1);
      await sellerResendDeliverySearchAtomic(order.seller, order.orderId).catch(() => {});
    }
  } else {
    await Order.updateOne(
      { _id: assignment.order, returnGuestCourierAssignment: assignment._id },
      { $set: { returnDeliveryAssigneeType: "none", returnGuestCourierAssignment: null } },
    );
  }

  await createOperatorAuditLog({
    action: replacement ? "guest_courier_replaced" : "guest_courier_revoked",
    actorId: adminId,
    actorRole,
    orderId: assignment.order,
    oldValue: { assignmentId: assignment._id, courier: assignment.courier },
    reason: assignment.revocationReason,
  });
  return assignmentPublicView(assignment);
}

export async function authenticateGuestToken(rawToken) {
  if (!rawToken) throw Object.assign(new Error("Guest delivery link is missing"), { statusCode: 401 });
  const assignment = await GuestCourierAssignment.findOne({
    tokenHash: hashGuestToken(rawToken),
    status: { $in: ACTIVE_STATUSES },
  }).select("+tokenHash");
  if (!assignment) throw Object.assign(new Error("This delivery link is invalid or has been revoked"), { statusCode: 401 });
  const order = await Order.findById(assignment.order);
  const currentRef = assignment.taskType === "forward_delivery" ? order?.guestCourierAssignment : order?.returnGuestCourierAssignment;
  const terminal = assignment.taskType === "forward_delivery"
    ? ["delivered", "cancelled"].includes(String(order?.status || "").toLowerCase()) || [WORKFLOW_STATUS.DELIVERED, WORKFLOW_STATUS.CANCELLED].includes(order?.workflowStatus)
    : ["return_rejected", "returned", "qc_passed", "qc_failed", "refund_initiated", "refund_completed"].includes(order?.returnStatus);
  if (terminal) {
    await GuestCourierAssignment.updateOne(
      { _id: assignment._id },
      { $set: { status: order?.status === "cancelled" || order?.returnStatus === "return_rejected" ? "cancelled" : "completed", revokedAt: new Date() }, $inc: { tokenVersion: 1 } },
    );
    throw Object.assign(new Error("This delivery task has ended and the link has been revoked"), { statusCode: 410 });
  }
  if (!order || String(currentRef || "") !== String(assignment._id)) {
    throw Object.assign(new Error("This delivery link is no longer active"), { statusCode: 410 });
  }
  assignment.lastAccessedAt = new Date();
  await assignment.save();
  return { assignment, order };
}

export async function completeGuestAssignment(assignmentId) {
  return GuestCourierAssignment.findByIdAndUpdate(
    assignmentId,
    { $set: { status: "completed", completedAt: new Date(), tokenHash: hashGuestToken(createToken()) }, $inc: { tokenVersion: 1 } },
    { new: true },
  );
}

export { ACTIVE_STATUSES, assignmentPublicView };
