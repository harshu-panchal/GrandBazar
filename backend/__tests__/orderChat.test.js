import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockOrderFindOne = jest.fn();
const mockOrderChatFind = jest.fn();
const mockOrderChatCreate = jest.fn();
const mockOrderChatUpdateMany = jest.fn();
const mockEmitOrderChatMessage = jest.fn();

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findOne: mockOrderFindOne,
  },
}));

jest.unstable_mockModule("../app/models/orderChat.js", () => ({
  default: {
    find: mockOrderChatFind,
    create: mockOrderChatCreate,
    updateMany: mockOrderChatUpdateMany,
  },
}));

jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitOrderChatMessage: mockEmitOrderChatMessage,
}));

const { getOrderChatMessages, sendOrderChatMessage } = await import(
  "../app/controller/orderChatController.js"
);

describe("Order Delivery Chat Controller", () => {
  const customerId = "650000000000000000000001";
  const deliveryId = "650000000000000000000002";
  const unauthorizedId = "650000000000000000000003";

  const mockActiveOrder = {
    _id: "650000000000000000000010",
    orderId: "ORD-ACTIVE-123",
    status: "out_for_delivery",
    workflowStatus: "OUT_FOR_DELIVERY",
    customer: { _id: customerId, name: "Alice", phone: "1234567890" },
    deliveryBoy: { _id: deliveryId, name: "Bob Rider", phone: "9876543210" },
  };

  const mockDeliveredOrder = {
    _id: "650000000000000000000011",
    orderId: "ORD-DELIVERED-123",
    status: "delivered",
    workflowStatus: "DELIVERED",
    customer: { _id: customerId, name: "Alice", phone: "1234567890" },
    deliveryBoy: { _id: deliveryId, name: "Bob Rider", phone: "9876543210" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getOrderChatMessages", () => {
    it("returns 404 when order is not found", async () => {
      mockOrderFindOne.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
          }),
        }),
      });

      const req = {
        params: { orderId: "NON-EXISTENT" },
        user: { id: customerId, role: "customer" },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await getOrderChatMessages(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: "Order not found" })
      );
    });

    it("returns 403 when user is not customer, delivery, or admin", async () => {
      mockOrderFindOne.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(mockActiveOrder),
          }),
        }),
      });

      const req = {
        params: { orderId: "ORD-ACTIVE-123" },
        user: { id: unauthorizedId, role: "customer" },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await getOrderChatMessages(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("returns messages and canChat=true for active order", async () => {
      mockOrderFindOne.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(mockActiveOrder),
          }),
        }),
      });

      mockOrderChatUpdateMany.mockResolvedValue({ modifiedCount: 0 });
      mockOrderChatFind.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: "m1", message: "On my way", senderRole: "delivery" },
          ]),
        }),
      });

      const req = {
        params: { orderId: "ORD-ACTIVE-123" },
        user: { id: customerId, role: "customer" },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await getOrderChatMessages(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        result: expect.objectContaining({
          canChat: true,
          orderId: "ORD-ACTIVE-123",
          messages: [{ _id: "m1", message: "On my way", senderRole: "delivery" }],
        }),
      });
    });

    it("returns canChat=false for delivered order", async () => {
      mockOrderFindOne.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(mockDeliveredOrder),
          }),
        }),
      });

      mockOrderChatUpdateMany.mockResolvedValue({ modifiedCount: 0 });
      mockOrderChatFind.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

      const req = {
        params: { orderId: "ORD-DELIVERED-123" },
        user: { id: customerId, role: "customer" },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await getOrderChatMessages(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          result: expect.objectContaining({ canChat: false }),
        })
      );
    });
  });

  describe("sendOrderChatMessage", () => {
    it("rejects empty message", async () => {
      const req = {
        params: { orderId: "ORD-ACTIVE-123" },
        body: { message: "   " },
        user: { id: customerId, role: "customer" },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await sendOrderChatMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Message content cannot be empty" })
      );
    });

    it("blocks sending message on delivered order", async () => {
      mockOrderFindOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockDeliveredOrder),
      });

      const req = {
        params: { orderId: "ORD-DELIVERED-123" },
        body: { message: "Hello" },
        user: { id: customerId, role: "customer" },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await sendOrderChatMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Chat window is closed for this order because delivery is completed or cancelled.",
        })
      );
    });

    it("saves message and returns 201 for active order", async () => {
      mockOrderFindOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockActiveOrder),
      });

      const mockCreatedDoc = {
        _id: "msg123",
        orderId: "ORD-ACTIVE-123",
        senderId: customerId,
        senderRole: "customer",
        message: "Calling when I reach",
        toObject: () => ({
          _id: "msg123",
          orderId: "ORD-ACTIVE-123",
          senderId: customerId,
          senderRole: "customer",
          message: "Calling when I reach",
        }),
      };

      mockOrderChatCreate.mockResolvedValue(mockCreatedDoc);

      const req = {
        params: { orderId: "ORD-ACTIVE-123" },
        body: { message: "Calling when I reach" },
        user: { id: customerId, role: "customer", name: "Alice" },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await sendOrderChatMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        result: expect.objectContaining({
          _id: "msg123",
          message: "Calling when I reach",
        }),
      });
      expect(mockEmitOrderChatMessage).toHaveBeenCalledWith(
        "ORD-ACTIVE-123",
        expect.objectContaining({ message: "Calling when I reach" }),
        customerId,
        deliveryId
      );
    });
  });
});
