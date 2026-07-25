import mongoose from "mongoose";
import Order from "../models/order.js";
import Product from "../models/product.js";
import Store from "../models/store.js";
import DeliveryAssignment from "../models/deliveryAssignment.js";
import {
  WORKFLOW_STATUS,
  legacyStatusFromWorkflow,
  DEFAULT_SELLER_TIMEOUT_MS,
  DEFAULT_SCHEDULED_SELLER_TIMEOUT_MS,
  FULFILLMENT_TYPE,
} from "../constants/orderWorkflow.js";
import { requireCanonicalOrderId } from "../utils/orderLookup.js";
import {
  releaseReservedStockForOrder,
  reserveStockForItems,
  computeStockReservationWindow,
} from "./stockService.js";
import {
  removeSellerTimeoutJob,
  removeDeliveryTimeoutJob,
  scheduleSellerTimeoutJob,
} from "./orderWorkflowService.js";
import { removeOrderActivationJob } from "./orderSchedulingService.js";
import { emitToSeller, emitOrderStatusUpdate } from "./orderSocketEmitter.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import { isStoreOperationallyOpen } from "./deliveryOptionResolver.js";
import { calculateDistance } from "../utils/helper.js";

const REASSIGNABLE_STATUSES = new Set([
  WORKFLOW_STATUS.SELLER_PENDING,
  WORKFLOW_STATUS.SELLER_ACCEPTED,
  WORKFLOW_STATUS.SCHEDULED_HOLD,
  WORKFLOW_STATUS.DELIVERY_SEARCH,
  WORKFLOW_STATUS.EXTERNAL_LOGISTICS_PENDING,
]);

function toId(value) {
  if (!value) return "";
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

function httpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function resolveOrderCustomerCoords(order) {
  const lat = Number(order?.address?.location?.lat);
  const lng = Number(order?.address?.location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { valid: false, lat: null, lng: null };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { valid: false, lat: null, lng: null };
  }
  return { valid: true, lat, lng };
}

function getStoreCoords(store) {
  const coords = store?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) {
    return { valid: false, lat: null, lng: null };
  }
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { valid: false, lat: null, lng: null };
  }
  return { valid: true, lat, lng };
}

/**
 * Store must fall inside its own serviceRadius from the customer's delivery pin.
 */
function evaluateStoreInCustomerRange(store, customerLat, customerLng) {
  const storeCoords = getStoreCoords(store);
  if (!storeCoords.valid) {
    return {
      inCustomerRange: false,
      distanceKm: null,
      serviceRadiusKm: Number(store?.serviceRadius) || 5,
      rangeReason: "Store location missing",
    };
  }

  const distanceKm =
    Math.round(
      calculateDistance(customerLat, customerLng, storeCoords.lat, storeCoords.lng) * 10,
    ) / 10;
  const serviceRadiusKm = Number(store?.serviceRadius) || 5;
  const inCustomerRange = distanceKm <= serviceRadiusKm;

  return {
    inCustomerRange,
    distanceKm,
    serviceRadiusKm,
    rangeReason: inCustomerRange
      ? null
      : `Out of range (${distanceKm} km > ${serviceRadiusKm} km service radius)`,
  };
}

function productCoversOrderQty(product, qty, variantSku = "") {
  if (!product) return false;
  const need = Number(qty || 0);
  if (variantSku) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const hit = variants.find(
      (variant) => String(variant?.sku || "").trim() === variantSku,
    );
    if (!hit) return false;
    return Number(hit.stock || 0) >= need;
  }
  return Number(product.stock || 0) >= need;
}

async function loadOrderForReassign(orderId) {
  const canonical = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId: canonical });
  if (!order) throw httpError("Order not found", 404);
  return order;
}

async function assertTargetStoreInCustomerRange(order, targetStore) {
  const customer = resolveOrderCustomerCoords(order);
  if (!customer.valid) {
    throw httpError(
      "Order has no customer delivery location, so store range cannot be verified",
      400,
    );
  }

  const range = evaluateStoreInCustomerRange(
    targetStore,
    customer.lat,
    customer.lng,
  );
  if (!range.inCustomerRange) {
    throw httpError(
      range.rangeReason ||
        "Target store is outside the customer's delivery range",
      400,
    );
  }
  return range;
}

/**
 * Resolve each order line to a product on the target store via catalogProductId.
 * Keeps customer-facing price/name from the original line.
 */
