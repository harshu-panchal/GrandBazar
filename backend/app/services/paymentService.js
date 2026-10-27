import crypto from "crypto";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

import Order from "../models/order.js";
import CheckoutGroup from "../models/checkoutGroup.js";
import Payment from "../models/payment.js";
import PaymentWebhookEvent from "../models/paymentWebhookEvent.js";
import { ORDER_PAYMENT_STATUS } from "../constants/finance.js";
import {
  PAYMENT_EVENT_SOURCE,
  PAYMENT_GATEWAY,
  PAYMENT_STATUS,
  canTransitionPaymentStatus,
} from "../constants/payment.js";
import { handleOnlineOrderFinance } from "./finance/orderFinanceService.js";
import { DEFAULT_SELLER_TIMEOUT_MS, WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import { afterPlaceOrderV2 } from "./orderWorkflowService.js";
import { computeSellerPendingExpiry } from "./orderSchedulingService.js";
import { releaseReservedStockForOrder } from "./stockService.js";
import { releaseCouponUsageForOrder } from "./couponUsageService.js";
import { processSubscriptionRazorpayWebhook, isSubscriptionMerchantOrderId } from "./subscriptionPaymentService.js";
import { processCodRemittanceRazorpayWebhook, isCodRemittanceMerchantOrderId } from "./codRemittanceService.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import { buildKey, invalidate } from "./cacheService.js";
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
  mapRazorpayStatusToInternal,
  razorpayCheckoutConfig,
} from "./razorpay/razorpayCheckoutClient.js";

const MAX_MERCHANT_ORDER_ID_LENGTH = 63;

function sanitizeGatewayPayload(payload = {}) {
  return {
    merchantOrderId: payload.merchantOrderId,
    transactionId: payload.transactionId,
    amount: payload.amount,
    state: payload.state,
    responseCode: payload.responseCode,
    paymentMode: payload.paymentMode,
    meta: payload.meta || {},
  };
}

