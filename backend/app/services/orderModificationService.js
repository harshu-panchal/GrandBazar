import mongoose from "mongoose";
import Order from "../models/order.js";
import Product from "../models/product.js";
import { requireCanonicalOrderId } from "../utils/orderLookup.js";
import { applyOrderPriceAdjustment } from "./orderPriceAdjustmentService.js";
import { emitOrderStatusUpdate } from "./orderSocketEmitter.js";

function nextVersion(order) {
  return Number(order.modificationVersion || 0) + 1;
}

function toObjectIdString(value) {
  if (!value) return "";
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

async function pushTimeline(orderId, entry) {
  const order = await Order.findOne({ orderId });
  if (!order) return null;
  const version = nextVersion(order);
  order.modificationVersion = version;
  order.modificationTimeline.push({
    version,
    createdAt: new Date(),
    ...entry,
  });
  await order.save();
  return order;
}

async function resolveReplacementProduct({ productId, productName, sellerId }) {
  const normalizedId = String(productId || "").trim();
  if (normalizedId && mongoose.Types.ObjectId.isValid(normalizedId)) {
    const byId = await Product.findOne({
      _id: normalizedId,
      sellerId,
      status: "active",
    })
      .select("_id name salePrice price variants")
      .lean();
    if (byId) return byId;
  }

  const name = String(productName || "").trim();
  if (!name) return null;

  const byName = await Product.findOne({
    sellerId,
    status: "active",
    name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
  })
    .select("_id name salePrice price variants")
    .lean();

  return byName || null;
}

export async function createReplacementRequest({
  orderId,
  itemIndex,
  alternatives = [],
  reason = "",
  actorRole = "seller",
  actorId = "",
}) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  if (!Array.isArray(order.items) || !order.items[itemIndex]) {
    const err = new Error("Invalid item index for replacement");
    err.statusCode = 400;
    throw err;
  }
  if (!Array.isArray(alternatives) || alternatives.length === 0) {
    const err = new Error("At least one alternative is required");
    err.statusCode = 400;
    throw err;
  }

  const requestId = new mongoose.Types.ObjectId().toString();
  const sellerId = order.seller;
  const normalizedAlternatives = [];

  for (const alt of alternatives) {
    const resolved = await resolveReplacementProduct({
      productId: alt.product || alt.productId,
      productName: alt.name,
      sellerId,
    });

    if (!resolved) {
      const err = new Error(
        `Replacement product not found for "${alt.name || alt.product || "unknown"}". Use an active product from your store.`,
      );
      err.statusCode = 400;
      throw err;
    }

    const quantity = Math.max(1, Number(alt.quantity || order.items[itemIndex].quantity || 1));
    const fallbackPrice = Number(resolved.salePrice || resolved.price || 0);
    const price = Number(alt.price);
    normalizedAlternatives.push({
      product: resolved._id,
      name: String(alt.name || resolved.name || "").trim(),
      price: Number.isFinite(price) && price >= 0 ? price : fallbackPrice,
      variantSlot: String(alt.variantSlot || alt.variantSku || "").trim(),
      quantity,
    });
  }

  order.replacementRequests.push({
    requestId,
    itemIndex,
    originalItem: {
      product: order.items[itemIndex].product,
      name: order.items[itemIndex].name,
      price: order.items[itemIndex].price,
      quantity: order.items[itemIndex].quantity,
      variantSlot: order.items[itemIndex].variantSlot || "",
    },
    alternatives: normalizedAlternatives,
    requestedBy: actorRole,
    reason: String(reason || "").trim(),
  });
  order.status = "customer_confirmation";
  order.orderStatus = "customer_confirmation";
  await order.save();

  await pushTimeline(orderId, {
    type: "replacement_requested",
    actorRole,
    actorId: String(actorId || ""),
    note: String(reason || "").trim(),
    meta: { itemIndex, requestId, alternativesCount: normalizedAlternatives.length },
  });
  emitOrderStatusUpdate(orderId, { replacementRequested: true, requestId }, order.customer);
  return order;
}

