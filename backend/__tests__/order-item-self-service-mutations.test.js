import { jest } from "@jest/globals";

// TC-ORD-011 (customer self-service item removal pre-acceptance) and
// TC-SELL-056 (seller add-item-before-packing) regression tests.

const mockOrderFindOne = jest.fn();
const mockOrderFindOneAndUpdate = jest.fn();
const mockBuildCheckoutPricingSnapshot = jest.fn();
const mockFreezeFinancialSnapshot = jest.fn();
const mockReserveStockForItems = jest.fn();
const mockReleaseReservedStockForOrder = jest.fn();
const mockProductFind = jest.fn();
const mockCreditNoteCreate = jest.fn();
const mockCreditNoteUpdateOne = jest.fn();
const mockUserFindByIdAndUpdate = jest.fn();
const mockTransactionCreate = jest.fn();
const mockRefundCreate = jest.fn();
const mockEmitOrderStatusUpdate = jest.fn();
const mockEmitNotificationEvent = jest.fn();

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { findOne: mockOrderFindOne, findOneAndUpdate: mockOrderFindOneAndUpdate },
}));
jest.unstable_mockModule("../app/models/creditNote.js", () => ({
  default: { create: mockCreditNoteCreate, updateOne: mockCreditNoteUpdateOne },
}));
jest.unstable_mockModule("../app/models/customer.js", () => ({
  default: { findByIdAndUpdate: mockUserFindByIdAndUpdate },
}));
jest.unstable_mockModule("../app/models/transaction.js", () => ({
  default: { create: mockTransactionCreate },
}));
jest.unstable_mockModule("../app/models/product.js", () => ({
  default: { find: mockProductFind },
}));
jest.unstable_mockModule("../app/models/refund.js", () => ({
  default: { create: mockRefundCreate },
}));
jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({
  requireCanonicalOrderId: jest.fn(async (id) => id),
}));
jest.unstable_mockModule("../app/services/checkoutPricingService.js", () => ({
  buildCheckoutPricingSnapshot: mockBuildCheckoutPricingSnapshot,
}));
jest.unstable_mockModule("../app/services/finance/orderFinanceService.js", () => ({
  freezeFinancialSnapshot: mockFreezeFinancialSnapshot,
}));
jest.unstable_mockModule("../app/services/finance/walletService.js", () => ({
  debitWallet: jest.fn(),
  creditWallet: jest.fn(),
}));
jest.unstable_mockModule("../app/services/finance/ledgerService.js", () => ({
  createLedgerEntry: jest.fn(),
}));
jest.unstable_mockModule("../app/services/stockService.js", () => ({
  releaseReservedStockForOrder: mockReleaseReservedStockForOrder,
  reserveStockForItems: mockReserveStockForItems,
}));
jest.unstable_mockModule("../app/services/orderWorkflowService.js", () => ({
  resolveWorkflowStatus: (order) => order.workflowStatus,
}));
jest.unstable_mockModule("../app/queues/orderQueues.js", () => ({
  extraPaymentDeadlineQueue: { add: jest.fn(), getJob: jest.fn().mockResolvedValue(null) },
  JOB_NAMES: { EXTRA_PAYMENT_DEADLINE: "extra-payment-deadline" },
}));
jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitOrderStatusUpdate: mockEmitOrderStatusUpdate,
}));
jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: mockEmitNotificationEvent,
}));
jest.unstable_mockModule("../app/services/orderSchedulingService.js", () => ({
  scheduleOrderActivationJob: jest.fn(),
}));

const { customerRemoveOrderItem, sellerAddOrderItems } = await import(
  "../app/services/orderPriceAdjustmentService.js"
);
const { WORKFLOW_STATUS } = await import("../app/constants/orderWorkflow.js");