function sanitizeMerchantOrderIdPart(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildGatewayMerchantOrderId(publicOrderRef, attemptCount = 1) {
  const normalizedBase = sanitizeMerchantOrderIdPart(publicOrderRef) || "ORDER";
  const suffix = `-A${Math.max(1, Number(attemptCount) || 1)}`;
  const maxBaseLength = MAX_MERCHANT_ORDER_ID_LENGTH - suffix.length;
  const truncatedBase = normalizedBase.slice(0, Math.max(1, maxBaseLength));
  return `${truncatedBase}${suffix}`;
}

function toOrderLookup(orderRef) {
  if (!orderRef) return null;
  const trimmed = String(orderRef).trim();
  if (!trimmed) return null;
  if (mongoose.Types.ObjectId.isValid(trimmed)) {
    return {
      $or: [{ _id: new mongoose.Types.ObjectId(trimmed) }, { orderId: trimmed }],
    };
  }
  return { orderId: trimmed };
}

function extractCheckoutGroupId(orderRef) {
  const trimmed = String(orderRef || "").trim().toUpperCase();
  if (!trimmed) return null;
  if (trimmed.startsWith("CHK-") || trimmed.startsWith("CG-")) {
    return trimmed;
  }
  return null;
}

async function resolvePaymentTarget(orderRef) {
  const checkoutGroupId = extractCheckoutGroupId(orderRef);
  if (checkoutGroupId) {
    const checkoutGroup = await CheckoutGroup.findOne({ checkoutGroupId }).lean();
    if (!checkoutGroup) {
      const err = new Error("Checkout group not found");
      err.statusCode = 404;
      throw err;
    }
    let orders = await Order.find({ checkoutGroupId })
      .sort({ checkoutGroupIndex: 1, createdAt: 1 });

    if (orders.length === 0) {
      const fallbackClauses = [];
      if (Array.isArray(checkoutGroup.orderIds) && checkoutGroup.orderIds.length > 0) {
        fallbackClauses.push({ _id: { $in: checkoutGroup.orderIds } });
      }
      if (Array.isArray(checkoutGroup.publicOrderIds) && checkoutGroup.publicOrderIds.length > 0) {
        fallbackClauses.push({ orderId: { $in: checkoutGroup.publicOrderIds } });
      }

      if (fallbackClauses.length > 0) {
        orders = await Order.find({ $or: fallbackClauses })
          .sort({ checkoutGroupIndex: 1, createdAt: 1 });
      }
    }

    if (orders.length === 0) {
      const err = new Error("Checkout group has no orders");
      err.statusCode = 404;
      throw err;
    }
    return {
      checkoutGroupId,
      checkoutGroup,
      orders,
      primaryOrder: orders[0],
      publicOrderRef: checkoutGroupId,
    };
  }

  const query = toOrderLookup(orderRef);
  if (!query) {
    const err = new Error("orderRef is required");
    err.statusCode = 400;
    throw err;
  }

  const order = await Order.findOne(query);
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  if (order.checkoutGroupId) {
    const orders = await Order.find({ checkoutGroupId: order.checkoutGroupId })
      .sort({ checkoutGroupIndex: 1, createdAt: 1 });
    const checkoutGroup = await CheckoutGroup.findOne({
      checkoutGroupId: order.checkoutGroupId,
    }).lean();
    return {
      checkoutGroupId: order.checkoutGroupId,
      checkoutGroup,
      orders: orders.length > 0 ? orders : [order],
      primaryOrder: order,
      publicOrderRef: order.checkoutGroupId,
    };
  }

  return {
    checkoutGroupId: null,
    checkoutGroup: null,
    orders: [order],
    primaryOrder: order,
    publicOrderRef: order.orderId,
  };
}

function validatePaymentEligibility(target, userId) {
  if (!target?.orders?.length) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  for (const order of target.orders) {
    if (String(order.customer) !== String(userId)) {
      const err = new Error("You are not allowed to pay for this order");
      err.statusCode = 403;
      throw err;
    }
    if (order.paymentMode !== "ONLINE") {
      const err = new Error("Payment is allowed only for ONLINE orders");
      err.statusCode = 400;
      throw err;
    }
    if (
      order.status === "cancelled" ||
      order.workflowStatus === WORKFLOW_STATUS.CANCELLED ||
      order.status === "delivered" ||
      order.workflowStatus === WORKFLOW_STATUS.DELIVERED
    ) {
      const err = new Error("Payment is not allowed for this checkout state");
      err.statusCode = 409;
      throw err;
    }
    if (order.paymentStatus === ORDER_PAYMENT_STATUS.PAID) {
      const err = new Error("Order is already paid");
      err.statusCode = 409;
      throw err;
    }
    if (order.paymentStatus === ORDER_PAYMENT_STATUS.REFUNDED) {
      const err = new Error("Order payment has already been refunded");
      err.statusCode = 409;
      throw err;
    }
  }
}

function getPayableAmountPaise(target) {
  const amountRupees = target.orders.reduce(
    (sum, order) =>
      sum +
      Number(
        order?.paymentBreakdown?.grandTotal ??
          order?.pricing?.total ??
          order?.pricing?.finalAmount ??
          order?.total ??
          order?.amount ??
          0,
      ),
    0,
  );
  if (!Number.isFinite(amountRupees) || amountRupees <= 0) {
    const err = new Error("Unable to determine payable amount for this checkout");
    err.statusCode = 400;
    throw err;
  }
  return Math.round(amountRupees * 100);
}

function paymentStatusToOrderPaymentStatus(status) {
  if (status === PAYMENT_STATUS.CAPTURED) return ORDER_PAYMENT_STATUS.PAID;
  if (status === PAYMENT_STATUS.FAILED) return ORDER_PAYMENT_STATUS.FAILED;
  if (status === PAYMENT_STATUS.REFUNDED) return ORDER_PAYMENT_STATUS.REFUNDED;
  return ORDER_PAYMENT_STATUS.CREATED;
}

async function transitionPaymentState(payment, {
  nextStatus,
  source,
  reason = "",
  gatewayPaymentId = null,
  rawGatewayResponse = null,
}) {
  const currentStatus = payment.status || PAYMENT_STATUS.CREATED;
  if (currentStatus === nextStatus) {
    if (gatewayPaymentId && !payment.gatewayPaymentId) {
      payment.gatewayPaymentId = gatewayPaymentId;
    }
    if (rawGatewayResponse) {
      payment.rawGatewayResponse = {
        ...(payment.rawGatewayResponse || {}),
        ...sanitizeGatewayPayload(rawGatewayResponse),
      };
    }
    await payment.save();
    return payment;
  }

  if (!canTransitionPaymentStatus(currentStatus, nextStatus)) {
    const err = new Error(`Invalid payment transition ${currentStatus} -> ${nextStatus}`);
    err.statusCode = 409;
    throw err;
  }

  payment.status = nextStatus;
  if (gatewayPaymentId) payment.gatewayPaymentId = gatewayPaymentId;
  if (rawGatewayResponse) {
    payment.rawGatewayResponse = {
      ...(payment.rawGatewayResponse || {}),
      ...sanitizeGatewayPayload(rawGatewayResponse),
    };
  }
  payment.statusHistory.push({
    fromStatus: currentStatus,
    toStatus: nextStatus,
    source,
    reason,
    changedAt: new Date(),
  });
  if (nextStatus === PAYMENT_STATUS.CAPTURED) {
    payment.capturedAt = new Date();
  } else if (nextStatus === PAYMENT_STATUS.FAILED) {
    payment.failedAt = new Date();
    payment.failureReason = reason || payment.failureReason;
  } else if (nextStatus === PAYMENT_STATUS.REFUNDED) {
    payment.refundedAt = new Date();
  }
  await payment.save();
  return payment;
}

// Exported so phoneOrderService.js can reuse this exact transition for a
// phone order's seller alert — see its own call site for why that's safe to
// trigger immediately instead of waiting for payment capture like a normal
// self-checkout ONLINE order does.
export async function moveOrderToSellerPendingAfterPayment(orderId) {
  const now = new Date();
  const order = await Order.findById(orderId).select("fulfillmentType schedule workflowStatus").lean();
  if (!order || order.workflowStatus !== WORKFLOW_STATUS.CREATED) return;

  if (order.fulfillmentType === "preorder") {
    return;
  }

  const sellerPendingUntil =
    order.fulfillmentType === "scheduled"
      ? computeSellerPendingExpiry(order, now)
      : new Date(now.getTime() + DEFAULT_SELLER_TIMEOUT_MS());

  const updatedOrder = await Order.findOneAndUpdate(
    {
      _id: orderId,
      workflowVersion: { $gte: 2 },
      workflowStatus: WORKFLOW_STATUS.CREATED,
      paymentMode: "ONLINE",
    },
    {
      $set: {
        workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
        sellerPendingExpiresAt: sellerPendingUntil,
        expiresAt: sellerPendingUntil,
      },
    },
    { new: true },
  );
  if (updatedOrder) {
    // Without this, a customer's own "My Orders" list (cached for
    // CACHE_ORDERS_TTL) can lag up to a minute behind a payment that just
    // unlocked the order — same invalidation call orderController.js makes
    // after its own order-mutating actions.
    await invalidate(buildKey("orders", "customer", `${updatedOrder.customer.toString()}:*`));
    void afterPlaceOrderV2(updatedOrder).catch((error) => {
      console.warn("[moveOrderToSellerPendingAfterPayment] afterPlaceOrderV2:", error.message);
    });
  }
}

async function getRelatedOrdersForPayment(payment) {
  if (Array.isArray(payment.orderIds) && payment.orderIds.length > 0) {
    return Order.find({ _id: { $in: payment.orderIds } })
      .sort({ checkoutGroupIndex: 1, createdAt: 1 });
  }
  if (payment.checkoutGroupId) {
    return Order.find({ checkoutGroupId: payment.checkoutGroupId })
      .sort({ checkoutGroupIndex: 1, createdAt: 1 });
  }
  if (payment.order) {
    const order = await Order.findById(payment.order);
    return order ? [order] : [];
  }
  return [];
}

async function updateCheckoutGroupPaymentStatus(checkoutGroupId, nextStatus) {
  if (!checkoutGroupId) return;
  if (nextStatus === PAYMENT_STATUS.CAPTURED) {
    await CheckoutGroup.updateOne(
      { checkoutGroupId },
      {
        $set: {
          status: "PAID",
          paymentStatus: ORDER_PAYMENT_STATUS.PAID,
          "stockReservation.status": "COMMITTED",
        },
      },
    );
    return;
  }
  if (nextStatus === PAYMENT_STATUS.FAILED || nextStatus === PAYMENT_STATUS.CANCELLED) {
    await CheckoutGroup.updateOne(
      { checkoutGroupId },
      {
        $set: {
          status: "CANCELLED",
          paymentStatus: ORDER_PAYMENT_STATUS.FAILED,
          "stockReservation.status": "RELEASED",
          "stockReservation.releasedAt": new Date(),
        },
      },
    );
    return;
  }
  if (nextStatus === PAYMENT_STATUS.REFUNDED) {
    await CheckoutGroup.updateOne(
      { checkoutGroupId },
      {
        $set: {
          paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,
          status: "CANCELLED",
        },
      },
    );
  }
}

async function handleOrderSideEffectsFromPaymentStatus(payment, nextStatus, reason) {
  const orders = await getRelatedOrdersForPayment(payment);
  if (!orders.length) return;

  if (nextStatus === PAYMENT_STATUS.CAPTURED) {
    for (const order of orders) {
      await handleOnlineOrderFinance(order._id, {
        actorId: null,
        transactionId: payment.gatewayPaymentId || "",
        metadata: {
          paymentId: payment._id.toString(),
          checkoutGroupId: payment.checkoutGroupId || null,
        },
      });
      await moveOrderToSellerPendingAfterPayment(order._id);
      emitNotificationEvent(NOTIFICATION_EVENTS.PAYMENT_SUCCESS, {
        orderId: order.orderId,
        checkoutGroupId: payment.checkoutGroupId,
        customerId: order.customer,
        userId: order.customer,
        sellerId: order.seller,
      });

      emitNotificationEvent(NOTIFICATION_EVENTS.NEW_ORDER, {
        orderId: order.orderId,
        sellerId: order.seller,
      });
    }
    await updateCheckoutGroupPaymentStatus(payment.checkoutGroupId, nextStatus);
    return;
  }

  if (nextStatus === PAYMENT_STATUS.FAILED || nextStatus === PAYMENT_STATUS.CANCELLED) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      for (const order of orders) {
        const orderForUpdate = await Order.findById(order._id, null, { session });
        if (
          orderForUpdate &&
          orderForUpdate.workflowStatus === WORKFLOW_STATUS.CREATED &&
          orderForUpdate.status !== "cancelled"
        ) {
          await releaseReservedStockForOrder(orderForUpdate, {
            session,
            reason: reason || "Payment failed",
          });
          await releaseCouponUsageForOrder(orderForUpdate, { session });
          orderForUpdate.status = "cancelled";
          orderForUpdate.orderStatus = "cancelled";
          orderForUpdate.workflowStatus = WORKFLOW_STATUS.CANCELLED;
          orderForUpdate.cancelledBy = "system";
          orderForUpdate.cancelReason = reason || "Payment failed";
          orderForUpdate.paymentStatus = ORDER_PAYMENT_STATUS.FAILED;
          await orderForUpdate.save({ session });
        }
      }
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
    await updateCheckoutGroupPaymentStatus(payment.checkoutGroupId, nextStatus);
    for (const order of orders) {
      emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CANCELLED, {
        orderId: order.orderId,
        checkoutGroupId: payment.checkoutGroupId,
        customerId: order.customer,
        userId: order.customer,
        sellerId: order.seller,
        customerMessage: "Order was cancelled because payment failed.",
        sellerMessage: `Order #${order.orderId} was cancelled because payment failed.`,
      });
    }
    return;
  }

  if (nextStatus === PAYMENT_STATUS.REFUNDED) {
    await Order.updateMany(
      { _id: { $in: orders.map((order) => order._id) } },
      {
        $set: {
          paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,
          "payment.status": "refunded",
        },
      },
    );
    await updateCheckoutGroupPaymentStatus(payment.checkoutGroupId, nextStatus);
    for (const order of orders) {
      emitNotificationEvent(NOTIFICATION_EVENTS.REFUND_COMPLETED, {
        orderId: order.orderId,
        checkoutGroupId: payment.checkoutGroupId,
        customerId: order.customer,
        userId: order.customer,
        sellerId: order.seller,
      });
    }
    return;
  }

  await Order.updateMany(
    { _id: { $in: orders.map((order) => order._id) } },
    {
      $set: {
        paymentStatus: paymentStatusToOrderPaymentStatus(nextStatus),
      },
    },
  );
}

