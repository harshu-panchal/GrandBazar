import { jest } from "@jest/globals";

// TC-CAT-006 regression test (unpauseProduct branch): recomputing
// isCurrentlyAvailable when a seller manually unpauses a product used the
// same inverted `!withinDailyWindow` logic as the background job. This locks
// in the fix: available when inside the window (or when no window is
// configured), unavailable when outside it.

const mockProductFindOne = jest.fn();
const mockEnqueueProductIndex = jest.fn();
const mockInvalidate = jest.fn();

jest.unstable_mockModule("../app/models/product.js", () => ({
  default: { findOne: mockProductFindOne },
}));

jest.unstable_mockModule("../app/services/searchSyncService.js", () => ({
  enqueueProductIndex: mockEnqueueProductIndex,
}));

jest.unstable_mockModule("../app/services/cacheService.js", () => ({
  invalidate: mockInvalidate,
  buildKey: jest.fn(() => "cache:catalog:productList:*"),
}));

jest.unstable_mockModule("../app/services/subscriptionService.js", () => ({
  assertCanPublishProduct: jest.fn(),
  assertCanCreateFreeTierProduct: jest.fn(),
}));

const { unpauseProduct } = await import("../app/services/productPublishService.js");

function makeProduct(availability) {
  return {
    _id: "prod-1",
    availability,
    isCurrentlyAvailable: null,
    save: jest.fn().mockResolvedValue(undefined),
  };
}

describe("productPublishService.unpauseProduct TC-CAT-006", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("becomes available when unpaused inside the daily window", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-01-01T02:30:00.000Z")); // 08:00 IST
    const product = makeProduct({ dailyStartTime: "06:00", dailyEndTime: "10:00", pausedUntil: new Date() });
    mockProductFindOne.mockResolvedValue(product);

    const result = await unpauseProduct({ productId: "prod-1", storeId: "store-1" });

    expect(result.isCurrentlyAvailable).toBe(true);
    expect(result.availability.pausedUntil).toBeNull();
  });

  it("stays unavailable when unpaused outside the daily window", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-01-01T08:30:00.000Z")); // 14:00 IST
    const product = makeProduct({ dailyStartTime: "06:00", dailyEndTime: "10:00", pausedUntil: new Date() });
    mockProductFindOne.mockResolvedValue(product);

    const result = await unpauseProduct({ productId: "prod-1", storeId: "store-1" });

    expect(result.isCurrentlyAvailable).toBe(false);
  });

  it("becomes available when unpaused with no daily window configured", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-01-01T08:30:00.000Z"));
    const product = makeProduct({ dailyStartTime: null, dailyEndTime: null, pausedUntil: new Date() });
    mockProductFindOne.mockResolvedValue(product);

    const result = await unpauseProduct({ productId: "prod-1", storeId: "store-1" });

    expect(result.isCurrentlyAvailable).toBe(true);
  });
});