export async function reviewReplacementRequest({
  orderId,
  requestId,
  decision,
  selectedAlternativeIndex = 0,
  customerId,
  note = "",
}) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId, customer: customerId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  const reqIndex = order.replacementRequests.findIndex((r) => String(r.requestId) === String(requestId));
  if (reqIndex === -1) {
    const err = new Error("Replacement request not found");
    err.statusCode = 404;
    throw err;
  }
  const reqEntry = order.replacementRequests[reqIndex];
  if (reqEntry.customerDecision !== "pending") {
    const err = new Error("Replacement request already reviewed");
    err.statusCode = 409;
    throw err;
  }
  const normalizedDecision = String(decision || "").toLowerCase();
  if (!["approved", "rejected"].includes(normalizedDecision)) {
    const err = new Error("Invalid replacement decision");
    err.statusCode = 400;
    throw err;
  }

  if (normalizedDecision === "approved") {
    const pickedIndex = Math.max(0, Number(selectedAlternativeIndex || 0));
    const picked = reqEntry.alternatives[pickedIndex];
    if (!picked) {
      const err = new Error("Selected replacement option is invalid");
      err.statusCode = 400;
      throw err;
    }

    const pickedProductId = toObjectIdString(picked.product);
    if (!pickedProductId || !mongoose.Types.ObjectId.isValid(pickedProductId)) {
      const err = new Error("Selected replacement has no valid product id");
      err.statusCode = 400;
      throw err;
    }

    const nextItems = order.items.map((item, idx) => {
      if (idx !== reqEntry.itemIndex) {
        return {
          product: toObjectIdString(item.product),
          variantSlot: item.variantSlot || "",
          quantity: Number(item.quantity || 1),
        };
      }
      return {
        product: pickedProductId,
        quantity: Math.max(1, Number(picked.quantity || item.quantity || 1)),
        variantSlot: picked.variantSlot || item.variantSlot || "",
      };
    });

    await applyOrderPriceAdjustment({
      orderId,
      items: nextItems,
      reason: `Replacement approved: ${note || reqEntry.reason || "customer approved replacement"}`,
      actorLabel: "seller",
    });
  }

  const finalOrder = await Order.findOneAndUpdate(
    { orderId, "replacementRequests.requestId": requestId },
    {
      $set: {
        "replacementRequests.$.customerDecision": normalizedDecision,
        "replacementRequests.$.status": normalizedDecision === "approved" ? "approved" : "rejected",
        "replacementRequests.$.selectedAlternativeIndex":
          normalizedDecision === "approved" ? Math.max(0, Number(selectedAlternativeIndex || 0)) : null,
        "replacementRequests.$.customerDecisionAt": new Date(),
        "replacementRequests.$.customerNote": String(note || "").trim(),
        status: normalizedDecision === "approved" ? "partial_updated" : "confirmed",
        orderStatus: normalizedDecision === "approved" ? "partial_updated" : "confirmed",
      },
    },
    { new: true },
  );

  await pushTimeline(orderId, {
    type: "replacement_reviewed",
    actorRole: "customer",
    actorId: String(customerId || ""),
    note: String(note || "").trim(),
    meta: { requestId, decision: normalizedDecision },
  });
  emitOrderStatusUpdate(orderId, { replacementReviewed: true, requestId, decision: normalizedDecision }, finalOrder?.customer);
  return finalOrder;
}

export async function createSplitDeliveries({
  orderId,
  splits = [],
  actorRole = "seller",
  actorId = "",
}) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId });
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  if (!Array.isArray(splits) || splits.length < 2) {
    const err = new Error("At least two split delivery records are required");
    err.statusCode = 400;
    throw err;
  }

  const used = new Set();
  const totalItems = order.items.length;
  const mapped = splits.map((split, idx) => {
    const itemIndexes = Array.isArray(split.itemIndexes) ? split.itemIndexes.map((v) => Number(v)) : [];
    if (!itemIndexes.length) {
      const err = new Error(`Split ${idx + 1} does not include items`);
      err.statusCode = 400;
      throw err;
    }
    itemIndexes.forEach((i) => {
      if (i < 0 || i >= totalItems) {
        const err = new Error(`Invalid item index ${i} in split ${idx + 1}`);
        err.statusCode = 400;
        throw err;
      }
      if (used.has(i)) {
        const err = new Error(`Item index ${i} cannot belong to multiple split deliveries`);
        err.statusCode = 400;
        throw err;
      }
      used.add(i);
    });
    return {
      splitId: new mongoose.Types.ObjectId().toString(),
      label: String(split.label || `Split ${idx + 1}`).trim(),
      itemIndexes,
      status: "pending",
      deliveryDate: split.deliveryDate || null,
      windowLabel: String(split.windowLabel || "").trim(),
      additionalDeliveryFee: Number(split.additionalDeliveryFee || 0),
      trackingLink: "",
    };
  });
  if (used.size !== totalItems) {
    const err = new Error("All order items must be assigned exactly once in split deliveries");
    err.statusCode = 400;
    throw err;
  }

  const extraDeliveryFee = mapped.reduce((sum, split) => sum + Number(split.additionalDeliveryFee || 0), 0);
  const currentDeliveryFee = Number(order.pricing?.deliveryFee || order.paymentBreakdown?.deliveryFeeCharged || 0);
  const currentGrandTotal = Number(order.paymentBreakdown?.grandTotal || order.pricing?.total || 0);
  const nextGrandTotal = currentGrandTotal + extraDeliveryFee;

  const updated = await Order.findOneAndUpdate(
    { orderId },
    {
      $set: {
        splitDeliveries: mapped,
        status: "partial_updated",
        orderStatus: "partial_updated",
        "pricing.deliveryFee": currentDeliveryFee + extraDeliveryFee,
        "pricing.total": nextGrandTotal,
        "paymentBreakdown.deliveryFeeCharged": currentDeliveryFee + extraDeliveryFee,
        "paymentBreakdown.grandTotal": nextGrandTotal,
      },
    },
    { new: true },
  );

  await pushTimeline(orderId, {
    type: "split_delivery_created",
    actorRole,
    actorId: String(actorId || ""),
    note: "Split delivery plan created",
    meta: { splitCount: mapped.length, extraDeliveryFee },
  });
  emitOrderStatusUpdate(orderId, { splitDeliveryCreated: true, splitCount: mapped.length }, updated?.customer);
  return updated;
}

export async function getOrderModificationTimeline({ orderId, actorId, role }) {
  orderId = await requireCanonicalOrderId(orderId);
  const query = { orderId };
  if (role === "customer") query.customer = actorId;
  if (role === "seller") query.seller = actorId;
  const order = await Order.findOne(query).select("orderId modificationVersion modificationTimeline replacementRequests splitDeliveries revisedInvoices");
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  return {
    orderId: order.orderId,
    modificationVersion: order.modificationVersion || 0,
    timeline: order.modificationTimeline || [],
    replacementRequests: order.replacementRequests || [],
    splitDeliveries: order.splitDeliveries || [],
    revisedInvoices: order.revisedInvoices || [],
  };
}