export async function createPaymentOrderForOrderRef({
  orderRef,
  userId,
  idempotencyKey = null,
  correlationId = null,
  // Only ever passed by resolvePhoneOrderPayLink. Threaded through so the
  // customer's still-anonymous browser can authenticate the Checkout.js
  // success-verify call (see verifyRazorpayPaymentStatus in
  // paymentController.js) instead of relying solely on the async webhook.
  // A normal logged-in customer's checkout never passes this.
  payLinkToken = null,
}) {
  const target = await resolvePaymentTarget(orderRef);
  validatePaymentEligibility(target, userId);
  const primaryOrder = target.primaryOrder;
  const paymentScopeQuery = target.checkoutGroupId
    ? { checkoutGroupId: target.checkoutGroupId }
    : { order: primaryOrder._id };

  const toCheckoutPayload = (payment) => ({
    payment,
    razorpayOrderId: payment.gatewayOrderId,
    merchantOrderId: payment.rawGatewayResponse?.merchantOrderId,
    amount: payment.amount,
    currency: payment.currency,
    keyId: razorpayCheckoutConfig().keyId,
    payLinkToken,
  });

  if (idempotencyKey) {
    const existingForKey = await Payment.findOne({
      ...paymentScopeQuery,
      idempotencyKey,
    });
    if (existingForKey) {
      return { ...toCheckoutPayload(existingForKey), duplicate: true };
    }
  }

  const existingOpenPayment = await Payment.findOne({
    ...paymentScopeQuery,
    status: {
      $in: [PAYMENT_STATUS.CREATED, PAYMENT_STATUS.PENDING],
    },
  }).sort({ createdAt: -1 });

  if (existingOpenPayment && existingOpenPayment.gatewayOrderId) {
    return { ...toCheckoutPayload(existingOpenPayment), duplicate: true };
  }

  const amountPaise = getPayableAmountPaise(target);
  const currency = String(primaryOrder?.paymentBreakdown?.currency || "INR").toUpperCase();
  const attemptCount = (await Payment.countDocuments(paymentScopeQuery)) + 1;
  const merchantOrderId = buildGatewayMerchantOrderId(
    target.checkoutGroupId || target.publicOrderRef || crypto.randomUUID(),
    attemptCount,
  );

  const razorpayOrder = await createRazorpayOrder({
    amountPaise,
    currency,
    receipt: merchantOrderId,
    notes: {
      merchantOrderId,
      checkoutGroupId: target.checkoutGroupId || "",
      publicOrderId: target.publicOrderRef || "",
    },
  });

  const paymentData = {
    order: primaryOrder._id,
    orderIds: target.orders.map((order) => order._id),
    checkoutGroupId: target.checkoutGroupId || null,
    publicOrderId: target.publicOrderRef,
    customer: primaryOrder.customer,
    gatewayName: PAYMENT_GATEWAY.RAZORPAY,
    gatewayOrderId: razorpayOrder.razorpayOrderId,
    amount: amountPaise,
    currency,
    status: PAYMENT_STATUS.PENDING,
    attemptCount,
    idempotencyKey: idempotencyKey || undefined,
    correlationId,
    rawGatewayResponse: {
      merchantOrderId,
      razorpayOrderId: razorpayOrder.razorpayOrderId,
      amount: amountPaise,
    },
    statusHistory: [
      {
        fromStatus: PAYMENT_STATUS.CREATED,
        toStatus: PAYMENT_STATUS.PENDING,
        source: PAYMENT_EVENT_SOURCE.SYSTEM,
        reason: "Razorpay checkout initiated",
      },
    ],
  };

  const payment = await Payment.create(paymentData);

  console.log(
    JSON.stringify({
      level: "info",
      ts: new Date().toISOString(),
      event: "payment_order_created",
      correlationId,
      publicOrderId: payment.publicOrderId,
      paymentId: payment._id.toString(),
      gatewayOrderId: payment.gatewayOrderId,
      amount: payment.amount,
    }),
  );

  return { ...toCheckoutPayload(payment), duplicate: false };
}

