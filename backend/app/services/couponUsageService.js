import mongoose from "mongoose";
import Coupon from "../models/coupon.js";
import CouponRedemption from "../modules/rewards/models/couponRedemption.model.js";
import { restoreGrantForCoupon } from "../modules/rewards/services/couponService.js";
import logger from "./logger.js";

function httpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/**
 * Claims one use of a coupon inside the caller's order-placement transaction.
 *
 * applySingleCoupon() only pre-validates against a plain read of usedCount, so
 * N concurrent checkouts can all pass it while one use is left. The guarded
 * increment below is the real gate: it only matches while usedCount is still
 * under usageLimit, and because it runs in the same transaction as the order
 * write, a rejected claim rolls the whole order back (stock, cart and all).
 *
 * The per-user cap is enforced by numbering each redemption (useIndex) under a
 * unique (couponId, customerId, useIndex) index — two concurrent orders from
 * the same customer compute the same next number and one of them fails.
 */
export async function consumeCouponUsageAtomic({
  couponId,
  customerId,
  order,
  couponCode = null,
  discountAmount = 0,
  session,
}) {
  const coupon = await Coupon.findOneAndUpdate(
    {
      _id: couponId,
      isActive: true,
      $expr: {
        $or: [
          { $lte: [{ $ifNull: ["$usageLimit", 0] }, 0] },
          { $lt: [{ $ifNull: ["$usedCount", 0] }, "$usageLimit"] },
        ],
      },
    },
    { $inc: { usedCount: 1 } },
    { returnDocument: "after", session },
  ).select("perUserLimit usageLimit usedCount isActive");

  if (!coupon) {
    // Bug #279 — user-friendly message when coupon is exhausted due to race condition
    throw httpError("This coupon is no longer available. Please try another coupon.");
  }

  // Bug #278 — auto-deactivate coupon when usage limit is reached
  if (
    coupon.usageLimit > 0 &&
    coupon.usedCount >= coupon.usageLimit &&
    coupon.isActive
  ) {
    const deactivateOpts = session ? { session } : {};
    await Coupon.updateOne(
      { _id: couponId },
      { $set: { isActive: false } },
      deactivateOpts,
    ).catch((err) => {
      // Non-fatal — log and continue; the coupon is already exhausted by the $expr guard above
      console.warn("[consumeCouponUsageAtomic] auto-deactivate failed:", err.message);
    });
  }

  const perUserLimit = Number(coupon.perUserLimit) > 0 ? Number(coupon.perUserLimit) : 1;
  const priorUses = await CouponRedemption.countDocuments({ couponId, customerId }).session(session);
  if (priorUses >= perUserLimit) {
    throw httpError(
      perUserLimit === 1
        ? "You have already used this coupon"
        : "You have reached the usage limit for this coupon",
    );
  }

  try {
    await CouponRedemption.create(
      [
        {
          couponId,
          customerId,
          orderId: order?._id || null,
          orderPublicId: order?.orderId || null,
          couponCode: couponCode || null,
          discountAmount: Math.max(0, Number(discountAmount || 0)),
          useIndex: priorUses + 1,
        },
      ],
      { session },
    );
  } catch (error) {
    if (error?.code === 11000) {
      // Bug #279 — concurrent duplicate redemption; give back the use we just incremented
      await Coupon.updateOne(
        { _id: couponId, usedCount: { $gt: 0 } },
        { $inc: { usedCount: -1 } },
        session ? { session } : {},
      ).catch(() => {});
      throw httpError("This coupon is no longer available. Please try another coupon.");
    }
    throw error;
  }

  return coupon;
}

async function releaseWithinSession(order, session) {
  const opts = session ? { session } : {};
  // Deleting the redemption is the idempotency guard: only the caller that
  // actually removes it gives the use back, so double-cancels can't double-refund.
  const redemption = await CouponRedemption.findOneAndDelete(
    { orderId: order._id, couponId: order.couponId },
    opts,
  );
  if (!redemption) return false;

  await Coupon.updateOne(
    { _id: order.couponId, usedCount: { $gt: 0 } },
    { $inc: { usedCount: -1 } },
    opts,
  );
  await restoreGrantForCoupon({
    customerId: redemption.customerId,
    couponId: order.couponId,
    session,
  });
  return true;
}

/**
 * Gives a coupon use back when the order that consumed it is cancelled or
 * expires unpaid. Safe to call repeatedly and for orders with no coupon.
 * Pass the caller's session to join an existing transaction; otherwise the
 * delete + decrement run in their own so they can't be left half-applied.
 */
export async function releaseCouponUsageForOrder(order, { session = null } = {}) {
  if (!order?._id || !order.couponId) return false;

  // Joined to the caller's transaction: let errors propagate, since a failed
  // write there has already aborted that transaction.
  if (session) return releaseWithinSession(order, session);

  try {
    const ownSession = await mongoose.startSession();
    try {
      let released = false;
      await ownSession.withTransaction(async () => {
        released = await releaseWithinSession(order, ownSession);
      });
      return released;
    } finally {
      ownSession.endSession();
    }
  } catch (error) {
    // A failed release must never block the cancellation itself — the safe
    // failure direction is a coupon that stays counted as used.
    logger.error("[couponUsage] Failed to release coupon usage", {
      orderId: order.orderId,
      couponId: String(order.couponId),
      message: error.message,
    });
    return false;
  }
}

export default { consumeCouponUsageAtomic, releaseCouponUsageForOrder };
