import { resolveFulfillmentMethod } from "./orderFulfillment.js";
import { getLegacyStatusFromOrder } from "./orderStatus.js";

const DEFAULT_PARTNER_IMAGE =
  "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop";

// "RIDER_AT_STORE"/"CUSTOMER_CONFIRMATION" were previously listed here but
// don't exist in WORKFLOW_STATUS on either the frontend
// (shared/utils/orderStatus.js) or backend (constants/orderWorkflow.js) —
// dead conditions that could never match, removed.
const PLATFORM_ASSIGNED_WORKFLOWS = new Set([
  "DELIVERY_ASSIGNED",
  "PICKUP_READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
]);

function getRawPartnerId(partner) {
  if (!partner) return null;
  if (typeof partner === "string" && partner.length >= 12) return partner;
  if (typeof partner === "object" && partner._id && !(partner.name || partner.phone)) {
    return String(partner._id);
  }
  return null;
}

function buildPartnerDisplay(partner, role = "Delivery Partner") {
  const name = partner.name || "Delivery Partner";
  return {
    role,
    name,
    phone: partner.phone || "N/A",
    avatar: name.charAt(0).toUpperCase(),
    image: partner.profileImage || partner.image || DEFAULT_PARTNER_IMAGE,
    rating: Number(partner.rating) > 0 ? Number(partner.rating) : 4.5,
  };
}

export function isPopulatedDeliveryPartner(partner) {
  return (
    partner &&
    typeof partner === "object" &&
    !Array.isArray(partner) &&
    Boolean(partner.name || partner.phone)
  );
}

/** Resolve delivery partner display for seller/admin tracking UIs */
export function resolveDeliveryPartnerDisplay(order = {}) {
  const partner = isPopulatedDeliveryPartner(order.deliveryBoy)
    ? order.deliveryBoy
    : isPopulatedDeliveryPartner(order.deliveryPartner)
      ? order.deliveryPartner
      : null;

  if (partner) {
    return buildPartnerDisplay(partner);
  }

  const providerName = String(order.externalLogisticsProvider || "").trim();
  if (providerName) {
    return {
      role: "Delivery Partner",
      name: providerName,
      phone: "N/A",
      avatar: providerName.charAt(0).toUpperCase(),
      image: DEFAULT_PARTNER_IMAGE,
      rating: 0,
    };
  }

  const method = resolveFulfillmentMethod(order);
  const logisticsMode = String(order.logisticsMode || "").toLowerCase();
  const workflow = String(order.workflowStatus || "").toUpperCase();
  const partnerId =
    getRawPartnerId(order.deliveryBoy) || getRawPartnerId(order.deliveryPartner);

  const isSellerDelivery =
    method === "seller_delivery" ||
    logisticsMode === "external" ||
    workflow === "EXTERNAL_LOGISTICS_PENDING";

  if (isSellerDelivery) {
    const storeName = order.seller?.shopName || order.seller?.name || "Store team";
    return {
      role: "Seller",
      name: storeName,
      phone: order.seller?.phone || "N/A",
      avatar: storeName.charAt(0).toUpperCase(),
      image: DEFAULT_PARTNER_IMAGE,
      rating: 0,
    };
  }

  if (
    partnerId &&
    PLATFORM_ASSIGNED_WORKFLOWS.has(workflow)
  ) {
    return {
      role: "Delivery Partner",
      name: "Delivery partner assigned",
      phone: "N/A",
      avatar: "D",
      image: DEFAULT_PARTNER_IMAGE,
      rating: 0,
    };
  }

  if (method === "customer_pickup" || logisticsMode === "pickup") {
    const storeName = order.seller?.shopName || order.seller?.name || "Store";
    return {
      role: "Pickup",
      name: storeName,
      phone: order.seller?.phone || "N/A",
      avatar: storeName.charAt(0).toUpperCase(),
      image: DEFAULT_PARTNER_IMAGE,
      rating: 0,
    };
  }

  return {
    role: "Partner",
    name: "Not Assigned",
    phone: "N/A",
    avatar: "?",
    image: DEFAULT_PARTNER_IMAGE,
    rating: 0,
  };
}

/** Map backend order to a clearer tracking status label */
export function getTrackingUiStatus(order = {}) {
  const status = String(order.status || "").toLowerCase();
  const workflow = String(order.workflowStatus || "").toUpperCase();
  const method = resolveFulfillmentMethod(order);
  // The two lifecycle-terminus checks below delegate to the same resolver
  // every other module uses, instead of re-deriving from raw fields — the
  // rest of this function's tracking-specific vocabulary (blending
  // fulfillment method with lifecycle stage into labels like "Seller
  // Delivery"/"Picked Up") stays as-is since it's a genuinely different,
  // more specific concern than a plain lifecycle-status label.
  const legacyStatus = getLegacyStatusFromOrder(order);

  if (legacyStatus === "delivered") return "Delivered";
  if (legacyStatus === "out_for_delivery") return "On the Way";

  if (method === "customer_pickup" || String(order.logisticsMode || "").toLowerCase() === "pickup") {
    return "Pickup";
  }

  if (
    method === "seller_delivery" ||
    String(order.logisticsMode || "").toLowerCase() === "external" ||
    workflow === "EXTERNAL_LOGISTICS_PENDING"
  ) {
    if (status === "packed" || workflow === "PACKED") return "Packed";
    return "Seller Delivery";
  }

  if (isPopulatedDeliveryPartner(order.deliveryBoy || order.deliveryPartner)) {
    if (status === "packed") return "Picked Up";
    return "Assigned";
  }

  if (
    (getRawPartnerId(order.deliveryBoy) || getRawPartnerId(order.deliveryPartner)) &&
    PLATFORM_ASSIGNED_WORKFLOWS.has(workflow)
  ) {
    return "Assigned";
  }

  if (status === "packed") return "Picked Up";
  if (status === "confirmed") return "Confirmed";
  return "Active";
}

export function getTrackingStatusVariant(status) {
  switch (status) {
    case "On the Way":
      return "info";
    case "Seller Delivery":
    case "Assigned":
    case "Picked Up":
    case "Packed":
    case "Confirmed":
      return "warning";
    case "Delivered":
      return "success";
    case "Pickup":
      return "primary";
    default:
      return "secondary";
  }
}
