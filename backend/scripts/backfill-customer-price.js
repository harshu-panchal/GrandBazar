// One-off backfill for the deduct-to-add-on commission model cutover: fills
// in customerPrice/customerSalePrice (and per-variant equivalents) on every
// existing product, computed under the NEW add-on formula. Run this once,
// after the pricingService.js formula change (Phase 2) has been deployed
// but BEFORE the customer-facing query/filter/sort (Phase 5) or
// customer-facing frontend (Phase 6) changes go live — those read
// customerPrice as if it's fully populated. See
// C:\Users\harsh\.claude\plans\iridescent-dazzling-falcon.md, Phase 7.
//
// Usage: node scripts/backfill-customer-price.js
import dotenv from "dotenv";
import connectDB from "../app/dbConfig/dbConfig.js";
import Product from "../app/models/product.js";
import { recalcProductsMatching } from "../app/queues/pricingQueueProcessors.js";

dotenv.config();

async function backfill() {
  await connectDB();

  const totalProducts = await Product.countDocuments({});
  console.log(`[backfill-customer-price] starting — ${totalProducts} total products`);

  const updated = await recalcProductsMatching(
    {},
    {
      onBatch: (count) => console.log(`[backfill-customer-price] progress: ${count}/${totalProducts}`),
    },
  );

  const remainingNull = await Product.countDocuments({ status: "active", customerPrice: null });
  console.log(`[backfill-customer-price] done — recomputed ${updated} products`);
  console.log(
    `[backfill-customer-price] verification: ${remainingNull} active products still have customerPrice: null` +
      (remainingNull > 0
        ? " — investigate before shipping Phase 5/6 (query/filter/sort, customer-facing frontend)"
        : " — safe to proceed to Phase 5/6"),
  );

  process.exit(remainingNull > 0 ? 1 : 0);
}

backfill().catch((error) => {
  console.error("[backfill-customer-price] failed:", error);
  process.exit(1);
});