async function mapItemsToTargetStore(order, targetStoreId, { session = null } = {}) {
  const sourceProductIds = order.items
    .map((item) => item.product)
    .filter(Boolean);

  const sourceProducts = await Product.find({ _id: { $in: sourceProductIds } })
    .select("_id catalogProductId name variants")
    .session(session || null)
    .lean();

  const sourceById = new Map(
    sourceProducts.map((product) => [String(product._id), product]),
  );

  const catalogIds = sourceProducts
    .map((product) => product.catalogProductId)
    .filter(Boolean)
    .map(String);

  if (!catalogIds.length) {
    throw httpError(
      "Order items are not linked to catalog products, so they cannot be auto-moved to another store.",
      400,
    );
  }

  const targetProducts = await Product.find({
    sellerId: targetStoreId,
    catalogProductId: { $in: catalogIds },
    status: "active",
    isPublished: { $ne: false },
  })
    .select("_id catalogProductId name mainImage price salePrice stock variants")
    .session(session || null)
    .lean();

  const targetByCatalogId = new Map(
    targetProducts.map((product) => [
      String(product.catalogProductId),
      product,
    ]),
  );

  const remappedItems = [];
  const reservePayload = [];
  const missing = [];

  for (const item of order.items) {
    const source = sourceById.get(String(item.product));
    if (!source?.catalogProductId) {
      missing.push({
        name: item.name || "Unknown item",
        reason: "No catalogProductId on source product",
      });
      continue;
    }

    const catalogId = String(source.catalogProductId);
    const target = targetByCatalogId.get(catalogId);
    if (!target) {
      missing.push({
        name: item.name || source.name || "Unknown item",
        catalogProductId: catalogId,
        reason: "Target store does not sell this catalog product",
      });
      continue;
    }

    const variantSku = String(item.variantSku || item.variantSlot || "").trim();
    if (variantSku) {
      const variants = Array.isArray(target.variants) ? target.variants : [];
      const hit = variants.find(
        (variant) => String(variant?.sku || "").trim() === variantSku,
      );
      if (!hit) {
        missing.push({
          name: item.name || target.name,
          catalogProductId: catalogId,
          reason: `Variant ${variantSku} not found on target store product`,
        });
        continue;
      }
      if (Number(hit.stock || 0) < Number(item.quantity || 0)) {
        missing.push({
          name: item.name || target.name,
          catalogProductId: catalogId,
          reason: `Insufficient variant stock (need ${item.quantity}, have ${hit.stock || 0})`,
        });
        continue;
      }
    } else if (Number(target.stock || 0) < Number(item.quantity || 0)) {
      missing.push({
        name: item.name || target.name,
        catalogProductId: catalogId,
        reason: `Insufficient stock (need ${item.quantity}, have ${target.stock || 0})`,
      });
      continue;
    }

    remappedItems.push({
      product: target._id,
      name: item.name || target.name,
      quantity: item.quantity,
      price: item.price,
      variantSlot: item.variantSlot || variantSku || "",
      variantSku: variantSku || undefined,
      image: item.image || target.mainImage || "",
    });

    reservePayload.push({
      productId: target._id,
      productName: item.name || target.name,
      quantity: item.quantity,
      variantSku,
    });
  }

  if (missing.length) {
    const err = httpError(
      `Cannot reassign: ${missing.length} item(s) unavailable on target store`,
      409,
    );
    err.details = { missing };
    throw err;
  }

  return { remappedItems, reservePayload };
}

async function clearDeliveryState(order, { session = null } = {}) {
  await DeliveryAssignment.updateMany(
    {
      orderId: order.orderId,
      status: { $in: ["broadcasting", "assigned"] },
    },
    {
      $set: {
        status: "superseded",
        meta: {
          supersededAt: new Date(),
          supersedeReason: "admin_store_reassign",
        },
      },
    },
    session ? { session } : {},
  );
}

function sellerTimeoutMsForOrder(order) {
  if (
    order.fulfillmentType === FULFILLMENT_TYPE.SCHEDULED ||
    order.fulfillmentType === FULFILLMENT_TYPE.PREORDER
  ) {
    return DEFAULT_SCHEDULED_SELLER_TIMEOUT_MS();
  }
  return DEFAULT_SELLER_TIMEOUT_MS();
}

/**
 * List stores that can fulfill every catalog line on this order
 * and are within the customer's delivery range (store serviceRadius).
 */
