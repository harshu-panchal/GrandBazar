import mongoose from "mongoose";
import Cart from "../models/cart.js";
import CheckoutGroup from "../models/checkoutGroup.js";
import Order from "../models/order.js";
import Store from "../models/store.js";
import User from "../models/customer.js";
import Transaction from "../models/transaction.js";
import Coupon from "../models/coupon.js";
import CouponRedemption from "../modules/rewards/models/couponRedemption.model.js";
import { applySingleCoupon } from "./couponApplicationService.js";
import { markGrantRedeemedForCoupon } from "../modules/rewards/services/couponService.js";
import { applyWalletSpendToGrants } from "../modules/rewards/services/cashbackService.js";
import { DEFAULT_WALLET_REDEMPTION } from "../modules/rewards/reward.constants.js";
import { WORKFLOW_STATUS, DEFAULT_SELLER_TIMEOUT_MS, FULFILLMENT_TYPE } from "../constants/orderWorkflow.js";
import { ORDER_PAYMENT_STATUS } from "../constants/finance.js";
import { freezeFinancialSnapshot } from "./finance/orderFinanceService.js";
import {
  generateUniqueCheckoutGroupId,
  generateUniquePublicOrderId,
  generateUniqueShortOrderId,
} from "./orderIdService.js";
import { afterPlaceOrderV2 } from "./orderWorkflowService.js";
import {
  computeStockReservationWindow,
  reserveStockForItems,
} from "./stockService.js";
import { isLowStockAlertsEnabled } from "./lowStockAlertService.js";
import {
  checkIdempotency,
  acquireIdempotencyLock,
  storeIdempotencyResult,
  storeIdempotencyError,
  releaseIdempotencyLock,
  isRetryableError,
  validateIdempotencyKey,
} from "./idempotencyService.js";
import { buildCheckoutPricingSnapshot, groupHydratedItemsBySeller } from "./checkoutPricingService.js";
import {
  resolveChosenFulfillmentMethod,
} from "./deliveryOptionResolver.js";
import { FULFILLMENT_METHOD, fulfillmentMethodToLogisticsMode } from "../constants/deliveryPolicy.js";
import { hydrateOrderItems } from "./finance/pricingService.js";
import {
  inferFulfillmentType,
  validateScheduleSelection,
  buildSchedulePayload,
  computeSellerPendingExpiry,
  isInstantFulfillment,
} from "./orderSchedulingService.js";
import {
  validatePreorderPlacement,
  reserveCampaignAllocation,
  assertCartPreorderRules,
} from "./preOrderCampaignService.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import * as logger from "./logger.js";

const IDEMPOTENCY_RECORD_TTL_MS = 24 * 60 * 60 * 1000;

function normalizePaymentMode(raw) {
  const mode = String(raw || "COD").trim().toUpperCase();
  return mode === "ONLINE" ? "ONLINE" : "COD";
}

function normalizeAddress(address = {}) {
  const normalized = { ...(address || {}) };
  if (address?.location) {
    const lat = Number(address.location.lat);
    const lng = Number(address.location.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      delete normalized.location;
    } else {
      normalized.location = { lat, lng };
    }
  }
  return normalized;
}

function mapOrderItemsForPersistence(hydratedItems = []) {
  return hydratedItems.map((item) => ({
    product: item.productId,
    name: item.productName,
    quantity: item.quantity,
    price: item.price,
    variantSlot: String(item.variantSku || item.variantSlot || "").trim() || undefined,
    image: item.image || "",
  }));
}

async function resolveFulfillmentMethodsForCheckout({
  orderItems,
  payload,
  address,
  fulfillmentType,
  session = null,
}) {
  const hydratedItems = await hydrateOrderItems(orderItems, {
    session,
    enforceServerPricing: true,
  });
  const grouped = groupHydratedItemsBySeller(hydratedItems);
  const map = {};
  for (const sellerId of grouped.keys()) {
    const store = await Store.findById(sellerId).session(session || null).lean();
    if (!store) continue;
    const resolved = await resolveChosenFulfillmentMethod({
      store,
      requestedMethod: payload.fulfillmentMethod,
      customerLocation: address?.location,
      fulfillmentType,
    });
    map[String(sellerId)] = {
      fulfillmentMethod: resolved.fulfillmentMethod,
      logisticsMode: resolved.logisticsMode,
    };
  }
  return map;
}

