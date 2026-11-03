import crypto from "crypto";
import Order from "../models/order.js";
import Store from "../models/store.js";
import Customer from "../models/customer.js";
import Seller from "../models/seller.js";
import OrderOtp from "../models/orderOtp.js";
import { WORKFLOW_STATUS, legacyStatusFromWorkflow } from "../constants/orderWorkflow.js";
import { distanceMeters } from "../utils/geoUtils.js";
import { writeDeliveryLocation, appendTrailPoint } from "./firebaseService.js";
import { emitOrderStatusUpdate, emitReturnStatusUpdate, emitToCustomer, emitToSeller } from "./orderSocketEmitter.js";
import { generateReturnPickupOtp, validateReturnPickupOtp, generateReturnDropOtp, validateReturnDropOtp } from "./deliveryOtpService.js";
import { applyDeliveredSettlement } from "./orderSettlement.js";
import { completeGuestAssignment, assignmentPublicView } from "./guestCourierAssignmentService.js";
import { creditGuestCourierAmountToAdmin, createGuestCodLiability, getGuestCodSettlement } from "./guestCourierFinanceService.js";

function assertTask(assignment, taskType) {
  if (assignment.taskType !== taskType) throw Object.assign(new Error("This link is not authorized for that task"), { statusCode: 403 });
}

function assertCoordinates(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw Object.assign(new Error("Valid location coordinates are required"), { statusCode: 400 });
  return { lat: a, lng: b };
}

export async function getGuestTaskView(assignment, order) {
  const populated = await Order.findById(order._id)
    .populate("customer", "name phone")
    .populate("seller", "shopName name phone address city state pincode landmark location")
    .lean();
  const cashSettlement = await getGuestCodSettlement(assignment._id);
  return {
    assignment: assignmentPublicView(assignment),
    order: {
      orderId: populated.orderId,
      shortOrderId: populated.shortOrderId,
      taskType: assignment.taskType,
      status: populated.status,
      workflowStatus: populated.workflowStatus,
      returnStatus: populated.returnStatus,
      deliveryRiderStep: populated.deliveryRiderStep,
      customer: populated.customer,
      seller: populated.seller,
      address: populated.address,
      items: assignment.taskType === "return_pickup" ? populated.returnItems : populated.items,
      paymentMode: populated.paymentMode,
      codAmount: String(populated.paymentMode).toUpperCase() === "COD"
        ? Number(populated.paymentBreakdown?.grandTotal || populated.pricing?.total || 0)
        : 0,
      sellerPackedAt: populated.sellerPackedAt,
      pickupProofImages: populated.pickupProofImages || [],
      returnPickupImages: populated.returnPickupImages || [],
      cashSettlement,
    },
  };
}

export async function updateGuestLocation(assignment, order, payload = {}) {
  const { lat, lng } = assertCoordinates(payload.lat, payload.lng);
  const actorId = `guest-${assignment._id}`;
  const snapshot = {
    lat,
    lng,
    accuracy: Number.isFinite(Number(payload.accuracy)) ? Number(payload.accuracy) : undefined,
    heading: Number.isFinite(Number(payload.heading)) ? Number(payload.heading) : undefined,
    speed: Number.isFinite(Number(payload.speed)) ? Number(payload.speed) : undefined,
    lastUpdatedAt: new Date().toISOString(),
    deliveryId: actorId,
    orderId: order.orderId,
    source: "guest_web_gps",
  };
  await Promise.all([
    writeDeliveryLocation(actorId, order.orderId, snapshot),
    appendTrailPoint(order.orderId, { lat, lng, timestamp: snapshot.lastUpdatedAt, source: snapshot.source }),
  ]);
  return snapshot;
}

export async function guestArrivedAtStore(assignment, order, payload) {
  assertTask(assignment, "forward_delivery");
  assertCoordinates(payload?.lat, payload?.lng);
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, guestCourierAssignment: assignment._id, workflowStatus: WORKFLOW_STATUS.DELIVERY_ASSIGNED },
    { $set: { workflowStatus: WORKFLOW_STATUS.PICKUP_READY, status: "packed", orderStatus: "packed", pickupReadyAt: new Date(), deliveryRiderStep: 2 } },
    { new: true },
  );
  if (!updated) throw Object.assign(new Error("This order is not ready for store arrival"), { statusCode: 409 });
  emitOrderStatusUpdate(updated.orderId, { workflowStatus: updated.workflowStatus, deliveryAssigneeType: "guest" }, updated.customer, updated.seller);
  return updated;
}