const PHONE_ORDER_PAY_LINK_PURPOSE = "phone_order_pay_link";

// Short-lived signed token embedded in the pay-by-link sent to a phone-order
// customer over SMS/email. Same convention as passwordResetService's
// signResetToken / sellerVerificationService's signVerificationToken: a
// purpose-tagged JWT off the existing JWT_SECRET, no new signing utility or
// secret needed.
export function signPhoneOrderPayLinkToken({ orderRef, customerId }) {
  return jwt.sign(
    {
      orderRef: String(orderRef),
      customerId: String(customerId),
      purpose: PHONE_ORDER_PAY_LINK_PURPOSE,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.PHONE_ORDER_PAY_LINK_EXPIRY || "30m" },
  );
}

// Shared by resolvePhoneOrderPayLink (initial checkout creation) and
// verifyPaymentStatus (the post-payment redirect-back verify call) — both
// need to turn the same raw token into { orderRef, customerId }.
export function verifyPhoneOrderPayLinkToken(token) {
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    const err = new Error("This payment link is invalid or has expired");
    err.statusCode = 400;
    throw err;
  }
  if (decoded.purpose !== PHONE_ORDER_PAY_LINK_PURPOSE) {
    const err = new Error("This payment link is invalid");
    err.statusCode = 400;
    throw err;
  }
  return { orderRef: decoded.orderRef, customerId: decoded.customerId };
}

