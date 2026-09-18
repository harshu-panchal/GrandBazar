import { jest } from "@jest/globals";

// TC-CAT-006 regression test: the daily availability-window check used to be
// inverted (`shouldBeAvailable = !pauseActive && !withinDailyWindow`), which
// hid a product exactly when it should have been orderable (inside its
// window) and showed it exactly when it should have been hidden (outside
// its window). This locks in the corrected `withinDailyWindow` (no negation)
// semantics across both places that compute it.

const mockProductFind = jest.fn();
const mockProductBulkWrite = jest.fn();
const mockEnqueueProductIndex = jest.fn();
const mockInvalidate = jest.fn();

jest.unstable_mockModule("../app/models/product.js", () => ({
  default: {
    find: mockProductFind,
    bulkWrite: mockProductBulkWrite,
  },
}));

jest.unstable_mockModule("../app/services/searchSyncService.js", () => ({
  enqueueProductIndex: mockEnqueueProductIndex,
}));

jest.unstable_mockModule("../app/services/cacheService.js", () => ({
  invalidate: mockInvalidate,
  buildKey: jest.fn(() => "cache:catalog:productList:*"),
}));

jest.unstable_mockModule("../app/services/logger.js", () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// scheduleDateUtils is left unmocked (pure, no DB) — the test controls "now"
// via fake timers so the real timezone math runs for real.
const recomputeProductAvailability = (
  await import("../app/jobs/productAvailabilityJob.js")
).default;

function selectLean(result) {
  return { select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(result) };
}

describe("productAvailabilityJob TC-CAT-006 (availability window inversion fix)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProductBulkWrite.mockResolvedValue({});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("marks a product AVAILABLE while the current time is inside its daily window", async () => {
    // 08:00 IST == 02:30 UTC — inside a 06:00-10:00 window.
    jest.useFakeTimers().setSystemTime(new Date("2026-01-01T02:30:00.000Z"));

    mockProductFind.mockReturnValue(
      selectLean([
        {
          _id: "p1",
          isCurrentlyAvailable: false, // previously left unavailable at 8am — the bug
          availability: { dailyStartTime: "06:00", dailyEndTime: "10:00", pausedUntil: null },
        },
      ]),
    );

    await recomputeProductAvailability();

    expect(mockProductBulkWrite).toHaveBeenCalledTimes(1);
    const [ops] = mockProductBulkWrite.mock.calls[0];
    expect(ops).toEqual([
      {
        updateOne: {
          filter: { _id: "p1" },
          update: { $set: { isCurrentlyAvailable: true } },
        },
      },
    ]);
  });

  it("marks a product UNAVAILABLE while the current time is outside its daily window", async () => {
    // 14:00 IST == 08:30 UTC — outside a 06:00-10:00 window.
    jest.useFakeTimers().setSystemTime(new Date("2026-01-01T08:30:00.000Z"));

    mockProductFind.mockReturnValue(
      selectLean([
        {
          _id: "p2",
          isCurrentlyAvailable: true, // previously left available at 2pm — the bug
          availability: { dailyStartTime: "06:00", dailyEndTime: "10:00", pausedUntil: null },
        },
      ]),
    );

    await recomputeProductAvailability();

    expect(mockProductBulkWrite).toHaveBeenCalledTimes(1);
    const [ops] = mockProductBulkWrite.mock.calls[0];
    expect(ops).toEqual([
      {
        updateOne: {
          filter: { _id: "p2" },
          update: { $set: { isCurrentlyAvailable: false } },
        },
      },
    ]);
  });

  it("leaves a product with no configured window always available (subject only to pause)", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-01-01T08:30:00.000Z"));

    mockProductFind.mockReturnValue(
      selectLean([
        {
          _id: "p3",
          isCurrentlyAvailable: false,
          availability: { dailyStartTime: null, dailyEndTime: null, pausedUntil: null },
        },
      ]),
    );

    await recomputeProductAvailability();

    const [ops] = mockProductBulkWrite.mock.calls[0];
    expect(ops).toEqual([
      {
        updateOne: {
          filter: { _id: "p3" },
          update: { $set: { isCurrentlyAvailable: true } },
        },
      },
    ]);
  });

  it("keeps a product unavailable while an active pause overrides an in-window time", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-01-01T02:30:00.000Z")); // 08:00 IST, inside window

    mockProductFind.mockReturnValue(
      selectLean([
        {
          _id: "p4",
          isCurrentlyAvailable: true,
          availability: {
            dailyStartTime: "06:00",
            dailyEndTime: "10:00",
            pausedUntil: new Date("2026-01-02T00:00:00.000Z"), // still in the future
          },
        },
      ]),
    );

    await recomputeProductAvailability();

    const [ops] = mockProductBulkWrite.mock.calls[0];
    expect(ops).toEqual([
      {
        updateOne: {
          filter: { _id: "p4" },
          update: { $set: { isCurrentlyAvailable: false } },
        },
      },
    ]);
  });
});
