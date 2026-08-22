import { ORDER_SETTLEMENT_STATUS } from "../constants/finance.js";

// Extracted from orderFinanceService.js so both it and payoutService.js can
// reuse the exact same aggregate-status logic without creating a circular
// import between the two (orderFinanceService.js already imports from
// payoutService.js for createPendingPayoutForOrder).
export function computeOverallSettlement(order) {
  const settlement = order.settlementStatus || {};
  const sellerDone = settlement.sellerPayout === "COMPLETED";
  const riderDone =
    settlement.riderPayout === "COMPLETED" ||
    settlement.riderPayout === "NOT_APPLICABLE";
  const adminDone = Boolean(settlement.adminEarningCredited);

  if (sellerDone && riderDone && adminDone) {
    settlement.overall = ORDER_SETTLEMENT_STATUS.COMPLETED;
    if (!settlement.reconciledAt) settlement.reconciledAt = new Date();
  } else if (sellerDone || riderDone || adminDone) {
    settlement.overall = ORDER_SETTLEMENT_STATUS.PARTIAL;
  } else {
    settlement.overall = ORDER_SETTLEMENT_STATUS.PENDING;
  }
  return settlement;
}

export default { computeOverallSettlement };
