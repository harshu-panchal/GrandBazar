import { jest } from "@jest/globals";

const mockFindOne = jest.fn();
const mockGetOrCreateFinanceSettings = jest.fn();
const mockCacheGetOrSet = jest.fn((_key, loader) => loader());
const mockCacheBuildKey = jest.fn((s, e, id) => `${s}:${e}:${id}`);
const mockInvalidate = jest.fn();

jest.unstable_mockModule("../app/models/cityBillingConfig.js", () => ({
  default: { findOne: mockFindOne },
}));
jest.unstable_mockModule("../app/services/cityCommissionService.js", () => ({
  normalizeCityKey: (raw = "") =>
    String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-"),
}));
jest.unstable_mockModule("../app/services/finance/financeSettingsService.js", () => ({
  getOrCreateFinanceSettings: mockGetOrCreateFinanceSettings,
}));
jest.unstable_mockModule("../app/services/cacheService.js", () => ({
  buildKey: mockCacheBuildKey,
  getOrSet: mockCacheGetOrSet,
  invalidate: mockInvalidate,
}));
jest.unstable_mockModule("../app/services/logger.js", () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
}));

const {
  resolveCityBillingConfig,
  resolveCustomerCityKey,
  mergeDeliverySettings,
  loadCityBillingConfig,
} = await import("../app/services/finance/cityBillingResolver.js");

const GLOBAL = {
  deliveryPricingMode: "distance_based",
  pricingMode: "distance_based",
  customerBaseDeliveryFee: 30,
  baseDeliveryCharge: 30,
  baseDistanceCapacityKm: 0.5,
  incrementalKmSurcharge: 10,
  riderBasePayout: 30,
  deliveryPartnerRatePerKm: 5,
  fixedDeliveryFee: 30,
  freeDeliveryThreshold: 0,
  weatherSurcharge: { enabled: false, amount: 0, revenueSplit: { platform: 100, seller: 0 } },
  oddHourSurcharge: { enabled: false, amount: 0, windowStart: "22:00", windowEnd: "06:00", revenueSplit: { platform: 100, seller: 0 } },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetOrCreateFinanceSettings.mockResolvedValue({ ...GLOBAL });
  mockFindOne.mockReturnValue({ lean: async () => null });
});

describe("resolveCustomerCityKey precedence", () => {
  test("prefers explicit cityKey over address.city and storeCity", () => {
    expect(
      resolveCustomerCityKey({
        cityKey: "Indore",
        address: { city: "Delhi" },
        storeCity: "Mumbai",
      }),
    ).toBe("indore");
  });

  test("falls back to address.city when no explicit key", () => {
    expect(resolveCustomerCityKey({ address: { city: "Mumbai" }, storeCity: "Pune" })).toBe("mumbai");
  });

  test("falls back to storeCity as legacy last resort", () => {
    expect(resolveCustomerCityKey({ storeCity: "Pune" })).toBe("pune");
  });

  test("returns empty string when nothing resolves", () => {
    expect(resolveCustomerCityKey({})).toBe("");
  });
});

describe("mergeDeliverySettings", () => {
  test("returns global unchanged when city config missing", () => {
    const out = mergeDeliverySettings(GLOBAL, null);
    expect(out).toEqual(expect.objectContaining({ customerBaseDeliveryFee: 30, incrementalKmSurcharge: 10 }));
    expect(out.weatherSurcharge).toEqual(GLOBAL.weatherSurcharge);
  });

  test("returns global unchanged when city deliveryCharges disabled", () => {
    const out = mergeDeliverySettings(GLOBAL, {
      deliveryCharges: { enabled: false, baseCharge: 999 },
    });
    expect(out.customerBaseDeliveryFee).toBe(30);
  });

  test("overrides delivery numbers from city config", () => {
    const out = mergeDeliverySettings(GLOBAL, {
      deliveryCharges: {
        enabled: true,
        pricingMode: "distance_based",
        baseCharge: 25,
        baseDistanceKm: 1,
        additionalChargePerKm: 8,
        riderBasePayout: 20,
        riderRatePerKm: 4,
        fixedCharge: 22,
        freeDeliveryThreshold: 500,
      },
    });
    expect(out.customerBaseDeliveryFee).toBe(25);
    expect(out.baseDistanceCapacityKm).toBe(1);
    expect(out.incrementalKmSurcharge).toBe(8);
    expect(out.riderBasePayout).toBe(20);
    expect(out.deliveryPartnerRatePerKm).toBe(4);
    expect(out.fixedDeliveryFee).toBe(22);
    expect(out.freeDeliveryThreshold).toBe(500);
  });

  test("overrides weather with city block when weather.enabled=true", () => {
    const out = mergeDeliverySettings(GLOBAL, {
      deliveryCharges: { enabled: true, baseCharge: 30 },
      weatherCharges: {
        enabled: true,
        active: true,
        amount: 25,
        revenueSplit: { platform: 60, seller: 40 },
      },
    });
    expect(out.weatherSurcharge.enabled).toBe(true);
    expect(out.weatherSurcharge.amount).toBe(25);
    expect(out.weatherSurcharge.revenueSplit).toEqual({ platform: 60, seller: 40 });
  });

  test("weather stays inactive even when enabled=true if active=false", () => {
    const out = mergeDeliverySettings(GLOBAL, {
      deliveryCharges: { enabled: true, baseCharge: 30 },
      weatherCharges: { enabled: true, active: false, amount: 25 },
    });
    expect(out.weatherSurcharge.enabled).toBe(false);
  });

  test("weather falls back to global when city weather.enabled=false", () => {
    const globalWithWeather = {
      ...GLOBAL,
      weatherSurcharge: { enabled: true, amount: 10, revenueSplit: { platform: 100, seller: 0 } },
    };
    const out = mergeDeliverySettings(globalWithWeather, {
      deliveryCharges: { enabled: true, baseCharge: 30 },
      weatherCharges: { enabled: false, active: false, amount: 0 },
    });
    expect(out.weatherSurcharge).toEqual(globalWithWeather.weatherSurcharge);
  });
});