function placementSource(payload = {}) {
  return Array.isArray(payload.items) && payload.items.length > 0
    ? "DIRECT_ITEMS"
    : "CART";
}

function toPlain(doc) {
  if (!doc) return doc;
  if (typeof doc.toObject === "function") return doc.toObject();
  return doc;
}

function buildResultPayload({ checkoutGroup, orders }) {
  const plainGroup = toPlain(checkoutGroup);
  const plainOrders = Array.isArray(orders) ? orders.map((item) => toPlain(item)) : [];
  return {
    checkoutGroup: plainGroup,
    orders: plainOrders,
    order: plainOrders[0] || null,
  };
}

async function findExistingCheckoutByIdempotency(customerId, idempotencyKey) {
  if (!idempotencyKey) return null;

  const checkoutGroup = await CheckoutGroup.findOne({
    customer: customerId,
    "placement.idempotencyKey": idempotencyKey,
  }).lean();
  if (checkoutGroup) {
    const orders = await Order.find({
      checkoutGroupId: checkoutGroup.checkoutGroupId,
    })
      .sort({ checkoutGroupIndex: 1, createdAt: 1 })
      .lean();
    return { checkoutGroup, orders };
  }

  const legacyOrder = await Order.findOne({
    customer: customerId,
    "placement.idempotencyKey": idempotencyKey,
  }).lean();
  if (!legacyOrder) return null;
  return {
    checkoutGroup: null,
    orders: [legacyOrder],
  };
}

function cartLineKey(productId, variantSku) {
  return `${String(productId)}::${String(variantSku || "").trim()}`;
}

/**
 * Cart is the only place campaignId is ever written server-side (see
 * cartController.addToCart) — the client payload never carries it
 * reliably (CheckoutPage sends fulfillmentType/campaignId from ephemeral
 * React state that resets on refresh or a seller switch). So regardless of
 * whether items came from the request body or the stored cart, annotate
 * each resolved item with its campaignId from the customer's actual cart —
 * that's what fulfillmentType gets reconciled against below, instead of
 * trusting the client's word for it.
 */
async function resolveOrderItemsInput({
  payload,
  customerId,
  session,
}) {
  const cart = await Cart.findOne({ customerId }, null, { session });
  const cartCampaignByLine = new Map();
  if (cart && Array.isArray(cart.items)) {
    for (const item of cart.items) {
      if (item.campaignId) {
        cartCampaignByLine.set(cartLineKey(item.productId, item.variantSku), String(item.campaignId));
      }
    }
  }

  let orderItemsInput = Array.isArray(payload.items) ? payload.items.filter(Boolean) : [];
  if (orderItemsInput.length > 0) {
    orderItemsInput = orderItemsInput.map((item) => ({
      ...item,
      campaignId:
        item.campaignId ||
        cartCampaignByLine.get(cartLineKey(item.product || item.productId, item.variantSku)) ||
        null,
    }));
    return {
      orderItemsInput,
      source: "DIRECT_ITEMS",
      cartDocument: cart,
    };
  }

  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
    const err = new Error("Cannot place order with empty cart");
    err.statusCode = 400;
    throw err;
  }

  orderItemsInput = cart.items.map((item) => ({
    product: item.productId,
    variantSku: String(item.variantSku || "").trim(),
    quantity: item.quantity,
    campaignId: item.campaignId || null,
  }));
  return {
    orderItemsInput,
    source: "CART",
    cartDocument: cart,
  };
}

