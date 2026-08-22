import { jest } from "@jest/globals";

const mockOrderFindById = jest.fn();
const mockRewardGrantFind = jest.fn();
const mockRewardCampaignFindByIdAndUpdate = jest.fn();
const mockDebitCustomerWallet = jest.fn();

function makeOrder(overrides = {}) {
  return {
    _id: "order-1",
    orderId: "ORD10001",
    paymentBreakdown: { grandTotal: 500 },
    financeFlags: { rewardsApplied: true },
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeGrant(overrides = {}) {
  return {
    _id: "grant-1",
    orderId: "order-1",
    customerId: "customer-1",
    campaignId: "campaign-1",
    amount: 100,
    status: "active",
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { findById: mockOrderFindById },
}));

jest.unstable_mockModule("../app/modules/rewards/models/rewardGrant.model.js", () => ({
  default: { find: mockRewardGrantFind },
}));

jest.unstable_mockModule("../app/modules/rewards/models/rewardCampaign.model.js", () => ({
  default: { findByIdAndUpdate: mockRewardCampaignFindByIdAndUpdate },
}));

jest.unstable_mockModule("../app/modules/rewards/services/cashbackService.js", () => ({
  debitCustomerWallet: mockDebitCustomerWallet,
}));

const { reverseOrderRewards } = await import(
  "../app/modules/rewards/services/reversalService.js"
);

describe("reversalService.reverseOrderRewards", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOrderFindById.mockResolvedValue(makeOrder());
    mockRewardCampaignFindByIdAndUpdate.mockResolvedValue({});
    mockDebitCustomerWallet.mockResolvedValue({});
  });

  it("reverses a grant in full when no refundAmount is given (cancellation)", async () => {
    const grant = makeGrant({ amount: 100, status: "active" });
    mockRewardGrantFind.mockResolvedValue([grant]);

    const result = await reverseOrderRewards("order-1");

    expect(mockDebitCustomerWallet).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "customer-1", amount: 100 }),
    );
    expect(grant.status).toBe("reversed");
    expect(grant.amount).toBe(0);
    expect(result.reversed).toBe(1);
  });

  it("reverses only the proportional share on a partial return, keeping the grant active", async () => {
    const grant = makeGrant({ amount: 100, status: "active" });
    mockRewardGrantFind.mockResolvedValue([grant]);

    // Order grandTotal is 500; customer was refunded 200 (a 40% partial return).
    await reverseOrderRewards("order-1", { refundAmount: 200 });

    expect(mockDebitCustomerWallet).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "customer-1", amount: 40 }),
    );
    // Grant keeps its remaining 60% and stays active — NOT fully wiped out,
    // which was the bug: REFUND_COMPLETED previously always triggered a
    // 100% reversal regardless of how much of the order was returned.
    expect(grant.amount).toBe(60);
    expect(grant.status).toBe("active");
  });

  it("fully reverses and marks REVERSED once cumulative partial reversals exhaust the grant", async () => {
    const grant = makeGrant({ amount: 100, status: "active" });
    mockRewardGrantFind.mockResolvedValue([grant]);

    // refundAmount === grandTotal -> fraction 1 -> full reversal even though
    // called via the partial-return code path.
    await reverseOrderRewards("order-1", { refundAmount: 500 });

    expect(grant.amount).toBe(0);
    expect(grant.status).toBe("reversed");
  });

  it("does not debit the wallet for non-ACTIVE grants but still reduces campaign counters proportionally", async () => {
    const grant = makeGrant({ amount: 100, status: "pending" });
    mockRewardGrantFind.mockResolvedValue([grant]);

    await reverseOrderRewards("order-1", { refundAmount: 250 }); // 50%

    expect(mockDebitCustomerWallet).not.toHaveBeenCalled();
    expect(grant.amount).toBe(50);
    expect(mockRewardCampaignFindByIdAndUpdate).toHaveBeenCalledWith(
      "campaign-1",
      expect.objectContaining({
        $inc: expect.objectContaining({ budgetUsed: -50, "stats.totalAmount": -50 }),
      }),
    );
  });

  it("only clears financeFlags.rewardsApplied on a full reversal, not a partial one", async () => {
    const grant = makeGrant({ amount: 100, status: "active" });
    mockRewardGrantFind.mockResolvedValue([grant]);
    const order = makeOrder();
    mockOrderFindById.mockResolvedValue(order);

    await reverseOrderRewards("order-1", { refundAmount: 200 });
    expect(order.financeFlags.rewardsApplied).toBe(true); // untouched

    await reverseOrderRewards("order-1", { refundAmount: 500 });
    expect(order.financeFlags.rewardsApplied).toBe(false);
  });
});
