import jwt from "jsonwebtoken";
import Order from "../models/order.js";
import User from "../models/customer.js";
import Store from "../models/store.js";
import Delivery from "../models/delivery.js";
import GuestCourierAssignment from "../models/guestCourierAssignment.js";
import { sendTrackingWhatsapp } from "./bhashWhatsappService.js";

const PURPOSE = "order_track";

// No expiry by request; the view endpoint only exposes this one order's
// status/rider/locations (no phone numbers or PII), and the signed token
// cannot be used as a pay-link or vice versa (purpose-checked).
export function signOrderTrackingToken(orderId) {
  return jwt.sign({ orderId: String(orderId), purpose: PURPOSE }, process.env.JWT_SECRET);
}

export function buildTrackingUrl(orderId) {
  const base = String(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  return `${base}/track/${signOrderTrackingToken(orderId)}`;
}

/** Best-effort WhatsApp of the tracking link; returns { success, error? }. */
export async function sendTrackingLinkForOrder(order) {
  const customer = await User.findById(order.customer).select("name phone").lean();
  if (!customer?.phone) return { success: false, error: "Customer has no phone number" };
  return sendTrackingWhatsapp({
    phone: customer.phone,
    name: customer.name,
    orderId: order.orderId,
    trackUrl: buildTrackingUrl(order.orderId),
  });
}

const point = (coords) =>
  Array.isArray(coords) && Number.isFinite(coords[0]) && Number.isFinite(coords[1]) && (coords[0] || coords[1])
    ? { lat: coords[1], lng: coords[0] }
    : null;

export async function getPublicTracking(token) {
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    decoded = null;
  }
  if (decoded?.purpose !== PURPOSE) {
    throw Object.assign(new Error("This tracking link is invalid"), { statusCode: 400 });
  }

  const order = await Order.findOne({ orderId: decoded.orderId })
    .select("orderId status workflowStatus deliveryAssigneeType deliveryBoy guestCourierAssignment guestCourierLiveLocation address.location seller")
    .lean();
  if (!order) throw Object.assign(new Error("Order not found"), { statusCode: 404 });

  let riderName = null;
  let riderLocation = null;
  if (order.deliveryAssigneeType === "guest" && order.guestCourierAssignment) {
    const assignment = await GuestCourierAssignment.findById(order.guestCourierAssignment).select("courier.name").lean();
    riderName = assignment?.courier?.name || null;
    const live = order.guestCourierLiveLocation;
    riderLocation = Number.isFinite(live?.lat) && Number.isFinite(live?.lng) ? { lat: live.lat, lng: live.lng } : null;
  } else if (order.deliveryBoy) {
    // shortcut: DB snapshot only (not Firebase live stream), upgrade if registered-rider tracking needs sub-10s updates.
    const rider = await Delivery.findById(order.deliveryBoy).select("name location").lean();
    riderName = rider?.name || null;
    riderLocation = point(rider?.location?.coordinates);
  }
  const store = await Store.findById(order.seller).select("location").lean();

  return {
    orderId: order.orderId,
    status: order.status,
    workflowStatus: order.workflowStatus,
    riderName,
    riderLocation,
    sellerLocation: point(store?.location?.coordinates),
    destinationLocation: order.address?.location || null,
  };
}
