import crypto from "crypto";
import Order from "../models/order.js";
import { WORKFLOW_STATUS, legacyStatusFromWorkflow } from "../constants/orderWorkflow.js";
import { emitOrderStatusUpdate } from "./orderSocketEmitter.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import { requireCanonicalOrderId } from "../utils/orderLookup.js";
import { FULFILLMENT_METHOD } from "../constants/deliveryPolicy.js";
import { applyDeliveredSettlement } from "./orderSettlement.js";

const OTP_EXPIRY_MS = () =>
  parseInt(process.env.CUSTOMER_PICKUP_OTP_EXPIRY_MS || String(24 * 60 * 60 * 1000), 10);
const OTP_RESEND_COOLDOWN_MS = () =>
  parseInt(process.env.CUSTOMER_PICKUP_OTP_RESEND_COOLDOWN_MS || String(30 * 1000), 10);

function hashToken(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateQrToken() {
  return crypto.randomBytes(16).toString("hex");
}

export async function markOrderReadyForCustomerPickup(sellerId, orderId) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId, seller: sellerId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  if (order.fulfillmentMethod !== FULFILLMENT_METHOD.CUSTOMER_PICKUP) {
    const err = new Error("Order is not a customer pickup order");
    err.statusCode = 400;
    throw err;
  }

  const otp = generateOtp();
  const qrToken = generateQrToken();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS());

  order.workflowStatus = WORKFLOW_STATUS.CUSTOMER_PICKUP_READY;
  order.status = legacyStatusFromWorkflow(WORKFLOW_STATUS.CUSTOMER_PICKUP_READY);
  order.orderStatus = legacyStatusFromWorkflow(WORKFLOW_STATUS.CUSTOMER_PICKUP_READY);
  order.customerPickup = {
    readyAt: new Date(),
    otpHash: hashToken(otp),
    qrTokenHash: hashToken(qrToken),
    expiresAt,
    verifiedAt: null,
    verifiedBy: null,
    lastOtpSentAt: new Date(),
  };
  await order.save();

  emitOrderStatusUpdate(
    orderId,
    {
      workflowStatus: WORKFLOW_STATUS.CUSTOMER_PICKUP_READY,
      customerPickupOtp: otp,
      customerPickupQr: qrToken,
      pickupExpiresAt: expiresAt,
    },
    order.customer,
  );
  emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_PACKED, {
    orderId,
    customerId: order.customer,
    userId: order.customer,
    sellerId: order.seller,
    customerMessage: `Your order #${orderId} is ready for pickup.`,
  });

  return { orderId, otp, qrToken, expiresAt };
}

/**
 * Seller-initiated re-send: issues a fresh OTP/QR (invalidating the old one
 * — nothing is "recovered", since only the hash is ever persisted) for an
 * order that's already ready for pickup. Covers the case where the customer
 * wasn't on the order page for the one-time live push when the seller first
 * marked it ready, and lets the seller read the new code out to a customer
 * who's calling or standing at the counter without it.
 */
export async function resendPickupOtpBySeller(sellerId, orderId) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId, seller: sellerId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  if (order.fulfillmentMethod !== FULFILLMENT_METHOD.CUSTOMER_PICKUP) {
    const err = new Error("Order is not a customer pickup order");
    err.statusCode = 400;
    throw err;
  }
  if (order.workflowStatus !== WORKFLOW_STATUS.CUSTOMER_PICKUP_READY) {
    const err = new Error("Order is not ready for pickup yet");
    err.statusCode = 409;
    throw err;
  }

  const lastSentAt = order.customerPickup?.lastOtpSentAt;
  if (lastSentAt) {
    const elapsedMs = Date.now() - new Date(lastSentAt).getTime();
    const cooldownMs = OTP_RESEND_COOLDOWN_MS();
    if (elapsedMs < cooldownMs) {
      const err = new Error(
        `Please wait ${Math.ceil((cooldownMs - elapsedMs) / 1000)}s before requesting another OTP`,
      );
      err.statusCode = 429;
      throw err;
    }
  }

  const otp = generateOtp();
  const qrToken = generateQrToken();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS());

  order.customerPickup.otpHash = hashToken(otp);
  order.customerPickup.qrTokenHash = hashToken(qrToken);
  order.customerPickup.expiresAt = expiresAt;
  order.customerPickup.lastOtpSentAt = new Date();
  await order.save();

  // customerPickupOtp/customerPickupQr are pushed only to the CUSTOMER's own
  // socket room (order.customer) — the seller must never receive the code
  // itself, since they're the party meant to check it against what the
  // customer tells them in person.
  emitOrderStatusUpdate(
    orderId,
    {
      workflowStatus: WORKFLOW_STATUS.CUSTOMER_PICKUP_READY,
      customerPickupOtp: otp,
      customerPickupQr: qrToken,
      pickupExpiresAt: expiresAt,
    },
    order.customer,
  );

  return { orderId, expiresAt };
}

