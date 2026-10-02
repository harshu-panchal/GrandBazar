import { jest } from "@jest/globals";

// The preview controller runs the same delivery/rider math and the same
// extra-charge / weather rules the checkout engine uses, without touching
// products, sellers or the DB — so it is the cleanest surface for
// unit-testing city-billing charge composition end-to-end.

const mockResolve = jest.fn();
const mockAudit = jest.fn();
const mockInvalidate = jest.fn();
const mockCbFindOne = jest.fn();
const mockService = {
  listCityBillingConfigs: jest.fn(),
  getCityBillingConfigByKey: jest.fn(),
  upsertCityBillingConfig: jest.fn(),
  setCityBillingStatus: jest.fn(),
  deleteCityBillingConfig: jest.fn(),
  duplicateCityBillingConfig: jest.fn(),
  activateWeatherCharge: jest.fn(),
  deactivateWeatherCharge: jest.fn(),
};

jest.unstable_mockModule("../app/services/finance/cityBillingResolver.js", () => ({
  resolveCityBillingConfig: mockResolve,
  invalidateCityBillingCache: mockInvalidate,
}));
jest.unstable_mockModule("../app/services/finance/cityBillingService.js", () => mockService);
jest.unstable_mockModule("../app/services/auditTrailService.js", () => ({
  recordAuditLog: mockAudit,
}));
jest.unstable_mockModule("../app/models/cityBillingConfig.js", () => ({
  default: { findOne: mockCbFindOne },
}));
jest.unstable_mockModule("../app/services/cityCommissionService.js", () => ({
  normalizeCityKey: (raw = "") => String(raw || "").trim().toLowerCase(),
}));
jest.unstable_mockModule("../app/utils/helper.js", () => ({
  default: (res, status, message, data) => {
    res.status(status);
    return res.json({ success: status < 400, message, result: data });
  },
}));

const { previewCityBillingController } = await import(
  "../app/controller/admin/cityBillingController.js"
);