async function consumeCartItems({
  customerId,
  source,
  orderItemsInput,
  session,
  cartDocument = null,
}) {
  if (source === "CART") {
    const cart = cartDocument || (await Cart.findOne({ customerId }, null, { session }));
    if (!cart) return;
    cart.items = [];
    await cart.save({ session });
    return;
  }

  const cart = cartDocument || (await Cart.findOne({ customerId }, null, { session }));
  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
    return;
  }

  const requestedQtyByLineKey = new Map();
  for (const item of orderItemsInput || []) {
    const productId = String(item.product || item.productId || "");
    if (!productId) continue;
    const variantSku = String(item.variantSku || item.variantSlot || "").trim();
    const quantity = Math.max(Number(item.quantity || 0), 0);
    if (!quantity) continue;
    const key = `${productId}::${variantSku || ""}`;
    requestedQtyByLineKey.set(key, (requestedQtyByLineKey.get(key) || 0) + quantity);
  }

  const remaining = [];
  for (const cartItem of cart.items) {
    const productId = String(cartItem.productId);
    const variantSku = String(cartItem.variantSku || "").trim();
    const key = `${productId}::${variantSku || ""}`;
    const requested = requestedQtyByLineKey.get(key) || 0;
    if (requested <= 0) {
      remaining.push(cartItem);
      continue;
    }
    const quantityLeft = Number(cartItem.quantity || 0) - requested;
    if (quantityLeft > 0) {
      remaining.push({
        productId: cartItem.productId,
        variantSku,
        quantity: quantityLeft,
      });
    }
    requestedQtyByLineKey.delete(key);
  }

  cart.items = remaining;
  await cart.save({ session });
}

function buildCheckoutGroupStatus(paymentMode) {
  return paymentMode === "ONLINE" ? "PAYMENT_PENDING" : "CREATED";
}

function buildCheckoutGroupPaymentStatus(paymentMode) {
  return paymentMode === "ONLINE"
    ? ORDER_PAYMENT_STATUS.CREATED
    : ORDER_PAYMENT_STATUS.PENDING_CASH_COLLECTION;
}

