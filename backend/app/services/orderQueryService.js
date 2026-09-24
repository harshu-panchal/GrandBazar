import Order from "../models/order.js";
import Delivery from "../models/delivery.js";
import Store from "../models/store.js";
import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import { distanceMeters } from "../utils/geoUtils.js";
import { attachDisplayStatusToList } from "./orderStatusResolver.js";
import mongoose from "mongoose";

function getPartnerRefId(partner) {
  if (!partner) return null;
  if (typeof partner === "string" && partner.length >= 12) return partner;
  if (partner instanceof mongoose.Types.ObjectId) return String(partner);
  if (typeof partner === "object" && partner._id && !(partner.name || partner.phone)) {
    return String(partner._id);
  }
  return null;
}

function isPartnerDocument(partner) {
  return (
    partner &&
    typeof partner === "object" &&
    Boolean(partner.name || partner.phone)
  );
}

/** Ensure deliveryBoy/deliveryPartner refs include name/phone even when populate misses */
export async function attachDeliveryPartners(orders = []) {
  if (!Array.isArray(orders) || orders.length === 0) return orders;

  const missingIds = new Set();
  for (const order of orders) {
    for (const field of ["deliveryBoy", "deliveryPartner"]) {
      const id = getPartnerRefId(order[field]);
      if (id) missingIds.add(id);
    }
  }

  if (missingIds.size === 0) return orders;

  const partners = await Delivery.find({ _id: { $in: [...missingIds] } })
    .select("name phone email profileImage vehicleType vehicleNumber currentArea isOnline isVerified")
    .lean();
  const map = new Map(partners.map((p) => [String(p._id), p]));

  for (const order of orders) {
    for (const field of ["deliveryBoy", "deliveryPartner"]) {
      const id = getPartnerRefId(order[field]);
      if (id && map.has(id)) {
        order[field] = map.get(id);
      }
    }
    if (isPartnerDocument(order.deliveryPartner) && !isPartnerDocument(order.deliveryBoy)) {
      order.deliveryBoy = order.deliveryPartner;
    } else if (isPartnerDocument(order.deliveryBoy) && !isPartnerDocument(order.deliveryPartner)) {
      order.deliveryPartner = order.deliveryBoy;
    }
  }

  return orders;
}

function normalizeSellerStatusFilter(statusParam) {
  if (!statusParam || statusParam === "all") {
    return {};
  }

  if (statusParam === "pending") {
    return { status: "pending" };
  }
  if (statusParam === "processed") {
    return { status: { $in: ["confirmed", "packed"] } };
  }
  if (statusParam === "out-for-delivery") {
    return { status: "out_for_delivery" };
  }
  if (statusParam === "delivered") {
    return { status: "delivered" };
  }
  if (statusParam === "cancelled") {
    return { status: "cancelled" };
  }
  if (statusParam === "returned") {
    return { returnStatus: { $ne: "none" } };
  }

  return {};
}

function appendDateRange(query, { startDate, endDate }) {
  if (!startDate && !endDate) {
    return query;
  }

  const range = {};
  if (startDate) {
    range.$gte = new Date(startDate);
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }

  return {
    ...query,
    createdAt: range,
  };
}

export function buildSellerOrdersQuery({
  role,
  userId,
  statusParam,
  startDate,
  endDate,
  storeIds = [],
}) {
  let base = {};
  if (role !== "admin") {
    if (Array.isArray(storeIds) && storeIds.length > 0) {
      base = { seller: storeIds.length === 1 ? storeIds[0] : { $in: storeIds } };
    } else if (userId) {
      base = { seller: userId };
    }
  }
  const withStatus = {
    ...base,
    ...normalizeSellerStatusFilter(statusParam),
  };
  return appendDateRange(withStatus, { startDate, endDate });
}