// Resolves an anonymous pay-link click (no session) into the same Razorpay
// checkout an authenticated customer would get. The token's own customerId
// (verified, never taken from the request) stands in for req.user.id so
// createPaymentOrderForOrderRef's existing ownership check keeps working
// unmodified.
export async function resolvePhoneOrderPayLink(token) {
  const { orderRef, customerId } = verifyPhoneOrderPayLinkToken(token);

  return createPaymentOrderForOrderRef({
    orderRef,
    userId: customerId,
    idempotencyKey: `phonelink:${orderRef}`,
    // Threaded through so the Checkout.js success-verify call (still from
    // this same anonymous browser) can authenticate itself the same way —
    // see verifyRazorpayPaymentStatus in paymentController.js.
    payLinkToken: token,
  });
}

// Plain DB read of a payment's current status — no gateway call. Used by the
// status page as a passive fallback/refresh (e.g. to pick up a result the
// webhook already resolved) alongside the real verify call below, which is
// what actually confirms a payment right after the Checkout.js modal closes.
export async function getPaymentRecordStatus({ gatewayOrderId, userId }) {
  const payment = await Payment.findOne({ gatewayOrderId });
  if (!payment) {
    const err = new Error("Payment attempt not found");
    err.statusCode = 404;
    throw err;
  }
  if (userId && String(payment.customer) !== String(userId)) {
    const err = new Error("Not authorized to view this payment");
    err.statusCode = 403;
    throw err;
  }
  return { payment, status: payment.status };
}