function baseOrder(overrides = {}) {
  return {
    _id: "order-1",
    orderId: "ORD-1",
    customer: "cust-1",
    seller: "seller-1",
    paymentMode: "COD",
    workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
    workflowVersion: 2,
    paymentBreakdown: { grandTotal: 300 },
    pricing: { total: 300 },
    priceAdjustment: {},
    items: [
      { product: "prod-a", variantSlot: "", quantity: 1, price: 100, name: "Item A" },
      { product: "prod-b", variantSlot: "", quantity: 2, price: 100, name: "Item B" },
    ],
    ...overrides,
  };
}

describe("customerRemoveOrderItem (TC-ORD-011)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("throws 404 when the order doesn't exist", async () => {
    mockOrderFindOne.mockResolvedValue(null);
    await expect(
      customerRemoveOrderItem({ customerId: "cust-1", orderId: "ORD-1", itemIndexes: [0] }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 403 when the order doesn't belong to this customer", async () => {
    mockOrderFindOne.mockResolvedValue(baseOrder({ customer: "someone-else" }));
    await expect(
      customerRemoveOrderItem({ customerId: "cust-1", orderId: "ORD-1", itemIndexes: [0] }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("throws 409 once the seller has already accepted the order", async () => {
    mockOrderFindOne.mockResolvedValue(baseOrder({ workflowStatus: WORKFLOW_STATUS.SELLER_ACCEPTED }));
    await expect(
      customerRemoveOrderItem({ customerId: "cust-1", orderId: "ORD-1", itemIndexes: [0] }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("throws 400 when no item indexes are selected", async () => {
    mockOrderFindOne.mockResolvedValue(baseOrder());
    await expect(
      customerRemoveOrderItem({ customerId: "cust-1", orderId: "ORD-1", itemIndexes: [] }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when asked to remove every item on the order", async () => {
    mockOrderFindOne.mockResolvedValue(baseOrder());
    await expect(
      customerRemoveOrderItem({ customerId: "cust-1", orderId: "ORD-1", itemIndexes: [0, 1] }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("auto-finalizes a price-decrease removal immediately (no separate approval step)", async () => {
    const order = baseOrder();
    mockOrderFindOne.mockResolvedValue(order);

    // Removing item B (qty 2 @ 100 = 200) drops the grand total from 300 to 100.
    mockBuildCheckoutPricingSnapshot.mockResolvedValue({
      sellerBreakdownEntries: [
        {
          sellerId: "seller-1",
          items: [{ productId: "prod-a", productName: "Item A", quantity: 1, price: 100, variantSku: "" }],
          breakdown: { grandTotal: 100 },
        },
      ],
    });

    // First findOneAndUpdate call = the "propose" step inside partialCancelOrderItems
    // -> applyOrderPriceAdjustment (returns the pending-adjustment order).
    const proposedOrder = {
      ...order,
      modificationVersion: 1,
      priceAdjustment: {
        status: "pending",
        direction: "decrease",
        deltaAmount: 200,
        priorWorkflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
        proposedItems: [{ product: "prod-a", quantity: 1, price: 100 }],
        proposedBreakdown: { grandTotal: 100 },
        proposedPartialCancelIndexes: [1],
      },
    };
    // Second findOneAndUpdate call = the "finalize" step (finalizePendingAdjustment).
    const finalizedOrder = {
      ...order,
      items: [{ product: "prod-a", quantity: 1, price: 100 }],
      workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
      priceAdjustment: { status: "applied" },
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockOrderFindOneAndUpdate
      .mockResolvedValueOnce(proposedOrder)
      .mockResolvedValueOnce(finalizedOrder);

    mockCreditNoteCreate.mockResolvedValue({ _id: "cn-1" });
    mockRefundCreate.mockResolvedValue({ _id: "rf-1", save: jest.fn().mockResolvedValue(undefined) });
    mockUserFindByIdAndUpdate.mockResolvedValue({});
    mockTransactionCreate.mockResolvedValue({});
    mockCreditNoteUpdateOne.mockResolvedValue({});

    const result = await customerRemoveOrderItem({
      customerId: "cust-1",
      orderId: "ORD-1",
      itemIndexes: [1],
    });

    // The key behavioral guarantee: no lingering "awaiting approval" state —
    // it comes back already applied, restored to SELLER_PENDING so the
    // seller can still accept it normally.
    expect(result.priceAdjustment.status).toBe("applied");
    expect(result.workflowStatus).toBe(WORKFLOW_STATUS.SELLER_PENDING);
    // A credit note/refund was issued for the removed item's value.
    expect(mockCreditNoteCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 200 }),
    );
  });
});

describe("sellerAddOrderItems (TC-SELL-056)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("throws 404 when the order doesn't exist", async () => {
    mockOrderFindOne.mockResolvedValue(null);
    await expect(
      sellerAddOrderItems({ sellerId: "seller-1", orderId: "ORD-1", items: [{ product: "prod-c", quantity: 1 }] }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 403 when the order belongs to a different seller", async () => {
    mockOrderFindOne.mockResolvedValue(baseOrder({ seller: "other-seller" }));
    await expect(
      sellerAddOrderItems({ sellerId: "seller-1", orderId: "ORD-1", items: [{ product: "prod-c", quantity: 1 }] }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("throws 409 once the order has already been packed", async () => {
    mockOrderFindOne.mockResolvedValue(baseOrder({ workflowStatus: WORKFLOW_STATUS.PICKUP_READY }));
    await expect(
      sellerAddOrderItems({ sellerId: "seller-1", orderId: "ORD-1", items: [{ product: "prod-c", quantity: 1 }] }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("throws 400 when no items are supplied", async () => {
    mockOrderFindOne.mockResolvedValue(baseOrder());
    await expect(
      sellerAddOrderItems({ sellerId: "seller-1", orderId: "ORD-1", items: [] }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when the product belongs to a different store", async () => {
    mockOrderFindOne.mockResolvedValue(baseOrder());
    mockProductFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ _id: "prod-c", sellerId: "other-seller", name: "Foreign Item" }]),
    });
    await expect(
      sellerAddOrderItems({
        sellerId: "seller-1",
        orderId: "ORD-1",
        items: [{ product: "prod-c", quantity: 1 }],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("reserves stock and proposes a price-increase adjustment awaiting customer confirmation", async () => {
    const order = baseOrder();
    mockOrderFindOne.mockResolvedValue(order);
    mockProductFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ _id: "prod-c", sellerId: "seller-1", name: "Item C" }]),
    });
    mockReserveStockForItems.mockResolvedValue([]);

    // Adding item C (qty 1 @ 50) raises the grand total from 300 to 350.
    mockBuildCheckoutPricingSnapshot.mockResolvedValue({
      sellerBreakdownEntries: [
        {
          sellerId: "seller-1",
          items: [
            { productId: "prod-a", productName: "Item A", quantity: 1, price: 100, variantSku: "" },
            { productId: "prod-b", productName: "Item B", quantity: 2, price: 100, variantSku: "" },
            { productId: "prod-c", productName: "Item C", quantity: 1, price: 50, variantSku: "" },
          ],
          breakdown: { grandTotal: 350 },
        },
      ],
    });

    const proposedOrder = {
      ...order,
      workflowStatus: WORKFLOW_STATUS.AWAITING_EXTRA_PAYMENT,
      priceAdjustment: { status: "pending", direction: "increase", deltaAmount: 50 },
    };
    mockOrderFindOneAndUpdate.mockResolvedValue(proposedOrder);

    const result = await sellerAddOrderItems({
      sellerId: "seller-1",
      orderId: "ORD-1",
      items: [{ product: "prod-c", quantity: 1 }],
      reason: "Customer asked for one more",
      actorId: "seller-1",
    });

    expect(mockReserveStockForItems).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ productId: "prod-c", quantity: 1 })],
        sellerId: "seller-1",
      }),
    );
    expect(result.priceAdjustment.status).toBe("pending");
    expect(result.priceAdjustment.direction).toBe("increase");
    // Still requires the customer to confirm — not applied outright.
    expect(result.workflowStatus).toBe(WORKFLOW_STATUS.AWAITING_EXTRA_PAYMENT);
  });
});
