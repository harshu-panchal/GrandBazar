import Order from "../models/order.js";
import Product from "../models/product.js";
import { placeOrderAtomic } from "./orderPlacementService.js";
import { findCustomerByPhone } from "./admin/userAdminService.js";
import { signPhoneOrderPayLinkToken } from "./paymentService.js";
import { sendPhoneOrderPayLinkSms } from "./smsIndiaHubService.js";
import { sendOrderPaymentLinkEmail } from "./emailService.js";

const PAY_LINK_EXPIRY_MS = 30 * 60 * 1000;

// Customer.addresses stores label as lowercase ("home"/"work"/"other" —
// see models/customer.js addressSchema), but Order.address.type is an enum
// of ["Home", "Work", "Other"] (models/order.js). The admin/seller UI passes
// the customer's saved address straight through, so it must be re-cased
// here or Mongoose rejects the order with an enum validation error.
const ADDRESS_TYPE_ENUM = ["Home", "Work", "Other"];
function normalizeAddressType(type) {
  const match = ADDRESS_TYPE_ENUM.find(
    (candidate) => candidate.toLowerCase() === String(type || "").toLowerCase(),
  );
  return match || "Other";
}

// placeOrderAtomic derives `seller` purely from each item's product.sellerId
// — it never checks "do these items belong to the caller's own store." That
// is fine for the admin flow (an operator may legitimately place an order
// for ANY store), but a seller-initiated phone order must be restricted to
// that seller's own catalog. Mirrors the ownership check already used by
// orderPriceAdjustmentService.js's addOrderItems (seller-edit-order) flow.
async function assertItemsBelongToSeller(items, sellerId) {
  const productIds = items.map((item) => item.product || item.productId || item.id).filter(Boolean);
  const products = await Product.find({ _id: { $in: productIds } })
    .select("_id sellerId name")
    .lean();
  const productById = new Map(products.map((p) => [String(p._id), p]));

  for (const item of items) {
    const productId = String(item.product || item.productId || item.id || "");
    const product = productById.get(productId);
    if (!product) {
      const err = new Error("One or more products in this order could not be found");
      err.statusCode = 404;
      throw err;
    }
    if (String(product.sellerId) !== String(sellerId)) {
      const err = new Error(
        `${product.name} is from a different store and cannot be added to this order`,
      );
      err.statusCode = 400;
      throw err;
    }
  }
}

/**
 * Shared "place an order on behalf of a customer who called in" flow, used
 * by both the admin phone-order controller and the seller phone-order
 * controller. Builds the order via placeOrderAtomic (forcing paymentMode
 * ONLINE — confirm-after-payment is the whole point), generates a
 * short-lived pay-by-link token, and sends it via SMS/email.
 *
 * @param {string|null} restrictToSellerId - when set (seller flow), every
 *   item must belong to this store or the whole request is rejected before
 *   placeOrderAtomic is ever called. null (admin flow) skips this check.
 * @param {string} placedByActorId - the acting Admin or Store id, stamped
 *   onto the order for audit/attribution.
 * @param {"admin"|"seller"} placementActorRole - which actor field to stamp.
 */
export async function placePhoneOrderForCustomer({
  customerPhone,
  items,
  address,
  notifyVia,
  fulfillmentType,
  fulfillmentMethod,
  deliveryDate,
  windowLabel,
  timeSlot,
  campaignId,
  preOrderCampaignId,
  tipAmount,
  couponId,
  couponCode,
  discountTotal,
  freeDelivery,
  idempotencyKey,
  restrictToSellerId = null,
  placedByActorId,
  placementActorRole,
}) {
  const customer = await findCustomerByPhone(customerPhone);
  if (!customer) {
    const err = new Error(
      "No account found for this phone number. Ask the customer to sign up first.",
    );
    err.statusCode = 404;
    throw err;
  }
  if (customer.isActive === false) {
    const err = new Error("This customer account is inactive");
    err.statusCode = 403;
    throw err;
  }

  if (restrictToSellerId) {
    await assertItemsBelongToSeller(items, restrictToSellerId);
  }

  const payload = {
    items,
    address: {
      ...address,
      type: normalizeAddressType(address?.type),
    },
    // Forced, never taken from the client — the whole point of this flow is
    // confirm-after-payment, so COD phone orders are out of scope.
    paymentMode: "ONLINE",
    timeSlot: timeSlot || "now",
    fulfillmentType,
    fulfillmentMethod,
    deliveryDate,
    windowLabel,
    campaignId,
    preOrderCampaignId,
    tipAmount: tipAmount || 0,
    couponId: couponId || null,
    couponCode: couponCode || null,
    discountTotal: discountTotal || 0,
    freeDelivery: Boolean(freeDelivery),
  };

  // Supplying items directly (rather than via the customer's own cart) takes
  // placeOrderAtomic's DIRECT_ITEMS branch, so the target customer's real
  // Cart document is never touched by the operator's picks. Seller/store is
  // derived from the items automatically, and placeOrderAtomic already
  // rejects a cart spanning more than one store.
  const placement = await placeOrderAtomic({
    customerId: customer._id,
    payload,
    idempotencyKey,
  });

  const orders = placement.orders || [];
  const primaryOrder = placement.order;
  const orderRef = placement.checkoutGroup?.checkoutGroupId || primaryOrder?.orderId;
  const amount =
    primaryOrder?.paymentBreakdown?.grandTotal ?? primaryOrder?.pricing?.total ?? null;

  const token = signPhoneOrderPayLinkToken({ orderRef, customerId: customer._id });
  const expiresAt = new Date(Date.now() + PAY_LINK_EXPIRY_MS);
  const payLinkUrl = `${process.env.FRONTEND_URL}/pay/${token}`;

  const sentVia = [];
  const channels = notifyVia || [];
  if (channels.includes("sms") && customer.phone) {
    try {
      await sendPhoneOrderPayLinkSms({ phone: customer.phone, payLinkUrl, amount });
      sentVia.push("sms");
    } catch (err) {
      console.warn("[phoneOrderService] SMS send failed:", err.message);
    }
  }
  if (channels.includes("email") && customer.email) {
    try {
      await sendOrderPaymentLinkEmail({
        email: customer.email,
        name: customer.name,
        orderId: primaryOrder?.orderId,
        amount,
        payLinkUrl,
        expiresAt,
      });
      sentVia.push("email");
    } catch (err) {
      console.warn("[phoneOrderService] Email send failed:", err.message);
    }
  }

  const orderIds = orders.map((order) => order._id);
  if (orderIds.length) {
    const actorStamp =
      placementActorRole === "seller"
        ? { placedBySeller: placedByActorId }
        : { placedByAdmin: placedByActorId };
    const paymentLinkActorStamp =
      placementActorRole === "seller"
        ? { createdBySeller: placedByActorId }
        : { createdByAdmin: placedByActorId };

    await Order.updateMany(
      { _id: { $in: orderIds } },
      {
        $set: {
          ...actorStamp,
          placementChannel: "ADMIN_PHONE_ORDER",
          paymentLink: {
            token,
            url: payLinkUrl,
            sentVia,
            sentAt: new Date(),
            expiresAt,
            ...paymentLinkActorStamp,
          },
        },
      },
    );
  }

  return {
    order: primaryOrder,
    orders,
    duplicate: Boolean(placement.duplicate),
    paymentLinkUrl: payLinkUrl,
    sentVia,
  };
}