// Verifies the razorpay_order_id/payment_id/signature Checkout.js's success
// handler returns to the client immediately after payment, and captures the
// order's side effects. The webhook (processRazorpayWebhook) is the
// authoritative async fallback for any payment whose browser never calls
// back (closed tab, network drop, etc.).
export async function verifyRazorpayPaymentStatus({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  userId,
  correlationId = null,
}) {
  const payment = await Payment.findOne({ gatewayOrderId: razorpayOrderId });
  if (!payment) {
    const err = new Error("Payment attempt not found");
    err.statusCode = 404;
    throw err;
  }

  // Security check: only the owner or admin can verify
  if (userId && String(payment.customer) !== String(userId)) {
      const err = new Error("Not authorized to verify this payment");
      err.statusCode = 403;
      throw err;
  }

  const signatureValid = verifyRazorpaySignature({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
  });
  const nextStatus = signatureValid ? PAYMENT_STATUS.CAPTURED : PAYMENT_STATUS.FAILED;

  await transitionPaymentState(payment, {
    nextStatus,
    source: PAYMENT_EVENT_SOURCE.CLIENT_VERIFY,
    reason: signatureValid ? "Razorpay signature verified" : "Razorpay signature verification failed",
    gatewayPaymentId: razorpayPaymentId,
    rawGatewayResponse: { razorpayOrderId, razorpayPaymentId },
  });

  await handleOrderSideEffectsFromPaymentStatus(
    payment,
    nextStatus,
    signatureValid ? "CAPTURED" : "SIGNATURE_MISMATCH",
  );

  payment.correlationId = correlationId || payment.correlationId;
  await payment.save();

  console.log(
    JSON.stringify({
      level: "info",
      ts: new Date().toISOString(),
      event: "payment_status_verified",
      correlationId,
      razorpayOrderId,
      status: nextStatus,
    }),
  );

  return {
    payment,
    status: nextStatus,
  };
}

