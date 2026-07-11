import mongoose from "mongoose";
import {
  CAMPAIGN_TYPE,
  CAMPAIGN_STATUS,
  FUNDING_SOURCE,
  REWARD_SUBTYPE,
  CREDIT_TIMING,
  CUSTOMER_ELIGIBILITY,
} from "../reward.constants.js";

const eligibilityRulesSchema = new mongoose.Schema(
  {
    customerType: {
      type: String,
      enum: Object.values(CUSTOMER_ELIGIBILITY),
      default: CUSTOMER_ELIGIBILITY.ALL,
    },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
    brandIds: [{ type: String, trim: true }],
    shopIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Store" }],
    cityIds: [{ type: String, trim: true }],
    minPurchase: { type: Number, default: 0 },
    maxRewardPerCustomer: { type: Number, default: null },
    maxRewardsPerDay: { type: Number, default: null },
    milestoneOrderCount: { type: Number, default: null },
    milestoneSpendAmount: { type: Number, default: null },
  },
  { _id: false },
);

const rewardConfigSchema = new mongoose.Schema(
  {
    rewardSubtype: {
      type: String,
      enum: Object.values(REWARD_SUBTYPE),
      required: true,
    },
    valueType: {
      type: String,
      enum: ["fixed", "percent"],
      default: "fixed",
    },
    value: { type: Number, default: 0 },
    maxRewardAmount: { type: Number, default: null },
    validityDays: { type: Number, default: 30 },
    creditTiming: {
      type: String,
      enum: Object.values(CREDIT_TIMING),
      default: CREDIT_TIMING.ON_DELIVERY,
    },
    delayedDays: { type: Number, default: 0 },
    linkedCouponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      default: null,
    },
  },
  { _id: false },
);

const rewardCampaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    campaignType: {
      type: String,
      enum: Object.values(CAMPAIGN_TYPE),
      required: true,
      index: true,
    },
    priority: { type: Number, default: 100, index: true },
    status: {
      type: String,
      enum: Object.values(CAMPAIGN_STATUS),
      default: CAMPAIGN_STATUS.DRAFT,
      index: true,
    },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    timezone: { type: String, default: "Asia/Kolkata" },
    createdBy: {
      role: { type: String, enum: ["admin", "seller"], default: "admin" },
      adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
      sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", default: null },
    },
    fundingSource: {
      type: String,
      enum: Object.values(FUNDING_SOURCE),
      default: FUNDING_SOURCE.PLATFORM,
    },
    sharedFunding: {
      platformPercent: { type: Number, default: 50, min: 0, max: 100 },
      sellerPercent: { type: Number, default: 50, min: 0, max: 100 },
    },
    budgetLimit: { type: Number, default: null },
    budgetUsed: { type: Number, default: 0 },
    dailyLimit: { type: Number, default: null },
    monthlyLimit: { type: Number, default: null },
    dailyUsed: { type: Number, default: 0 },
    monthlyUsed: { type: Number, default: 0 },
    rules: { type: eligibilityRulesSchema, default: () => ({}) },
    rewardConfig: { type: rewardConfigSchema, required: true },
    stats: {
      totalGrants: { type: Number, default: 0 },
      totalAmount: { type: Number, default: 0 },
    },
    meta: { type: Object, default: {} },
  },
  { timestamps: true },
);

rewardCampaignSchema.index({ status: 1, startAt: 1, endAt: 1 });
rewardCampaignSchema.index({ "createdBy.sellerId": 1, status: 1 });

export default mongoose.model("RewardCampaign", rewardCampaignSchema);
