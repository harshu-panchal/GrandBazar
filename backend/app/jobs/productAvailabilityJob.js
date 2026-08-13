import dotenv from "dotenv";
import Product from "../models/product.js";
import {
  currentMinutesInZone,
  parseTimeToMinutes,
  isMinutesWithinWindow,
} from "../utils/scheduleDateUtils.js";
import { enqueueProductIndex } from "../services/searchSyncService.js";
import { invalidate, buildKey } from "../services/cacheService.js";
import logger from "../services/logger.js";

dotenv.config();

const DEFAULT_INTERVAL_MS = 60000;
const PRODUCT_AVAILABILITY_INTERVAL_MS = parseInt(
  process.env.PRODUCT_AVAILABILITY_INTERVAL_MS || `${DEFAULT_INTERVAL_MS}`,
  10,
);

/**
 * Recomputes `isCurrentlyAvailable` for every product that has a schedule
 * configured (recurring daily window and/or a temporary pause). Products
 * with no schedule are never touched, so this stays cheap regardless of
 * total catalog size.
 */
const recomputeProductAvailability = async () => {
  const startTime = Date.now();

  try {
    const now = new Date();
    const candidates = await Product.find({
      $or: [
        { "availability.dailyStartTime": { $ne: null } },
        { "availability.pausedUntil": { $ne: null } },
      ],
    })
      .select("_id availability isCurrentlyAvailable")
      .lean();

    if (candidates.length === 0) {
      return;
    }

    const nowMinutes = currentMinutesInZone(now);
    const bulkOps = [];
    const changedIds = [];
    const expiredPauseIds = [];

    for (const product of candidates) {
      const availability = product.availability || {};
      const pausedUntil = availability.pausedUntil ? new Date(availability.pausedUntil) : null;
      const pauseActive = Boolean(pausedUntil && pausedUntil.getTime() > now.getTime());
      const pauseExpired = Boolean(pausedUntil && !pauseActive);

      const withinDailyWindow =
        availability.dailyStartTime && availability.dailyEndTime
          ? isMinutesWithinWindow(
              nowMinutes,
              parseTimeToMinutes(availability.dailyStartTime),
              parseTimeToMinutes(availability.dailyEndTime),
            )
          : false;

      const shouldBeAvailable = !pauseActive && !withinDailyWindow;
      const set = {};
      if (shouldBeAvailable !== (product.isCurrentlyAvailable !== false)) {
        set.isCurrentlyAvailable = shouldBeAvailable;
      }
      if (pauseExpired) {
        set["availability.pausedUntil"] = null;
        expiredPauseIds.push(product._id);
      }

      if (Object.keys(set).length > 0) {
        bulkOps.push({ updateOne: { filter: { _id: product._id }, update: { $set: set } } });
        if (Object.prototype.hasOwnProperty.call(set, "isCurrentlyAvailable")) {
          changedIds.push(product._id.toString());
        }
      }
    }

    if (bulkOps.length > 0) {
      await Product.bulkWrite(bulkOps, { ordered: false });
    }

    if (changedIds.length > 0) {
      for (const id of changedIds) {
        try {
          await enqueueProductIndex(id);
          await invalidate(`cache:catalog:product:${id}`);
        } catch (err) {
          logger.error("Per-product cache invalidation failed", {
            jobName: "productAvailabilityJob",
            productId: id,
            error: err.message,
          });
        }
      }
      try {
        await invalidate(buildKey("catalog", "productList", "*"));
        await invalidate("cache:offersections:public:*");
      } catch {
        // non-fatal cache invalidation
      }
    }

    const duration = Date.now() - startTime;
    if (bulkOps.length > 0) {
      logger.info("Product availability job completed", {
        jobName: "productAvailabilityJob",
        duration,
        candidates: candidates.length,
        changed: changedIds.length,
        pausesExpired: expiredPauseIds.length,
      });
    }
  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error("Product availability job failed", {
      jobName: "productAvailabilityJob",
      duration,
      error: err.message,
      stack: err.stack,
    });
  }
};

export const getProductAvailabilityJobHandler = () => recomputeProductAvailability;

export const getProductAvailabilityJobInterval = () => PRODUCT_AVAILABILITY_INTERVAL_MS;

export default recomputeProductAvailability;
