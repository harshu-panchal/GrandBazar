import { jest } from "@jest/globals";

// TC-ORD-009 / TC-E2E-010 regression test: a cart mixing one store's
// pre-order campaign item with regular in-stock items from the same store
// used to hard-block checkout entirely. assertCartPreorderRules now allows
// that mix (checkout auto-aligns the regular items to the campaign's
// delivery window) and only still blocks two different campaigns at once.

const mockPreOrderCampaignFindOne = jest.fn();

jest.unstable_mockModule("../app/models/preOrderCampaign.js", () => ({
  default: { findOne: mockPreOrderCampaignFindOne },
}));
jest.unstable_mockModule("../app/models/order.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/product.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/services/orderSchedulingService.js", () => ({
  validateScheduleSelection: jest.fn(),
  buildSchedulePayload: jest.fn(),
  computeSellerPendingExpiry: jest.fn(),
}));
jest.unstable_mockModule("../app/queues/orderQueues.js", () => ({
  preorderActivationQueue: { add: jest.fn(), getJob: jest.fn() },
  JOB_NAMES: { PREORDER_ACTIVATION: "preorder-activation" },
}));
jest.unstable_mockModule("../app/services/orderWorkflowService.js", () => ({
  afterPlaceOrderV2: jest.fn(),
}));
jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: jest.fn(),
}));
jest.unstable_mockModule("../app/services/orderCompensation.js", () => ({
  compensateOrderCancellation: jest.fn(),
}));
jest.unstable_mockModule("../app/services/customerVisibilityService.js", () => ({
  parseCustomerCoordinates: jest.fn(),
  getNearbySellerIdsForCustomer: jest.fn(),
}));

const { assertCartPreorderRules, getCampaignProductIdSet } = await import(
  "../app/services/preOrderCampaignService.js"
);

describe("assertCartPreorderRules TC-ORD-009 / TC-E2E-010", () => {
  it("allows a pre-order campaign item mixed with regular items from the same store", async () => {
    const result = await assertCartPreorderRules([
      { campaignId: "POC-1", productId: "prod-a" },
      { productId: "prod-b" }, // regular, no campaignId
    ]);
    expect(result).toEqual({ hasPreorder: true, hasRegular: true, campaignId: "POC-1" });
  });

  it("still blocks two different campaigns in the same cart", async () => {
    await expect(
      assertCartPreorderRules([
        { campaignId: "POC-1", productId: "prod-a" },
        { campaignId: "POC-2", productId: "prod-b" },
      ]),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Cart cannot contain items from multiple pre-order campaigns",
    });
  });

  it("reports a pure regular cart as having no pre-order component", async () => {
    const result = await assertCartPreorderRules([{ productId: "prod-a" }, { productId: "prod-b" }]);
    expect(result).toEqual({ hasPreorder: false, hasRegular: true, campaignId: null });
  });

  it("reports a pure pre-order cart with no regular items", async () => {
    const result = await assertCartPreorderRules([
      { campaignId: "POC-1", productId: "prod-a" },
      { campaignId: "POC-1", productId: "prod-b" },
    ]);
    expect(result).toEqual({ hasPreorder: true, hasRegular: false, campaignId: "POC-1" });
  });
});

describe("getCampaignProductIdSet (mixed-cart order split helper)", () => {
  it("returns the set of product ids that belong to the seller's active campaign", async () => {
    mockPreOrderCampaignFindOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        products: [{ product: "prod-a" }, { product: "prod-c" }],
      }),
    });

    const ids = await getCampaignProductIdSet("POC-1", "seller-1");

    expect(ids).toEqual(new Set(["prod-a", "prod-c"]));
    expect(mockPreOrderCampaignFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: "POC-1", seller: "seller-1" }),
    );
  });

  it("returns an empty set when no matching active campaign is found", async () => {
    mockPreOrderCampaignFindOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });

    const ids = await getCampaignProductIdSet("POC-1", "seller-2");

    expect(ids.size).toBe(0);
  });
});
