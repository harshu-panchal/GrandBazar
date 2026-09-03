import { customerPriceRecalcQueue, JOB_NAMES } from "./pricingQueues.js";
import { isRedisEnabled } from "../config/redis.js";
import logger from "../services/logger.js";
import { incrementCounter, recordHistogram } from "../services/metrics.js";
import Product from "../models/product.js";
import Category from "../models/category.js";
import Store from "../models/store.js";
import CityCommission from "../models/cityCommission.js";
import { normalizeCityKey } from "../services/cityCommissionService.js";
import { computeCustomerPriceForProduct } from "../services/finance/customerPriceService.js";

const PRODUCT_SELECT =
  "_id name price salePrice variants applyCommission adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule subcategoryId sellerId";
const STORE_SELECT =
  "applyCommission adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule city";
const CITY_COMMISSION_SELECT =
  "cityKey cityName enabled applyCommission adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule";
const CATEGORY_SELECT =
  "_id name type applyCommission adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule";

const BATCH_SIZE = 500;

async function fillMissing(cache, ids, fetcher) {
  const missing = ids.filter((id) => id && !cache.has(id));
  if (missing.length === 0) return;
  const docs = await fetcher(missing);
  for (const doc of docs) {
    cache.set(doc.key, doc.value);
  }
}

async function recalcCustomerPriceForBatch(products, { storeCache, cityCache, categoryCache }) {
  const sellerIds = Array.from(new Set(products.map((p) => String(p.sellerId || "")).filter(Boolean)));
  await fillMissing(storeCache, sellerIds, async (missingIds) => {
    const stores = await Store.find({ _id: { $in: missingIds } }).select(STORE_SELECT).lean();
    return stores.map((store) => ({ key: String(store._id), value: store }));
  });

  const cityKeys = Array.from(
    new Set(
      sellerIds
        .map((id) => normalizeCityKey(storeCache.get(id)?.city || ""))
        .filter(Boolean),
    ),
  );
  await fillMissing(cityCache, cityKeys, async (missingKeys) => {
    const docs = await CityCommission.find({ cityKey: { $in: missingKeys } })
      .select(CITY_COMMISSION_SELECT)
      .lean();
    return docs.map((doc) => ({ key: doc.cityKey, value: doc }));
  });

  const subcategoryIds = Array.from(
    new Set(products.map((p) => String(p.subcategoryId || "")).filter(Boolean)),
  );
  await fillMissing(categoryCache, subcategoryIds, async (missingIds) => {
    const docs = await Category.find({ _id: { $in: missingIds } }).select(CATEGORY_SELECT).lean();
    return docs.map((doc) => ({ key: String(doc._id), value: doc }));
  });

  const ops = [];
  for (const product of products) {
    const storeDoc = product.sellerId ? storeCache.get(String(product.sellerId)) || null : null;
    const cityKey = normalizeCityKey(storeDoc?.city || "");
    const cityCommission = cityKey ? cityCache.get(cityKey) || null : null;
    const categoryById = product.subcategoryId
      ? new Map([[String(product.subcategoryId), categoryCache.get(String(product.subcategoryId))]])
      : new Map();

    const { customerPrice, customerSalePrice, variantCustomerPrices } =
      await computeCustomerPriceForProduct(product, { categoryById, storeDoc, cityCommission });

    const set = {
      customerPrice,
      customerSalePrice,
      customerPriceComputedAt: new Date(),
    };
    (product.variants || []).forEach((variant, index) => {
      const key = variant.sku || variant.name;
      const computed = key ? variantCustomerPrices.get(key) : null;
      if (computed) {
        set[`variants.${index}.customerPrice`] = computed.customerPrice;
        set[`variants.${index}.customerSalePrice`] = computed.customerSalePrice;
      }
    });

    ops.push({ updateOne: { filter: { _id: product._id }, update: { $set: set } } });
  }

  if (ops.length > 0) {
    await Product.bulkWrite(ops, { ordered: false });
  }
}

// Exported so the one-off backfill script (scripts/backfill-customer-price.js)
// can reuse the exact same batched recompute logic across ALL products,
// instead of reimplementing it.
export async function recalcProductsMatching(filter, { onBatch = null } = {}) {
  const storeCache = new Map();
  const cityCache = new Map();
  const categoryCache = new Map();

  const cursor = Product.find(filter).select(PRODUCT_SELECT).lean().cursor({ batchSize: BATCH_SIZE });

  let batch = [];
  let total = 0;
  for await (const product of cursor) {
    batch.push(product);
    if (batch.length >= BATCH_SIZE) {
      await recalcCustomerPriceForBatch(batch, { storeCache, cityCache, categoryCache });
      total += batch.length;
      batch = [];
      if (onBatch) onBatch(total);
    }
  }
  if (batch.length > 0) {
    await recalcCustomerPriceForBatch(batch, { storeCache, cityCache, categoryCache });
    total += batch.length;
    if (onBatch) onBatch(total);
  }
  return total;
}

