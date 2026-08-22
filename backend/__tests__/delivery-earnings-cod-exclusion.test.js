import { jest } from "@jest/globals";

const mockTransactionFind = jest.fn();
const mockWalletFindOne = jest.fn();
const mockTransactionAggregate = jest.fn();
const mockTransactionCreate = jest.fn();

function makeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function makeTxn(overrides) {
  return { status: "Settled", type: "Delivery Earning", amount: 0, ...overrides };
}

jest.unstable_mockModule("mongoose", () => ({
  default: {
    Types: {
      ObjectId: class MockObjectId {
        constructor(value) {
          this.value = value;
        }
        toString() {
          return String(this.value);
        }
      },
    },
  },
}));

jest.unstable_mockModule("../app/models/order.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({
  orderMatchQueryFromRouteParam: jest.fn(),
}));
jest.unstable_mockModule("../app/models/transaction.js", () => ({
  default: {
    find: mockTransactionFind,
    aggregate: mockTransactionAggregate,
    create: mockTransactionCreate,
  },
}));
jest.unstable_mockModule("../app/models/delivery.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/deliveryAssignment.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/wallet.js", () => ({
  default: { findOne: mockWalletFindOne },
}));
jest.unstable_mockModule("../app/services/firebaseService.js", () => ({
  writeDeliveryLocation: jest.fn(),
  appendTrailPoint: jest.fn(),
}));
jest.unstable_mockModule("../app/config/redis.js", () => ({ getRedisClient: jest.fn() }));
jest.unstable_mockModule("../app/utils/geoUtils.js", () => ({ distanceMeters: jest.fn() }));
jest.unstable_mockModule("../app/services/orderSettlement.js", () => ({
  applyDeliveredSettlement: jest.fn(),
}));

const { getDeliveryEarnings, requestWithdrawal } = await import(
  "../app/controller/deliveryController.js"
);

describe("deliveryController COD cash-float exclusion from withdrawable balance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransactionAggregate.mockResolvedValue([]);
    mockWalletFindOne.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ cashInHand: 0 }) }),
    });
  });

  it("getDeliveryEarnings excludes un-remitted COD gross cash from availableBalance", async () => {
    const transactions = [
      makeTxn({ type: "Delivery Earning", amount: 50 }), // rider's actual commission
      // Full gross grandTotal of a COD order the rider hasn't remitted yet —
      // this used to be counted as if it were the rider's own earnings.
      makeTxn({ type: "Cash Collection", amount: 300 }),
    ];
    mockTransactionFind.mockReturnValue({
      sort: () => ({
        limit: () => ({
          populate: () => Promise.resolve(transactions),
        }),
      }),
    });

    const req = { user: { id: "rider-1" }, query: {} };
    const res = makeRes();
    await getDeliveryEarnings(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0].result;
    // Only the 50 commission counts toward withdrawable balance, not the 300
    // gross COD cash still sitting un-remitted.
    expect(payload.availableBalance).toBe(50);
  });

  it("getDeliveryEarnings nets out a remitted Cash Settlement correctly (no double subtraction)", async () => {
    const transactions = [
      makeTxn({ type: "Delivery Earning", amount: 50 }),
      makeTxn({ type: "Cash Collection", amount: 300 }),
      makeTxn({ type: "Cash Settlement", amount: -300 }),
    ];
    mockTransactionFind.mockReturnValue({
      sort: () => ({ limit: () => ({ populate: () => Promise.resolve(transactions) }) }),
    });

    const req = { user: { id: "rider-1" }, query: {} };
    const res = makeRes();
    await getDeliveryEarnings(req, res);

    const payload = res.json.mock.calls[0][0].result;
    // Cash Collection and Cash Settlement are both excluded (pure pass-through
    // float, not earnings) — so this must remain 50, not -250.
    expect(payload.availableBalance).toBe(50);
  });

  it("requestWithdrawal rejects a withdrawal funded by un-remitted COD cash", async () => {
    mockTransactionFind.mockResolvedValue([
      makeTxn({ type: "Delivery Earning", amount: 50 }),
      makeTxn({ type: "Cash Collection", amount: 300 }),
    ]);

    const req = { user: { id: "rider-1" }, body: { amount: 200 } };
    const res = makeRes();
    await requestWithdrawal(req, res);

    // Only 50 is actually available — a 200 withdrawal request must be
    // rejected, not silently funded out of the platform's COD float.
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("requestWithdrawal allows a withdrawal within the true earnings balance", async () => {
    mockTransactionFind.mockResolvedValue([
      makeTxn({ type: "Delivery Earning", amount: 50 }),
      makeTxn({ type: "Cash Collection", amount: 300 }),
    ]);
    mockTransactionCreate.mockResolvedValue({ _id: "wd-1" });

    const req = { user: { id: "rider-1" }, body: { amount: 40 } };
    const res = makeRes();
    await requestWithdrawal(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: -40, type: "Withdrawal" }),
    );
  });
});