export async function getOrderReassignCandidates(orderId) {
  const order = await loadOrderForReassign(orderId);
  const workflowStatus = order.workflowStatus || WORKFLOW_STATUS.SELLER_PENDING;
  if (!REASSIGNABLE_STATUSES.has(workflowStatus)) {
    throw httpError(
      `Order cannot be reassigned in status ${workflowStatus}`,
      400,
    );
  }

  const customer = resolveOrderCustomerCoords(order);
  if (!customer.valid) {
    return {
      orderId: order.orderId,
      currentStoreId: toId(order.seller),
      requiredCatalogCount: 0,
      candidates: [],
      message:
        "Order has no customer delivery location, so in-range stores cannot be determined.",
    };
  }

  const sourceProductIds = order.items.map((item) => item.product).filter(Boolean);
  const sourceProducts = await Product.find({ _id: { $in: sourceProductIds } })
    .select("_id catalogProductId")
    .lean();
  const sourceById = new Map(
    sourceProducts.map((product) => [String(product._id), product]),
  );

  const catalogIds = [
    ...new Set(
      sourceProducts
        .map((product) => product.catalogProductId)
        .filter(Boolean)
        .map(String),
    ),
  ];

  if (!catalogIds.length) {
    return {
      orderId: order.orderId,
      currentStoreId: toId(order.seller),
      requiredCatalogCount: 0,
      candidates: [],
      message: "Order has no catalog-linked products to match against other stores.",
    };
  }

  const lineRequirementMap = new Map();
  for (const item of order.items) {
    const source = sourceById.get(String(item.product));
    if (!source?.catalogProductId) continue;
    const catalogId = String(source.catalogProductId);
    const variantSku = String(item.variantSku || item.variantSlot || "").trim();
    const key = `${catalogId}::${variantSku}`;
    const existing = lineRequirementMap.get(key);
    if (existing) {
      existing.quantity += Number(item.quantity || 0);
    } else {
      lineRequirementMap.set(key, {
        catalogId,
        quantity: Number(item.quantity || 0),
        variantSku,
      });
    }
  }
  const lineRequirements = [...lineRequirementMap.values()];

  const currentStoreId = toId(order.seller);
  const stores = await Store.find({
    _id: { $ne: currentStoreId },
    isActive: true,
    isVerified: true,
    applicationStatus: "approved",
  })
    .select("_id shopName name address locality location serviceRadius isOpen availability timezone ownerId")
    .limit(200)
    .lean();

  const storeIds = stores.map((store) => String(store._id));
  const matchedProducts = await Product.find({
    sellerId: { $in: storeIds },
    catalogProductId: { $in: catalogIds },
    status: "active",
    isPublished: { $ne: false },
  })
    .select("sellerId catalogProductId stock variants")
    .lean();

  const byStore = new Map();
  for (const product of matchedProducts) {
    const sid = String(product.sellerId);
    if (!byStore.has(sid)) byStore.set(sid, []);
    byStore.get(sid).push(product);
  }

  const candidates = [];
  for (const store of stores) {
    const sid = String(store._id);
    const products = byStore.get(sid) || [];
    const byCatalog = new Map(
      products.map((product) => [String(product.catalogProductId), product]),
    );

    let matchedCount = 0;
    let stockOk = true;
    const requiredLineCount = lineRequirements.length || catalogIds.length;

    for (const line of lineRequirements) {
      const product = byCatalog.get(line.catalogId);
      if (!product) {
        stockOk = false;
        continue;
      }
      matchedCount += 1;
      if (!productCoversOrderQty(product, line.quantity, line.variantSku)) {
        stockOk = false;
      }
    }

    const coveragePct = Math.round(
      (matchedCount / Math.max(requiredLineCount, 1)) * 100,
    );
    if (coveragePct <= 0) continue;

    const range = evaluateStoreInCustomerRange(store, customer.lat, customer.lng);
    const productsAvailable = coveragePct === 100 && stockOk;
    const openState = isStoreOperationallyOpen(store);

    candidates.push({
      storeId: sid,
      shopName: store.shopName || store.name || "Store",
      locality: store.locality || store.address || "",
      isOpenNow: Boolean(openState.open),
      openReason: openState.reason || null,
      matchedCatalogCount: matchedCount,
      requiredCatalogCount: requiredLineCount,
      coveragePct,
      stockOk,
      productsAvailable,
      inCustomerRange: range.inCustomerRange,
      distanceKm: range.distanceKm,
      serviceRadiusKm: range.serviceRadiusKm,
      rangeReason: range.rangeReason,
      canReassign: productsAvailable && range.inCustomerRange,
    });
  }

  candidates.sort((a, b) => {
    if (a.canReassign !== b.canReassign) return a.canReassign ? -1 : 1;
    if (a.inCustomerRange !== b.inCustomerRange) {
      return a.inCustomerRange ? -1 : 1;
    }
    if (
      a.distanceKm != null &&
      b.distanceKm != null &&
      a.distanceKm !== b.distanceKm
    ) {
      return a.distanceKm - b.distanceKm;
    }
    if (b.coveragePct !== a.coveragePct) return b.coveragePct - a.coveragePct;
    if (a.isOpenNow !== b.isOpenNow) return a.isOpenNow ? -1 : 1;
    return String(a.shopName).localeCompare(String(b.shopName));
  });

  return {
    orderId: order.orderId,
    currentStoreId,
    workflowStatus,
    requiredCatalogCount: lineRequirements.length || catalogIds.length,
    customerLocation: { lat: customer.lat, lng: customer.lng },
    candidates,
  };
}

