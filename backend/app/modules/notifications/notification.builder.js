import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_ROLES,
  ROLE_TO_RECIPIENT_MODEL,
} from "./notification.constants.js";

function normalizeId(value) {
  if (!value) return null;
  if (typeof value === "object" && value._id) {
    return String(value._id);
  }
  return String(value);
}

function normalizeIdList(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeId).filter(Boolean);
  }
  const single = normalizeId(value);
  return single ? [single] : [];
}

function truncateText(text, maxLen = 140) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (value.length <= maxLen) return value;
  return `${value.slice(0, Math.max(0, maxLen - 3))}...`;
}

function getFrontendBaseUrl() {
  const explicit =
    process.env.FRONTEND_URL ||
    process.env.WEB_APP_URL ||
    "http://localhost:5173";
  return String(explicit).trim().replace(/\/+$/, "");
}

function buildOrderLink(orderId) {
  const id = String(orderId || "").trim();
  const baseUrl = getFrontendBaseUrl();
  if (!id) return `${baseUrl}/orders`;
  return `${baseUrl}/orders/${encodeURIComponent(id)}`;
}

function buildCustomerSupportLink(ticketId) {
  const baseUrl = getFrontendBaseUrl();
  const id = String(ticketId || "").trim();
  return id ? `${baseUrl}/chat?ticketId=${encodeURIComponent(id)}` : `${baseUrl}/chat`;
}

function buildAdminSupportLink(ticketId) {
  const baseUrl = getFrontendBaseUrl();
  const id = String(ticketId || "").trim();
  return id
    ? `${baseUrl}/admin/support-tickets?ticketId=${encodeURIComponent(id)}`
    : `${baseUrl}/admin/support-tickets`;
}

function buildSellerInventoryLink(productId) {
  const baseUrl = getFrontendBaseUrl();
  const id = String(productId || "").trim();
  return id
    ? `${baseUrl}/seller/inventory?productId=${encodeURIComponent(id)}`
    : `${baseUrl}/seller/inventory`;
}