export async function guestConfirmPickup(assignment, order, payload) {
  assertTask(assignment, "forward_delivery");
  assertCoordinates(payload?.lat, payload?.lng);
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, guestCourierAssignment: assignment._id, workflowStatus: WORKFLOW_STATUS.HANDED_OVER_TO_LOGISTICS },
    { $set: { workflowStatus: WORKFLOW_STATUS.OUT_FOR_DELIVERY, status: "out_for_delivery", orderStatus: "out_for_delivery", pickupConfirmedAt: new Date(), outForDeliveryAt: new Date(), deliveryRiderStep: 3 } },
    { new: true },
  );
  if (!updated) throw Object.assign(new Error("Seller handover must be confirmed before pickup"), { statusCode: 409 });
  emitOrderStatusUpdate(updated.orderId, { workflowStatus: updated.workflowStatus }, updated.customer, updated.seller);
  return updated;
}

export async function guestAdvance(assignment, order) {
  assertTask(assignment, "forward_delivery");
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, guestCourierAssignment: assignment._id, workflowStatus: WORKFLOW_STATUS.OUT_FOR_DELIVERY },
    { $set: { deliveryRiderStep: 4 } },
    { new: true },
  );
  if (!updated) throw Object.assign(new Error("Order is not out for delivery"), { statusCode: 409 });
  return updated;
}

export async function guestRequestDeliveryOtp(assignment, order, payload) {
  assertTask(assignment, "forward_delivery");
  const position = assertCoordinates(payload?.lat, payload?.lng);
  if (order.workflowStatus !== WORKFLOW_STATUS.OUT_FOR_DELIVERY) throw Object.assign(new Error("Order is not ready for OTP"), { statusCode: 409 });
  const destination = order.address?.location;
  if (!Number.isFinite(Number(destination?.lat)) || !Number.isFinite(Number(destination?.lng))) {
    throw Object.assign(new Error("Customer delivery coordinates are missing"), { statusCode: 400 });
  }
  const radius = Number(process.env.DELIVERY_OTP_RADIUS_METERS || 120);
  if (distanceMeters(position.lat, position.lng, Number(destination.lat), Number(destination.lng)) > radius) {
    throw Object.assign(new Error(`Move within ${radius}m of the customer to request OTP`), { statusCode: 400 });
  }
  // The courier becomes accountable for COD only at the customer's doorstep.
  // Creating the liability here also makes online remittance available before
  // the completion OTP revokes the permanent task link.
  if (String(order.paymentMode || "").toUpperCase() === "COD") {
    await createGuestCodLiability(order, assignment);
  }
  const code = String(crypto.randomInt(0, 10000)).padStart(4, "0");
  const expiresAt = new Date(Date.now() + Number(process.env.DELIVERY_OTP_EXPIRY_MS || 10 * 60 * 1000));
  await OrderOtp.updateMany({ orderId: order.orderId, type: "delivery", consumedAt: null }, { $set: { consumedAt: new Date() } });
  await OrderOtp.create({ orderId: order.orderId, orderMongoId: order._id, type: "delivery", codeHash: OrderOtp.hashCode(code), code, expiresAt, attempts: 0, maxAttempts: 3, lastGeneratedAt: new Date() });
  emitToCustomer(order.customer, { event: "delivery:otp:generated", payload: { orderId: order.orderId, otp: code, expiresAt, deliveryPersonNearby: true } });
  emitOrderStatusUpdate(order.orderId, { otpSent: true }, order.customer);
  return { expiresAt };
}

export async function guestVerifyDeliveryOtp(assignment, order, code) {
  assertTask(assignment, "forward_delivery");
  if (order.workflowStatus !== WORKFLOW_STATUS.OUT_FOR_DELIVERY) throw Object.assign(new Error("Order is not ready for delivery completion"), { statusCode: 409 });
  const otp = await OrderOtp.findOne({ orderId: order.orderId, type: "delivery", consumedAt: null }).sort({ createdAt: -1 });
  if (!otp || otp.expiresAt < new Date()) throw Object.assign(new Error("OTP is missing or expired"), { statusCode: 400 });
  if (otp.attempts >= otp.maxAttempts) throw Object.assign(new Error("Too many OTP attempts"), { statusCode: 429 });
  if (OrderOtp.hashCode(String(code || "")) !== otp.codeHash) {
    otp.attempts += 1;
    await otp.save();
    throw Object.assign(new Error("Invalid OTP"), { statusCode: 400 });
  }
  otp.consumedAt = new Date();
  await otp.save();
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, guestCourierAssignment: assignment._id, workflowStatus: WORKFLOW_STATUS.OUT_FOR_DELIVERY },
    { $set: { workflowStatus: WORKFLOW_STATUS.DELIVERED, status: "delivered", orderStatus: "delivered", deliveredAt: new Date(), deliveryRiderStep: 4 } },
    { new: true },
  );
  if (!updated) throw Object.assign(new Error("Could not complete delivery"), { statusCode: 409 });
  await applyDeliveredSettlement(updated, updated.orderId);
  await creditGuestCourierAmountToAdmin(updated._id, assignment);
  await createGuestCodLiability(updated, assignment);
  await completeGuestAssignment(assignment._id);
  emitOrderStatusUpdate(updated.orderId, { workflowStatus: WORKFLOW_STATUS.DELIVERED }, updated.customer, updated.seller);
  return { orderId: updated.orderId, completed: true };
}

