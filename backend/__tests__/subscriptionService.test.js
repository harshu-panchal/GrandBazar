import { jest } from "@jest/globals";

const mockStoreFind = jest.fn();
const mockSellerFind = jest.fn();
const mockSellerFindById = jest.fn();
const mockStoreUpdateMany = jest.fn();
const mockProductUpdateMany = jest.fn();
const mockSubscriptionCreate = jest.fn();
const mockSubscriptionFindOne = jest.fn();
const mockSubscriptionFind = jest.fn();
const mockSubscriptionFindByIdAndUpdate = jest.fn();
const mockPlanFindById = jest.fn();
const mockPlanFindOne = jest.fn();
const mockPaymentRequestCreate = jest.fn();
const mockPaymentRequestFindOne = jest.fn();
const mockPaymentRequestFindById = jest.fn();

jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: {
    find: mockSellerFind,
    findById: mockSellerFindById,
    findByIdAndUpdate: jest.fn().mockResolvedValue({}),
  },
}));

jest.unstable_mockModule("../app/models/store.js", () => ({
  default: {
    find: mockStoreFind,
    countDocuments: jest.fn().mockResolvedValue(0),
    updateMany: mockStoreUpdateMany.mockResolvedValue({}),
  },
}));

jest.unstable_mockModule("../app/models/product.js", () => ({
  default: {
    countDocuments: jest.fn().mockResolvedValue(0),
    updateMany: mockProductUpdateMany.mockResolvedValue({}),
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
    }),
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
    updateOne: jest.fn().mockResolvedValue({}),
  },
}));

jest.unstable_mockModule("../app/models/subscriptionPaymentRequest.js", () => ({
  default: {
    create: mockPaymentRequestCreate,
    findOne: mockPaymentRequestFindOne,
    findById: mockPaymentRequestFindById,
  },
}));

const {
  approvePaymentRequest,
  expireDueSubscriptions,
  activateSubscriptionFromPaymentRequest,
  enforceSubscriptionLimits,
  resolveSubscriptionRequestType,
} = await import("../app/services/subscriptionService.js");
const { PAYMENT_REQUEST_TYPE } = await import("../app/constants/subscription.js");

describe("subscriptionService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreFind.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
    });
  });

  it("approves payment and creates active subscription", async () => {
    const request = {
      _id: "req1",
      sellerId: "seller1",
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
        shopCount: 1,
        productCountPerShop: 50,
        durationDays: 30,
        price: 999,
      }),
    });
    mockSubscriptionCreate.mockResolvedValue({ _id: "sub1", status: "active" });

    const result = await approvePaymentRequest("req1", "admin1");

    expect(request.status).toBe("approved");
    expect(mockSubscriptionCreate).toHaveBeenCalled();
    expect(mockStoreUpdateMany).toHaveBeenCalled();
    expect(result.subscription).toBeTruthy();
  });

  it("expires due subscriptions and hides stores", async () => {
    mockStoreFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ _id: "store1" }]),
    });

    mockSubscriptionFind.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { _id: "sub1", sellerId: "seller1" },
      ]),
    });

    const count = await expireDueSubscriptions();
    expect(count).toBe(1);
    expect(mockStoreUpdateMany).toHaveBeenCalled();
    expect(mockProductUpdateMany).toHaveBeenCalled();
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
        shopCount: 3,
        productCountPerShop: 100,
        durationDays: 30,
        price: 2499,
        sortOrder: 2,
      }),
    });
    mockSubscriptionFindByIdAndUpdate.mockResolvedValue({
      _id: "sub1",
      planSnapshot: { shopCount: 3, productCountPerShop: 100 },
    });

    const request = {
      _id: "req2",
      sellerId: "seller1",
      planId: "plan2",
      requestType: PAYMENT_REQUEST_TYPE.UPGRADE,
    };

    const subscription = await activateSubscriptionFromPaymentRequest(request);
    expect(mockSubscriptionFindByIdAndUpdate).toHaveBeenCalled();
    const updateArg = mockSubscriptionFindByIdAndUpdate.mock.calls[0][1];
    expect(new Date(updateArg.currentPeriodEnd).getTime()).toBe(periodEnd.getTime());
    expect(subscription).toBeTruthy();
  });

  it("enforceSubscriptionLimits deactivates excess stores", async () => {
    mockStoreFind.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: "s1", isActive: true },
            { _id: "s2", isActive: true },
            { _id: "s3", isActive: true },
          ]),
        }),
      }),
    });

    await enforceSubscriptionLimits("seller1", { shopCount: 1, productCountPerShop: 10 });

    expect(mockStoreUpdateMany).toHaveBeenCalledWith(
      { _id: { $in: ["s2", "s3"] } },
      { $set: { isActive: false } },
    );
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