describe("resolveCityBillingConfig", () => {
  test("returns GLOBAL source when no city config exists", async () => {
    mockFindOne.mockReturnValueOnce({ lean: async () => null });
    const out = await resolveCityBillingConfig({ address: { city: "Indore" } });
    expect(out.meta.source).toBe("GLOBAL");
    expect(out.extraCharges).toEqual([]);
    expect(out.deliverySettings.customerBaseDeliveryFee).toBe(30);
  });

  test("returns CITY source and merged settings when config exists", async () => {
    mockFindOne.mockReturnValueOnce({
      lean: async () => ({
        cityKey: "indore",
        cityName: "Indore",
        isActive: true,
        deliveryCharges: { enabled: true, pricingMode: "fixed_price", fixedCharge: 20 },
        weatherCharges: { enabled: false },
        extraCharges: [{ name: "Night", enabled: true, amount: 10, type: "flat" }],
      }),
    });
    const out = await resolveCityBillingConfig({ address: { city: "Indore" } });
    expect(out.meta.source).toBe("CITY");
    expect(out.meta.cityKey).toBe("indore");
    expect(out.deliverySettings.fixedDeliveryFee).toBe(20);
    expect(out.extraCharges).toHaveLength(1);
  });

  test("treats inactive city config as absent (falls back to global)", async () => {
    mockFindOne.mockReturnValueOnce({
      lean: async () => ({
        cityKey: "indore",
        isActive: false,
        deliveryCharges: { enabled: true, fixedCharge: 20 },
      }),
    });
    const out = await resolveCityBillingConfig({ address: { city: "Indore" } });
    expect(out.meta.source).toBe("GLOBAL");
  });

  test("filters out disabled extra charges", async () => {
    mockFindOne.mockReturnValueOnce({
      lean: async () => ({
        cityKey: "indore",
        isActive: true,
        deliveryCharges: { enabled: true, baseCharge: 30 },
        extraCharges: [
          { name: "Night", enabled: true, amount: 10, type: "flat" },
          { name: "Peak", enabled: false, amount: 20, type: "flat" },
        ],
      }),
    });
    const out = await resolveCityBillingConfig({ address: { city: "Indore" } });
    expect(out.extraCharges.map((c) => c.name)).toEqual(["Night"]);
  });

  test("does not query when no city key resolves", async () => {
    const out = await resolveCityBillingConfig({});
    expect(out.meta.source).toBe("GLOBAL");
    expect(mockFindOne).not.toHaveBeenCalled();
  });
});

describe("loadCityBillingConfig", () => {
  test("returns null for empty key without querying", async () => {
    const out = await loadCityBillingConfig("");
    expect(out).toBeNull();
    expect(mockFindOne).not.toHaveBeenCalled();
  });

  test("bypasses cache when a session is passed", async () => {
    const sessionQuery = { session: jest.fn().mockReturnThis(), lean: async () => ({ cityKey: "indore" }) };
    mockFindOne.mockReturnValueOnce(sessionQuery);
    const out = await loadCityBillingConfig("indore", { session: {} });
    expect(sessionQuery.session).toHaveBeenCalled();
    expect(out).toEqual({ cityKey: "indore" });
    expect(mockCacheGetOrSet).not.toHaveBeenCalled();
  });
});