function eventDefinition(eventType) {
  switch (eventType) {
    case NOTIFICATION_EVENTS.ORDER_PLACED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Order Placed",
        body: () => "Your order has been placed successfully.",
      };
    case NOTIFICATION_EVENTS.PAYMENT_SUCCESS:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Payment Successful",
        body: () => "Payment received for your order.",
      };
    case NOTIFICATION_EVENTS.ORDER_CONFIRMED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Order Confirmed",
        body: (payload) => payload.customerMessage || "Seller has confirmed your order.",
      };
    case NOTIFICATION_EVENTS.ORDER_PACKED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Order Packed",
        body: (payload) => payload.customerMessage || "Your order is packed and ready.",
      };
    case NOTIFICATION_EVENTS.OUT_FOR_DELIVERY:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Out For Delivery",
        body: () => "Your order is on the way.",
      };
    case NOTIFICATION_EVENTS.ORDER_DELIVERED:
      return {
        multi: true,
        definitions: [
          {
            role: NOTIFICATION_ROLES.CUSTOMER,
            recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
            title: () => "Order Delivered",
            body: () => "Your order has been delivered.",
          },
          {
            role: NOTIFICATION_ROLES.SELLER,
            recipientIds: (payload) => normalizeIdList(payload.sellerId),
            title: () => "Order Delivered ✅",
            body: (payload) =>
              payload.orderId
                ? `Order #${payload.orderId} has been delivered to the customer.`
                : "Your order has been delivered to the customer.",
          },
          {
            role: NOTIFICATION_ROLES.DELIVERY,
            recipientIds: (payload) => normalizeIdList(payload.deliveryId),
            title: () => "Delivery Completed! 🏁",
            body: (payload) =>
              payload.orderId
                ? `You have successfully delivered order #${payload.orderId}.`
                : "Delivery completed successfully.",
          },
        ],
      };
    case NOTIFICATION_EVENTS.ORDER_CANCELLED:
      return {
        multi: true,
        definitions: [
          {
            role: NOTIFICATION_ROLES.CUSTOMER,
            recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
            title: () => "Order Cancelled",
            body: (payload) => payload.customerMessage || "Your order has been cancelled.",
          },
          {
            role: NOTIFICATION_ROLES.SELLER,
            recipientIds: (payload) => normalizeIdList(payload.sellerId || payload.sellerIds),
            title: () => "Order Cancelled",
            body: (payload) =>
              payload.sellerMessage ||
              (payload.orderId
                ? `Order #${payload.orderId} has been cancelled.`
                : "An order has been cancelled."),
          },
        ],
      };
    case NOTIFICATION_EVENTS.REFUND_INITIATED: {
      const refundInitiatedAmount = (payload) => payload.data?.refundAmount ?? payload.amount;
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Refund Initiated",
        body: (payload) => {
          const amount = refundInitiatedAmount(payload);
          return amount
            ? `Refund of ₹${amount} has been initiated for your order.`
            : "Refund has been initiated for your order.";
        },
      };
    }
    case NOTIFICATION_EVENTS.REFUND_COMPLETED: {
      const refundCompletedAmount = (payload) => payload.data?.refundAmount ?? payload.amount;
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Refund Completed",
        body: (payload) => {
          const amount = refundCompletedAmount(payload);
          return amount
            ? `Refund of ₹${amount} has been credited to your wallet.`
            : "Refund has been completed.";
        },
      };
    }
    case NOTIFICATION_EVENTS.NEW_ORDER:
      return {
        role: NOTIFICATION_ROLES.SELLER,
        recipientIds: (payload) => {
          const fromList = normalizeIdList(payload.sellerIds);
          const fromSingle = normalizeIdList(payload.sellerId);
          return [...new Set([...fromList, ...fromSingle])];
        },
        title: (payload) =>
          payload.reassigned ? "Order Assigned to Your Store" : "New Order",
        body: (payload) => {
          if (payload.reassigned && payload.orderId) {
            return `Order #${payload.orderId} was reassigned to your store. Please accept and prepare it.`;
          }
          return payload.orderId
            ? `New order #${payload.orderId} received.`
            : "You have received a new order.";
        },
      };
    case NOTIFICATION_EVENTS.DELIVERY_ASSIGNED:
      return {
        multi: true,
        definitions: [
          {
            role: NOTIFICATION_ROLES.DELIVERY,
            recipientIds: (payload) => normalizeIdList(payload.deliveryId),
            title: () => "Delivery Assigned",
            body: (payload) =>
              payload.orderId
                ? `You have been assigned order #${payload.orderId}.`
                : "A new delivery has been assigned to you.",
          },
          {
            role: NOTIFICATION_ROLES.CUSTOMER,
            recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
            title: () => "Delivery Partner Assigned",
            body: (payload) =>
              payload.orderId
                ? `A delivery partner has been assigned to order #${payload.orderId} and is preparing to pick it up.`
                : "A delivery partner has been assigned to your order.",
          },
          {
            role: NOTIFICATION_ROLES.SELLER,
            recipientIds: (payload) => normalizeIdList(payload.sellerId),
            title: () => "Delivery Partner Assigned",
            body: (payload) =>
              payload.orderId
                ? `A delivery partner has been assigned to order #${payload.orderId}.`
                : "A delivery partner has been assigned to an order.",
          },
        ],
      };
    case NOTIFICATION_EVENTS.NEW_DELIVERY_BROADCAST:
      return {
        role: NOTIFICATION_ROLES.DELIVERY,
        recipientIds: (payload) => normalizeIdList(payload.deliveryIds),
        title: () => "New Delivery Request 🛍️",
        body: (payload) =>
          payload.orderId
            ? `New order #${payload.orderId} is available nearby.`
            : "A new delivery request is available nearby.",
      };
    case NOTIFICATION_EVENTS.ORDER_READY:
      return {
        role: NOTIFICATION_ROLES.DELIVERY,
        recipientIds: (payload) => normalizeIdList(payload.deliveryId),
        title: () => "Order Ready",
        body: (payload) =>
          payload.orderId
            ? `Order #${payload.orderId} is ready for pickup.`
            : "An order is ready for pickup.",
      };
    // ── Return Workflow Events ──────────────────────────────────────────────
    case NOTIFICATION_EVENTS.RETURN_REQUESTED:
      return {
        role: NOTIFICATION_ROLES.SELLER,
        recipientIds: (payload) => normalizeIdList(payload.sellerId),
        title: () => "Return Request Received",
        body: (payload) =>
          payload.orderId
            ? `Customer has requested a return for order #${payload.orderId}.`
            : "A new return request has been received.",
      };
    case NOTIFICATION_EVENTS.RETURN_APPROVED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) =>
          normalizeIdList(payload.customerId || payload.userId),
        title: () => "Return Approved ✅",
        body: (payload) =>
          payload.orderId
            ? `Your return request for order #${payload.orderId} has been approved. A delivery partner will collect the product.`
            : "Your return request has been approved.",
      };
    case NOTIFICATION_EVENTS.RETURN_REJECTED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) =>
          normalizeIdList(payload.customerId || payload.userId),
        title: () => "Return Request Rejected",
        body: (payload) =>
          `Your return request for order #${payload.orderId || ""} was rejected.${
            payload.data?.reason ? " Reason: " + payload.data.reason : ""
          }`,
      };
    case NOTIFICATION_EVENTS.NEW_RETURN_BROADCAST:
      return {
        role: NOTIFICATION_ROLES.DELIVERY,
        recipientIds: (payload) => normalizeIdList(payload.deliveryIds),
        title: () => "New Return Pickup Task 📦",
        body: (payload) =>
          payload.orderId
            ? `Return pickup for order #${payload.orderId} is available nearby.`
            : "A new return pickup task is available nearby.",
      };
    case NOTIFICATION_EVENTS.RETURN_PICKUP_ASSIGNED:
      return {
        role: NOTIFICATION_ROLES.DELIVERY,
        recipientIds: (payload) => normalizeIdList(payload.deliveryId),
        title: () => "Return Pickup Assigned",
        body: (payload) =>
          `Return pickup for order #${payload.orderId || ""}.${
            payload.data?.commission
              ? " Commission: ₹" + payload.data.commission + "."
              : ""
          } Check app for details.`,
      };
    case NOTIFICATION_EVENTS.RETURN_PICKUP_OTP:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) =>
          normalizeIdList(payload.customerId || payload.userId),
        title: () => "Your Return Pickup OTP 🔐",
        body: (payload) =>
          payload.data?.otp
            ? `Your return pickup OTP is ${payload.data.otp}. Share this with the delivery partner. Valid for 10 mins.`
            : "Your return pickup OTP has been sent.",
      };
    case NOTIFICATION_EVENTS.RETURN_DROP_OTP:
      return {
        role: NOTIFICATION_ROLES.SELLER,
        recipientIds: (payload) => normalizeIdList(payload.sellerId),
        title: () => "Return Drop OTP 🔐",
        body: (payload) =>
          payload.data?.otp
            ? `Return drop OTP for order #${payload.orderId}: ${payload.data.otp}. Share with delivery partner.`
            : "A return drop OTP has been generated.",
      };
    case NOTIFICATION_EVENTS.RETURN_COMPLETED:
      return {
        role: NOTIFICATION_ROLES.SELLER,
        recipientIds: (payload) => normalizeIdList(payload.sellerId),
        title: () => "Product Returned to Store",
        body: (payload) =>
          `Product for order #${payload.orderId || ""} has been returned. Admin QC is pending.`,
      };
    case NOTIFICATION_EVENTS.RETURN_QC_PASSED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) =>
          normalizeIdList(payload.customerId || payload.userId),
        title: () => "QC Passed — Refund Initiated 💸",
        body: (payload) =>
          `Quality check passed for order #${payload.orderId || ""}. Refund of ₹${
            payload.data?.refundAmount || 0
          } credited to your wallet.`,
      };
    case NOTIFICATION_EVENTS.RETURN_QC_FAILED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) =>
          normalizeIdList(payload.customerId || payload.userId),
        title: () => "QC Failed — No Refund",
        body: (payload) =>
          `Quality check failed for order #${payload.orderId || ""}. No refund will be issued.${
            payload.data?.note ? " Note: " + payload.data.note : ""
          }`,
      };
    case NOTIFICATION_EVENTS.SUPPORT_TICKET_MESSAGE:
      return {
        multi: true,
        definitions: [
          {
            role: NOTIFICATION_ROLES.ADMIN,
            recipientIds: (payload) => {
              const fromRole = String(payload.fromRole || "").toLowerCase();
              if (fromRole === "admin") return [];
              return normalizeIdList(payload.adminIds);
            },
            title: (payload) => {
              const name = String(payload.userName || "Customer").trim() || "Customer";
              return `Support message from ${name}`;
            },
            body: (payload) => truncateText(payload.messageText || "New message"),
          },
          {
            role: NOTIFICATION_ROLES.CUSTOMER,
            recipientIds: (payload) => {
              const fromRole = String(payload.fromRole || "").toLowerCase();
              if (fromRole !== "admin") return [];
              return normalizeIdList(payload.userId || payload.customerId);
            },
            title: () => "Support reply",
            body: (payload) => truncateText(payload.messageText || "New message"),
          },
        ],
      };
    case NOTIFICATION_EVENTS.LOW_STOCK_ALERT:
      return {
        role: NOTIFICATION_ROLES.SELLER,
        recipientIds: (payload) => normalizeIdList(payload.sellerId),
        title: (payload) => {
          const productName = String(payload.productName || "Product").trim() || "Product";
          return `${productName} is running low`;
        },
        body: (payload) => {
          const variantName = String(payload.variantName || "").trim();
          const currentStock = Number(payload.currentStock || 0);
          const itemLabel = variantName ? `${variantName}` : "this item";
          return `Only ${currentStock} left for ${itemLabel}. Restock soon.`;
        },
      };
    case NOTIFICATION_EVENTS.SELLER_ACCOUNT_APPROVED:
      return {
        role: NOTIFICATION_ROLES.SELLER,
        recipientIds: (payload) => normalizeIdList(payload.sellerId),
        title: () => "Seller account approved",
        body: () => "Your seller admin account has been approved. You can now continue onboarding.",
      };
    case NOTIFICATION_EVENTS.SELLER_ACCOUNT_REJECTED:
      return {
        role: NOTIFICATION_ROLES.SELLER,
        recipientIds: (payload) => normalizeIdList(payload.sellerId),
        title: () => "Seller account rejected",
        body: (payload) => payload.reason || "Your seller admin account application was rejected.",
      };
    case NOTIFICATION_EVENTS.STORE_APPLICATION_APPROVED:
      return {
        role: NOTIFICATION_ROLES.SELLER,
        recipientIds: (payload) => normalizeIdList(payload.sellerId),
        title: (payload) => `${payload.shopName || "Your shop"} approved`,
        body: () => "Your shop application has been approved. You can now open your store.",
      };
    case NOTIFICATION_EVENTS.STORE_APPLICATION_REJECTED:
      return {
        role: NOTIFICATION_ROLES.SELLER,
        recipientIds: (payload) => normalizeIdList(payload.sellerId),
        title: (payload) => `${payload.shopName || "Shop"} application rejected`,
        body: (payload) => payload.reason || "Your shop application was rejected. You can resubmit from My Stores.",
      };
    // ── Order Lifecycle: scheduling / reschedule / price / preorder / dispute ──
    case NOTIFICATION_EVENTS.RESCHEDULE_REQUESTED:
      return {
        role: NOTIFICATION_ROLES.SELLER,
        recipientIds: (payload) => normalizeIdList(payload.sellerId),
        title: () => "Reschedule Requested",
        body: (payload) =>
          payload.orderId
            ? `Customer requested a reschedule for order #${payload.orderId}.`
            : "A customer requested a reschedule.",
      };
    case NOTIFICATION_EVENTS.RESCHEDULE_APPROVED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Reschedule Approved ✅",
        body: (payload) =>
          payload.orderId
            ? `Your reschedule for order #${payload.orderId} was approved.`
            : "Your reschedule request was approved.",
      };
    case NOTIFICATION_EVENTS.RESCHEDULE_REJECTED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Reschedule Rejected",
        body: (payload) =>
          `Your reschedule request for order #${payload.orderId || ""} was rejected.${
            payload.note ? " Reason: " + payload.note : ""
          }`,
      };
    case NOTIFICATION_EVENTS.CANCELLATION_REQUEST_REJECTED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Cancellation Request Rejected",
        body: (payload) =>
          `Your cancellation request for order #${payload.orderId || ""} was rejected — the order is still being processed.${
            payload.adminNote ? " Note: " + payload.adminNote : ""
          }`,
      };
    case NOTIFICATION_EVENTS.PRICE_REVISED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Order Price Revised",
        body: (payload) =>
          payload.amount
            ? `Your order total changed by ₹${payload.amount}. A credit/refund has been applied where applicable.`
            : "Your order price has been revised.",
      };
    case NOTIFICATION_EVENTS.EXTRA_PAYMENT_REQUIRED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Extra Payment Required 💳",
        body: (payload) =>
          payload.amount
            ? `Please pay the additional ₹${payload.amount} to continue with order #${payload.orderId || ""}.`
            : "Additional payment is required to continue your order.",
      };
    case NOTIFICATION_EVENTS.ITEMS_ADDED_TO_ORDER:
      return {
        multi: true,
        definitions: [
          {
            role: NOTIFICATION_ROLES.CUSTOMER,
            recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
            title: () => "Items Added to Your Order",
            body: (payload) => {
              const extra = payload.walletShortfall > 0
                ? ` ₹${payload.walletShortfall} will be collected at delivery.`
                : "";
              return payload.orderId
                ? `New items were added to order #${payload.orderId}.${extra}`
                : `New items were added to your order.${extra}`;
            },
          },
          {
            role: NOTIFICATION_ROLES.SELLER,
            recipientIds: (payload) => normalizeIdList(payload.sellerId),
            title: () => "Order Updated",
            body: (payload) =>
              payload.orderId
                ? `The customer added new items to order #${payload.orderId}. Please review before packing.`
                : "A customer added new items to an order awaiting packing.",
          },
        ],
      };
    case NOTIFICATION_EVENTS.PREORDER_CONFIRMED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Pre-Order Confirmed",
        body: (payload) =>
          payload.orderId
            ? `Your pre-order #${payload.orderId} is confirmed. We'll notify you when the sale starts.`
            : "Your pre-order is confirmed.",
      };
    case NOTIFICATION_EVENTS.PREORDER_SALE_STARTED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Pre-Order Sale Started 🎉",
        body: (payload) =>
          payload.orderId
            ? `The sale for your pre-order #${payload.orderId} has started and is being processed.`
            : "Your pre-order sale has started.",
      };
    case NOTIFICATION_EVENTS.SCHEDULED_ACTIVATED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Order Being Prepared",
        body: (payload) =>
          payload.orderId
            ? `Your scheduled order #${payload.orderId} is now being prepared for delivery.`
            : "Your scheduled order is now being prepared.",
      };
    case NOTIFICATION_EVENTS.ORDER_REASSIGNED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Order Store Updated",
        body: (payload) =>
          payload.orderId
            ? `Order #${payload.orderId} was moved to ${payload.shopName || "another store"} so it can be fulfilled.`
            : "Your order was moved to another store so it can be fulfilled.",
      };
    case NOTIFICATION_EVENTS.DISPUTE_RAISED:
      return {
        multi: true,
        definitions: [
          {
            role: NOTIFICATION_ROLES.CUSTOMER,
            recipientIds: (payload) =>
              payload.raisedBy === "customer"
                ? normalizeIdList(payload.userId || payload.customerId)
                : [],
            title: () => "Dispute Submitted",
            body: (payload) =>
              `Your dispute for order #${payload.orderId || ""} has been submitted for review.`,
          },
          {
            role: NOTIFICATION_ROLES.SELLER,
            recipientIds: (payload) => normalizeIdList(payload.sellerId),
            title: () => "Order Dispute Raised",
            body: (payload) =>
              `A dispute was raised on order #${payload.orderId || ""}. Platform is reviewing.`,
          },
        ],
      };
    case NOTIFICATION_EVENTS.DISPUTE_RESOLVED:
      return {
        multi: true,
        definitions: [
          {
            role: NOTIFICATION_ROLES.CUSTOMER,
            recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
            title: () => "Dispute Resolved",
            body: (payload) =>
              `Your dispute for order #${payload.orderId || ""} was resolved (${payload.resolution || "closed"}).`,
          },
          {
            role: NOTIFICATION_ROLES.SELLER,
            recipientIds: (payload) => normalizeIdList(payload.sellerId),
            title: () => "Dispute Resolved",
            body: (payload) =>
              `Dispute for order #${payload.orderId || ""} was resolved by platform.`,
          },
        ],
      };
    case NOTIFICATION_EVENTS.CASHBACK_CREDITED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Cashback Credited! 💰",
        body: (payload) =>
          `₹${payload.amount || 0} cashback added to your wallet${payload.orderId ? ` for order #${payload.orderId}` : ""}.`,
      };
    case NOTIFICATION_EVENTS.REWARD_EARNED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Reward Earned! 🎁",
        body: (payload) =>
          `You earned ₹${payload.amount || 0}${payload.campaignName ? ` from ${payload.campaignName}` : ""}.`,
      };
    case NOTIFICATION_EVENTS.REWARD_EXPIRING:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Reward Expiring Soon",
        body: (payload) =>
          `Your reward of ₹${payload.amount || 0} expires soon. Use it before it's gone!`,
      };
    case NOTIFICATION_EVENTS.COUPON_ISSUED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "New Coupon Issued",
        body: (payload) => `A new coupon ${payload.couponCode || ""} is available in your rewards.`,
      };
    case NOTIFICATION_EVENTS.REWARD_EXPIRED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Reward Expired",
        body: (payload) =>
          `Your reward of ₹${payload.amount || 0} has expired and was removed from your wallet.`,
      };
    case NOTIFICATION_EVENTS.BIRTHDAY_REWARD:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Happy Birthday! 🎂",
        body: (payload) =>
          `₹${payload.amount || 0} birthday reward${payload.campaignName ? ` from ${payload.campaignName}` : ""} is in your wallet. Enjoy!`,
      };
    case NOTIFICATION_EVENTS.REFERRAL_SUCCESS:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Referral Reward! 🎉",
        body: (payload) =>
          `Your friend completed their first order. ₹${payload.amount || 0} credited to your wallet!`,
      };
    default:
      return null;
  }
}

