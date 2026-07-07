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
  });

  if (campaign.status === "active") {
    await schedulePreorderSaleStartJob(campaign);
  }
  return campaign;
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

export async function listActiveCampaignsForCustomer({ sellerId } = {}) {
  const now = new Date();
  const query = {
    status: { $in: ["active", "sale_started"] },
    "saleWindow.startAt": { $lte: now },
    "saleWindow.endAt": { $gte: now },
  };
  if (sellerId) query.seller = sellerId;
  return PreOrderCampaign.find(query).sort({ "saleWindow.startAt": 1 }).lean();
}

export async function getCampaignProducts(campaignId) {
  const campaign = await PreOrderCampaign.findOne({ campaignId, status: { $ne: "cancelled" } }).lean();
  if (!campaign) {
    const err = new Error("Campaign not found");
    err.statusCode = 404;
    throw err;
  }
  const productIds = campaign.products.map((p) => p.product);
  const products = await Product.find({ _id: { $in: productIds } }).lean();
  return { campaign, products };
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
    // allowed - order confirmed awaiting sale start
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
  const campaign = await PreOrderCampaign.findOneAndUpdate(
    { campaignId, seller: sellerId, status: { $nin: ["cancelled", "completed"] } },
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
          cancelledBy: "seller",
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
