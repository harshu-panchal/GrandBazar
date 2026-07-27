import mongoose from "mongoose";
import { CAMPAIGN_TYPE, GRANT_STATUS, FUNDING_SOURCE } from "../reward.constants.js";

const rewardGrantSchema = new mongoose.Schema(
  {
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RewardCampaign",
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    orderPublicId: { type: String, default: null },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      default: null,
    },
    campaignType: {
      type: String,
      enum: Object.values(CAMPAIGN_TYPE),
      required: true,
    },
    rewardSubtype: { type: String, required: true },
    amount: { type: Number, default: 0 },
    /** Remaining wallet credit not yet spent (cashback/reward grants). */
    remainingAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: Object.values(GRANT_STATUS),
      default: GRANT_STATUS.CREATED,
      index: true,
    },
    fundedBy: {
      type: String,
      enum: Object.values(FUNDING_SOURCE),
      default: FUNDING_SOURCE.PLATFORM,
    },
    expiresAt: { type: Date, default: null, index: true },
    activatedAt: { type: Date, default: null },
    redeemedAt: { type: Date, default: null },
    reversedAt: { type: Date, default: null },
    linkedCouponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      default: null,
    },
    referralId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Referral",
      default: null,
    },
    meta: { type: Object, default: {} },
  },
  { timestamps: true },
);

rewardGrantSchema.index({ customerId: 1, status: 1, expiresAt: 1 });
rewardGrantSchema.index({ orderId: 1, campaignId: 1 });

export default mongoose.model("RewardGrant", rewardGrantSchema);
