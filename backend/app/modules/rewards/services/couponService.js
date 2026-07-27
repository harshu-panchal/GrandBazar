import Coupon from "../../../models/coupon.js";
import CouponRedemption from "../models/couponRedemption.model.js";
import RewardGrant from "../models/rewardGrant.model.js";
import { GRANT_STATUS } from "../reward.constants.js";

export async function listCustomerCoupons(customerId) {
  const now = new Date();

  const [globalCoupons, voucherGrants, redemptions] = await Promise.all([
    Coupon.find({
      isActive: true,
      validFrom: { $lte: now },
      validTill: { $gte: now },
      sellerId: null,
      $or: [
        { "metadata.issuedToCustomerId": { $exists: false } },
        { "metadata.issuedToCustomerId": null },
        { "metadata.issuedToCustomerId": "" },
        { "metadata.issuedToCustomerId": String(customerId) },
      ],
    })
      .sort({ createdAt: -1 })
      .lean(),
    RewardGrant.find({
      customerId,
      campaignType: "coupon",
      status: GRANT_STATUS.ACTIVE,
      linkedCouponId: { $ne: null },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    })
      .populate("linkedCouponId")
      .populate("campaignId", "name")
      .sort({ createdAt: -1 })
      .lean(),
    CouponRedemption.find({ customerId }).select("couponId").lean(),
  ]);

  const usedCounts = redemptions.reduce((acc, r) => {
    const key = String(r.couponId);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const byId = new Map();

  for (const coupon of globalCoupons) {
    const issuedTo = coupon.metadata?.issuedToCustomerId;
    if (issuedTo && String(issuedTo) !== String(customerId)) continue;
    const id = String(coupon._id);
    const usage = usedCounts[id] || 0;
    byId.set(id, {
      ...coupon,
      source: issuedTo ? "digital_voucher" : "platform",
      userUsageCount: usage,
      canUse: !coupon.perUserLimit || usage < coupon.perUserLimit,
    });
  }

  for (const grant of voucherGrants) {
    const coupon = grant.linkedCouponId;
    if (!coupon || !coupon.isActive) continue;
    const id = String(coupon._id || coupon);
    if (byId.has(id)) {
      byId.set(id, {
        ...byId.get(id),
        source: "digital_voucher",
        grantId: grant._id,
        grantStatus: grant.status,
        campaignName: grant.campaignId?.name,
        expiresAt: grant.expiresAt,
      });
      continue;
    }
    const usage = usedCounts[id] || 0;
    byId.set(id, {
      ...(typeof coupon === "object" ? coupon : { _id: coupon }),
      source: "digital_voucher",
      grantId: grant._id,
      grantStatus: grant.status,
      campaignName: grant.campaignId?.name,
      expiresAt: grant.expiresAt,
      userUsageCount: usage,
      canUse: !coupon.perUserLimit || usage < coupon.perUserLimit,
    });
  }

  return [...byId.values()];
}

export async function markGrantRedeemedForCoupon({ customerId, couponId }) {
  if (!customerId || !couponId) return null;
  const grant = await RewardGrant.findOne({
    customerId,
    linkedCouponId: couponId,
    status: GRANT_STATUS.ACTIVE,
  });
  if (!grant) return null;
  grant.status = GRANT_STATUS.REDEEMED;
  grant.redeemedAt = new Date();
  await grant.save();
  return grant;
}

export default {
  listCustomerCoupons,
  markGrantRedeemedForCoupon,
};
