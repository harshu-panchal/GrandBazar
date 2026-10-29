import { jest } from "@jest/globals";

const mockStoreFind = jest.fn();
const mockSellerFind = jest.fn();
const mockSellerFindById = jest.fn();
const mockStoreUpdateMany = jest.fn();
const mockStoreCountDocuments = jest.fn();
const mockStoreFindById = jest.fn();
const mockProductCountDocuments = jest.fn();
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
    findById: mockStoreFindById,
    countDocuments: mockStoreCountDocuments,
    updateMany: mockStoreUpdateMany.mockResolvedValue({}),
  },
}));

jest.unstable_mockModule("../app/models/product.js", () => ({
  default: {
    countDocuments: mockProductCountDocuments,
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
  assertCanCreateStore,
  assertCanAddProduct,
  expireDueSubscriptions,
  activateSubscriptionFromPaymentRequest,
  enforceSubscriptionLimits,
  resolveSubscriptionRequestType,
} = await import("../app/services/subscriptionService.js");
const { PAYMENT_REQUEST_TYPE } = await import("../app/constants/subscription.js");

describe("subscriptionService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreCountDocuments.mockResolvedValue(0);
    mockProductCountDocuments.mockResolvedValue(0);
    mockStoreFind.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
    });
  });

  it("blocks adding products when a subscription shop limit would be exceeded", async () => {
    mockStoreFindById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ ownerId: "seller1" }),
    });
    mockSellerFindById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ businessModel: "subscription" }),
    });
    mockSubscriptionFindOne.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        sellerId: "seller1",
        planSnapshot: { productCountPerShop: 2 },
      }),
    });
    mockProductCountDocuments.mockResolvedValue(1);

    await expect(assertCanAddProduct("store1", 2)).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining("Product limit reached"),
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

  // The shop cap is what makes a single ACCOUNT-level subscription work: the
  // seller buys one plan and plan.shopCount decides how many shops it covers.
  describe("assertCanCreateStore", () => {
    const activeSubscription = (shopCount) => {
      mockSubscriptionFindOne.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          _id: "sub1",
          sellerId: "seller1",
          planSnapshot: { shopCount, productCountPerShop: 100 },
        }),
      });
    };

    const sellerOn = (businessModel) => {
      mockSellerFindById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: "seller1", businessModel }),
      });
    };

    it("lets a commission seller add shops without any subscription", async () => {
      sellerOn("commission");
      mockStoreCountDocuments.mockResolvedValue(99);

      await expect(assertCanCreateStore("seller1")).resolves.toBeUndefined();
      expect(mockSubscriptionFindOne).not.toHaveBeenCalled();
    });

    it("blocks a subscription seller with no active subscription", async () => {
      sellerOn("subscription");
      mockSubscriptionFindOne.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(assertCanCreateStore("seller1")).rejects.toMatchObject({
        statusCode: 403,
        message: "Active subscription required to create shops",
      });
    });

    it("allows a new shop while under the plan shopCount", async () => {
      sellerOn("subscription");
      activeSubscription(3);
      mockStoreCountDocuments.mockResolvedValue(2);

      await expect(assertCanCreateStore("seller1")).resolves.toBeUndefined();
    });

    it("blocks a new shop once the plan shopCount is reached", async () => {
      sellerOn("subscription");
      activeSubscription(3);
      mockStoreCountDocuments.mockResolvedValue(3);

      await expect(assertCanCreateStore("seller1")).rejects.toMatchObject({
        statusCode: 403,
        message: "Shop limit reached (3). Upgrade your subscription plan.",
      });
    });

    it("treats a plan with no shopCount as uncapped", async () => {
      sellerOn("subscription");
      activeSubscription(0);
      mockStoreCountDocuments.mockResolvedValue(50);

      await expect(assertCanCreateStore("seller1")).resolves.toBeUndefined();
    });
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
