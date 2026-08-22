import { jest } from "@jest/globals";

const mockStartSession = jest.fn();
const mockPayoutFindById = jest.fn();
const mockOrderFindById = jest.fn();
const mockOrderFindOne = jest.fn();
const mockGetOrCreateWallet = jest.fn();
const mockCreateLedgerEntry = jest.fn();
const mockFinanceAuditLogCreate = jest.fn();
const mockBulkSettlementUpdateOne = jest.fn();

function createSession() {
  return {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
  };
}

function makePayout(overrides = {}) {
  return {
    _id: "payout-1",
    payoutType: "SELLER",
    beneficiaryId: "store-1",
    amount: 220,
    status: "PENDING",
    relatedOrderIds: ["order-1"],
    isBulkSettlement: false,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeOrder(overrides = {}) {
  return {
    _id: "order-1",
    settlementStatus: {
      overall: "PENDING",
      sellerPayout: "PENDING",
      riderPayout: "NOT_APPLICABLE",
      adminEarningCredited: true,
      reconciledAt: null,
    },
    financeFlags: {},
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

jest.unstable_mockModule("mongoose", () => ({
  default: { startSession: mockStartSession },
}));

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { findById: mockOrderFindById, findOne: mockOrderFindOne },
}));

jest.unstable_mockModule("../app/models/wallet.js", () => ({ default: {} }));

jest.unstable_mockModule("../app/models/payout.js", () => ({
  default: { findById: mockPayoutFindById },
}));

jest.unstable_mockModule("../app/models/transaction.js", () => ({ default: {} }));

jest.unstable_mockModule("../app/models/financeAuditLog.js", () => ({
  default: { create: mockFinanceAuditLogCreate },
}));

jest.unstable_mockModule("../app/models/bulkSettlement.js", () => ({
  default: { updateOne: mockBulkSettlementUpdateOne },
}));

jest.unstable_mockModule("../app/services/finance/walletService.js", () => ({
  getOrCreateWallet: mockGetOrCreateWallet,
}));

jest.unstable_mockModule("../app/services/finance/ledgerService.js", () => ({
  createLedgerEntry: mockCreateLedgerEntry,
}));

const { processPayout } = await import("../app/services/finance/payoutService.js");
const { LEDGER_TRANSACTION_TYPE, LEDGER_DIRECTION } = await import("../app/constants/finance.js");

describe("payoutService.processPayout", () => {
  let currentSession;
  let currentPayout;
  let currentOrder;

  beforeEach(() => {
    jest.clearAllMocks();
    currentSession = createSession();
    currentPayout = makePayout();
    currentOrder = makeOrder();

    mockStartSession.mockResolvedValue(currentSession);
    mockPayoutFindById.mockReturnValue({ session: () => Promise.resolve(currentPayout) });
    mockOrderFindById.mockReturnValue({
      session: () => Promise.resolve(currentOrder),
    });
    mockOrderFindOne.mockReturnValue({
      select: () => ({ session: () => ({ lean: () => Promise.resolve(null) }) }),
    });
    mockGetOrCreateWallet.mockResolvedValue({
      _id: "wallet-1",
      pendingBalance: 500,
      availableBalance: 100,
      save: jest.fn().mockResolvedValue(undefined),
    });
    mockFinanceAuditLogCreate.mockResolvedValue([{ _id: "audit-1" }]);
    mockBulkSettlementUpdateOne.mockResolvedValue({});
  });

  it("moves pendingBalance to availableBalance", async () => {
    const wallet = { _id: "wallet-1", pendingBalance: 500, availableBalance: 100, save: jest.fn().mockResolvedValue(undefined) };
    mockGetOrCreateWallet.mockResolvedValue(wallet);

    await processPayout("payout-1", { adminId: "admin-1" });

    expect(wallet.pendingBalance).toBe(280); // 500 - 220
    expect(wallet.availableBalance).toBe(320); // 100 + 220
    expect(currentPayout.status).toBe("COMPLETED");
  });

  it("writes a SELLER_PAYOUT_PROCESSED ledger entry — previously never written despite the constant existing", async () => {
    await processPayout("payout-1", { adminId: "admin-1" });

    expect(mockCreateLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: LEDGER_TRANSACTION_TYPE.SELLER_PAYOUT_PROCESSED,
        direction: LEDGER_DIRECTION.CREDIT,
        amount: 220,
        payoutId: "payout-1",
      }),
      expect.any(Object),
    );
  });

  it("writes a RIDER_PAYOUT_PROCESSED ledger entry for delivery-partner payouts", async () => {
    currentPayout = makePayout({ payoutType: "DELIVERY_PARTNER", beneficiaryId: "rider-1" });
    mockPayoutFindById.mockReturnValue({ session: () => Promise.resolve(currentPayout) });
    currentOrder = makeOrder({
      settlementStatus: {
        overall: "PENDING",
        sellerPayout: "NOT_APPLICABLE",
        riderPayout: "PENDING",
        adminEarningCredited: true,
      },
    });
    mockOrderFindById.mockReturnValue({ session: () => Promise.resolve(currentOrder) });

    await processPayout("payout-1", { adminId: "admin-1" });

    expect(mockCreateLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({ type: LEDGER_TRANSACTION_TYPE.RIDER_PAYOUT_PROCESSED }),
      expect.any(Object),
    );
  });

  it("recomputes settlementStatus.overall to COMPLETED once seller+rider+admin are all done — previously left stale forever on this path", async () => {
    currentOrder = makeOrder({
      settlementStatus: {
        overall: "PARTIAL",
        sellerPayout: "PENDING",
        riderPayout: "NOT_APPLICABLE",
        adminEarningCredited: true,
      },
    });
    mockOrderFindById.mockReturnValue({ session: () => Promise.resolve(currentOrder) });

    await processPayout("payout-1", { adminId: "admin-1" });

    expect(currentOrder.settlementStatus.sellerPayout).toBe("COMPLETED");
    expect(currentOrder.settlementStatus.overall).toBe("COMPLETED");
  });

  it("leaves settlementStatus.overall as PARTIAL when the rider side is still pending", async () => {
    currentOrder = makeOrder({
      settlementStatus: {
        overall: "PENDING",
        sellerPayout: "PENDING",
        riderPayout: "PENDING",
        adminEarningCredited: true,
      },
    });
    mockOrderFindById.mockReturnValue({ session: () => Promise.resolve(currentOrder) });

    await processPayout("payout-1", { adminId: "admin-1" });

    expect(currentOrder.settlementStatus.sellerPayout).toBe("COMPLETED");
    expect(currentOrder.settlementStatus.overall).toBe("PARTIAL");
  });

  it("blocks processing a seller payout on a held order", async () => {
    mockOrderFindOne.mockReturnValue({
      select: () => ({ session: () => ({ lean: () => Promise.resolve({ orderId: "ORD1" }) }) }),
    });

    await expect(processPayout("payout-1", { adminId: "admin-1" })).rejects.toThrow(/settlement hold/i);
    expect(currentSession.abortTransaction).toHaveBeenCalled();
  });
});
