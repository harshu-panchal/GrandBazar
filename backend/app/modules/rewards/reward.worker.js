import RewardCampaign from "./models/rewardCampaign.model.js";
import RewardGrant from "./models/rewardGrant.model.js";
import User from "../../models/customer.js";
import { CAMPAIGN_STATUS, GRANT_STATUS, REWARD_JOB_NAMES } from "./reward.constants.js";
import { activatePendingGrant } from "./services/cashbackService.js";
import { getActiveCampaigns } from "./services/eligibilityEngine.js";
import { processCashbackGrant } from "./services/cashbackService.js";
import { emitNotificationEvent } from "../notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../notifications/notification.constants.js";
import { rewardQueue } from "./reward.queue.js";
import logger from "../../services/logger.js";

export async function expireCampaigns() {
  const now = new Date();
  const result = await RewardCampaign.updateMany(
    { status: CAMPAIGN_STATUS.ACTIVE, endAt: { $lt: now } },
    { status: CAMPAIGN_STATUS.EXPIRED },
  );
  return result.modifiedCount || 0;
}

export async function activateDuePendingGrants() {
  const now = new Date();
  const grants = await RewardGrant.find({
    status: GRANT_STATUS.PENDING,
    $or: [
      { "meta.activateAt": { $lte: now } },
      { createdAt: { $lte: new Date(now.getTime() - 86400000) }, "meta.activateAt": { $exists: false } },
    ],
  }).limit(100);

  let activated = 0;
  for (const grant of grants) {
    try {
      await activatePendingGrant(grant._id);
      activated += 1;
    } catch (error) {
      logger.error("Failed to activate pending grant", { grantId: grant._id, message: error.message });
    }
  }
  return activated;
}

export async function sendExpiryReminders() {
  const in7days = new Date(Date.now() + 7 * 86400000);
  const in1day = new Date(Date.now() + 86400000);

  const grants = await RewardGrant.find({
    status: GRANT_STATUS.ACTIVE,
    expiresAt: { $gte: new Date(), $lte: in7days },
    "meta.expiryReminderSent": { $ne: true },
  }).limit(200);

  for (const grant of grants) {
    emitNotificationEvent(NOTIFICATION_EVENTS.REWARD_EXPIRING, {
      customerId: grant.customerId,
      userId: grant.customerId,
      role: "customer",
      amount: grant.amount,
      expiresAt: grant.expiresAt,
    });
    grant.meta = { ...(grant.meta || {}), expiryReminderSent: true };
    await grant.save();
  }

  return grants.length;
}

export async function processBirthdayRewards() {
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();

  const users = await User.find({
    dateOfBirth: { $ne: null },
    $expr: {
      $and: [
        { $eq: [{ $month: "$dateOfBirth" }, month] },
        { $eq: [{ $dayOfMonth: "$dateOfBirth" }, day] },
      ],
    },
  })
    .select("_id")
    .limit(500)
    .lean();

  const campaigns = await getActiveCampaigns({ campaignType: "reward" });
  const birthdayCampaigns = campaigns.filter(
    (c) => c.rewardConfig?.rewardSubtype === "birthday",
  );

  let processed = 0;
  for (const user of users) {
    for (const campaign of birthdayCampaigns) {
      try {
        const pseudoOrder = { customer: user._id, _id: null, orderId: null, seller: null };
        await processCashbackGrant({
          campaign,
          order: pseudoOrder,
          amount: campaign.rewardConfig?.value || 0,
        });
        processed += 1;
      } catch {
        // skip duplicate or ineligible
      }
    }
  }
  return processed;
}

export async function runRewardMaintenanceJobs() {
  // Reset daily counters at day boundary
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  await RewardCampaign.updateMany(
    { updatedAt: { $lt: dayStart } },
    { $set: { dailyUsed: 0 } },
  );

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  await RewardCampaign.updateMany(
    { updatedAt: { $lt: monthStart } },
    { $set: { monthlyUsed: 0 } },
  );

  const [expired, activated, reminders, birthdays] = await Promise.all([
    expireCampaigns(),
    activateDuePendingGrants(),
    sendExpiryReminders(),
    processBirthdayRewards(),
  ]);
  return { expired, activated, reminders, birthdays };
}

export function registerRewardQueueProcessors() {
  if (!rewardQueue.process) return;

  rewardQueue.process(REWARD_JOB_NAMES.ACTIVATE_PENDING, async (job) => {
    const { grantId } = job.data || {};
    if (grantId) await activatePendingGrant(grantId);
  });

  rewardQueue.process(REWARD_JOB_NAMES.EXPIRE_CAMPAIGNS, async () => {
    await runRewardMaintenanceJobs();
  });
}

export default {
  expireCampaigns,
  activateDuePendingGrants,
  sendExpiryReminders,
  processBirthdayRewards,
  runRewardMaintenanceJobs,
  registerRewardQueueProcessors,
};