export async function placeOrderAtomic({
  customerId,
  payload,
  idempotencyKey = null,
  retryCount = 0,
}) {
  const normalizedPayload = {
    ...(payload || {}),
    paymentMode: normalizePaymentMode(payload?.paymentMode),
  };

  if (idempotencyKey) {
    if (!validateIdempotencyKey(idempotencyKey)) {
      const error = new Error("Invalid idempotency key format");
      error.statusCode = 400;
      throw error;
    }

    const idempotencyCheck = await checkIdempotency(idempotencyKey, normalizedPayload);
    if (idempotencyCheck.exists && !idempotencyCheck.checksumMismatch) {
      if (idempotencyCheck.result.status === "error") {
        const error = new Error(idempotencyCheck.result.error.message);
        error.statusCode = idempotencyCheck.result.error.statusCode || 500;
        throw error;
      }
      return {
        ...idempotencyCheck.result.data,
        duplicate: true,
      };
    }
    if (idempotencyCheck.checksumMismatch) {
      const error = new Error("Idempotency key reused with different payload");
      error.statusCode = 422;
      throw error;
    }
    if (idempotencyCheck.inProgress) {
      const error = new Error("Request is being processed");
      error.statusCode = 409;
      throw error;
    }

    const lockAcquired = await acquireIdempotencyLock(idempotencyKey);
    if (!lockAcquired) {
      const error = new Error("Request is being processed");
      error.statusCode = 409;
      throw error;
    }
  }

  const existingByIdempotency = await findExistingCheckoutByIdempotency(customerId, idempotencyKey);
  if (existingByIdempotency) {
    const existingResult = buildResultPayload({
      checkoutGroup: existingByIdempotency.checkoutGroup,
      orders: existingByIdempotency.orders,
    });
    if (idempotencyKey) {
      await storeIdempotencyResult(idempotencyKey, existingResult, normalizedPayload);
    }
    return { ...existingResult, duplicate: true };
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction({
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
      maxCommitTimeMS: parseInt(process.env.CHECKOUT_TRANSACTION_TIMEOUT_MS || "20000", 10),
    });

    const paymentMode = normalizePaymentMode(normalizedPayload.paymentMode);
    const normalizedAddress = normalizeAddress(normalizedPayload.address);
    const idempotencyKeyExpiry = idempotencyKey
      ? new Date(Date.now() + IDEMPOTENCY_RECORD_TTL_MS)
      : null;
    const source = placementSource(normalizedPayload);
    const walletAmount = Math.max(0, Number(normalizedPayload.walletAmount || 0));
    const tipAmount = Math.max(0, Number(normalizedPayload.tipAmount || 0));

    const {
      orderItemsInput,
      source: resolvedSource,
      cartDocument,
    } = await resolveOrderItemsInput({
      payload: normalizedPayload,
      customerId,
      session,
    });

    // Reconcile against the customer's actual cart — campaignId is only
    // ever written server-side on the cart (cartController.addToCart), so
    // it's authoritative. This closes the gap where a lost/reset client
    // fulfillmentType (page refresh, seller switch resets CartContext
    // state) would otherwise silently place a genuine pre-order cart as a
    // plain instant order with no campaign link and no allocation held.
    const cartCampaignId = orderItemsInput.find((item) => item.campaignId)?.campaignId || null;
    if (cartCampaignId) {
      normalizedPayload.campaignId = cartCampaignId;
      normalizedPayload.preOrderCampaignId = cartCampaignId;
      normalizedPayload.fulfillmentType = FULFILLMENT_TYPE.PREORDER;
    }

    const fulfillmentType = inferFulfillmentType(normalizedPayload);
    const isInstant = fulfillmentType === FULFILLMENT_TYPE.INSTANT && isInstantFulfillment(normalizedPayload);

    // 1. Fetch user and validate wallet + redemption rules
    const user = await User.findById(customerId).session(session);
    if (walletAmount > 0) {
      if (!user) throw new Error("User not found");
      if (user.walletBalance < walletAmount) {
        throw new Error("Insufficient wallet balance");
      }
      const rules = DEFAULT_WALLET_REDEMPTION;
      const estimatedCart = Math.max(
        0,
        Number(normalizedPayload.grandTotal || normalizedPayload.cartTotal || 0),
      );
      if (rules.minOrderAmount > 0 && estimatedCart < rules.minOrderAmount) {
        throw new Error(
          `Minimum order of ₹${rules.minOrderAmount} required to use reward wallet`,
        );
      }
      if (
        rules.allowWithCoupon === false &&
        (normalizedPayload.couponId || normalizedPayload.couponCode)
      ) {
        throw new Error("Reward wallet cannot be combined with coupons");
      }
      if (rules.maxWalletPercent != null && estimatedCart > 0) {
        const maxByPercent = Math.round(
          (estimatedCart * Number(rules.maxWalletPercent)) / 100,
        );
        if (walletAmount > maxByPercent) {
          throw new Error(
            `You can use up to ${rules.maxWalletPercent}% of order amount from reward wallet`,
          );
        }
      }
      if (
        rules.maxWalletAmount != null &&
        walletAmount > Number(rules.maxWalletAmount)
      ) {
        throw new Error(
          `Maximum reward wallet use is ₹${rules.maxWalletAmount} per order`,
        );
      }
    }

    // Enforce exactly one coupon per order — re-validate server-side
    let resolvedDiscountTotal = 0;
    let resolvedFreeDelivery = false;
    let resolvedCouponId = null;
    let resolvedCouponCode = null;
    const requestedCouponId = normalizedPayload.couponId || null;
    const requestedCouponCode = normalizedPayload.couponCode || null;

    if (requestedCouponId || requestedCouponCode) {
      const hydratedForCoupon = await hydrateOrderItems(orderItemsInput, {
        session,
        enforceServerPricing: true,
      });
      const cartTotalForCoupon = hydratedForCoupon.reduce((sum, item) => {
        const price = Number(item.price || 0);
        const qty = Number(item.quantity || 1);
        return sum + price * qty;
      }, 0);

      const applied = await applySingleCoupon({
        code: requestedCouponCode,
        couponId: requestedCouponId,
        cartTotal: cartTotalForCoupon,
        items: hydratedForCoupon,
        customerId,
      });

      resolvedCouponId = applied.couponId;
      resolvedCouponCode = applied.code;
      resolvedDiscountTotal = Math.max(0, Number(applied.discountAmount || 0));
      resolvedFreeDelivery = Boolean(applied.freeDelivery);
    }

    normalizedPayload.couponId = resolvedCouponId;
    normalizedPayload.couponCode = resolvedCouponCode;
    normalizedPayload.discountTotal = resolvedDiscountTotal;
    normalizedPayload.freeDelivery = resolvedFreeDelivery;

    const pricingSnapshot = await buildCheckoutPricingSnapshot({
      orderItems: orderItemsInput,
      address: normalizedAddress,
      tipAmount,
      discountTotal: resolvedDiscountTotal,
      freeDelivery: resolvedFreeDelivery,
      session,
      fulfillmentMethod: normalizedPayload.fulfillmentMethod || null,
      fulfillmentMethodBySeller: await resolveFulfillmentMethodsForCheckout({
        orderItems: orderItemsInput,
        payload: normalizedPayload,
        address: normalizedAddress,
        fulfillmentType,
        session,
      }),
    });

    if (Number(pricingSnapshot.sellerCount || 0) > 1) {
      const error = new Error(
        "Please order from only one store at a time. Remove items from other stores to continue.",
      );
      error.statusCode = 400;
      throw error;
    }

    const checkoutGroupId = await generateUniqueCheckoutGroupId({ session });
    const checkoutReservation = computeStockReservationWindow(paymentMode);
    const checkoutGroup = new CheckoutGroup({
      checkoutGroupId,
      customer: customerId,
      paymentMode,
      paymentStatus: buildCheckoutGroupPaymentStatus(paymentMode),
      status: buildCheckoutGroupStatus(paymentMode),
      stockReservation: checkoutReservation,
      pricingSummary: pricingSnapshot.aggregateBreakdown,
      walletAmount,
      sellerCount: pricingSnapshot.sellerCount,
      itemCount: pricingSnapshot.itemCount,
      addressSnapshot: normalizedAddress,
      placement: {
        idempotencyKey: idempotencyKey || undefined,
        idempotencyKeyExpiry,
        createdFrom: resolvedSource || source,
      },
      expiresAt: checkoutReservation.expiresAt || null,
      metadata: {
        timeSlot: normalizedPayload.timeSlot || "now",
        deliveryDate: normalizedPayload.deliveryDate || null,
        windowLabel: normalizedPayload.windowLabel || null,
        fulfillmentType,
        tipAmount,
      },
    });
    await checkoutGroup.save({ session });

    const orders = [];
    const pendingLowStockAlerts = [];
    const sellerTimeoutMs = DEFAULT_SELLER_TIMEOUT_MS();
    const shouldStartSellerWorkflow =
      paymentMode === "COD" &&
      (isInstant || fulfillmentType === FULFILLMENT_TYPE.SCHEDULED);

    // Each item already carries its own real campaignId from
    // resolveOrderItemsInput (cart-derived) — pass them through as-is so a
    // genuine mix (e.g. a manipulated DIRECT_ITEMS payload naming products
    // that don't match the customer's actual cart) is actually caught,
    // instead of every item being forced onto the same campaignId first.
    await assertCartPreorderRules(orderItemsInput);

    for (let index = 0; index < pricingSnapshot.sellerBreakdownEntries.length; index += 1) {
      const entry = pricingSnapshot.sellerBreakdownEntries[index];
      const orderId = await generateUniquePublicOrderId({ session });
      const shortOrderId = await generateUniqueShortOrderId({ session });
      const orderReservation = computeStockReservationWindow(paymentMode);

      let scheduleFields = {};
      let preOrderCampaignRef = null;
      let initialWorkflow = shouldStartSellerWorkflow
        ? WORKFLOW_STATUS.SELLER_PENDING
        : WORKFLOW_STATUS.CREATED;
      let legacyOrderStatus = "pending";

      if (fulfillmentType === FULFILLMENT_TYPE.SCHEDULED) {
        const scheduleMeta = await validateScheduleSelection({
          sellerId: entry.sellerId,
          deliveryDate: normalizedPayload.deliveryDate,
          windowLabel: normalizedPayload.windowLabel,
          fulfillmentType: FULFILLMENT_TYPE.SCHEDULED,
        });
        scheduleFields = buildSchedulePayload(scheduleMeta);
        initialWorkflow =
          paymentMode === "COD" ? WORKFLOW_STATUS.SELLER_PENDING : WORKFLOW_STATUS.CREATED;
      } else if (fulfillmentType === FULFILLMENT_TYPE.PREORDER) {
        const campaignId = normalizedPayload.campaignId || normalizedPayload.preOrderCampaignId;
        const { campaign, scheduleMeta } = await validatePreorderPlacement({
          campaignId,
          sellerId: entry.sellerId,
          items: entry.items,
          deliveryDate: normalizedPayload.deliveryDate,
          windowLabel: normalizedPayload.windowLabel,
        });
        preOrderCampaignRef = campaign._id;
        scheduleFields = scheduleMeta;
        for (const item of entry.items) {
          await reserveCampaignAllocation(campaign.campaignId, item.productId, item.quantity, session);
        }
        initialWorkflow = WORKFLOW_STATUS.PREORDER_HOLD;
        legacyOrderStatus = "preorder_confirmed";
        emitNotificationEvent(NOTIFICATION_EVENTS.PREORDER_CONFIRMED, {
          orderId,
          campaignId: campaign.campaignId,
          customerId,
          sellerId: entry.sellerId,
        });
      }

      const sellerPendingUntil =
        initialWorkflow === WORKFLOW_STATUS.SELLER_PENDING
          ? fulfillmentType === FULFILLMENT_TYPE.INSTANT
            ? new Date(Date.now() + sellerTimeoutMs)
            : computeSellerPendingExpiry(
                { fulfillmentType, schedule: scheduleFields },
                new Date(),
              )
          : null;
      const orderExpiresAt = orderReservation.expiresAt || sellerPendingUntil || null;

      const sellerLowStockAlerts = await reserveStockForItems({
        items: entry.items,
        sellerId: entry.sellerId,
        orderId,
        session,
        paymentMode,
      });
      if (Array.isArray(sellerLowStockAlerts) && sellerLowStockAlerts.length > 0) {
        pendingLowStockAlerts.push(...sellerLowStockAlerts);
      }

      const orderGrandTotal = Number(entry.breakdown?.grandTotal || 0);
      const groupGrandTotal = Number(pricingSnapshot.aggregateBreakdown?.grandTotal || 1);
      const proportionateWallet = (orderGrandTotal / groupGrandTotal) * walletAmount;

      const fulfillmentEntry =
        pricingSnapshot.fulfillmentMethodBySeller?.[String(entry.sellerId)] ||
        pricingSnapshot.fulfillmentMethodBySeller?.[entry.sellerId] ||
        null;
      const entryFulfillmentMethod =
        entry.fulfillmentMethod ||
        (typeof fulfillmentEntry === "object" && fulfillmentEntry
          ? fulfillmentEntry.fulfillmentMethod
          : fulfillmentEntry) ||
        pricingSnapshot.sellerBreakdownEntries[index]?.fulfillmentMethod ||
        FULFILLMENT_METHOD.PLATFORM_LOGISTICS;
      const logisticsMode =
        (typeof fulfillmentEntry === "object" && fulfillmentEntry?.logisticsMode) ||
        fulfillmentMethodToLogisticsMode(entryFulfillmentMethod);

      const order = new Order({
        orderId,
        shortOrderId,
        customer: customerId,
        seller: entry.sellerId,
        items: mapOrderItemsForPersistence(entry.items),
        address: normalizedAddress,
        paymentMode,
        paymentStatus:
          paymentMode === "ONLINE"
            ? ORDER_PAYMENT_STATUS.CREATED
            : ORDER_PAYMENT_STATUS.PENDING_CASH_COLLECTION,
        payment: {
          method: paymentMode === "ONLINE" ? "online" : "cash",
          status: "pending",
        },
        pricing: {
          ...entry.breakdown, // This might overwrite fields, be careful
          tip: entry.breakdown.tipTotal,
          total: entry.breakdown.grandTotal,
          walletAmount: proportionateWallet,
        },
        status: legacyOrderStatus,
        orderStatus: legacyOrderStatus,
        timeSlot:
          scheduleFields.deliveryDate && scheduleFields.windowLabel
            ? `${scheduleFields.deliveryDate.toISOString().slice(0, 10)}|${scheduleFields.windowLabel}`
            : normalizedPayload.timeSlot || "now",
        fulfillmentType,
        schedule: scheduleFields.deliveryDate ? scheduleFields : undefined,
        preOrderCampaign: preOrderCampaignRef,
        workflowVersion: 2,
        workflowStatus: initialWorkflow,
        sellerPendingExpiresAt: sellerPendingUntil,
        expiresAt: orderExpiresAt,
        stockReservation: orderReservation,
        checkoutGroupId,
        checkoutGroupSize: pricingSnapshot.sellerCount,
        checkoutGroupIndex: index,
        fulfillmentMethod: entryFulfillmentMethod,
        logisticsMode,
        placement: {
          idempotencyKey: idempotencyKey || undefined,
          idempotencyKeyExpiry,
          createdFrom: resolvedSource || source,
        },
        settlementStatus: {
          overall: "PENDING",
          sellerPayout: "PENDING",
          riderPayout: "PENDING",
          adminEarningCredited: false,
        },
        couponId: normalizedPayload.couponId || null,
        couponCode: normalizedPayload.couponCode || null,
        freeDeliveryApplied: Boolean(normalizedPayload.freeDelivery),
      });

      freezeFinancialSnapshot(order, entry.breakdown);
      await order.save({ session });
      orders.push(order);
    }

    checkoutGroup.orderIds = orders.map((order) => order._id);
    checkoutGroup.publicOrderIds = orders.map((order) => order.orderId);
    checkoutGroup.sellerBreakdown = orders.map((order, index) => ({
      seller: order.seller,
      order: order._id,
      publicOrderId: order.orderId,
      itemCount: order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      subtotal: Number(order.paymentBreakdown?.productSubtotal || 0),
      sellerPayout: Number(order.paymentBreakdown?.sellerPayoutTotal || 0),
      riderTipAmount: Number(order.paymentBreakdown?.riderTipAmount || 0),
      adminCommission: Number(order.paymentBreakdown?.adminProductCommissionTotal || 0),
      grandTotal: Number(order.paymentBreakdown?.grandTotal || 0),
    }));
    await checkoutGroup.save({ session });

    // Deduct wallet balance if used
    if (walletAmount > 0) {
      const balanceBefore = Number(user.walletBalance || 0);
      user.walletBalance -= walletAmount;
      await user.save({ session });
      const balanceAfter = Number(user.walletBalance || 0);

      await Transaction.create({
        user: customerId,
        userModel: "User",
        type: "Order Payment",
        amount: -walletAmount,
        status: "Settled",
        reference: `WLT-CHOUT-${checkoutGroupId}`,
        paymentMethod: "WALLET",
        meta: { checkoutGroupId }
      }, { session });

      const primaryOrder = orders[0];
      void applyWalletSpendToGrants({
        customerId,
        amount: walletAmount,
        order: primaryOrder,
        balanceBefore,
        balanceAfter,
      }).catch(() => {});
    }

    const transactionRows = orders.map((order) => ({
      user: order.seller,
      userModel: "Seller",
      order: order._id,
      type: "Order Payment",
      amount: Number(order.paymentBreakdown?.grandTotal || order.pricing?.total || 0),
      status: "Pending",
      reference: order.orderId,
      paymentMethod: order.paymentMode || null,
      meta: {
        checkoutGroupId,
      },
    }));
    if (transactionRows.length > 0) {
      await Transaction.create(transactionRows, { session, ordered: true });
    }

    await consumeCartItems({
      customerId,
      source: resolvedSource || source,
      orderItemsInput,
      session,
      cartDocument,
    });

    await session.commitTransaction();

    // Increment coupon usedCount and record redemption after successful order placement
    const couponId = normalizedPayload.couponId;
    if (couponId) {
      Coupon.findByIdAndUpdate(couponId, { $inc: { usedCount: 1 } }).catch(() => {});
      const primaryOrder = orders[0];
      CouponRedemption.create({
        couponId,
        customerId,
        orderId: primaryOrder?._id || null,
        orderPublicId: primaryOrder?.orderId || null,
        couponCode: normalizedPayload.couponCode || null,
        discountAmount: Math.max(0, Number(normalizedPayload.discountTotal || 0)),
      }).catch(() => {});
      markGrantRedeemedForCoupon({ customerId, couponId }).catch(() => {});
    }

    const resultPayload = buildResultPayload({
      checkoutGroup,
      orders,
    });

    if (idempotencyKey) {
      await storeIdempotencyResult(idempotencyKey, resultPayload, normalizedPayload);
    }

    if (shouldStartSellerWorkflow) {
      for (const order of orders) {
        if (order.workflowStatus !== WORKFLOW_STATUS.SELLER_PENDING) continue;
        void afterPlaceOrderV2(order).catch((error) => {
          logger.warn("[placeOrderAtomic] afterPlaceOrderV2 failed", {
            orderId: order.orderId,
            message: error.message,
          });
        });
      }
    }

    for (const order of orders) {
      emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_PLACED, {
        orderId: order.orderId,
        checkoutGroupId,
        customerId,
        userId: customerId,
      });
      if (order.seller) {
        emitNotificationEvent(NOTIFICATION_EVENTS.NEW_ORDER, {
          orderId: order.orderId,
          checkoutGroupId,
          sellerId: order.seller,
          customerId,
        });
      }
    }

    if (pendingLowStockAlerts.length > 0 && await isLowStockAlertsEnabled()) {
      pendingLowStockAlerts.forEach((alertPayload) => {
        emitNotificationEvent(NOTIFICATION_EVENTS.LOW_STOCK_ALERT, alertPayload);
      });
    }

    return { ...resultPayload, duplicate: false };
  } catch (error) {
    await session.abortTransaction();

    if (idempotencyKey) {
      if (isRetryableError(error)) {
        await releaseIdempotencyLock(idempotencyKey);
      } else {
        await storeIdempotencyError(idempotencyKey, error, normalizedPayload);
      }
    }

    if (error?.code === 11000) {
      if (idempotencyKey) {
        const existing = await findExistingCheckoutByIdempotency(customerId, idempotencyKey);
        if (existing) {
          const existingResult = buildResultPayload({
            checkoutGroup: existing.checkoutGroup,
            orders: existing.orders,
          });
          await storeIdempotencyResult(idempotencyKey, existingResult, normalizedPayload);
          return { ...existingResult, duplicate: true };
        }
      }

      if (retryCount < 2 && /orderId|checkoutGroupId/i.test(String(error.message || ""))) {
        return placeOrderAtomic({
          customerId,
          payload: normalizedPayload,
          idempotencyKey,
          retryCount: retryCount + 1,
        });
      }
    }

    throw error;
  } finally {
    session.endSession();
  }
}

export default {
  placeOrderAtomic,
};
