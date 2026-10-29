import { jest } from "@jest/globals";

const mockOrderFind = jest.fn();
const mockOrderUpdateOne = jest.fn();
const mockApplyDeliveredSettlement = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { find: mockOrderFind, updateOne: mockOrderUpdateOne },
}));

jest.unstable_mockModule("../app/services/orderSettlement.js", () => ({
  applyDeliveredSettlement: mockApplyDeliveredSettlement,
}));

jest.unstable_mockModule("../app/services/logger.js", () => ({
  default: {
    error: mockLoggerError,
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
  },
}));

const {
  getDeliveredSettlementReconciliationJobHandler,
  getDeliveredSettlementReconciliationJobInterval,
} = await import("../app/jobs/deliveredSettlementReconciliationJob.js");

describe("delivered settlement reconciliation job", () => {
  let candidates;
  let query;

  beforeEach(() => {
    jest.clearAllMocks();
    candidates = [];
    query = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(candidates),
    };
    mockOrderFind.mockReturnValue(query);
    mockOrderUpdateOne.mockResolvedValue({});
  });

  afterEach(() => {
    delete process.env.DELIVERED_SETTLEMENT_RECONCILIATION_INTERVAL_MS;
  });

  it("uses the configured interval and falls back for invalid values", () => {
    process.env.DELIVERED_SETTLEMENT_RECONCILIATION_INTERVAL_MS = "30000";
    expect(getDeliveredSettlementReconciliationJobInterval()).toBe(30000);

    process.env.DELIVERED_SETTLEMENT_RECONCILIATION_INTERVAL_MS = "invalid";
    expect(getDeliveredSettlementReconciliationJobInterval()).toBe(60000);
  });

  it("retries unsettled delivered orders and logs failures without stopping the batch", async () => {
    candidates.push(
      { _id: "order-1", orderId: "ORD-1" },
      { _id: "order-2", orderId: "ORD-2" },
    );
    query.lean.mockResolvedValue(candidates);
    mockApplyDeliveredSettlement
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("ledger unavailable"));

    await getDeliveredSettlementReconciliationJobHandler()();

    expect(mockOrderFind).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "delivered",
        $and: expect.arrayContaining([
          expect.objectContaining({
            $or: expect.arrayContaining([
              { "financeFlags.deliveredSettlementApplied": { $ne: true } },
              expect.objectContaining({
                paymentMode: "COD",
                fulfillmentMethod: "platform_logistics",
                "financeFlags.codMarkedCollected": { $ne: true },
              }),
            ]),
          }),
        ]),
      }),
    );
    expect(query.limit).toHaveBeenCalledWith(25);
    expect(mockApplyDeliveredSettlement).toHaveBeenNthCalledWith(
      1,
      candidates[0],
      "ORD-1",
    );
    expect(mockApplyDeliveredSettlement).toHaveBeenNthCalledWith(
      2,
      candidates[1],
      "ORD-2",
    );
    expect(mockLoggerError).toHaveBeenCalledWith(
      "Delivered order finance reconciliation failed",
      expect.objectContaining({ orderId: "ORD-2", error: "ledger unavailable" }),
    );
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "Delivered order finance reconciliation completed",
      expect.objectContaining({
        candidateCount: 2,
        settledCount: 1,
        failedCount: 1,
      }),
    );
    expect(mockOrderUpdateOne).toHaveBeenCalledTimes(2);
  });

  it("does not query or log when there are no unsettled delivered orders", async () => {
    await getDeliveredSettlementReconciliationJobHandler()();

    expect(mockOrderFind).toHaveBeenCalledTimes(1);
    expect(mockApplyDeliveredSettlement).not.toHaveBeenCalled();
    expect(mockLoggerInfo).not.toHaveBeenCalled();
  });
});
