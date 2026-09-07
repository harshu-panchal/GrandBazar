import Order from "../models/order.js";
import OrderChat from "../models/orderChat.js";
import { emitOrderChatMessage } from "../services/orderSocketEmitter.js";

const CLOSED_STATUSES = ["delivered", "cancelled", "returned", "failed"];

/**
  Check whether chatting is allowed for the order.
  Chat is enabled during active delivery window:
  - Order is assigned a delivery partner (or in active workflow)
  - Order status is active (not delivered, cancelled, returned)
 */
function checkDeliveryWindowChatActive(order) {
  if (!order) return false;
  const legacyStatus = String(order.status || "").toLowerCase();
  if (CLOSED_STATUSES.includes(legacyStatus)) return false;

  // Active delivery window: assigned to rider or rider in workflow
  const hasDeliveryBoy = Boolean(order.deliveryBoy);
  const riderStep = Number(order.deliveryRiderStep) || 0;
  const isDeliveryWorkflow = ["DELIVERY_ASSIGNED", "PICKUP_READY", "OUT_FOR_DELIVERY"].includes(
    String(order.workflowStatus || "").toUpperCase()
  );

  return hasDeliveryBoy || riderStep > 0 || isDeliveryWorkflow;
}

export const getOrderChatMessages = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id || req.user._id;
    const userRole = req.user.role;

    const order = await Order.findOne({
      $or: [{ orderId }, { _id: orderId.match(/^[0-9a-fA-F]{24}$/) ? orderId : null }],
    })
      .populate("customer", "name phone avatar")
      .populate("deliveryBoy", "name phone avatar profileImage vehicleType")
      .lean();

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const customerIdStr = order.customer?._id?.toString() || order.customer?.toString();
    const deliveryIdStr = order.deliveryBoy?._id?.toString() || order.deliveryBoy?.toString();

    // Verify authorization: must be the customer of this order, assigned delivery partner, or admin
    const isCustomer = Boolean(customerIdStr && String(userId) === customerIdStr);
    const isDelivery = Boolean(deliveryIdStr && String(userId) === deliveryIdStr);
    const isAdmin = userRole === "admin";

    if (!isCustomer && !isDelivery && !isAdmin) {
      return res.status(403).json({ success: false, message: "Access denied to order chat" });
    }

    const canChat = checkDeliveryWindowChatActive(order);

    // Mark messages sent by others as read
    await OrderChat.updateMany(
      {
        orderId: order.orderId,
        senderId: { $ne: userId },
        isRead: false,
      },
      {
        $set: { isRead: true, readAt: new Date() },
      }
    );

    const messages = await OrderChat.find({ orderId: order.orderId })
      .sort({ createdAt: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      result: {
        canChat,
        orderId: order.orderId,
        orderStatus: order.status,
        workflowStatus: order.workflowStatus,
        customer: order.customer
          ? {
              id: customerIdStr,
              name: order.customer.name || "Customer",
              phone: order.customer.phone || "",
              avatar: order.customer.avatar || "",
            }
          : null,
        deliveryBoy: order.deliveryBoy
          ? {
              id: deliveryIdStr,
              name: order.deliveryBoy.name || "Delivery Partner",
              phone: order.deliveryBoy.phone || "",
              avatar: order.deliveryBoy.avatar || order.deliveryBoy.profileImage || "",
            }
          : null,
        messages,
      },
    });
  } catch (error) {
    console.error("[getOrderChatMessages] Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch chat messages" });
  }
};

export const sendOrderChatMessage = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { message, quickReplyType } = req.body;
    const userId = req.user.id || req.user._id;
    const userRole = req.user.role;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ success: false, message: "Message content cannot be empty" });
    }

    if (message.length > 1000) {
      return res.status(400).json({ success: false, message: "Message exceeds maximum length of 1000 characters" });
    }

    const order = await Order.findOne({
      $or: [{ orderId }, { _id: orderId.match(/^[0-9a-fA-F]{24}$/) ? orderId : null }],
    }).lean();

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const customerIdStr = order.customer?._id?.toString() || order.customer?.toString();
    const deliveryIdStr = order.deliveryBoy?._id?.toString() || order.deliveryBoy?.toString();

    // Verify authorization: must be the customer of this order, assigned delivery partner, or admin
    const isCustomer = Boolean(customerIdStr && String(userId) === customerIdStr);
    const isDelivery = Boolean(deliveryIdStr && String(userId) === deliveryIdStr);
    const isAdmin = userRole === "admin";

    if (!isCustomer && !isDelivery && !isAdmin) {
      return res.status(403).json({ success: false, message: "Access denied to order chat" });
    }

    const canChat = checkDeliveryWindowChatActive(order);
    if (!canChat) {
      return res.status(400).json({
        success: false,
        message: "Chat window is closed for this order because delivery is completed or cancelled.",
      });
    }

    let senderRole = "customer";
    if (isDelivery) senderRole = "delivery";
    if (isAdmin) senderRole = "admin";

    const chatDoc = await OrderChat.create({
      orderId: order.orderId,
      orderMongoId: order._id,
      senderId: userId,
      senderRole,
      senderName: req.user.name || (senderRole === "delivery" ? "Delivery Partner" : "Customer"),
      message: message.trim(),
      quickReplyType: quickReplyType || null,
      isRead: false,
    });

    const populatedMsg = chatDoc.toObject();

    // Broadcast Socket.io real-time event
    emitOrderChatMessage(order.orderId, populatedMsg, customerIdStr, deliveryIdStr);

    return res.status(201).json({
      success: true,
      result: populatedMsg,
    });
  } catch (error) {
    console.error("[sendOrderChatMessage] Error:", error);
    return res.status(500).json({ success: false, message: "Failed to send chat message" });
  }
};