/**
 * Admin moves an order to another store when the original seller/store is unavailable.
 */
export async function adminReassignOrderToStore({
  orderId,
  targetStoreId,
  adminId,
  note = "",
  reason = "seller_unavailable",
}) {
  if (!targetStoreId || !mongoose.Types.ObjectId.isValid(String(targetStoreId))) {
    throw httpError("Valid targetStoreId is required", 400);
  }

  const order = await loadOrderForReassign(orderId);
  const workflowStatus = order.workflowStatus || WORKFLOW_STATUS.SELLER_PENDING;
  if (!REASSIGNABLE_STATUSES.has(workflowStatus)) {
    throw httpError(
      `Order cannot be reassigned in status ${workflowStatus}`,
      400,
    );
  }

  const fromStoreId = toId(order.seller);
  const toStoreId = String(targetStoreId);
  if (fromStoreId === toStoreId) {
    throw httpError("Target store is the same as the current store", 400);
  }

  const targetStore = await Store.findById(toStoreId)
    .select(
      "_id shopName name ownerId isActive isVerified applicationStatus location serviceRadius",
    )
    .lean();
  if (!targetStore) throw httpError("Target store not found", 404);
  if (!targetStore.isActive || !targetStore.isVerified) {
    throw httpError("Target store is not active/verified", 400);
  }
  if (targetStore.applicationStatus && targetStore.applicationStatus !== "approved") {
    throw httpError("Target store is not approved", 400);
  }

  await assertTargetStoreInCustomerRange(order, targetStore);

  const fromStore = fromStoreId
    ? await Store.findById(fromStoreId).select("_id shopName name").lean()
    : null;
  const fromShopName = fromStore?.shopName || fromStore?.name || "Previous store";
  const toShopName = targetStore.shopName || targetStore.name || "New store";

  const session = await mongoose.startSession();
  let updatedOrder;
  try {
    session.startTransaction();

    const locked = await Order.findOne({ orderId: order.orderId }).session(session);
    if (!locked) throw httpError("Order not found", 404);
    if (!REASSIGNABLE_STATUSES.has(locked.workflowStatus || WORKFLOW_STATUS.SELLER_PENDING)) {
      throw httpError(
        `Order cannot be reassigned in status ${locked.workflowStatus}`,
        400,
      );
    }
    if (toId(locked.seller) !== fromStoreId) {
      throw httpError("Order seller changed concurrently. Refresh and retry.", 409);
    }

    const { remappedItems, reservePayload } = await mapItemsToTargetStore(
      locked,
      toStoreId,
      { session },
    );

    // Restore stock on original store products, then reserve on target.
    if (locked.stockReservation?.status !== "RELEASED") {
      await releaseReservedStockForOrder(locked, {
        session,
        reason: "Admin reassigned to another store",
      });
    }

    const paymentMode = locked.paymentMode || locked.payment?.method || "COD";
    await reserveStockForItems({
      items: reservePayload,
      sellerId: toStoreId,
      orderId: locked.orderId,
      session,
      paymentMode,
    });

    await clearDeliveryState(locked, { session });

    const timeoutMs = sellerTimeoutMsForOrder(locked);
    const sellerPendingExpiresAt = new Date(Date.now() + timeoutMs);
    const nextVersion = Number(locked.modificationVersion || 0) + 1;
    const reservation = computeStockReservationWindow(paymentMode);
    const reassignedAt = new Date();
    const reassignmentNote =
      note ||
      `Reassigned from ${fromShopName} to ${toShopName} (${reason})`;

    locked.seller = toStoreId;
    locked.items = remappedItems;
    locked.workflowStatus = WORKFLOW_STATUS.SELLER_PENDING;
    locked.status = legacyStatusFromWorkflow(WORKFLOW_STATUS.SELLER_PENDING);
    locked.orderStatus = locked.status;
    locked.sellerPendingExpiresAt = sellerPendingExpiresAt;
    locked.sellerAcceptedAt = undefined;
    locked.deliveryBoy = undefined;
    locked.deliveryPartner = undefined;
    locked.assignedAt = undefined;
    locked.assignmentVersion = Number(locked.assignmentVersion || 0) + 1;
    locked.skippedBy = [];
    locked.deliverySearchMeta = {
      radiusMeters: 5000,
      attempt: 1,
      lastBroadcastAt: undefined,
    };
    locked.stockReservation = reservation;
    locked.modificationVersion = nextVersion;
    locked.storeReassignment = {
      fromStoreId,
      toStoreId,
      fromShopName,
      toShopName,
      reason,
      note: reassignmentNote,
      reassignedAt,
      reassignedBy: String(adminId || ""),
      previousWorkflowStatus: workflowStatus,
    };
    locked.modificationTimeline = [
      ...(Array.isArray(locked.modificationTimeline)
        ? locked.modificationTimeline
        : []),
      {
        version: nextVersion,
        type: "seller_reassigned",
        actorRole: "admin",
        actorId: String(adminId || ""),
        note: reassignmentNote,
        meta: {
          fromStoreId,
          toStoreId,
          fromShopName,
          toShopName,
          reason,
          previousWorkflowStatus: workflowStatus,
        },
        createdAt: reassignedAt,
      },
    ];

    await locked.save({ session });
    await session.commitTransaction();
    updatedOrder = locked;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  // Post-commit side effects (queues / sockets / notifications)
  await removeSellerTimeoutJob(updatedOrder.orderId);
  await removeOrderActivationJob(updatedOrder.orderId);
  const attempt = Number(updatedOrder.deliverySearchMeta?.attempt || 1);
  await removeDeliveryTimeoutJob(updatedOrder.orderId, attempt);
  await scheduleSellerTimeoutJob(updatedOrder.orderId);

  emitToSeller(fromStoreId, {
    event: "order:reassigned_away",
    payload: {
      orderId: updatedOrder.orderId,
      toStoreId,
      reason,
    },
  });
  emitToSeller(toStoreId, {
    event: "order:new",
    payload: {
      orderId: updatedOrder.orderId,
      workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
      sellerPendingExpiresAt: updatedOrder.sellerPendingExpiresAt,
      reassigned: true,
      fromStoreId,
    },
  });
  if (targetStore.ownerId) {
    emitToSeller(String(targetStore.ownerId), {
      event: "order:new",
      payload: {
        orderId: updatedOrder.orderId,
        workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
        sellerPendingExpiresAt: updatedOrder.sellerPendingExpiresAt,
        reassigned: true,
        fromStoreId,
        storeId: toStoreId,
      },
    });
  }

  emitOrderStatusUpdate(
    updatedOrder.orderId,
    {
      workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
      reassigned: true,
      fromStoreId,
      toStoreId,
    },
    updatedOrder.customer,
  );

  // Push delivery expands store → owner (+ sibling store token ids).
  emitNotificationEvent(NOTIFICATION_EVENTS.NEW_ORDER, {
    orderId: updatedOrder.orderId,
    sellerId: toStoreId,
    customerId: updatedOrder.customer,
    reassigned: true,
  });

  emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_REASSIGNED, {
    orderId: updatedOrder.orderId,
    customerId: updatedOrder.customer,
    userId: updatedOrder.customer,
    fromStoreId,
    toStoreId,
    shopName: targetStore.shopName || targetStore.name,
  });

  const populated = await Order.findOne({ orderId: updatedOrder.orderId })
    .populate("seller", "shopName name phone address locality")
    .populate("customer", "name phone email")
    .populate("items.product", "name mainImage price salePrice")
    .lean();

  return populated;
}
