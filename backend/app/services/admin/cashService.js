import Delivery from "../../models/delivery.js";
import Order from "../../models/order.js";
import Transaction from "../../models/transaction.js";
import Notification from "../../models/notification.js";
import Wallet from "../../models/wallet.js";
import { reconcileCodCash } from "../finance/orderFinanceService.js";
import { roundCurrency } from "../../utils/money.js";

export async function getDeliveryCashBalancesData({ page, limit, skip }) {
  const ridersPipeline = [
    {
      $lookup: {
        from: "transactions",
        localField: "_id",
        foreignField: "user",
        as: "allTransactions",
      },
    },
    {
      $lookup: {
        from: "orders",
        localField: "_id",
        foreignField: "deliveryBoy",
        as: "allOrders",
      },
    },
    {
      $project: {
        name: 1,
        phone: 1,
        avatar: 1,
        limit: { $ifNull: ["$limit", 5000] },
        documents: 1,
        currentCash: {
          $reduce: {
            input: {
              $filter: {
                input: "$allTransactions",
                as: "transaction",
                cond: {
                  $in: [
                    "$$transaction.type",
                    ["Cash Collection", "Cash Settlement"],
                  ],
                },
              },
            },
            initialValue: 0,
            in: {
              $let: {
                vars: {
                  order: {
                    $first: {
                      $filter: {
                        input: "$allOrders",
                        as: "order",
                        cond: { $eq: ["$$order._id", "$$this.order"] },
                      },
                    },
                  },
                },
                in: {
                  $cond: [
                    { $eq: ["$$this.type", "Cash Collection"] },
                    {
                      $add: [
                        "$$value",
                        {
                          $ifNull: [
                            "$$this.meta.netCashHeldForPlatform",
                            {
                              $cond: [
                                {
                                  $gt: [
                                    "$$order.paymentBreakdown.codCollectedAmount",
                                    0,
                                  ],
                                },
                                "$$order.paymentBreakdown.codCollectedAmount",
                                {
                                  $max: [
                                    {
                                      $subtract: [
                                        "$$this.amount",
                                        {
                                          $ifNull: [
                                            "$$order.paymentBreakdown.riderPayoutTotal",
                                            0,
                                          ],
                                        },
                                      ],
                                    },
                                    0,
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                    {
                      $subtract: ["$$value", { $abs: "$$this.amount" }],
                    },
                  ],
                },
              },
            },
          },
        },
        pendingOrders: {
          $size: {
            $filter: {
              input: "$allOrders",
              as: "order",
              cond: {
                $and: [
                  {
                    $in: [
                      "$$order.status",
                      ["confirmed", "packed", "picked_up", "handed_over_to_logistics", "out_for_delivery"],
                    ],
                  },
                  { $in: ["$$order.payment.method", ["cash", "cod"]] },
                ],
              },
            },
          },
        },
        totalOrders: {
          $size: {
            $filter: {
              input: "$allOrders",
              as: "order",
              cond: { $eq: ["$$order.status", "delivered"] },
            },
          },
        },
        lastSettlementTxn: {
          $arrayElemAt: [
            {
              $sortArray: {
                input: {
                  $filter: {
                    input: "$allTransactions",
                    as: "transaction",
                    cond: {
                      $eq: ["$$transaction.type", "Cash Settlement"],
                    },
                  },
                },
                sortBy: { createdAt: -1 },
              },
            },
            0,
          ],
        },
      },
    },
    {
      $project: {
        id: "$_id",
        name: 1,
        phone: 1,
        avatar: {
          $cond: [
            { $ifNull: ["$documents.profileImage", false] },
            "$documents.profileImage",
            {
              $concat: [
                "https://api.dicebear.com/7.x/avataaars/svg?seed=",
                "$name",
              ],
            },
          ],
        },
        currentCash: 1,
        limit: 1,
        status: {
          $cond: [
            { $gt: ["$currentCash", 4500] },
            "critical",
            {
              $cond: [
                { $gt: ["$currentCash", 3000] },
                "warning",
                "safe",
              ],
            },
          ],
        },
        pendingOrders: 1,
        totalOrders: 1,
        lastSettlement: {
          $ifNull: ["$lastSettlementTxn.createdAt", "Never"],
        },
      },
    },
    {
      $facet: {
        meta: [{ $count: "total" }],
        items: [{ $skip: skip }, { $limit: limit }],
      },
    },
  ];

  const [aggregateResult] = await Delivery.aggregate(ridersPipeline);
  const meta = aggregateResult?.meta?.[0];
  const riders = aggregateResult?.items ?? [];
  const total = meta?.total ?? 0;

  const totalInHand = riders.reduce(
    (accumulator, rider) => accumulator + (rider.currentCash || 0),
    0,
  );
  const overLimitCount = riders.filter(
    (rider) => (rider.currentCash || 0) >= (rider.limit || 5000),
  ).length;

  return {
    items: riders,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
    stats: {
      totalInHand,
      overLimitCount,
      avgBalance: riders.length ? totalInHand / riders.length : 0,
    },
  };
}

export async function settleRiderCashEntry({ riderId, amount, method }) {
  const requestedAmount = roundCurrency(amount);
  if (!riderId || !Number.isFinite(Number(amount)) || requestedAmount <= 0) {
    throw new Error("Missing riderId or invalid amount");
  }

  const rider = await Delivery.findById(riderId);
  if (!rider) {
    return null;
  }

  const orders = await Order.find({
    deliveryBoy: riderId,
    paymentMode: "COD",
    status: { $ne: "cancelled" },
    orderStatus: { $ne: "cancelled" },
    "financeFlags.codMarkedCollected": true,
    "paymentBreakdown.codPendingAmount": { $gt: 0 },
  })
    .select("orderId paymentBreakdown.codPendingAmount")
    .sort({ createdAt: 1 })
    .lean();
  const totalPending = roundCurrency(
    orders.reduce(
      (sum, order) => sum + Number(order.paymentBreakdown?.codPendingAmount || 0),
      0,
    ),
  );
  const wallet = await Wallet.findOne({
    ownerType: "DELIVERY_PARTNER",
    ownerId: riderId,
  })
    .select("cashInHand")
    .lean();
  const availableToSettle = Math.min(totalPending, roundCurrency(wallet?.cashInHand || 0));
  if (requestedAmount > availableToSettle) {
    throw new Error(
      `Settlement cannot exceed collected COD cash of ${availableToSettle.toFixed(2)}`,
    );
  }

  let remaining = requestedAmount;
  const settledOrders = [];
  for (const order of orders) {
    if (remaining <= 0) break;
    const pending = roundCurrency(order.paymentBreakdown?.codPendingAmount || 0);
    if (pending <= 0) continue;
    const settleAmount = roundCurrency(Math.min(pending, remaining));
    await reconcileCodCash(order._id, settleAmount, riderId, {
      metadata: {
        source: "admin_cash_collection",
        initiatedBy: "admin",
      },
    });
    remaining = roundCurrency(remaining - settleAmount);
    settledOrders.push({ orderId: order.orderId, amount: settleAmount });
  }

  const settlement = await Transaction.create({
    user: riderId,
    userModel: "Delivery",
    type: "Cash Settlement",
    amount: -requestedAmount,
    status: "Settled",
    reference: `CSH-SET-${Date.now()}`,
    notes: `Method: ${method || "Cash"}`,
    meta: {
      source: "admin_cash_collection",
      orders: settledOrders,
    },
  });

  await Notification.create({
    recipient: riderId,
    recipientModel: "Delivery",
    title: "Cash Settled",
    message: `Admin has collected \u20B9${amount} cash from you. Your balance is updated.`,
    type: "payment",
    data: { transactionId: settlement._id },
  });

  return settlement;
}

export async function getRiderCashDetailsData(riderId) {
  const transactions = await Transaction.find({
    user: riderId,
    userModel: "Delivery",
    type: "Cash Collection",
  })
    .populate("order", "orderId pricing paymentBreakdown createdAt")
    .sort({ createdAt: -1 })
    .limit(20);

  return transactions.map((transaction) => {
    const breakdown = transaction.order?.paymentBreakdown || {};
    const hasGrossAccounting =
      transaction.meta?.grossCashCollected != null ||
      Number(breakdown.codGrossCollectedAmount || 0) > 0;
    const legacyGross = Number(transaction.amount || 0);
    const legacyNet = Number(breakdown.codCollectedAmount || 0);
    const gross = hasGrossAccounting
      ? transaction.meta?.grossCashCollected ?? breakdown.codGrossCollectedAmount
      : Number(transaction.order?.pricing?.total || 0) || legacyGross;
    const net =
      transaction.meta?.netCashHeldForPlatform ??
      (legacyNet > 0
        ? legacyNet
        : Math.max(legacyGross - Number(breakdown.riderPayoutTotal || 0), 0));
    const retained =
      transaction.meta?.riderCommissionRetained ??
      (hasGrossAccounting
        ? breakdown.codRiderCommissionRetained
        : Math.max(legacyGross - legacyNet, 0));

    return {
      id: transaction.order?.orderId || transaction.reference || "N/A",
      amount: roundCurrency(gross),
      amountNet: roundCurrency(net),
      riderCommissionRetained: roundCurrency(retained),
      time: new Date(transaction.createdAt).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      date: transaction.createdAt,
    };
  });
}

export async function getCashSettlementHistoryData({ page, limit, skip }) {
  const query = { userModel: "Delivery", type: "Cash Settlement" };

  const [history, total] = await Promise.all([
    Transaction.find(query)
      .populate("user", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments(query),
  ]);

  const items = history.map((entry) => ({
    id: (entry.reference || entry._id).toString(),
    rider: entry.user?.name || "Unknown Rider",
    amount: Math.abs(entry.amount),
    unappliedAmount: roundCurrency(entry.meta?.unappliedAmount || 0),
    date: entry.createdAt,
    method: entry.notes?.replace("Method: ", "") || "Cash Submission",
    status: "completed",
  }));

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}