function makeRes() {
  return {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

const BASE_SETTINGS = {
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
  weatherSurcharge: { enabled: false, amount: 0 },
  oddHourSurcharge: { enabled: false, amount: 0, windowStart: "22:00", windowEnd: "06:00" },
};

beforeEach(() => {
  jest.clearAllMocks();
});

async function callPreview(body, cityBilling) {
  mockResolve.mockResolvedValueOnce(cityBilling);
  const res = makeRes();
  await previewCityBillingController({ body, user: { id: "admin1" } }, res);
  return res;
}

describe("Delivery pricing modes", () => {
  test("fixed_price mode charges the fixed fee regardless of distance", async () => {
    const res = await callPreview(
      { cityKey: "indore", subtotal: 500, distanceKm: 10, paymentMethod: "ONLINE" },
      {
        deliverySettings: {
          ...BASE_SETTINGS,
          deliveryPricingMode: "fixed_price",
          fixedDeliveryFee: 25,
        },
        extraCharges: [],
        meta: { source: "CITY", cityKey: "indore", cityName: "Indore" },
      },
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.result.breakdown.deliveryFee).toBe(25);
  });

  test("distance-based: within base distance charges base only", async () => {
    const res = await callPreview(
      { cityKey: "indore", subtotal: 500, distanceKm: 0.3 },
      {
        deliverySettings: {
          ...BASE_SETTINGS,
          customerBaseDeliveryFee: 30,
          baseDistanceCapacityKm: 0.5,
          incrementalKmSurcharge: 10,
        },
        extraCharges: [],
        meta: { source: "CITY", cityKey: "indore", cityName: "Indore" },
      },
    );
    expect(res.body.result.breakdown.deliveryFee).toBe(30);
  });

  test("distance-based: beyond base distance adds per-km surcharge", async () => {
    // 2.5 km, base 0.5 km, per km ₹10 → 30 + ceil(2)*10 = 50
    const res = await callPreview(
      { cityKey: "indore", subtotal: 500, distanceKm: 2.5 },
      {
        deliverySettings: {
          ...BASE_SETTINGS,
          customerBaseDeliveryFee: 30,
          baseDistanceCapacityKm: 0.5,
          incrementalKmSurcharge: 10,
        },
        extraCharges: [],
        meta: { source: "CITY", cityKey: "indore", cityName: "Indore" },
      },
    );
    expect(res.body.result.breakdown.deliveryFee).toBe(50);
  });

  test("free-delivery threshold zeros the delivery fee", async () => {
    const res = await callPreview(
      { cityKey: "indore", subtotal: 1000, distanceKm: 5 },
      {
        deliverySettings: { ...BASE_SETTINGS, freeDeliveryThreshold: 999 },
        extraCharges: [],
        meta: { source: "CITY", cityKey: "indore", cityName: "Indore" },
      },
    );
    expect(res.body.result.breakdown.deliveryFee).toBe(0);
    expect(res.body.result.breakdown.freeDeliveryApplied).toBe(true);
  });
});

describe("Weather surcharge", () => {
  test("adds weather amount when enabled on the resolved city", async () => {
    const res = await callPreview(
      { cityKey: "indore", subtotal: 500, distanceKm: 0 },
      {
        deliverySettings: {
          ...BASE_SETTINGS,
          weatherSurcharge: { enabled: true, amount: 20, revenueSplit: { platform: 100, seller: 0 } },
        },
        extraCharges: [],
        meta: { source: "CITY", cityKey: "indore", cityName: "Indore" },
      },
    );
    expect(res.body.result.breakdown.weatherSurcharge).toBe(20);
  });

  test("adds zero weather when disabled", async () => {
    const res = await callPreview(
      { cityKey: "delhi", subtotal: 500, distanceKm: 0 },
      {
        deliverySettings: {
          ...BASE_SETTINGS,
          weatherSurcharge: { enabled: false, amount: 20 },
        },
        extraCharges: [],
        meta: { source: "CITY", cityKey: "delhi", cityName: "Delhi" },
      },
    );
    expect(res.body.result.breakdown.weatherSurcharge).toBe(0);
  });
});

describe("Extra charges — applicability rules", () => {
  test("flat charge with revenueType=platform is added", async () => {
    const res = await callPreview(
      { cityKey: "indore", subtotal: 500, distanceKm: 0 },
      {
        deliverySettings: { ...BASE_SETTINGS, customerBaseDeliveryFee: 0 },
        extraCharges: [
          { name: "Handling", type: "flat", amount: 5, enabled: true, appliesTo: "all_orders", revenueType: "platform" },
        ],
        meta: { source: "CITY", cityKey: "indore", cityName: "Indore" },
      },
    );
    expect(res.body.result.breakdown.extraCharges).toHaveLength(1);
    expect(res.body.result.breakdown.extraChargesTotal).toBe(5);
  });

  test("percentage charge computed against subtotal", async () => {
    const res = await callPreview(
      { cityKey: "indore", subtotal: 500, distanceKm: 0 },
      {
        deliverySettings: BASE_SETTINGS,
        extraCharges: [
          { name: "Peak", type: "percentage", amount: 5, enabled: true, appliesTo: "all_orders", revenueType: "platform" },
        ],
        meta: { source: "CITY", cityKey: "indore", cityName: "Indore" },
      },
    );
    expect(res.body.result.breakdown.extraChargesTotal).toBe(25); // 5% of 500
  });

  test("COD-only charge skipped for online orders", async () => {
    const res = await callPreview(
      { cityKey: "indore", subtotal: 500, distanceKm: 0, paymentMethod: "ONLINE" },
      {
        deliverySettings: BASE_SETTINGS,
        extraCharges: [
          { name: "COD Fee", type: "flat", amount: 20, enabled: true, appliesTo: "cod", revenueType: "platform" },
        ],
        meta: { source: "CITY", cityKey: "indore", cityName: "Indore" },
      },
    );
    expect(res.body.result.breakdown.extraCharges).toHaveLength(0);
    expect(res.body.result.breakdown.extraChargesTotal).toBe(0);
  });

  test("COD-only charge applied for COD orders", async () => {
    const res = await callPreview(
      { cityKey: "indore", subtotal: 500, distanceKm: 0, paymentMethod: "COD" },
      {
        deliverySettings: BASE_SETTINGS,
        extraCharges: [
          { name: "COD Fee", type: "flat", amount: 20, enabled: true, appliesTo: "cod", revenueType: "platform" },
        ],
        meta: { source: "CITY", cityKey: "indore", cityName: "Indore" },
      },
    );
    expect(res.body.result.breakdown.extraChargesTotal).toBe(20);
  });

  test("minimumOrderValue gates charge", async () => {
    const res = await callPreview(
      { cityKey: "indore", subtotal: 100, distanceKm: 0 },
      {
        deliverySettings: BASE_SETTINGS,
        extraCharges: [
          {
            name: "Small basket fee",
            type: "flat",
            amount: 10,
            enabled: true,
            appliesTo: "all_orders",
            minimumOrderValue: 200,
            revenueType: "platform",
          },
        ],
        meta: { source: "CITY", cityKey: "indore", cityName: "Indore" },
      },
    );
    // Charge only applies when subtotal >= min; here subtotal 100 < 200 → skip
    expect(res.body.result.breakdown.extraChargesTotal).toBe(0);
  });

  test("multiple extras sum together into grandTotal", async () => {
    const res = await callPreview(
      { cityKey: "indore", subtotal: 500, distanceKm: 0 },
      {
        deliverySettings: { ...BASE_SETTINGS, customerBaseDeliveryFee: 0 },
        extraCharges: [
          { name: "Handling", type: "flat", amount: 5, enabled: true, appliesTo: "all_orders", revenueType: "platform" },
          { name: "Night", type: "flat", amount: 20, enabled: true, appliesTo: "all_orders", revenueType: "platform" },
        ],
        meta: { source: "CITY", cityKey: "indore", cityName: "Indore" },
      },
    );
    expect(res.body.result.breakdown.extraChargesTotal).toBe(25);
    // subtotal 500 + delivery 30 (base 0? no BASE_SETTINGS overrides to 0) + extras 25
    expect(res.body.result.breakdown.grandTotal).toBe(525);
  });
});

describe("Grand total composition", () => {
  test("stacks subtotal + delivery + weather + extras exactly once", async () => {
    const res = await callPreview(
      { cityKey: "indore", subtotal: 500, distanceKm: 0, paymentMethod: "ONLINE" },
      {
        deliverySettings: {
          ...BASE_SETTINGS,
          customerBaseDeliveryFee: 30,
          baseDistanceCapacityKm: 5,
          weatherSurcharge: { enabled: true, amount: 20 },
        },
        extraCharges: [
          { name: "Handling", type: "flat", amount: 5, enabled: true, appliesTo: "all_orders", revenueType: "platform" },
        ],
        meta: { source: "CITY", cityKey: "indore", cityName: "Indore" },
      },
    );
    // 500 + 30 + 20 + 5 = 555
    expect(res.body.result.breakdown.grandTotal).toBe(555);
  });
});

describe("Billing source reporting", () => {
  test("returns GLOBAL when resolver reports no city config", async () => {
    const res = await callPreview(
      { cityKey: "unknown", subtotal: 500, distanceKm: 0 },
      {
        deliverySettings: BASE_SETTINGS,
        extraCharges: [],
        meta: { source: "GLOBAL", cityKey: "", cityName: "" },
      },
    );
    expect(res.body.result.billing.source).toBe("GLOBAL");
    expect(res.body.result.breakdown.extraCharges).toHaveLength(0);
  });
});
