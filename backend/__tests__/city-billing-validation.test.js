import {
  upsertCityBillingSchema,
  activateWeatherSchema,
  extraChargeSchema,
} from "../app/validation/cityBillingValidation.js";

const validBase = {
  cityKey: "indore",
  cityName: "Indore",
  state: "MP",
  country: "IN",
  isActive: true,
  deliveryCharges: {
    enabled: true,
    pricingMode: "distance_based",
    fixedCharge: 30,
    baseCharge: 30,
    baseDistanceKm: 0.5,
    additionalChargePerKm: 10,
    riderBasePayout: 30,
    riderRatePerKm: 5,
    freeDeliveryThreshold: 0,
    minimumOrderValue: 0,
    maximumDeliveryCharge: 0,
  },
  weatherCharges: {
    enabled: false,
    active: false,
    amount: 0,
    reason: "",
    revenueSplit: { platform: 100, seller: 0 },
  },
  extraCharges: [],
};

describe("upsertCityBillingSchema", () => {
  test("accepts a well-formed payload", () => {
    const { error } = upsertCityBillingSchema.validate(validBase);
    expect(error).toBeUndefined();
  });

  test("rejects an unknown pricingMode", () => {
    const { error } = upsertCityBillingSchema.validate({
      ...validBase,
      deliveryCharges: { ...validBase.deliveryCharges, pricingMode: "surge" },
    });
    expect(error).toBeDefined();
  });

  test("rejects negative delivery amounts", () => {
    const { error } = upsertCityBillingSchema.validate({
      ...validBase,
      deliveryCharges: { ...validBase.deliveryCharges, baseCharge: -1 },
    });
    expect(error).toBeDefined();
  });

  test("rejects weather revenue split that does not sum to 100", () => {
    const { error } = upsertCityBillingSchema.validate({
      ...validBase,
      weatherCharges: {
        ...validBase.weatherCharges,
        revenueSplit: { platform: 60, seller: 30 },
      },
    });
    expect(error).toBeDefined();
  });

  test("accepts a legitimate 60/40 weather split", () => {
    const { error } = upsertCityBillingSchema.validate({
      ...validBase,
      weatherCharges: {
        ...validBase.weatherCharges,
        revenueSplit: { platform: 60, seller: 40 },
      },
    });
    expect(error).toBeUndefined();
  });

  test("strips unknown top-level keys instead of persisting them", () => {
    const { value, error } = upsertCityBillingSchema.validate(
      { ...validBase, hackerBackdoor: true },
      { stripUnknown: true },
    );
    expect(error).toBeUndefined();
    expect(value.hackerBackdoor).toBeUndefined();
  });
});

describe("extraChargeSchema", () => {
  test("accepts a flat platform charge", () => {
    const { error } = extraChargeSchema.validate({
      name: "Handling",
      type: "flat",
      amount: 5,
      revenueType: "platform",
    });
    expect(error).toBeUndefined();
  });

  test("rejects percentage amount > 100", () => {
    const { error } = extraChargeSchema.validate({
      name: "Insane",
      type: "percentage",
      amount: 150,
      revenueType: "platform",
    });
    expect(error).toBeDefined();
  });

  test("rejects split whose parts do not sum to 100", () => {
    const { error } = extraChargeSchema.validate({
      name: "Bad split",
      type: "flat",
      amount: 10,
      revenueType: "split",
      platformPercentage: 50,
      sellerPercentage: 30,
      riderPercentage: 10,
    });
    expect(error).toBeDefined();
  });

  test("accepts split whose parts sum to 100", () => {
    const { error } = extraChargeSchema.validate({
      name: "OK split",
      type: "flat",
      amount: 10,
      revenueType: "split",
      platformPercentage: 50,
      sellerPercentage: 30,
      riderPercentage: 20,
    });
    expect(error).toBeUndefined();
  });

  test("rejects minimumOrderValue greater than maximumOrderValue", () => {
    const { error } = extraChargeSchema.validate({
      name: "Ranged",
      type: "flat",
      amount: 5,
      minimumOrderValue: 500,
      maximumOrderValue: 100,
    });
    expect(error).toBeDefined();
  });
});

describe("activateWeatherSchema", () => {
  test("requires amount", () => {
    const { error } = activateWeatherSchema.validate({ reason: "Heavy rain" });
    expect(error).toBeDefined();
  });

  test("accepts amount + reason without an explicit split", () => {
    const { error } = activateWeatherSchema.validate({ amount: 20, reason: "Heavy rain" });
    expect(error).toBeUndefined();
  });

  test("rejects a bad revenue split when supplied", () => {
    const { error } = activateWeatherSchema.validate({
      amount: 20,
      reason: "Heavy rain",
      revenueSplit: { platform: 70, seller: 40 },
    });
    expect(error).toBeDefined();
  });
});
