import { jest } from "@jest/globals";

// Subscriptions are per STORE now (see models/store.js,
// services/subscriptionService.js) — every record carries storeId, and
// enforcement (visibility, product limits) acts on ONE store, not an
// account's whole fleet of shops.

const mockStoreFindById = jest.fn();
const mockStoreFindByIdAndUpdate = jest.fn();
const mockStoreUpdateOne = jest.fn();
const mockProductUpdateMany = jest.fn();
const mockProductFind = jest.fn();
const mockSubscriptionCreate = jest.fn();
const mockSubscriptionFindOne = jest.fn();
const mockSubscriptionFind = jest.fn();
const mockSubscriptionFindByIdAndUpdate = jest.fn();
const mockSubscriptionUpdateOne = jest.fn();
const mockPlanFindById = jest.fn();
const mockPlanFindOne = jest.fn();
const mockPaymentRequestFindById = jest.fn();

jest.unstable_mockModule("../app/models/store.js", () => ({
  default: {
    findById: mockStoreFindById,
    findByIdAndUpdate: mockStoreFindByIdAndUpdate.mockResolvedValue({}),
    updateOne: mockStoreUpdateOne.mockResolvedValue({}),
  },
}));

jest.unstable_mockModule("../app/models/product.js", () => ({
  default: {
    countDocuments: jest.fn().mockResolvedValue(0),
    updateMany: mockProductUpdateMany.mockResolvedValue({}),
    find: mockProductFind,
  },
}));

jest.unstable_mockModule("../app/models/setting.js", () => ({
  default: {
    findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(null) }),
  },
}));

jest.unstable_mockModule("../app/models/subscriptionPlan.js", () => ({
  default: {
    find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) }),
    findById: mockPlanFindById,
    findOne: mockPlanFindOne,
  },
}));

jest.unstable_mockModule("../app/models/sellerSubscription.js", () => ({
  default: {
    findOne: mockSubscriptionFindOne,
    find: mockSubscriptionFind,
    create: mockSubscriptionCreate,
    findByIdAndUpdate: mockSubscriptionFindByIdAndUpdate,
    updateOne: mockSubscriptionUpdateOne.mockResolvedValue({}),
  },
}));

jest.unstable_mockModule("../app/models/subscriptionPaymentRequest.js", () => ({
  default: {
    create: jest.fn(),
    findOne: jest.fn(),
    findById: mockPaymentRequestFindById,
  },
}));

jest.unstable_mockModule("../app/models/sellerSubscriptionPayment.js", () => ({
  default: { findOne: jest.fn() },
}));

const {
  approvePaymentRequest,
  expireDueSubscriptions,
  activateSubscriptionFromPaymentRequest,
  enforceSubscriptionLimits,
  resolveSubscriptionRequestType,
} = await import("../app/services/subscriptionService.js");
const { PAYMENT_REQUEST_TYPE } = await import("../app/constants/subscription.js");

function emptyProductFindChain() {
  return {
    sort: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    }),
  };
}

describe("subscriptionService (per-store)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProductFind.mockReturnValue(emptyProductFindChain());
  });

  it("approves payment and creates an active subscription for the request's store", async () => {
    const request = {
      _id: "req1",
      sellerId: "seller1",
      storeId: "store1",
      planId: "plan1",
      requestType: "new",
      status: "pending",
      save: jest.fn().mockResolvedValue(true),
    };

    mockPaymentRequestFindById.mockResolvedValue(request);
    mockSubscriptionFindOne.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });
    mockPlanFindById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "plan1",
        name: "Starter",
        productCountPerShop: 50,
        durationDays: 30,
        price: 999,
      }),
    });
    mockSubscriptionCreate.mockResolvedValue({ _id: "sub1", status: "active" });

    const result = await approvePaymentRequest("req1", "admin1");

    expect(request.status).toBe("approved");
    expect(mockSubscriptionCreate).toHaveBeenCalled();
    const createArg = mockSubscriptionCreate.mock.calls[0][0];
    expect(createArg.storeId).toBe("store1");
    // This store (and only this store) is re-activated.
    expect(mockStoreUpdateOne).toHaveBeenCalledWith(
      { _id: "store1", isVerified: true, applicationStatus: "approved" },
      { $set: { isActive: true } },
    );
    expect(result.subscription).toBeTruthy();
  });

  it("rejects activation when the payment request has no storeId (pre-migration row)", async () => {
    mockPlanFindById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "plan1", price: 999, durationDays: 30 }) });
    await expect(
      activateSubscriptionFromPaymentRequest({ _id: "req-old", sellerId: "seller1", planId: "plan1" }),
    ).rejects.toThrow(/no storeId/i);
  });

  it("expires due subscriptions and hides just that store", async () => {
    mockSubscriptionFind.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { _id: "sub1", sellerId: "seller1", storeId: "store1" },
      ]),
    });

    const count = await expireDueSubscriptions();
    expect(count).toBe(1);
    expect(mockStoreUpdateOne).toHaveBeenCalledWith({ _id: "store1" }, { $set: { isActive: false } });
    expect(mockProductUpdateMany).toHaveBeenCalledWith(
      { sellerId: "store1" },
      { $set: { isPublished: false } },
    );
  });

  it("keeps period end unchanged on upgrade", async () => {
    const periodEnd = new Date("2026-12-31T00:00:00.000Z");
    mockSubscriptionFindOne.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        _id: "sub1",
        currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
        currentPeriodEnd: periodEnd,
        planSnapshot: { price: 999, sortOrder: 1 },
      }),
    });
    mockPlanFindById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "plan2",
        name: "Pro",
        productCountPerShop: 100,
        durationDays: 30,
        price: 2499,
        sortOrder: 2,
      }),
    });
    mockSubscriptionFindByIdAndUpdate.mockResolvedValue({
      _id: "sub1",
      planSnapshot: { productCountPerShop: 100 },
    });

    const request = {
      _id: "req2",
      sellerId: "seller1",
      storeId: "store1",
      planId: "plan2",
      requestType: PAYMENT_REQUEST_TYPE.UPGRADE,
    };

    const subscription = await activateSubscriptionFromPaymentRequest(request);
    expect(mockSubscriptionFindByIdAndUpdate).toHaveBeenCalled();
    const updateArg = mockSubscriptionFindByIdAndUpdate.mock.calls[0][1];
    expect(new Date(updateArg.currentPeriodEnd).getTime()).toBe(periodEnd.getTime());
    expect(subscription).toBeTruthy();
  });

  it("enforceSubscriptionLimits unpublishes excess products on THIS store only (no more cross-shop disabling)", async () => {
    mockProductFind.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: "p1" }, { _id: "p2" }, { _id: "p3" },
          ]),
        }),
      }),
    });

    await enforceSubscriptionLimits("store1", { productCountPerShop: 2 });

    expect(mockProductUpdateMany).toHaveBeenCalledWith(
      { _id: { $in: ["p3"] } },
      { $set: { isPublished: false } },
    );
    // No more "disable extra shops" behavior — a store's own subscription
    // only ever governs that one store.
    expect(mockStoreUpdateOne).not.toHaveBeenCalled();
  });

  it("resolveSubscriptionRequestType infers upgrade for higher tier", () => {
    const type = resolveSubscriptionRequestType({
      activeSubscription: { planSnapshot: { price: 999, sortOrder: 1 } },
      selectedPlan: { price: 2499, sortOrder: 2 },
      explicitType: PAYMENT_REQUEST_TYPE.NEW,
    });
    expect(type).toBe(PAYMENT_REQUEST_TYPE.UPGRADE);
  });
});
