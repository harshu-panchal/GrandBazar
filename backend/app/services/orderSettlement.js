import Transaction from "../models/transaction.js";
import Order from "../models/order.js";
import {
  handleCodOrderFinance,
  settleDeliveredOrder,
} from "./finance/orderFinanceService.js";
import { roundCurrency } from "../utils/money.js";

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

  // roundCurrency (paise precision), not Math.round (whole rupee) — the live
  // "new order" popup shows riderPayoutTotal at paise precision too, so
  // rounding it differently here made the settled earning disagree with what
  // the rider was shown when the order came in.
  const deliveryEarning = roundCurrency(settled.paymentBreakdown?.riderPayoutTotal || 0);
  const deliveryMeta = {
    tipAmount: roundCurrency(settled.paymentBreakdown?.riderTipAmount || 0),
    payoutBase: roundCurrency(settled.paymentBreakdown?.riderPayoutBase || 0),
    payoutDistance: roundCurrency(settled.paymentBreakdown?.riderPayoutDistance || 0),
    payoutBonus: roundCurrency(settled.paymentBreakdown?.riderPayoutBonus || 0),
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
  } else if (
    isCod &&
    (settled.fulfillmentMethod === "seller_delivery" || !settled.deliveryBoy) &&
    !settled.financeFlags?.codMarkedCollected
  ) {
    // Seller delivered COD order: seller holds 100% cash collected from customer at the door.
    // The admin commission is tracked in the seller's dedicated codCommissionDue liability bucket.
    const adminCommission = roundCurrency(
      Number(
        settled.paymentBreakdown?.platformTotalEarning ??
          settled.paymentBreakdown?.adminProductCommissionTotal ??
          0,
      ),
    );
    const totalCashCollected = roundCurrency(
      Number(settled.paymentBreakdown?.grandTotal || settled.pricing?.total || 0),
    );

    if (adminCommission > 0 && settled.seller) {
      try {
        const {
          updateCodCommissionDue,
          getOrCreateWallet,
          debitWallet,
          creditWallet,
        } = await import("./finance/walletService.js");
        const { createLedgerEntry } = await import("./finance/ledgerService.js");
        const {
          OWNER_TYPE,
          LEDGER_TRANSACTION_TYPE,
          LEDGER_DIRECTION,
        } = await import("../constants/finance.js");

        // 1. Record the cash commission liability in the seller's wallet
        const walletRes = await updateCodCommissionDue({
          ownerType: OWNER_TYPE.SELLER,
          ownerId: settled.seller,
          deltaAmount: adminCommission,
        });

        // 2. Create ledger entry for the commission liability
        await createLedgerEntry({
          orderId: settled._id,
          walletId: walletRes.wallet._id,
          actorType: OWNER_TYPE.SELLER,
          actorId: settled.seller,
          type: LEDGER_TRANSACTION_TYPE.SELLER_COD_COMMISSION_DUE,
          direction: LEDGER_DIRECTION.DEBIT,
          amount: adminCommission,
          paymentMode: "COD",
          metadata: {
            description: `Admin commission due for self-delivered COD order #${settled.shortOrderId || settled.orderId}`,
            totalCashCollected,
            adminCommission,
          },
        });

        // 3. Auto-offset if seller has available balance from previous online earnings
        let offsetAmount = 0;
        const currentWallet = await getOrCreateWallet(OWNER_TYPE.SELLER, settled.seller);
        if (currentWallet.availableBalance > 0) {
          offsetAmount = roundCurrency(Math.min(currentWallet.availableBalance, adminCommission));
          if (offsetAmount > 0) {
            await debitWallet({
              ownerType: OWNER_TYPE.SELLER,
              ownerId: settled.seller,
              amount: offsetAmount,
              bucket: "available",
              allowNegative: false,
            });
            await updateCodCommissionDue({
              ownerType: OWNER_TYPE.SELLER,
              ownerId: settled.seller,
              deltaAmount: -offsetAmount,
            });
            await creditWallet({
              ownerType: OWNER_TYPE.ADMIN,
              ownerId: null,
              amount: offsetAmount,
              bucket: "available",
            });
            await createLedgerEntry({
              orderId: settled._id,
              walletId: currentWallet._id,
              actorType: OWNER_TYPE.SELLER,
              actorId: settled.seller,
              type: LEDGER_TRANSACTION_TYPE.SELLER_COD_COMMISSION_REMITTED,
              direction: LEDGER_DIRECTION.DEBIT,
              amount: offsetAmount,
              paymentMode: "COD",
              metadata: {
                description: `Auto-offset COD commission from available wallet balance for order #${settled.shortOrderId || settled.orderId}`,
                offsetAmount,
              },
            });
          }
        }

        // 4. Update order finance flags
        await Order.findByIdAndUpdate(settled._id, {
          $set: {
            "financeFlags.codMarkedCollected": true,
            "paymentBreakdown.codCollectedAmount": totalCashCollected,
            "paymentBreakdown.codCommissionDue": Math.max(0, roundCurrency(adminCommission - offsetAmount)),
            paymentStatus: "CASH_COLLECTED",
          },
        });

        // 5. Track in Transaction collection for seller ledger visibility
        await Transaction.findOneAndUpdate(
          { reference: `COD-COM-${orderIdString}` },
          {
            $set: {
              amount: -adminCommission,
              status: "Settled",
              meta: {
                totalCashCollected,
                adminCommission,
                offsetAmount,
                unsettledDue: Math.max(0, roundCurrency(adminCommission - offsetAmount)),
              },
            },
            $setOnInsert: {
              user: settled.seller,
              userModel: "Seller",
              order: settled._id,
              type: "Commission Deduction",
              reference: `COD-COM-${orderIdString}`,
            },
          },
          { upsert: true, new: true },
        );
      } catch (err) {
        console.error(
          `[COD Settlement] Failed to record commission liability for seller ${settled.seller}:`,
          err.message,
        );
      }
    }
  }

  await syncLegacyDeliveryTransactions(settled, orderIdString);
}
