import dotenv from "dotenv";
import connectDB from "../app/dbConfig/dbConfig.js";
import CityBillingConfig from "../app/models/cityBillingConfig.js";
import Setting from "../app/models/setting.js";

dotenv.config();

/**
 * City-wise billing migration.
 *
 * Intentionally minimal:
 *  - Existing global Setting stays authoritative for every city that has
 *    no explicit CityBillingConfig row. Nothing about historical orders,
 *    settlements, payouts or the global Setting changes.
 *  - We do NOT auto-seed a CityBillingConfig for every Indian city — that
 *    would silently override checkout in cities the admin never touched.
 *  - This script only ensures the collection exists (creating its unique
 *    index on cityKey) and logs the current global defaults so operators
 *    can see what fallback checkout will use before they configure
 *    per-city overrides.
 *
 * Historical orders remain immutable regardless: their pricingSnapshot /
 * paymentBreakdown were frozen at order-placement time.
 */
async function run() {
  await connectDB();

  await CityBillingConfig.init(); // ensure indexes

  const globalSetting = await Setting.findOne({}).lean();
  if (!globalSetting) {
    console.log("[city-billing-migration] No Setting document exists yet. Nothing to do.");
    return;
  }

  const cityConfigCount = await CityBillingConfig.countDocuments({});
  console.log("[city-billing-migration] Ready.");
  console.log(`  Existing CityBillingConfig rows: ${cityConfigCount}`);
  console.log("  Global fallback (Setting) — used when no city config exists:");
  console.log({
    deliveryPricingMode: globalSetting.deliveryPricingMode,
    customerBaseDeliveryFee: globalSetting.customerBaseDeliveryFee,
    baseDistanceCapacityKm: globalSetting.baseDistanceCapacityKm,
    incrementalKmSurcharge: globalSetting.incrementalKmSurcharge,
    weatherSurcharge: globalSetting.weatherSurcharge,
    oddHourSurcharge: globalSetting.oddHourSurcharge,
  });

  process.exit(0);
}

run().catch((err) => {
  console.error("[city-billing-migration] Failed", err);
  process.exit(1);
});