export async function processRazorpayWebhook({
  rawBody,
  signatureHeader,
  correlationId = null,
}) {
  const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "");
  if (!verifyRazorpayWebhookSignature(bodyString, signatureHeader)) {
    const err = new Error("Invalid webhook signature");
    err.statusCode = 401;
    throw err;
  }

  const event = JSON.parse(bodyString);
  const paymentEntity = event.payload?.payment?.entity || {};
  const orderEntity = event.payload?.order?.entity || {};
  const payload = {
    event: event.event,
    razorpayOrderId: paymentEntity.order_id || orderEntity.id,
    razorpayPaymentId: paymentEntity.id,
    amount: paymentEntity.amount ?? orderEntity.amount,
    status: paymentEntity.status,
    errorCode: paymentEntity.error_code,
    errorDescription: paymentEntity.error_description,
    merchantOrderId: paymentEntity.notes?.merchantOrderId || orderEntity.notes?.merchantOrderId,
  };

  const eventId = paymentEntity.id || event.event + ":" + (payload.razorpayOrderId || crypto.randomUUID());
  const payloadHash = crypto.createHash("sha256").update(bodyString).digest("hex");

  try {
    await PaymentWebhookEvent.create({
      eventId,
      gatewayName: PAYMENT_GATEWAY.RAZORPAY,
      eventType: event.event || "unknown",
      payloadHash,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return { duplicate: true, accepted: true };
    }
    throw error;
  }

  const merchantOrderId = payload.merchantOrderId;

  if (isSubscriptionMerchantOrderId(merchantOrderId)) {
    return processSubscriptionRazorpayWebhook({ payload, correlationId });
  }

  if (isCodRemittanceMerchantOrderId(merchantOrderId)) {
    return processCodRemittanceRazorpayWebhook({ payload, correlationId });
  }

  const payment = await Payment.findOne({ gatewayOrderId: payload.razorpayOrderId });
  if (!payment) {
    return { accepted: true, ignored: true, reason: "Payment attempt not found" };
  }

  const nextStatus = mapRazorpayStatusToInternal(event.event || payload.status);
  await transitionPaymentState(payment, {
    nextStatus,
    source: PAYMENT_EVENT_SOURCE.WEBHOOK,
    reason: `Razorpay webhook: ${event.event}`,
    gatewayPaymentId: payload.razorpayPaymentId,
    rawGatewayResponse: payload,
  });

  payment.correlationId = correlationId || payment.correlationId;
  await payment.save();

  await PaymentWebhookEvent.updateOne(
    { eventId },
    {
      $set: {
        payment: payment._id,
        publicOrderId: payment.publicOrderId,
      },
    },
  );

  await handleOrderSideEffectsFromPaymentStatus(payment, nextStatus, payload.errorCode || payload.status);

  return {
    accepted: true,
    duplicate: false,
    paymentStatus: nextStatus,
    publicOrderId: payment.publicOrderId,
  };
}
