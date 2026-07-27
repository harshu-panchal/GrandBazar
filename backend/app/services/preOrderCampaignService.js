import PreOrderCampaign from "../models/preOrderCampaign.js";
import Order from "../models/order.js";
import Product from "../models/product.js";
import {
  WORKFLOW_STATUS,
  FULFILLMENT_TYPE,
  legacyStatusFromWorkflow,
} from "../constants/orderWorkflow.js";
import { validateScheduleSelection, buildSchedulePayload, computeSellerPendingExpiry } from "./orderSchedulingService.js";
import {
  preorderActivationQueue,
  JOB_NAMES,
} from "../queues/orderQueues.js";
import { afterPlaceOrderV2 } from "./orderWorkflowService.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import { compensateOrderCancellation } from "./orderCompensation.js";
import {
  parseCustomerCoordinates,
  getNearbySellerIdsForCustomer,
} from "./customerVisibilityService.js";

function generateCampaignId() {
  return `POC-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export async function createPreOrderCampaign(sellerId, payload, createdBy = null) {
  const campaignId = generateCampaignId();
  const campaign = await PreOrderCampaign.create({
    campaignId,
    seller: sellerId,
    title: payload.title,
    description: payload.description || "",
    status: payload.status || "draft",
    saleWindow: payload.saleWindow,
    deliveryWindow: payload.deliveryWindow,
    products: payload.products || [],
    rescheduleCutoffDays: payload.rescheduleCutoffDays ?? null,
    deliveryWindows: payload.deliveryWindows || [],
    timezone: payload.timezone || "Asia/Kolkata",
    createdBy,
    createdByRole: "seller",
  });

  if (campaign.status === "active") {
    await schedulePreorderSaleStartJob(campaign);
  }
  return campaign;
}

/**
 * Admin-curated advance booking: pick a seller store + that store's products,
 * booking window (saleWindow), and delivery window.
 */
export async function createAdminAdvanceBookingCampaign(adminId, payload = {}) {
  const productRows = Array.isArray(payload.products) ? payload.products : [];
  if (!productRows.length) {
    const err = new Error("At least one product is required");
    err.statusCode = 400;
    throw err;
  }

  // Support multi-store: each row may carry its own sellerId.
  // Legacy payload: single sellerId + products without per-row seller.
  const legacySellerId = payload.sellerId || payload.seller || null;
  const normalizedRows = productRows.map((row) => {
    const productId = row.product || row.productId;
    const rowSellerId = row.sellerId || row.seller || legacySellerId;
    return {
      product: productId,
      seller: rowSellerId,
      allocationCap: Math.max(1, Number(row.allocationCap || 100)),
      allocatedQty: 0,
      priceOverride:
        row.priceOverride === "" || row.priceOverride == null
          ? null
          : Number(row.priceOverride),
    };
  });

  if (normalizedRows.some((row) => !row.product || !row.seller)) {
    const err = new Error("Each product must include a store (sellerId) and product id");
    err.statusCode = 400;
    throw err;
  }

  const productIds = normalizedRows.map((row) => row.product);
  const products = await Product.find({
    _id: { $in: productIds },
    status: "active",
  })
    .select("_id sellerId")
    .lean();

  if (products.length !== productIds.length) {
    const err = new Error("All products must exist and be active");
    err.statusCode = 400;
    throw err;
  }

  const productSellerMap = new Map(
    products.map((p) => [String(p._id), String(p.sellerId)]),
  );
  for (const row of normalizedRows) {
    const ownedBy = productSellerMap.get(String(row.product));
    if (ownedBy !== String(row.seller)) {
      const err = new Error(
        "Each product must belong to the store selected on that row",
      );
      err.statusCode = 400;
      throw err;
    }
  }

  const sellerIds = [...new Set(normalizedRows.map((row) => String(row.seller)))];
  const primarySellerId = legacySellerId || sellerIds[0];

  const saleWindow = payload.saleWindow || {
    startAt: payload.bookingStartAt || payload.saleStartAt,
    endAt: payload.bookingEndAt || payload.saleEndAt,
  };
  const deliveryWindow = payload.deliveryWindow || {
    startDate: payload.deliveryStartDate,
    endDate: payload.deliveryEndDate,
  };

  if (!saleWindow?.startAt || !saleWindow?.endAt) {
    const err = new Error("Booking start and end times are required");
    err.statusCode = 400;
    throw err;
  }
  if (!deliveryWindow?.startDate || !deliveryWindow?.endDate) {
    const err = new Error("Delivery start and end dates are required");
    err.statusCode = 400;
    throw err;
  }
  if (new Date(saleWindow.endAt) <= new Date(saleWindow.startAt)) {
    const err = new Error("Booking end must be after booking start");
    err.statusCode = 400;
    throw err;
  }
  if (new Date(deliveryWindow.endDate) < new Date(deliveryWindow.startDate)) {
    const err = new Error("Delivery end date must be on or after start date");
    err.statusCode = 400;
    throw err;
  }

  const campaignId = generateCampaignId();
  const campaign = await PreOrderCampaign.create({
    campaignId,
    seller: primarySellerId,
    sellers: sellerIds,
    title: payload.title,
    description: payload.description || "",
    status: payload.status || "active",
    saleWindow,
    deliveryWindow,
    products: normalizedRows,
    rescheduleCutoffDays: payload.rescheduleCutoffDays ?? null,
    deliveryWindows: payload.deliveryWindows || [],
    timezone: payload.timezone || "Asia/Kolkata",
    createdByRole: "admin",
    createdByAdmin: adminId || null,
  });

  if (campaign.status === "active") {
    await schedulePreorderSaleStartJob(campaign);
  }
  return campaign;
}

export async function listAdminAdvanceBookingCampaigns({ status } = {}) {
  const query = { createdByRole: "admin" };
  if (status) query.status = status;
  return PreOrderCampaign.find(query)
    .populate("seller", "shopName name locality city")
    .populate("sellers", "shopName name locality city")
    .populate("products.product", "name mainImage price salePrice stock sellerId")
    .populate("products.seller", "shopName name")
    .sort({ createdAt: -1 })
    .lean();
}

export async function updateAdminAdvanceBookingCampaign(adminId, campaignId, updates = {}) {
  const allowed = {};
  for (const key of [
    "title",
    "description",
    "status",
    "saleWindow",
    "deliveryWindow",
    "rescheduleCutoffDays",
    "deliveryWindows",
    "timezone",
  ]) {
    if (updates[key] !== undefined) allowed[key] = updates[key];
  }

  if (Array.isArray(updates.products)) {
    const productRows = updates.products;
    if (!productRows.length) {
      const err = new Error("At least one product is required");
      err.statusCode = 400;
      throw err;
    }

    const normalizedRows = productRows.map((row) => {
      const productId = row.product || row.productId;
      const rowSellerId = row.sellerId || row.seller;
      return {
        product: productId,
        seller: rowSellerId,
        allocationCap: Math.max(1, Number(row.allocationCap || 100)),
        allocatedQty: Math.max(0, Number(row.allocatedQty || 0)),
        priceOverride:
          row.priceOverride === "" || row.priceOverride == null
            ? null
            : Number(row.priceOverride),
      };
    });

    if (normalizedRows.some((row) => !row.product || !row.seller)) {
      const err = new Error("Each product must include a store (sellerId) and product id");
      err.statusCode = 400;
      throw err;
    }

    const productIds = normalizedRows.map((row) => row.product);
    const products = await Product.find({
      _id: { $in: productIds },
      status: "active",
    })
      .select("_id sellerId")
      .lean();

    if (products.length !== productIds.length) {
      const err = new Error("All products must exist and be active");
      err.statusCode = 400;
      throw err;
    }

    const productSellerMap = new Map(
      products.map((p) => [String(p._id), String(p.sellerId)]),
    );
    for (const row of normalizedRows) {
      const ownedBy = productSellerMap.get(String(row.product));
      if (ownedBy !== String(row.seller)) {
        const err = new Error(
          "Each product must belong to the store selected on that row",
        );
        err.statusCode = 400;
        throw err;
      }
    }

    allowed.products = normalizedRows;
    allowed.sellers = [...new Set(normalizedRows.map((row) => String(row.seller)))];
    allowed.seller = allowed.sellers[0];
  }

  const campaign = await PreOrderCampaign.findOneAndUpdate(
    {
      campaignId,
      createdByRole: "admin",
      status: { $nin: ["cancelled", "completed"] },
    },
    { $set: allowed },
    { new: true },
  );
  if (!campaign) {
    const err = new Error("Advance booking campaign not found or cannot be updated");
    err.statusCode = 404;
    throw err;
  }
  if (campaign.status === "active") {
    await schedulePreorderSaleStartJob(campaign);
  }
  return campaign;
}

export async function deleteAdminAdvanceBookingCampaign(campaignId) {
  const campaign = await PreOrderCampaign.findOne({
    campaignId,
    createdByRole: "admin",
  });
  if (!campaign) {
    const err = new Error("Advance booking campaign not found");
    err.statusCode = 404;
    throw err;
  }

  const activeOrders = await Order.countDocuments({
    preOrderCampaign: campaign._id,
    workflowStatus: {
      $nin: [WORKFLOW_STATUS.CANCELLED, WORKFLOW_STATUS.DELIVERED],
    },
  });
  if (activeOrders > 0) {
    const err = new Error(
      "Cannot delete while active orders exist. Cancel the campaign first.",
    );
    err.statusCode = 400;
    throw err;
  }

  await PreOrderCampaign.deleteOne({ _id: campaign._id });
  return { deleted: true, campaignId };
}

export async function cancelAdminAdvanceBookingCampaign(campaignId, reason = "") {
  return cancelPreOrderCampaignByQuery(
    { campaignId, createdByRole: "admin" },
    reason || "Advance booking cancelled by admin",
  );
}

async function cancelPreOrderCampaignByQuery(query, reason = "") {
  const campaign = await PreOrderCampaign.findOneAndUpdate(
    { ...query, status: { $nin: ["cancelled", "completed"] } },
    {
      $set: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    },
    { new: true },
  );
  if (!campaign) {
    const err = new Error("Campaign not found");
    err.statusCode = 404;
    throw err;
  }

  const orders = await Order.find({
    preOrderCampaign: campaign._id,
    workflowStatus: { $nin: [WORKFLOW_STATUS.CANCELLED, WORKFLOW_STATUS.DELIVERED] },
  });

  for (const order of orders) {
    const updated = await Order.findOneAndUpdate(
      { _id: order._id },
      {
        $set: {
          workflowStatus: WORKFLOW_STATUS.CANCELLED,
          status: "cancelled",
          cancelledBy: "admin",
          cancelReason: reason || "Pre-order campaign cancelled",
        },
      },
      { new: true },
    );
    if (updated) {
      await compensateOrderCancellation(updated, updated.orderId);
      emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CANCELLED, {
        orderId: updated.orderId,
        customerId: updated.customer,
        userId: updated.customer,
        sellerId: updated.seller,
        customerMessage: "Your pre-order was cancelled because the campaign was cancelled.",
      });
    }
  }
  return campaign;
}

function serializeCampaignForCustomer(campaign, now = new Date()) {
  const bookingStartAt = campaign.saleWindow?.startAt
    ? new Date(campaign.saleWindow.startAt)
    : null;
  const bookingEndAt = campaign.saleWindow?.endAt
    ? new Date(campaign.saleWindow.endAt)
    : null;
  const bookingOpen =
    Boolean(bookingStartAt && bookingEndAt) &&
    now >= bookingStartAt &&
    now <= bookingEndAt &&
    ["active", "sale_started"].includes(campaign.status);

  const sellerIds = collectCampaignSellerIds(campaign);
  const storeNames = [];
  const pushName = (store) => {
    const name = store?.shopName || store?.name;
    if (name && !storeNames.includes(name)) storeNames.push(name);
  };
  pushName(campaign.seller);
  for (const s of campaign.sellers || []) pushName(s);
  for (const row of campaign.products || []) pushName(row.seller);

  return {
    ...campaign,
    bookingStartAt,
    bookingEndAt,
    deliveryStartDate: campaign.deliveryWindow?.startDate || null,
    deliveryEndDate: campaign.deliveryWindow?.endDate || null,
    bookingOpen,
    bookingStatusLabel: bookingOpen
      ? "Booking open"
      : bookingStartAt && now < bookingStartAt
        ? "Booking opens soon"
        : "Booking closed",
    storeCount: sellerIds.length,
    storeNames,
    storeLabel:
      storeNames.length > 1
        ? `${storeNames.length} stores`
        : storeNames[0] ||
          campaign.seller?.shopName ||
          campaign.seller?.name ||
          "Partner store",
  };
}

function collectCampaignSellerIds(campaign) {
  const ids = new Set();
  const add = (value) => {
    const id = String(value?._id || value || "").trim();
    if (id && id !== "undefined" && id !== "null") ids.add(id);
  };
  add(campaign?.seller);
  for (const s of campaign?.sellers || []) add(s);
  for (const row of campaign?.products || []) add(row?.seller);
  return [...ids];
}

function buildNearbySellerQuery(nearbyIds, sellerId) {
  if (sellerId) {
    return { seller: sellerId };
  }
  return {
    $or: [
      { seller: { $in: nearbyIds } },
      { sellers: { $in: nearbyIds } },
      { "products.seller": { $in: nearbyIds } },
    ],
  };
}

/**
 * Upcoming + currently bookable campaigns for customer browse.
 * When lat/lng are provided, only campaigns whose store serves that location are returned.
 */
export async function listDiscoverableCampaignsForCustomer({
  sellerId,
  lat,
  lng,
} = {}) {
  const now = new Date();
  const query = {
    status: { $in: ["active", "sale_started"] },
    "saleWindow.endAt": { $gte: now },
  };

  const coords = parseCustomerCoordinates({ lat, lng });
  if (coords.valid) {
    const nearbyIds = await getNearbySellerIdsForCustomer(coords.lat, coords.lng);
    if (!nearbyIds.length) return [];
    if (sellerId) {
      if (!nearbyIds.map(String).includes(String(sellerId))) return [];
      Object.assign(query, { seller: sellerId });
    } else {
      Object.assign(query, buildNearbySellerQuery(nearbyIds, null));
    }
  } else if (sellerId) {
    query.seller = sellerId;
  } else {
    // Without a customer location we cannot safely show area-scoped bookings.
    return [];
  }

  const campaigns = await PreOrderCampaign.find(query)
    .populate("seller", "shopName name locality location serviceRadius")
    .populate("sellers", "shopName name")
    .populate("products.seller", "shopName name")
    .sort({ "saleWindow.startAt": 1 })
    .lean();

  return campaigns.map((campaign) => serializeCampaignForCustomer(campaign, now));
}

export async function getCampaignDetailForCustomer(campaignId, { lat, lng } = {}) {
  const coords = parseCustomerCoordinates({ lat, lng });
  if (!coords.valid) {
    const err = new Error(
      "Set your delivery location to view this advance booking.",
    );
    err.statusCode = 400;
    throw err;
  }

  const nearbyIds = await getNearbySellerIdsForCustomer(coords.lat, coords.lng);
  const nearbySet = new Set(nearbyIds.map(String));
  const data = await getCampaignProducts(campaignId);
  const campaignSellerIds = collectCampaignSellerIds(data.campaign);

  if (!campaignSellerIds.some((id) => nearbySet.has(id))) {
    const err = new Error(
      "This advance booking is not available in your area. It is only shown where the store delivers.",
    );
    err.statusCode = 403;
    throw err;
  }

  // Only show products from stores that deliver to the customer.
  const products = (data.products || []).filter((product) => {
    const sid = String(
      product?.sellerId?._id ||
        product?.sellerId ||
        product?.storeId ||
        "",
    );
    return nearbySet.has(sid);
  });

  const now = new Date();
  return {
    campaign: serializeCampaignForCustomer(data.campaign, now),
    products,
  };
}

/**
 * Map productId → advance booking meta for cart/product UI.
 * Prefers the soonest relevant non-cancelled campaign.
 */
export async function getAdvanceBookingMapForProductIds(productIds = [], { lat, lng } = {}) {
  const ids = [...new Set(productIds.map((id) => String(id || "")).filter(Boolean))];
  if (!ids.length) return new Map();

  const now = new Date();
  const query = {
    status: { $in: ["active", "sale_started"] },
    "saleWindow.endAt": { $gte: now },
    "products.product": { $in: ids },
  };

  const coords = parseCustomerCoordinates({ lat, lng });
  if (coords.valid) {
    const nearbyIds = await getNearbySellerIdsForCustomer(coords.lat, coords.lng);
    if (!nearbyIds.length) return new Map();
    Object.assign(query, buildNearbySellerQuery(nearbyIds, null));
  }

  const campaigns = await PreOrderCampaign.find(query)
    .select("campaignId title seller status saleWindow deliveryWindow products createdByRole")
    .sort({ "saleWindow.startAt": 1 })
    .lean();

  const map = new Map();
  for (const campaign of campaigns) {
    const serialized = serializeCampaignForCustomer(campaign, now);
    for (const row of campaign.products || []) {
      const pid = String(row.product || "");
      if (!ids.includes(pid) || map.has(pid)) continue;
      map.set(pid, {
        campaignId: campaign.campaignId,
        title: campaign.title,
        sellerId: campaign.seller,
        createdByRole: campaign.createdByRole || "seller",
        bookingStartAt: serialized.bookingStartAt,
        bookingEndAt: serialized.bookingEndAt,
        deliveryStartDate: serialized.deliveryStartDate,
        deliveryEndDate: serialized.deliveryEndDate,
        bookingOpen: serialized.bookingOpen,
        bookingStatusLabel: serialized.bookingStatusLabel,
        allocationCap: row.allocationCap,
        remaining:
          Math.max(0, Number(row.allocationCap || 0) - Number(row.allocatedQty || 0)),
      });
    }
  }
  return map;
}

export async function attachAdvanceBookingMetaToProducts(products = [], location = {}) {
  if (!Array.isArray(products) || !products.length) return products;
  const ids = products.map((p) => p?._id || p?.id).filter(Boolean);
  const map = await getAdvanceBookingMapForProductIds(ids, location);
  if (!map.size) return products;
  return products.map((product) => {
    const key = String(product?._id || product?.id || "");
    const advanceBooking = map.get(key) || null;
    if (!advanceBooking) return product;
    return { ...product, advanceBooking };
  });
}

/**
 * Block add-to-cart when product is only available via a future advance booking.
 */
export async function assertProductBookableForCart(productId) {
  const map = await getAdvanceBookingMapForProductIds([productId]);
  const meta = map.get(String(productId));
  if (!meta) return { blocked: false, advanceBooking: null };
  if (meta.bookingOpen) return { blocked: false, advanceBooking: meta };

  const err = new Error(
    meta.bookingStartAt
      ? `Advance booking opens on ${new Date(meta.bookingStartAt).toLocaleString("en-IN")}. You cannot add this product to cart yet.`
      : "Advance booking has not started for this product yet.",
  );
  err.statusCode = 400;
  err.advanceBooking = meta;
  throw err;
}

export async function updatePreOrderCampaign(sellerId, campaignId, updates) {
  const campaign = await PreOrderCampaign.findOneAndUpdate(
    { campaignId, seller: sellerId, status: { $nin: ["cancelled", "completed"] } },
    { $set: updates },
    { new: true },
  );
  if (!campaign) {
    const err = new Error("Campaign not found or cannot be updated");
    err.statusCode = 404;
    throw err;
  }
  if (campaign.status === "active") {
    await schedulePreorderSaleStartJob(campaign);
  }
  return campaign;
}

export async function listSellerCampaigns(sellerId, { status } = {}) {
  const query = { seller: sellerId };
  if (status) query.status = status;
  return PreOrderCampaign.find(query).sort({ createdAt: -1 }).lean();
}

export async function listActiveCampaignsForCustomer({ sellerId, lat, lng } = {}) {
  const now = new Date();
  const query = {
    status: { $in: ["active", "sale_started"] },
    "saleWindow.startAt": { $lte: now },
    "saleWindow.endAt": { $gte: now },
  };

  const coords = parseCustomerCoordinates({ lat, lng });
  if (coords.valid) {
    const nearbyIds = await getNearbySellerIdsForCustomer(coords.lat, coords.lng);
    if (!nearbyIds.length) return [];
    if (sellerId) {
      if (!nearbyIds.map(String).includes(String(sellerId))) return [];
      query.seller = sellerId;
    } else {
      Object.assign(query, buildNearbySellerQuery(nearbyIds, null));
    }
  } else if (sellerId) {
    query.seller = sellerId;
  } else {
    return [];
  }

  return PreOrderCampaign.find(query)
    .populate("seller", "shopName name locality")
    .populate("sellers", "shopName name")
    .sort({ "saleWindow.startAt": 1 })
    .lean();
}

export async function getCampaignProducts(campaignId) {
  const campaign = await PreOrderCampaign.findOne({ campaignId, status: { $ne: "cancelled" } })
    .populate("seller", "shopName name locality")
    .populate("sellers", "shopName name locality")
    .populate("products.seller", "shopName name")
    .lean();
  if (!campaign) {
    const err = new Error("Campaign not found");
    err.statusCode = 404;
    throw err;
  }
  const productIds = (campaign.products || [])
    .map((p) => p.product)
    .filter(Boolean);
  const products = await Product.find({ _id: { $in: productIds } })
    .populate("sellerId", "shopName name locality")
    .lean();

  const metaByProductId = new Map(
    (campaign.products || []).map((row) => [String(row.product), row]),
  );

  const enriched = products.map((product) => {
    const meta = metaByProductId.get(String(product._id));
    const override =
      meta?.priceOverride != null && Number.isFinite(Number(meta.priceOverride))
        ? Number(meta.priceOverride)
        : null;
    const store =
      product.sellerId && typeof product.sellerId === "object"
        ? product.sellerId
        : meta?.seller;
    const sellerIdValue =
      product.sellerId?._id || product.sellerId || meta?.seller?._id || meta?.seller || null;

    return {
      ...product,
      sellerId: sellerIdValue,
      storeName: store?.shopName || store?.name || null,
      price: override != null ? override : product.price,
      salePrice: override != null ? override : product.salePrice,
      allocationCap: meta?.allocationCap ?? null,
      remaining:
        meta != null
          ? Math.max(0, Number(meta.allocationCap || 0) - Number(meta.allocatedQty || 0))
          : null,
    };
  });

  return { campaign, products: enriched };
}

export async function schedulePreorderSaleStartJob(campaign) {
  const delay = Math.max(0, new Date(campaign.saleWindow.startAt).getTime() - Date.now());
  const jobId = `campaign:${campaign.campaignId}:sale-start`;
  try {
    const existing = await preorderActivationQueue.getJob(jobId);
    if (existing) await existing.remove();
  } catch {
    /* ignore */
  }
  const job = await preorderActivationQueue.add(
    JOB_NAMES.PREORDER_SALE_START,
    { campaignId: campaign.campaignId },
    { delay, jobId, removeOnComplete: true },
  );
  await PreOrderCampaign.updateOne(
    { _id: campaign._id },
    { $set: { saleStartJobId: job?.id ? String(job.id) : jobId } },
  );
}

export async function processPreorderSaleStartJob({ campaignId }) {
  const campaign = await PreOrderCampaign.findOne({ campaignId });
  if (!campaign || campaign.status === "cancelled") return;

  await PreOrderCampaign.updateOne(
    { campaignId },
    { $set: { status: "sale_started" } },
  );

  const orders = await Order.find({
    preOrderCampaign: campaign._id,
    workflowStatus: WORKFLOW_STATUS.PREORDER_HOLD,
  });

  for (const order of orders) {
    const sellerPendingUntil = computeSellerPendingExpiry(order, new Date());
    const updated = await Order.findOneAndUpdate(
      {
        _id: order._id,
        workflowStatus: WORKFLOW_STATUS.PREORDER_HOLD,
      },
      {
        $set: {
          workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
          status: legacyStatusFromWorkflow(WORKFLOW_STATUS.SELLER_PENDING),
          sellerPendingExpiresAt: sellerPendingUntil,
          expiresAt: sellerPendingUntil,
        },
      },
      { new: true },
    );
    if (updated) {
      void afterPlaceOrderV2(updated).catch(() => {});
      emitNotificationEvent(NOTIFICATION_EVENTS.PREORDER_SALE_STARTED, {
        orderId: updated.orderId,
        customerId: updated.customer,
        userId: updated.customer,
        sellerId: updated.seller,
        campaignId,
      });
    }
  }
}

export async function reserveCampaignAllocation(campaignId, productId, quantity, session = null) {
  const qty = Math.max(1, Number(quantity || 1));
  const campaign = await PreOrderCampaign.findOne({ campaignId }).session(session || null);
  if (!campaign) {
    const err = new Error("Pre-order campaign not found");
    err.statusCode = 404;
    throw err;
  }
  const entry = campaign.products.find((p) => String(p.product) === String(productId));
  if (!entry) {
    const err = new Error("Product not in campaign");
    err.statusCode = 400;
    throw err;
  }
  const remaining = entry.allocationCap - (entry.allocatedQty || 0);
  if (remaining < qty) {
    const err = new Error("Pre-order campaign allocation unavailable");
    err.statusCode = 409;
    throw err;
  }
  entry.allocatedQty = (entry.allocatedQty || 0) + qty;
  await campaign.save({ session: session || undefined });
  return campaign;
}

export async function releaseCampaignAllocation(campaignId, productId, quantity) {
  const qty = Math.max(1, Number(quantity || 1));
  await PreOrderCampaign.updateOne(
    { campaignId, "products.product": productId },
    { $inc: { "products.$[elem].allocatedQty": -qty } },
    { arrayFilters: [{ "elem.product": productId }] },
  );
}

export async function validatePreorderPlacement({
  campaignId,
  sellerId,
  items,
  deliveryDate,
  windowLabel,
}) {
  const campaign = await PreOrderCampaign.findOne({
    campaignId,
    seller: sellerId,
    status: { $in: ["active", "sale_started"] },
  }).lean();
  if (!campaign) {
    const err = new Error("Pre-order campaign not available");
    err.statusCode = 400;
    throw err;
  }

  const now = new Date();
  if (now < new Date(campaign.saleWindow.startAt)) {
    const err = new Error(
      `Advance booking opens on ${new Date(campaign.saleWindow.startAt).toLocaleString("en-IN")}. Orders cannot be placed yet.`,
    );
    err.statusCode = 400;
    throw err;
  } else if (now > new Date(campaign.saleWindow.endAt)) {
    const err = new Error("Pre-order campaign sale window has ended");
    err.statusCode = 400;
    throw err;
  }

  for (const item of items) {
    const entry = campaign.products.find(
      (p) => String(p.product) === String(item.product || item.productId),
    );
    if (!entry) {
      const err = new Error("Product not part of this pre-order campaign");
      err.statusCode = 400;
      throw err;
    }
    const remaining = entry.allocationCap - (entry.allocatedQty || 0);
    if (remaining < Number(item.quantity || 1)) {
      const err = new Error(`Insufficient pre-order allocation for ${item.name || "product"}`);
      err.statusCode = 409;
      throw err;
    }
  }

  const scheduleMeta = await validateScheduleSelection({
    sellerId,
    deliveryDate,
    windowLabel,
    fulfillmentType: FULFILLMENT_TYPE.PREORDER,
    campaign,
  });

  return { campaign, scheduleMeta: buildSchedulePayload(scheduleMeta) };
}

export async function cancelPreOrderCampaign(sellerId, campaignId, reason = "") {
  return cancelPreOrderCampaignByQuery(
    { campaignId, seller: sellerId },
    reason || "Pre-order campaign cancelled",
  );
}

export async function assertCartPreorderRules(items = []) {
  const campaignIds = new Set();
  for (const item of items) {
    if (item.campaignId || item.preOrderCampaignId) {
      campaignIds.add(String(item.campaignId || item.preOrderCampaignId));
    }
  }
  if (campaignIds.size > 1) {
    const err = new Error("Cart cannot contain items from multiple pre-order campaigns");
    err.statusCode = 400;
    throw err;
  }
  const hasPreorder = campaignIds.size === 1;
  const hasRegular = items.some((i) => !i.campaignId && !i.preOrderCampaignId);
  if (hasPreorder && hasRegular) {
    const err = new Error(
      "If cart contains a pre-order item, entire cart must be within the campaign window",
    );
    err.statusCode = 400;
    throw err;
  }
  return { hasPreorder, campaignId: [...campaignIds][0] || null };
}
