import { jest } from "@jest/globals";

const mockStoreFind = jest.fn();
const mockStoreFindByIdAndUpdate = jest.fn();
const mockSellerFind = jest.fn();
const mockSellerFindOneAndUpdate = jest.fn();
const mockAssignComplimentarySubscription = jest.fn();

const chain = (rows) => {
  const q = {
    sort: jest.fn(() => q),
    select: jest.fn(() => q),
    populate: jest.fn(() => q),
    lean: jest.fn().mockResolvedValue(rows),
  };
  return q;
};

jest.unstable_mockModule("../app/models/store.js", () => ({
  default: { find: mockStoreFind, findByIdAndUpdate: mockStoreFindByIdAndUpdate },
}));

jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: { find: mockSellerFind, findOneAndUpdate: mockSellerFindOneAndUpdate },
}));

jest.unstable_mockModule("../app/models/sellerInvite.js", () => ({ default: {} }));

// The service fires these and chains .catch(), so they must return promises.
jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule("../app/modules/notifications/notification.constants.js", () => ({
  NOTIFICATION_EVENTS: {},
}));

jest.unstable_mockModule("../app/services/emailService.js", () => ({
  sendVendorWelcomeEmail: jest.fn().mockResolvedValue(undefined),
  sendSellerInviteEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule("../app/services/auditTrailService.js", () => ({
  recordAuditLog: jest.fn(),
}));

jest.unstable_mockModule("../app/services/subscriptionService.js", () => ({
  assignComplimentarySubscription: mockAssignComplimentarySubscription,
}));

const { getPendingSellerApplications, approveSellerApplicationById } = await import(
  "../app/services/admin/sellerApplicationService.js"
);

const OWNER = { _id: "owner1", name: "Palak", email: "p@x.com", phone: "1", createdAt: new Date("2026-10-02") };
const SHOP = { _id: "store1", shopName: "Vmart", ownerId: { _id: "owner9", name: "Jiya" }, createdAt: new Date("2026-10-01") };

describe("getPendingSellerApplications applicationType filter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreFind.mockImplementation(() => chain([SHOP]));
    mockSellerFind.mockImplementation(() => chain([OWNER]));
  });

  const run = (applicationType) =>
    getPendingSellerApplications({ status: "pending", applicationType, page: 1, limit: 50, skip: 0 });

  it("merges both kinds by default, preserving the combined screen", async () => {
    const result = await run("all");
    expect(result.items.map((i) => i.applicationType).sort()).toEqual(["seller_admin", "store"]);
  });

  it("returns only owner-account registrations for seller_admin", async () => {
    const result = await run("seller_admin");

    expect(result.items).toHaveLength(1);
    expect(result.items[0].applicationType).toBe("seller_admin");
    // The shop collection must not even be queried for this screen.
    expect(mockStoreFind).not.toHaveBeenCalled();
  });

  it("returns only shop applications for store", async () => {
    const result = await run("store");

    expect(result.items).toHaveLength(1);
    expect(result.items[0].applicationType).toBe("store");
    expect(mockSellerFind).not.toHaveBeenCalled();
  });

  it("scopes the stats to the filtered type rather than the combined backlog", async () => {
    expect((await run("all")).stats.totalApplications).toBe(2);
    expect((await run("seller_admin")).stats.totalApplications).toBe(1);
    expect((await run("store")).stats.totalApplications).toBe(1);
  });
});

describe("approveSellerApplicationById", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreFindByIdAndUpdate.mockReturnValue({
      populate: jest.fn().mockResolvedValue(null),
    });
    // The service returns formatSellerApplication(account.toObject()).
    const account = { _id: "owner1", name: "Palak", email: "" };
    mockSellerFindOneAndUpdate.mockResolvedValue({
      ...account,
      toObject: () => account,
    });
  });

  const ownerUpdate = () => mockSellerFindOneAndUpdate.mock.calls[0][1].$set;

  // Setting a model here defaulted every approved seller to "commission", which
  // meant the seller-side /seller/choose-model gate could never fire.
  it("approves without choosing a business model for the seller", async () => {
    await approveSellerApplicationById({ sellerId: "owner1", reviewedBy: "admin1" });

    const update = ownerUpdate();
    expect(update.applicationStatus).toBe("approved");
    expect(update.isVerified).toBe(true);
    expect(update).not.toHaveProperty("businessModel");
    expect(update).not.toHaveProperty("businessModelChosenAt");
  });

  it("still applies the admin per-store commission override when given", async () => {
    await approveSellerApplicationById({
      sellerId: "store1",
      reviewedBy: "admin1",
      commissionConfig: {
        applyCommission: true,
        adminCommissionType: "percentage",
        adminCommissionValue: 12,
      },
    });

    const storeUpdate = mockStoreFindByIdAndUpdate.mock.calls[0][1].$set;
    expect(storeUpdate.applyCommission).toBe(true);
    expect(storeUpdate.adminCommissionValue).toBe(12);
  });

  it("leaves the store commission override alone when none is supplied", async () => {
    await approveSellerApplicationById({ sellerId: "store1", reviewedBy: "admin1" });

    const storeUpdate = mockStoreFindByIdAndUpdate.mock.calls[0][1].$set;
    expect(storeUpdate).not.toHaveProperty("applyCommission");
  });

  it("grants a complimentary plan only when the admin picked one", async () => {
    await approveSellerApplicationById({ sellerId: "owner1", reviewedBy: "admin1" });
    expect(mockAssignComplimentarySubscription).not.toHaveBeenCalled();

    await approveSellerApplicationById({
      sellerId: "owner1",
      reviewedBy: "admin1",
      subscriptionPlanId: "plan1",
    });
    expect(mockAssignComplimentarySubscription).toHaveBeenCalledWith(
      expect.objectContaining({ planId: "plan1" }),
    );
  });
});
