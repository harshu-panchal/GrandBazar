import mongoose from "mongoose";
import { REWARD_TXN_TYPE } from "../reward.constants.js";

const rewardTransactionSchema = new mongoose.Schema(
  {
    grantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RewardGrant",
      default: null,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RewardCampaign",
      default: null,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    orderPublicId: { type: String, default: null },
    type: {
      type: String,
      enum: Object.values(REWARD_TXN_TYPE),
      required: true,
    },
    amount: { type: Number, required: true },
    balanceBefore: { type: Number, default: 0 },
    balanceAfter: { type: Number, default: 0 },
    reason: { type: String, default: "" },
    meta: { type: Object, default: {} },
  },
  { timestamps: true },
);

rewardTransactionSchema.index({ customerId: 1, createdAt: -1 });

export default mongoose.model("RewardTransaction", rewardTransactionSchema);