export async function guestSaveReturnProof(assignment, order, { images, condition, note }) {
  assertTask(assignment, "return_pickup");
  const urls = Array.isArray(images) ? images.map((v) => String(v || "").trim()).filter((v) => /^https:\/\//i.test(v)).slice(0, 6) : [];
  if (!urls.length) throw Object.assign(new Error("At least one return pickup image is required"), { statusCode: 400 });
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, returnGuestCourierAssignment: assignment._id, returnStatus: "return_pickup_assigned" },
    { $set: { returnPickupImages: urls, returnPickupCondition: condition || "good", returnPickupConditionNote: String(note || "") } },
    { new: true },
  );
  if (!updated) throw Object.assign(new Error("Return pickup is not active"), { statusCode: 409 });
  return updated;
}

export async function guestRequestReturnPickupOtp(assignment, order) {
  assertTask(assignment, "return_pickup");
  if (!order.returnPickupImages?.length) throw Object.assign(new Error("Upload pickup proof before requesting OTP"), { statusCode: 400 });
  const result = await generateReturnPickupOtp(order.orderId, { id: assignment._id, role: "guest" });
  if (!result.success) throw Object.assign(new Error(result.error), { statusCode: 400 });
  return { expiresAt: result.expiresAt };
}

export async function guestVerifyReturnPickupOtp(assignment, order, code) {
  assertTask(assignment, "return_pickup");
  const validation = await validateReturnPickupOtp(order.orderId, String(code || ""));
  if (!validation.valid) throw Object.assign(new Error(validation.message), { statusCode: validation.error === "MAX_ATTEMPTS_EXCEEDED" ? 429 : 400 });
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, returnGuestCourierAssignment: assignment._id, returnStatus: "return_pickup_assigned" },
    { $set: { returnStatus: "return_in_transit", returnPickedAt: new Date() } },
    { new: true },
  );
  if (!updated) throw Object.assign(new Error("Return pickup could not be confirmed"), { statusCode: 409 });
  await creditGuestCourierAmountToAdmin(updated._id, assignment, { isReturn: true });
  emitReturnStatusUpdate(updated);
  return updated;
}

export async function guestRequestReturnDropOtp(assignment, order) {
  assertTask(assignment, "return_pickup");
  if (!["return_in_transit", "return_drop_pending"].includes(order.returnStatus)) throw Object.assign(new Error("Return is not ready for seller drop-off"), { statusCode: 409 });
  const result = await generateReturnDropOtp(order.orderId);
  if (!result.success) throw Object.assign(new Error(result.error), { statusCode: 400 });
  await Order.updateOne({ _id: order._id }, { $set: { returnStatus: "return_drop_pending" } });
  const store = await Store.findById(order.seller).select("ownerId").lean();
  const payload = { orderId: order.orderId, otp: result.otp, expiresAt: result.expiresAt };
  emitToSeller(order.seller, { event: "return:drop:otp", payload });
  if (store?.ownerId) emitToSeller(store.ownerId, { event: "return:drop:otp", payload });
  return { expiresAt: result.expiresAt };
}

export async function guestVerifyReturnDropOtp(assignment, order, code) {
  assertTask(assignment, "return_pickup");
  const validation = await validateReturnDropOtp(order.orderId, String(code || ""));
  if (!validation.valid) throw Object.assign(new Error(validation.message), { statusCode: validation.error === "MAX_ATTEMPTS_EXCEEDED" ? 429 : 400 });
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, returnGuestCourierAssignment: assignment._id, returnStatus: { $in: ["return_in_transit", "return_drop_pending"] } },
    { $set: { returnStatus: "returned", returnDeliveredBackAt: new Date(), returnDropVerifiedAt: new Date() } },
    { new: true },
  );
  if (!updated) throw Object.assign(new Error("Return drop-off could not be completed"), { statusCode: 409 });
  await completeGuestAssignment(assignment._id);
  emitReturnStatusUpdate(updated);
  return { orderId: updated.orderId, completed: true };
}
