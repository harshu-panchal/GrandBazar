import { jest } from "@jest/globals";

const mockDisputeFindOne = jest.fn();
const mockDisputeUpdateOne = jest.fn();
const mockOrderFindById = jest.fn();
const mockOrderFindOneAndUpdate = jest.fn();
const mockUserFindByIdAndUpdate = jest.fn();
const mockTransactionCreate = jest.fn();
const mockEmitNotificationEvent = jest.fn();

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { findById: mockOrderFindById, findOneAndUpdate: mockOrderFindOneAndUpdate },
}));
jest.unstable_mockModule("../app/models/dispute.js", () => ({
  default: {
    findOne: mockDisputeFindOne,
    updateOne: mockDisputeUpdateOne,
    findById: jest.fn(async () => ({ _id: "dispute-1", status: "resolved" })),
  },
}));
jest.unstable_mockModule("../app/models/customer.js", () => ({
  default: { findByIdAndUpdate: mockUserFindByIdAndUpdate },
}));
jest.unstable_mockModule("../app/models/transaction.js", () => ({
  default: { create: mockTransactionCreate },
}));
jest.unstable_mockModule("../app/models/setting.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({
  requireCanonicalOrderId: jest.fn(async (id) => id),
}));
jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitOrderStatusUpdate: jest.fn(),
}));
jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: mockEmitNotificationEvent,
}));
jest.unstable_mockModule("../app/services/orderPriceAdjustmentService.js", () => ({
  applyOrderPriceAdjustment: jest.fn(),
}));

const { resolveDispute } = await import("../app/services/disputeService.js");

const VALID_TRANSACTION_TYPES = [
  "Order Payment",
  "Delivery Earning",
  "Withdrawal",
  "Refund",
  "Incentive",
  "Bonus",
  "Cash Collection",
  "Cash Settlement",
];

describe("disputeService.resolveDispute transaction type", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDisputeFindOne.mockResolvedValue({
      _id: "dispute-1",
      status: "open",
      order: "order-1",
      customer: "customer-1",
    });
    mockOrderFindById.mockResolvedValue({ _id: "order-1", orderId: "ORD1", customer: "customer-1" });
    mockOrderFindOneAndUpdate.mockResolvedValue({ _id: "order-1", orderId: "ORD1", customer: "customer-1" });
    mockUserFindByIdAndUpdate.mockResolvedValue({ _id: "customer-1" });
    mockTransactionCreate.mockResolvedValue({ _id: "txn-1" });
    mockDisputeUpdateOne.mockResolvedValue({});
  });

  it("uses a valid Transaction.type for a 'refund' resolution", async () => {
    await resolveDispute({ disputeId: "D1", adminId: "admin-1", resolution: "refund", refundAmount: 50 });

    expect(mockTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: expect.any(String) }),
    );
    const createdType = mockTransactionCreate.mock.calls[0][0].type;
    expect(VALID_TRANSACTION_TYPES).toContain(createdType);
  });

  it("uses a valid Transaction.type for a 'wallet_credit' resolution — previously wrote the invalid value 'Wallet Credit'", async () => {
    await resolveDispute({ disputeId: "D1", adminId: "admin-1", resolution: "wallet_credit", refundAmount: 50 });

    const createdType = mockTransactionCreate.mock.calls[0][0].type;
    expect(createdType).not.toBe("Wallet Credit");
    expect(VALID_TRANSACTION_TYPES).toContain(createdType);
  });

  it("still credits the customer's wallet balance for a wallet_credit resolution", async () => {
    await resolveDispute({ disputeId: "D1", adminId: "admin-1", resolution: "wallet_credit", refundAmount: 75 });

    expect(mockUserFindByIdAndUpdate).toHaveBeenCalledWith(
      "customer-1",
      expect.objectContaining({ $inc: { walletBalance: 75 } }),
    );
  });
});