export async function verifyCustomerPickup({
  orderId,
  customerId,
  otp,
  qrToken,
  orderNumber,
  verifiedBy = "customer",
}) {
  orderId = await requireCanonicalOrderId(orderId || orderNumber);
  const order = await Order.findOne({
    orderId,
    ...(customerId ? { customer: customerId } : {}),
  });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  if (order.fulfillmentMethod !== FULFILLMENT_METHOD.CUSTOMER_PICKUP) {
    const err = new Error("Not a customer pickup order");
    err.statusCode = 400;
    throw err;
  }
  if (order.workflowStatus !== WORKFLOW_STATUS.CUSTOMER_PICKUP_READY) {
    const err = new Error("Order is not ready for pickup");
    err.statusCode = 409;
    throw err;
  }

  const pickup = order.customerPickup || {};
  if (pickup.expiresAt && new Date(pickup.expiresAt) < new Date()) {
    const err = new Error("Pickup verification expired");
    err.statusCode = 410;
    throw err;
  }

  const otpOk = otp && pickup.otpHash === hashToken(otp);
  const qrOk = qrToken && pickup.qrTokenHash === hashToken(qrToken);
  const orderIdOk =
    orderNumber &&
    String(order.orderId).toLowerCase() === String(orderNumber).toLowerCase() &&
    (otpOk || qrOk);

  if (!otpOk && !qrOk && !orderIdOk) {
    const err = new Error("Invalid pickup verification");
    err.statusCode = 401;
    throw err;
  }

  order.workflowStatus = WORKFLOW_STATUS.DELIVERED;
  order.status = legacyStatusFromWorkflow(WORKFLOW_STATUS.DELIVERED);
  order.orderStatus = legacyStatusFromWorkflow(WORKFLOW_STATUS.DELIVERED);
  order.deliveredAt = new Date();
  order.customerPickup = {
    ...pickup,
    verifiedAt: new Date(),
    verifiedBy,
  };
  await order.save();

  // Same financial side effects every other "became delivered" path
  // triggers (seller/rider payout creation, admin earning credit, return
  // window, and — what this was actually missing — invoice generation).
  // This was a real gap: self-pickup orders reached DELIVERED without ever
  // running settlement, so no invoice existed for the customer or seller to
  // download even though the order was genuinely delivered.
  await applyDeliveredSettlement(order, orderId);

  emitOrderStatusUpdate(
    orderId,
    { workflowStatus: WORKFLOW_STATUS.DELIVERED, pickupVerified: true },
    order.customer,
  );
  emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_DELIVERED, {
    orderId,
    customerId: order.customer,
    userId: order.customer,
    sellerId: order.seller,
  });

  return order;
}

export async function getCustomerPickupCredentials(orderId, customerId) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId, customer: customerId })
    .select("orderId fulfillmentMethod workflowStatus customerPickup")
    .lean();
  if (!order || order.fulfillmentMethod !== FULFILLMENT_METHOD.CUSTOMER_PICKUP) {
    return null;
  }
  if (order.workflowStatus !== WORKFLOW_STATUS.CUSTOMER_PICKUP_READY) {
    return { orderId, ready: false };
  }
  return {
    orderId,
    ready: true,
    expiresAt: order.customerPickup?.expiresAt || null,
    message: "Use OTP or QR shown when order was marked ready, or verify with order number at shop.",
  };
}
