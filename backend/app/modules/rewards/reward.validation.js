import { REWARD_SUBTYPE } from "./reward.constants.js";

const hasIds = (arr) => Array.isArray(arr) && arr.filter(Boolean).length > 0;

/**
 * Validates a reward campaign create/update payload against the rules the
 * runtime engines (eligibilityEngine, rewardEngine, referralService) actually
 * key off of for each rewardSubtype, so campaigns can't be saved missing the
 * fields their own offer type depends on.
 */
export function validateCampaignPayload(body, { isSellerCampaign = false } = {}) {
  const rewardConfig = body.rewardConfig || {};
  const rules = body.rules || {};
  const subtype = rewardConfig.rewardSubtype;

  if (!subtype || !Object.values(REWARD_SUBTYPE).includes(subtype)) {
    return { valid: false, message: "A valid reward offer type is required" };
  }

  if (body.startAt && body.endAt && new Date(body.startAt) >= new Date(body.endAt)) {
    return { valid: false, message: "Start date must be before end date" };
  }

  if (rewardConfig.valueType === "percent") {
    const value = Number(rewardConfig.value);
    const maxPercent = 100;
    if (!(value > 0) || value > maxPercent) {
      return { valid: false, message: "Percentage value must be between 0 and 100" };
    }
  }

  switch (subtype) {
    case REWARD_SUBTYPE.PRODUCT_CASHBACK:
      if (!hasIds(rules.productIds)) {
        return { valid: false, message: "Product-wise Cashback requires at least one product" };
      }
      break;
    case REWARD_SUBTYPE.CATEGORY_CASHBACK:
      if (!hasIds(rules.categoryIds)) {
        return { valid: false, message: "Category-wise Cashback requires at least one category" };
      }
      break;
    case REWARD_SUBTYPE.BRAND_CASHBACK:
      if (!hasIds(rules.brandIds)) {
        return { valid: false, message: "Brand-wise Cashback requires at least one brand" };
      }
      break;
    case REWARD_SUBTYPE.SHOP_CASHBACK:
      if (!isSellerCampaign && !hasIds(rules.shopIds)) {
        return { valid: false, message: "Shop-wise Cashback requires at least one shop" };
      }
      break;
    case REWARD_SUBTYPE.NEW_SHOP_PROMOTION:
    case REWARD_SUBTYPE.NEW_SHOP_REWARD:
      if (!isSellerCampaign && !hasIds(rules.shopIds)) {
        return { valid: false, message: "New Shop campaigns require at least one shop" };
      }
      if (!(Number(rules.newShopMaxAgeDays) > 0)) {
        return { valid: false, message: "New Shop campaigns require a max shop age (days) greater than 0" };
      }
      break;
    case REWARD_SUBTYPE.MILESTONE:
      if (
        (rules.milestoneOrderCount == null || rules.milestoneOrderCount === "") &&
        (rules.milestoneSpendAmount == null || rules.milestoneSpendAmount === "")
      ) {
        return {
          valid: false,
          message: "Milestone Rewards require either an order count or a spend threshold",
        };
      }
      break;
    case REWARD_SUBTYPE.FESTIVAL:
      if (!String(rewardConfig.festivalName || "").trim()) {
        return { valid: false, message: "Festival Cashback requires a festival name" };
      }
      break;
    case REWARD_SUBTYPE.FLAT_COUPON:
    case REWARD_SUBTYPE.PERCENT_COUPON:
    case REWARD_SUBTYPE.VOUCHER:
    case REWARD_SUBTYPE.DIGITAL_VOUCHER:
      if (!(Number(rewardConfig.value) > 0)) {
        return { valid: false, message: "This coupon type requires a discount value greater than 0" };
      }
      break;
    case REWARD_SUBTYPE.REFERRAL_REGISTRATION:
    case REWARD_SUBTYPE.REFERRAL_FIRST_PURCHASE:
      if (!(Number(rewardConfig.value) > 0)) {
        return { valid: false, message: "Referral campaigns require a reward value greater than 0" };
      }
      break;
    default:
      break;
  }

  return { valid: true, message: "" };
}

export default { validateCampaignPayload };
