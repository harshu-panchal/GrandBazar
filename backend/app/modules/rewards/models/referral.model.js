import mongoose from "mongoose";
import { REFERRAL_CHANNEL, REFERRAL_STATUS, REFERRAL_TYPE } from "../reward.constants.js";

const referralSchema = new mongoose.Schema(
  {
    referralType: {
      type: String,
      enum: Object.values(REFERRAL_TYPE),
      default: REFERRAL_TYPE.CUSTOMER,
      index: true,
    },
    referrerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    referrerModel: {
      type: String,
      enum: ["User", "Seller", "Delivery"],
      default: "User",
    },
    refereeId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    refereeModel: {
      type: String,
      enum: ["User", "Seller", "Delivery"],
      default: "User",
    },
    referralCode: { type: String, required: true, trim: true, uppercase: true, index: true },
    channel: {
      type: String,
      enum: Object.values(REFERRAL_CHANNEL),
      default: REFERRAL_CHANNEL.CODE,
    },
    status: {
      type: String,
      enum: Object.values(REFERRAL_STATUS),
      default: REFERRAL_STATUS.PENDING,
      index: true,
    },
    referrerRewardGrantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RewardGrant",
      default: null,
    },
    refereeRewardGrantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RewardGrant",
      default: null,
    },
    invitedPhone: { type: String, default: null },
    meta: { type: Object, default: {} },
  },
  { timestamps: true },
);

referralSchema.index({ referrerId: 1, refereeId: 1 });
referralSchema.index({ referralCode: 1, refereeId: 1 });

export default mongoose.model("Referral", referralSchema);
