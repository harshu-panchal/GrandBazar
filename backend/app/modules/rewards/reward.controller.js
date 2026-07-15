import RewardCampaign from "./models/rewardCampaign.model.js";
import RewardGrant from "./models/rewardGrant.model.js";
import RewardTransaction from "./models/rewardTransaction.model.js";
import User from "../../models/customer.js";
import handleResponse from "../../utils/helper.js";
import { CAMPAIGN_STATUS } from "./reward.constants.js";
import { getAnalyticsSummary, getSettlementSummary } from "./services/settlementService.js";
import { listCustomerCoupons } from "./services/couponService.js";
import {
  ensureCustomerReferralCode,
  getReferralStats,
  listMyReferrals,
} from "./services/referralService.js";
import { GRANT_STATUS } from "./reward.constants.js";

// ─── Admin Campaign CRUD ───────────────────────────────────────────

export const listCampaigns = async (req, res) => {
  try {
    const { status, campaignType, search } = req.query;
    const query = {};
    if (status) query.status = status;
    if (campaignType) query.campaignType = campaignType;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    const campaigns = await RewardCampaign.find(query).sort({ priority: 1, createdAt: -1 }).lean();
    return handleResponse(res, 200, "Campaigns fetched", campaigns);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const createCampaign = async (req, res) => {
  try {
    const data = {
      ...req.body,
      createdBy: {
        role: "admin",
        adminId: req.user?.id || req.user?._id,
      },
    };
    const campaign = await RewardCampaign.create(data);
    return handleResponse(res, 201, "Campaign created", campaign);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateCampaign = async (req, res) => {
  try {
    const campaign = await RewardCampaign.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!campaign) return handleResponse(res, 404, "Campaign not found");
    return handleResponse(res, 200, "Campaign updated", campaign);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateCampaignStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!Object.values(CAMPAIGN_STATUS).includes(status)) {
      return handleResponse(res, 400, "Invalid status");
    }
    const campaign = await RewardCampaign.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true },
    );
    if (!campaign) return handleResponse(res, 404, "Campaign not found");
    return handleResponse(res, 200, "Campaign status updated", campaign);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const deleteCampaign = async (req, res) => {
  try {
    await RewardCampaign.findByIdAndDelete(req.params.id);
    return handleResponse(res, 200, "Campaign deleted");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getAdminAnalytics = async (req, res) => {
  try {
    const summary = await getAnalyticsSummary({
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
    });
    return handleResponse(res, 200, "Analytics fetched", summary);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getAdminSettlements = async (req, res) => {
  try {
    const summary = await getSettlementSummary({
      sellerId: req.query.sellerId,
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
    });
    return handleResponse(res, 200, "Settlements fetched", summary);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// ─── Seller Campaigns ──────────────────────────────────────────────

const SELLER_CAMPAIGN_LIMITS = {
  maxBudget: 50000,
  allowedTypes: ["cashback", "coupon"],
};

export const listSellerCampaigns = async (req, res) => {
  try {
    const sellerId = req.user.activeStoreId || req.user.id || req.user._id;
    const campaigns = await RewardCampaign.find({ "createdBy.sellerId": sellerId })
      .sort({ createdAt: -1 })
      .lean();
    return handleResponse(res, 200, "Seller campaigns fetched", campaigns);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const createSellerCampaign = async (req, res) => {
  try {
    const sellerId = req.user.activeStoreId || req.user.id || req.user._id;
    if (!SELLER_CAMPAIGN_LIMITS.allowedTypes.includes(req.body.campaignType)) {
      return handleResponse(res, 400, "Campaign type not allowed for sellers");
    }
    if (req.body.budgetLimit > SELLER_CAMPAIGN_LIMITS.maxBudget) {
      return handleResponse(res, 400, `Budget limit cannot exceed ₹${SELLER_CAMPAIGN_LIMITS.maxBudget}`);
    }

    const rules = {
      ...(req.body.rules || {}),
      // Seller campaigns are always scoped to their own store
      shopIds: [sellerId],
    };

    const campaign = await RewardCampaign.create({
      ...req.body,
      rules,
      rewardConfig: {
        creditTiming: "on_delivery",
        validityDays: 30,
        ...(req.body.rewardConfig || {}),
      },
      createdBy: { role: "seller", sellerId },
      fundingSource: "seller",
    });
    return handleResponse(res, 201, "Campaign created", campaign);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateSellerCampaign = async (req, res) => {
  try {
    const sellerId = req.user.activeStoreId || req.user.id || req.user._id;
    const campaign = await RewardCampaign.findOneAndUpdate(
      { _id: req.params.id, "createdBy.sellerId": sellerId },
      req.body,
      { new: true, runValidators: true },
    );
    if (!campaign) return handleResponse(res, 404, "Campaign not found");
    return handleResponse(res, 200, "Campaign updated", campaign);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getSellerAnalytics = async (req, res) => {
  try {
    const sellerId = req.user.activeStoreId || req.user.id || req.user._id;
    const grants = await RewardGrant.aggregate([
      { $match: { sellerId } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);
    const settlements = await getSettlementSummary({ sellerId });
    return handleResponse(res, 200, "Seller analytics fetched", { grants, settlements });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

// ─── Customer Reward Center ────────────────────────────────────────

export const getCustomerSummary = async (req, res) => {
  try {
    const customerId = req.user.id || req.user._id;
    const [user, pending, expiringSoon, referralStats] = await Promise.all([
      User.findById(customerId).select("walletBalance referralCode").lean(),
      RewardGrant.countDocuments({ customerId, status: GRANT_STATUS.PENDING }),
      RewardGrant.countDocuments({
        customerId,
        status: GRANT_STATUS.ACTIVE,
        expiresAt: { $lte: new Date(Date.now() + 7 * 86400000), $gte: new Date() },
      }),
      getReferralStats(customerId),
    ]);

    return handleResponse(res, 200, "Reward summary fetched", {
      walletBalance: user?.walletBalance || 0,
      pendingRewards: pending,
      expiringSoon,
      referralCode: referralStats.referralCode,
      totalReferrals: referralStats.totalReferrals,
      rewardedReferrals: referralStats.rewardedReferrals,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getCustomerGrants = async (req, res) => {
  try {
    const customerId = req.user.id || req.user._id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      RewardGrant.find({ customerId })
        .populate("campaignId", "name campaignType")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      RewardGrant.countDocuments({ customerId }),
    ]);

    return handleResponse(res, 200, "Grants fetched", { items, total, page, limit });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getCustomerTransactions = async (req, res) => {
  try {
    const customerId = req.user.id || req.user._id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      RewardTransaction.find({ customerId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      RewardTransaction.countDocuments({ customerId }),
    ]);

    return handleResponse(res, 200, "Transactions fetched", { items, total, page, limit });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getCustomerCoupons = async (req, res) => {
  try {
    const customerId = req.user.id || req.user._id;
    const coupons = await listCustomerCoupons(customerId);
    return handleResponse(res, 200, "Coupons fetched", coupons);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getMyReferrals = async (req, res) => {
  try {
    const customerId = req.user.id || req.user._id;
    const data = await listMyReferrals(customerId, {
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 20,
    });
    return handleResponse(res, 200, "Referrals fetched", data);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getMyReferralCode = async (req, res) => {
  try {
    const customerId = req.user.id || req.user._id;
    const code = await ensureCustomerReferralCode(customerId);
    const stats = await getReferralStats(customerId);
    return handleResponse(res, 200, "Referral code fetched", {
      referralCode: code,
      ...stats,
      shareLink: `${process.env.FRONTEND_URL || "http://localhost:5173"}/signup?ref=${code}`,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const inviteReferral = async (req, res) => {
  try {
    const customerId = req.user.id || req.user._id;
    const code = await ensureCustomerReferralCode(customerId);
    const { phone } = req.body;
    return handleResponse(res, 200, "Invite prepared", {
      referralCode: code,
      phone,
      shareLink: `${process.env.FRONTEND_URL || "http://localhost:5173"}/signup?ref=${code}`,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export default {
  listCampaigns,
  createCampaign,
  updateCampaign,
  updateCampaignStatus,
  deleteCampaign,
  getAdminAnalytics,
  getAdminSettlements,
  listSellerCampaigns,
  createSellerCampaign,
  updateSellerCampaign,
  getSellerAnalytics,
  getCustomerSummary,
  getCustomerGrants,
  getCustomerTransactions,
  getCustomerCoupons,
  getMyReferrals,
  getMyReferralCode,
  inviteReferral,
};
