/** Shared fulfillment labels for seller + admin order UIs */

export const FULFILLMENT_METHOD_LABELS = {
  customer_pickup: "Store Pickup",
  seller_delivery: "Seller Delivery",
  platform_logistics: "Platform Delivery",
};

export const FULFILLMENT_TYPE_LABELS = {
  instant: "Instant",
  scheduled: "Scheduled",
  preorder: "Pre-order",
};

export function getFulfillmentMethodLabel(method) {
  const key = String(method || "platform_logistics").toLowerCase();
  return FULFILLMENT_METHOD_LABELS[key] || "Platform Delivery";
}

export function getFulfillmentTypeLabel(type) {
  const key = String(type || "instant").toLowerCase();
  return FULFILLMENT_TYPE_LABELS[key] || "Instant";
}

export function getFulfillmentMethodBadgeClass(method) {
  const key = String(method || "platform_logistics").toLowerCase();
  if (key === "customer_pickup") return "bg-violet-50 text-violet-700 border-violet-200";
  if (key === "seller_delivery") return "bg-orange-50 text-orange-700 border-orange-200";
  return "bg-sky-50 text-sky-700 border-sky-200";
}

export function getFulfillmentTypeBadgeClass(type) {
  const key = String(type || "instant").toLowerCase();
  if (key === "scheduled") return "bg-blue-50 text-blue-700 border-blue-200";
  if (key === "preorder") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

/** Resolve delivery method from explicit field or logistics/workflow signals */
export function resolveFulfillmentMethod(order = {}) {
  const explicit = String(
    order.fulfillmentMethod ?? order.fulfillment_method ?? "",
  )
    .trim()
    .toLowerCase();

  if (explicit && FULFILLMENT_METHOD_LABELS[explicit]) {
    return explicit;
  }

  const logisticsMode = String(order.logisticsMode ?? "").trim().toLowerCase();
  if (logisticsMode === "pickup") return "customer_pickup";
  if (logisticsMode === "external") return "seller_delivery";
  if (logisticsMode === "zinto") return "platform_logistics";

  const workflow = String(order.workflowStatus ?? "").trim().toUpperCase();
  if (workflow === "EXTERNAL_LOGISTICS_PENDING") return "seller_delivery";
  if (workflow.includes("PICKUP")) return "customer_pickup";

  return "platform_logistics";
}

export function getFulfillmentScheduleDetail(order) {
  const type = String(order?.fulfillmentType || "instant").toLowerCase();
  const deliveryDate = order?.schedule?.deliveryDate;
  const windowLabel = order?.schedule?.windowLabel;
  const formattedDate = deliveryDate
    ? new Date(deliveryDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  if (type === "scheduled") {
    return formattedDate
      ? `${formattedDate}${windowLabel ? ` · ${windowLabel}` : ""}`
      : windowLabel || "Future delivery";
  }
  if (type === "preorder") {
    return formattedDate
      ? `${formattedDate}${windowLabel ? ` · ${windowLabel}` : ""}`
      : "Campaign delivery";
  }
  return "Deliver now";
}

/** Combined display for list/detail badges */
export function getFulfillmentDisplay(order) {
  const type = String(order?.fulfillmentType || "instant").toLowerCase();
  const method = resolveFulfillmentMethod(order);

  return {
    type,
    method,
    typeLabel: getFulfillmentTypeLabel(type),
    methodLabel: getFulfillmentMethodLabel(method),
    typeBadgeClassName: getFulfillmentTypeBadgeClass(type),
    methodBadgeClassName: getFulfillmentMethodBadgeClass(method),
    detail: getFulfillmentScheduleDetail(order),
  };
}
