import Transaction from "../models/transaction.js";
import {
  handleCodOrderFinance,
  settleDeliveredOrder,
} from "./finance/orderFinanceService.js";

/**
 * Legacy Transaction-collection mirror of the real (Wallet/Payout-based)
 * settlement, kept in sync for the seller/rider dashboards that still read
 * from the Transaction table (e.g. the delivery app's stats/earnings/
 * withdrawal screens). Every code path that marks an order delivered and
 * settles it MUST call this afterwards — settleDeliveredOrder() itself only
 * touches the Wallet/Payout ledger, so skipping this mirror leaves those
 * dashboards silently stuck at zero even though the rider was actually paid.
 */
export async function syncLegacyDeliveryTransactions(settled, orderIdString) {
  await Transaction.findOneAndUpdate(
    { reference: orderIdString, userModel: "Seller" },
    { status: "Settled" },
  );

  if (!settled.deliveryBoy) return;

  const method = (settled.payment?.method || "").toLowerCase();
  const isCod = settled.paymentMode === "COD" || method === "cash" || method === "cod";

  const deliveryEarning = Math.round(settled.paymentBreakdown?.riderPayoutTotal || 0);
  const deliveryMeta = {
    tipAmount: Math.round(settled.paymentBreakdown?.riderTipAmount || 0),
    payoutBase: Math.round(settled.paymentBreakdown?.riderPayoutBase || 0),
    payoutDistance: Math.round(settled.paymentBreakdown?.riderPayoutDistance || 0),
    payoutBonus: Math.round(settled.paymentBreakdown?.riderPayoutBonus || 0),
  };
  await Transaction.findOneAndUpdate(
    { reference: `DEL-ERN-${orderIdString}` },
    {
      $set: {
        amount: deliveryEarning,
        status: "Settled",
        meta: deliveryMeta,
      },
      $setOnInsert: {
        user: settled.deliveryBoy,
        userModel: "Delivery",
        order: settled._id,
        type: "Delivery Earning",
        reference: `DEL-ERN-${orderIdString}`,
      },
    },
    { upsert: true, new: true },
  );

  if (isCod) {
    await Transaction.findOneAndUpdate(
      { reference: `CASH-COL-${orderIdString}` },
      {
        $setOnInsert: {
          user: settled.deliveryBoy,
          userModel: "Delivery",
          order: settled._id,
          type: "Cash Collection",
          amount: settled.paymentBreakdown?.grandTotal || settled.pricing?.total || 0,
          status: "Settled",
          reference: `CASH-COL-${orderIdString}`,
        },
      },
      { upsert: true, new: true },
    );
  }
}

/**
 * Financial side effects when order becomes delivered (mirrors orderController).
 */
export async function applyDeliveredSettlement(order, orderIdString) {
  const settled = await settleDeliveredOrder(order._id);

  const method = (order.payment?.method || "").toLowerCase();
  const isCod = settled.paymentMode === "COD" || method === "cash" || method === "cod";
  if (isCod && settled.deliveryBoy && !settled.financeFlags?.codMarkedCollected) {
    await handleCodOrderFinance(settled._id, {
      deliveryPartnerId: settled.deliveryBoy,
    });
  }

  await syncLegacyDeliveryTransactions(settled, orderIdString);
}