function eventData(eventType, payload = {}, role) {
  if (eventType === NOTIFICATION_EVENTS.LOW_STOCK_ALERT) {
    const productId = String(payload.productId || "").trim() || undefined;
    return {
      eventType,
      productId,
      currentStock: Number(payload.currentStock || 0),
      threshold: Number(payload.threshold || 0),
      variantSku: String(payload.variantSku || "").trim() || undefined,
      variantName: String(payload.variantName || "").trim() || undefined,
      imageUrl: String(payload.imageUrl || "").trim() || undefined,
      link: buildSellerInventoryLink(productId),
      ...(payload.data || {}),
    };
  }

  if (eventType === NOTIFICATION_EVENTS.SUPPORT_TICKET_MESSAGE) {
    const ticketId = String(payload.ticketId || "").trim() || undefined;
    const link =
      role === NOTIFICATION_ROLES.ADMIN
        ? buildAdminSupportLink(ticketId)
        : buildCustomerSupportLink(ticketId);

    return {
      eventType,
      ticketId,
      link,
      ...(payload.data || {}),
    };
  }

  const orderId = String(payload.orderId || "").trim() || undefined;
  const checkoutGroupId = String(payload.checkoutGroupId || "").trim() || undefined;
  return {
    eventType,
    orderId,
    checkoutGroupId,
    link: buildOrderLink(orderId),
    ...(payload.data || {}),
  };
}

export function buildNotification(eventType, payload = {}) {
  const result = eventDefinition(eventType);
  if (!result) return [];

  const definitions = result.multi ? result.definitions : [result];
  const notifications = [];

  for (const def of definitions) {
    const recipientIds = def.recipientIds(payload);
    if (!recipientIds.length) continue;

    const role = def.role;
    const title = def.title(payload);
    const body = def.body(payload);
    const data = eventData(eventType, payload, role);

    recipientIds.forEach((recipientId) => {
      notifications.push({
        userId: recipientId,
        role,
        recipient: recipientId,
        recipientModel: ROLE_TO_RECIPIENT_MODEL[role],
        type: eventType,
        title,
        body,
        message: body,
        data,
        channel: "push",
        provider: "fcm",
      });
    });
  }

  return notifications;
}

export default {
  buildNotification,
};