async function processRecalcByCategory({ categoryId }) {
  if (!categoryId) return;
  const count = await recalcProductsMatching({
    $or: [{ headerId: categoryId }, { categoryId }, { subcategoryId: categoryId }],
  });
  logger.info("[pricingQueue] customerPrice recalculated for category", { categoryId, count });
}

async function processRecalcBySeller({ sellerId }) {
  if (!sellerId) return;
  const count = await recalcProductsMatching({ sellerId });
  logger.info("[pricingQueue] customerPrice recalculated for seller", { sellerId, count });
}

async function processRecalcByCity({ cityKey }) {
  if (!cityKey) return;
  const stores = await Store.find({}).select("_id city").lean();
  const sellerIds = stores
    .filter((store) => normalizeCityKey(store.city || "") === cityKey)
    .map((store) => store._id);
  if (sellerIds.length === 0) return;
  const count = await recalcProductsMatching({ sellerId: { $in: sellerIds } });
  logger.info("[pricingQueue] customerPrice recalculated for city", { cityKey, count });
}

function registerRecalcProcessor(jobName, handler, queueLabel) {
  customerPriceRecalcQueue.process(jobName, async (job) => {
    const startTime = Date.now();
    try {
      await handler(job.data);
      recordHistogram("queue_job_duration_seconds", (Date.now() - startTime) / 1000, {
        queue: queueLabel,
      });
      incrementCounter("queue_jobs_total", { queue: queueLabel, status: "completed" });
    } catch (error) {
      incrementCounter("queue_jobs_total", { queue: queueLabel, status: "failed" });
      logger.error(`[pricingQueue] ${queueLabel} job failed`, {
        jobId: job.id,
        data: job.data,
        error: error.message,
        stack: error.stack,
      });
      // Never throw: a stale customerPrice is degraded catalog UX, not a
      // checkout-correctness bug (checkout always live-computes pricing),
      // so this shouldn't retry-storm the queue.
    }
  });
}

export function registerPricingQueueProcessors() {
  if (!isRedisEnabled()) {
    logger.info("Redis disabled, skipping pricing queue processor registration");
    return;
  }

  registerRecalcProcessor(JOB_NAMES.RECALC_BY_CATEGORY, processRecalcByCategory, "customer-price-recalc-category");
  registerRecalcProcessor(JOB_NAMES.RECALC_BY_SELLER, processRecalcBySeller, "customer-price-recalc-seller");
  registerRecalcProcessor(JOB_NAMES.RECALC_BY_CITY, processRecalcByCity, "customer-price-recalc-city");

  logger.info("Pricing queue processors registered", {
    queues: [JOB_NAMES.RECALC_BY_CATEGORY, JOB_NAMES.RECALC_BY_SELLER, JOB_NAMES.RECALC_BY_CITY],
  });
}

// Enqueue helpers — swallow errors so a recompute-trigger failure never
// blocks the admin write (category/store/city commission update) that
// triggered it. See searchSyncService.js's enqueueProductIndex for the same
// convention.
export async function enqueueRecalcByCategory(categoryId) {
  if (!categoryId) return;
  try {
    await customerPriceRecalcQueue.add(
      JOB_NAMES.RECALC_BY_CATEGORY,
      { categoryId: String(categoryId) },
      { jobId: `recalc-cat-${categoryId}-${Date.now()}`, removeOnComplete: true },
    );
  } catch (error) {
    logger.error("[pricingQueue] Failed to enqueue category recalc", {
      categoryId,
      error: error.message,
    });
  }
}

export async function enqueueRecalcBySeller(sellerId) {
  if (!sellerId) return;
  try {
    await customerPriceRecalcQueue.add(
      JOB_NAMES.RECALC_BY_SELLER,
      { sellerId: String(sellerId) },
      { jobId: `recalc-seller-${sellerId}-${Date.now()}`, removeOnComplete: true },
    );
  } catch (error) {
    logger.error("[pricingQueue] Failed to enqueue seller recalc", {
      sellerId,
      error: error.message,
    });
  }
}

export async function enqueueRecalcByCity(cityKey) {
  if (!cityKey) return;
  try {
    await customerPriceRecalcQueue.add(
      JOB_NAMES.RECALC_BY_CITY,
      { cityKey: String(cityKey) },
      { jobId: `recalc-city-${cityKey}-${Date.now()}`, removeOnComplete: true },
    );
  } catch (error) {
    logger.error("[pricingQueue] Failed to enqueue city recalc", {
      cityKey,
      error: error.message,
    });
  }
}