export async function fetchSellerOrdersPage({
  role,
  userId,
  user,
  statusParam,
  startDate,
  endDate,
  skip,
  limit,
}) {
  let storeIds = [];
  if (role !== "admin") {
    const candidateIds = [
      user?.activeStoreId,
      userId,
      user?.accountId,
    ]
      .map((s) => String(s || "").trim())
      .filter(Boolean);

    const ownerId = user?.accountId || userId;
    let foundStores = [];
    if (ownerId) {
      try {
        foundStores = await Store.find({ ownerId }).select("_id").lean();
      } catch (err) {
        console.warn("[fetchSellerOrdersPage] Store lookup by ownerId error:", err.message);
      }
    }
    storeIds = [
      ...new Set([...candidateIds, ...foundStores.map((s) => String(s._id))]),
    ];
  }

  const query = buildSellerOrdersQuery({
    role,
    userId,
    statusParam,
    startDate,
    endDate,
    storeIds,
  });

  const [ordersRaw, total, summaryRows] = await Promise.all([
    Order.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate("customer", "name phone")
      .populate("items.product", "name mainImage price salePrice")
      .populate("deliveryBoy", "name phone profileImage")
      .populate("deliveryPartner", "name phone profileImage")
      .populate("seller", "shopName name phone")
      .lean(),
    Order.countDocuments(query),
    Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalAmount: { $sum: { $ifNull: ["$pricing.total", 0] } },
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
          confirmed: {
            $sum: { $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0] },
          },
          packed: {
            $sum: { $cond: [{ $eq: ["$status", "packed"] }, 1, 0] },
          },
          outForDelivery: {
            $sum: { $cond: [{ $eq: ["$status", "out_for_delivery"] }, 1, 0] },
          },
          delivered: {
            $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] },
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
          },
          returned: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$returnStatus", null] },
                    { $ne: ["$returnStatus", ""] },
                    { $ne: ["$returnStatus", "none"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const now = new Date();
  for (const o of ordersRaw) {
    if (
      (o.status === "pending" || o.workflowStatus === WORKFLOW_STATUS.SELLER_PENDING) &&
      o.sellerPendingExpiresAt &&
      new Date(o.sellerPendingExpiresAt) <= now
    ) {
      o.status = "cancelled";
      o.orderStatus = "cancelled";
      o.workflowStatus = WORKFLOW_STATUS.CANCELLED;
      o.cancelledBy = "system";
      o.cancelReason = "Seller did not accept the order in time.";
      Order.findOneAndUpdate(
        { _id: o._id, workflowStatus: WORKFLOW_STATUS.SELLER_PENDING },
        {
          $set: {
            workflowStatus: WORKFLOW_STATUS.CANCELLED,
            status: "cancelled",
            orderStatus: "cancelled",
            cancelledBy: "system",
            cancelReason: "Seller did not accept the order in time.",
          },
        },
        { new: true },
      )
        .then(async (cancelled) => {
          if (cancelled) {
            try {
              const { compensateOrderCancellation } = await import("./orderCompensation.js");
              await compensateOrderCancellation(cancelled, cancelled.orderId);
            } catch (e) {
              console.warn("[fetchSellerOrdersPage] auto-cancel compensation failed:", e.message);
            }
          }
        })
        .catch((e) => console.warn("[fetchSellerOrdersPage] auto-cancel error:", e.message));
    }
  }

  const orders = attachDisplayStatusToList(await attachDeliveryPartners(ordersRaw));

  const rawSummary = summaryRows?.[0] || {};
  const summary = {
    totalOrders: Number(rawSummary.totalOrders || 0),
    totalAmount: Number(rawSummary.totalAmount || 0),
    pending: Number(rawSummary.pending || 0),
    confirmed: Number(rawSummary.confirmed || 0),
    packed: Number(rawSummary.packed || 0),
    outForDelivery: Number(rawSummary.outForDelivery || 0),
    delivered: Number(rawSummary.delivered || 0),
    cancelled: Number(rawSummary.cancelled || 0),
    returned: Number(rawSummary.returned || 0),
  };
  summary.activeOrders =
    summary.pending +
    summary.confirmed +
    summary.packed +
    summary.outForDelivery;

  return {
    query,
    orders,
    total,
    summary,
  };
}

function parseAvailableOrdersLimit(requestedLimit) {
  const maxLimit = 50;
  const parsed = parseInt(requestedLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20;
  }
  return Math.min(parsed, maxLimit);
}

async function resolveNearbySellerIds(deliveryPartner, userId) {
  const nearbySellers = await Store.find({
    isActive: true,
    isVerified: true,
    applicationStatus: "approved",
    location: {
      $near: {
        $geometry: deliveryPartner.location,
        $maxDistance: 5000,
      },
    },
  }).select("_id");

  let sellerIds = nearbySellers.map((seller) => seller._id);
  let usedFallback = false;

  if (sellerIds.length === 0 && process.env.NODE_ENV !== "production") {
    const allSellers = await Store.find({ isActive: true, isVerified: true }).select("_id");
    sellerIds = allSellers.map((seller) => seller._id);
    usedFallback = true;
    console.log(
      `DEV LOG - Radius search found 0 sellers. Bypassing radius check for Delivery Partner: ${userId}`,
    );
  }

  return {
    sellerIds,
    usedFallback,
  };
}

function filterV2OrdersByRadius(v2Orders, deliveryCoords) {
  const [dlng, dlat] = deliveryCoords;
  return v2Orders.filter((order) => {
    const coords = order.seller?.location?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return true;

    const [slng, slat] = coords;
    const searchR = order.deliverySearchMeta?.radiusMeters || 5000;
    const serviceKm = Number(order.seller?.serviceRadius ?? 5);
    const serviceM = Math.max(serviceKm, 0) * 1000;
    const maxR = Math.min(searchR, serviceM);
    return distanceMeters(dlat, dlng, slat, slng) <= maxR;
  });
}

function mergeAvailableOrders(v2Orders, legacyOrders, returnPickups, limit) {
  const seen = new Set();
  const merged = [];

  for (const order of [...v2Orders, ...legacyOrders, ...returnPickups]) {
    if (seen.has(order.orderId)) continue;
    seen.add(order.orderId);
    merged.push(order);
    if (merged.length >= limit) break;
  }

  return merged;
}

export async function fetchAvailableOrdersForDelivery({
  userId,
  requestedLimit,
  type = "delivery",
}) {
  const limit = parseAvailableOrdersLimit(requestedLimit);
  const showDeliveries = type === "delivery" || type === "all";
  const showReturns = type === "return" || type === "all";

  let assignedReturnPickups = [];
  if (showReturns) {
    const assignedReturnPickupsRaw = await Order.find({
      returnStatus: "return_pickup_assigned",
      returnDeliveryBoy: userId,
      skippedBy: { $nin: [userId] },
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate("customer", "name phone")
      .populate("seller", "shopName address name location")
      .lean();

    assignedReturnPickups = assignedReturnPickupsRaw.map((rp) => ({
      ...rp,
      isReturnPickup: true,
    }));
  }

  const deliveryPartner = await Delivery.findById(userId);
  if (
    !deliveryPartner ||
    !deliveryPartner.location ||
    !Array.isArray(deliveryPartner.location.coordinates)
  ) {
    return {
      requiresLocation: showDeliveries && assignedReturnPickups.length === 0,
      orders: attachDisplayStatusToList(assignedReturnPickups),
      limit,
    };
  }

  const { sellerIds } = await resolveNearbySellerIds(deliveryPartner, userId);

  let v2Orders = [];
  if (showDeliveries) {
    const v2OrdersRaw = await Order.find({
      workflowVersion: { $gte: 2 },
      workflowStatus: WORKFLOW_STATUS.DELIVERY_SEARCH,
      deliveryBoy: null,
      seller: { $in: sellerIds },
      skippedBy: { $nin: [userId] },
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate("customer", "name phone")
      .populate("seller", "shopName address name location serviceRadius")
      .lean();

    v2Orders = filterV2OrdersByRadius(
      v2OrdersRaw,
      deliveryPartner.location.coordinates,
    );
  }

  let legacyOrders = [];
  if (showDeliveries) {
    legacyOrders = await Order.find({
      $or: [
        { workflowVersion: { $exists: false } },
        { workflowVersion: { $lt: 2 } },
      ],
      status: { $in: ["confirmed", "packed"] },
      deliveryBoy: null,
      seller: { $in: sellerIds },
      skippedBy: { $nin: [userId] },
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate("customer", "name phone")
      .populate("seller", "shopName address name location")
      .lean();
  }

  let returnPickups = [];
  if (showReturns) {
    const returnPickupsRaw = await Order.find({
      returnStatus: { $in: ["return_approved", "return_pickup_assigned"] },
      skippedBy: { $nin: [userId] },
      $or: [
        {
          returnDeliveryBoy: null,
          seller: { $in: sellerIds },
        },
        {
          returnDeliveryBoy: userId,
        },
      ],
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate("customer", "name phone")
      .populate("seller", "shopName address name location")
      .lean();

    returnPickups = returnPickupsRaw.map((rp) => ({
      ...rp,
      isReturnPickup: true,
    }));
  }

  const orders = attachDisplayStatusToList(
    mergeAvailableOrders(
      v2Orders,
      legacyOrders,
      [...assignedReturnPickups, ...returnPickups],
      limit,
    ),
  ).map(attachDistanceAndEarningsPreview);

  return {
    requiresLocation: false,
    orders,
    limit,
  };
}

function extractLatLng(loc) {
  if (!loc) return null;
  if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
    const lng = Number(loc.coordinates[0]);
    const lat = Number(loc.coordinates[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  if (Array.isArray(loc) && loc.length >= 2) {
    const lng = Number(loc[0]);
    const lat = Number(loc[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  const lat = Number(loc.lat ?? loc.latitude);
  const lng = Number(loc.lng ?? loc.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

/** Adds shop-to-customer distanceKm and a real riderEarnings estimate so the app's
 * new-order popup shows the same figures the rider will actually get, instead of
 * a "Nearby" placeholder and a naive 10%-of-total guess. */
function attachDistanceAndEarningsPreview(order) {
  const sellerLoc = extractLatLng(order.seller?.location || order.sellerStore?.location);
  const addressLoc = extractLatLng(order.address?.location || order.address);
  const originLoc = order.isReturnPickup ? addressLoc : sellerLoc;
  const dropLoc = order.isReturnPickup ? sellerLoc : addressLoc;

  let distanceKm;
  if (originLoc && dropLoc) {
    const meters = distanceMeters(originLoc.lat, originLoc.lng, dropLoc.lat, dropLoc.lng);
    if (Number.isFinite(meters)) distanceKm = Math.round((meters / 1000) * 10) / 10;
  }
  const riderEarnings = order.isReturnPickup
    ? (Number(order.returnDeliveryCommission) || 30)
    : Number(order.paymentBreakdown?.riderPayoutTotal);

  return {
    ...order,
    distanceKm,
    riderEarnings: Number.isFinite(riderEarnings) ? riderEarnings : undefined,
  };
}

export default {
  buildSellerOrdersQuery,
  fetchSellerOrdersPage,
  fetchAvailableOrdersForDelivery,
  attachDeliveryPartners,
};
