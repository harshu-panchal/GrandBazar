import mongoose from "mongoose";
import Order from "../models/order.js";
import Complaint from "../models/complaint.js";
import ComplaintItem from "../models/complaintItem.js";
import ComplaintEvent from "../models/complaintEvent.js";
import CallLog from "../models/callLog.js";
import User from "../models/customer.js";
import Admin from "../models/admin.js";
import Setting from "../models/setting.js";
import Transaction from "../models/transaction.js";
import { requireCanonicalOrderId } from "../utils/orderLookup.js";
import { roundCurrency } from "../utils/money.js";
import { nextComplaintId } from "../utils/sequenceIds.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import {
  COMPLAINT_STATUS,
  COMPLAINT_SUBMIT_TYPE,
  COMPLAINT_CULPRIT,
  COMPLAINT_TRANSITIONS,
  OPEN_COMPLAINT_STATUSES,
  ALL_COMPLAINT_REASONS,
} from "../constants/complaint.js";
import {
  SETTLEMENT_STATE,
  LEDGER_TRANSACTION_TYPE,
  LEDGER_DIRECTION,
  OWNER_TYPE,
} from "../constants/finance.js";
import { createLedgerEntry } from "./finance/ledgerService.js";

// ---------------------------------------------------------------------------
// Complaint Window service (BRD section 4 + "Complaint ticket – status machine").
// Replaces the legacy disputeService flow (migrated/retired in Phase 8). Every
// status change writes an append-only complaint_event in the SAME transaction
// and sends the customer a message. Admin-only close with a named culprit and
// a final summary. A complaint (not feedback) holds the order's settlement.
// ---------------------------------------------------------------------------

function httpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function loadComplaintConfig() {
  const setting = await Setting.findOne({})
    .select("complaint refundWindowHours")
    .lean();
  const c = setting?.complaint || {};
  return {
    windowHours: c.windowHours ?? setting?.refundWindowHours ?? 24,
    slaDays: c.slaDays ?? 7,
    photosRequired: Boolean(c.photosRequired),
    maxPhotosPerItem: c.maxPhotosPerItem ?? 4,
    day5AlertDay: c.day5AlertDay ?? 5,
    day5AlertEnabled: c.day5AlertEnabled !== false,
    holdScope: c.settlementHoldScope || "whole_order",
  };
}

async function getAdminIds() {
  const admins = await Admin.find().select("_id").lean();
  return admins.map((a) => a?._id).filter(Boolean);
}

// End of the 24h window for an order. Prefer the frozen value; fall back to
// deliveredAt + configured hours so enforcement works even before the delivery
// hook (Phase 4) backfills complaintWindowClosesAt.
function effectiveWindowClose(order, windowHours) {
  if (order.complaintWindowClosesAt) return new Date(order.complaintWindowClosesAt);
  if (order.deliveredAt) {
    return new Date(new Date(order.deliveredAt).getTime() + windowHours * 3600 * 1000);
  }
  return null;
}

function isDelivered(order) {
  return (
    Boolean(order.deliveredAt) ||
    order.status === "delivered" ||
    order.orderStatus === "delivered" ||
    String(order.workflowStatus || "").toUpperCase() === "DELIVERED"
  );
}

function assertTransition(from, to) {
  const allowed = COMPLAINT_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw httpError(`Illegal complaint transition ${from} -> ${to}`, 409);
  }
}

// Append-only audit row, written inside the caller's transaction.
async function writeEvent(session, complaint, { actorId, actorRole, action, fromStatus = null, toStatus = null, note = "", meta = {}, ctx = {} }) {
  await ComplaintEvent.create(
    [
      {
        complaint: complaint._id,
        actorId: actorId || null,
        actorRole,
        action,
        fromStatus,
        toStatus,
        note,
        meta,
        device: ctx.device || "",
        ip: ctx.ip || "",
      },
    ],
    { session },
  );
}

// Apply / release the settlement hold on the order (mirrors disputeService's
// belt-and-suspenders guard — never touches a finished payout).
function holdSettlementUpdate(order) {
  const sp = order.settlementStatus?.sellerPayout;
  if (sp && ["COMPLETED", "NOT_APPLICABLE"].includes(sp)) return {};
  return {
    "settlementStatus.sellerPayout": "HOLD",
    "settlementStatus.settlementState": SETTLEMENT_STATE.HELD,
    "financeFlags.sellerPayoutHeld": true,
  };
}

function releaseSettlementUpdate(order, windowHours) {
  const sp = order.settlementStatus?.sellerPayout;
  if (sp && ["COMPLETED", "NOT_APPLICABLE"].includes(sp)) return {};
  const windowClose = effectiveWindowClose(order, windowHours);
  const windowClosed = windowClose && new Date() >= windowClose;
  return {
    "settlementStatus.sellerPayout": "PENDING",
    // The precise READY/HELD decision is the Phase 4 engine's job; set a sane
    // starting state so the order re-enters the settlement pipeline.
    "settlementStatus.settlementState": windowClosed
      ? SETTLEMENT_STATE.READY
      : SETTLEMENT_STATE.WINDOW_OPEN,
    "financeFlags.sellerPayoutHeld": false,
  };
}

// --------------------------- raise -----------------------------------------

/**
 * Raise FEEDBACK or a COMPLAINT on a delivered order, within the 24h window.
 * `items` = [{ orderItemId, reason, reasonText?, photos?: [url] }, ...]
 */
export async function raiseComplaintOrFeedback({
  orderId,
  customerId,
  submitType,
  items,
  ctx = {},
}) {
  orderId = await requireCanonicalOrderId(orderId);
  const config = await loadComplaintConfig();

  const order = await Order.findOne({ orderId });
  if (!order) throw httpError("Order not found", 404);
  if (String(order.customer) !== String(customerId)) {
    throw httpError("You can only raise a complaint on your own order", 403);
  }
  if (!isDelivered(order)) {
    throw httpError("Complaints can only be raised on delivered orders", 400);
  }

  const windowClose = effectiveWindowClose(order, config.windowHours);
  if (windowClose && new Date() > windowClose) {
    throw httpError(
      `The ${config.windowHours}-hour complaint window has closed for this order.`,
      400,
    );
  }
  if (order.complaintRef) {
    throw httpError("A complaint already exists for this order", 409);
  }

  const type =
    submitType === COMPLAINT_SUBMIT_TYPE.FEEDBACK
      ? COMPLAINT_SUBMIT_TYPE.FEEDBACK
      : COMPLAINT_SUBMIT_TYPE.COMPLAINT;

  // Validate the selected products against the order's items.
  const normalizedItems = validateItems(order, items, config);

  const session = await mongoose.startSession();
  let created;
  const afterCommit = [];
  try {
    await session.withTransaction(async () => {
      const complaintId = await nextComplaintId({ session });
      const openedAt = new Date();
      const dueAt = new Date(openedAt.getTime() + config.slaDays * 24 * 3600 * 1000);
      const isComplaint = type === COMPLAINT_SUBMIT_TYPE.COMPLAINT;

      const [complaint] = await Complaint.create(
        [
          {
            complaintId,
            order: order._id,
            orderPublicId: order.orderId,
            customer: order.customer,
            seller: order.seller,
            submitType: type,
            status: COMPLAINT_STATUS.NEW,
            openedAt,
            dueAt,
            settlementHeld: isComplaint,
            settlementHoldScope: config.holdScope,
          },
        ],
        { session },
      );

      await ComplaintItem.create(
        normalizedItems.map((it) => ({ ...it, complaint: complaint._id })),
        { session },
      );

      await writeEvent(session, complaint, {
        actorId: customerId,
        actorRole: "customer",
        action: isComplaint ? "raised" : "feedback_submitted",
        toStatus: COMPLAINT_STATUS.NEW,
        note: isComplaint ? "Complaint raised" : "Feedback submitted",
        meta: { submitType: type, items: normalizedItems.length },
        ctx,
      });

      const orderUpdate = { complaintRef: complaint._id };
      if (isComplaint) Object.assign(orderUpdate, holdSettlementUpdate(order));
      await Order.updateOne({ _id: order._id }, { $set: orderUpdate }, { session });

      created = complaint;

      // Fire notifications only after the transaction commits.
      afterCommit.push(() => {
        if (isComplaint) {
          emitNotificationEvent(NOTIFICATION_EVENTS.COMPLAINT_RAISED, {
            orderId: order.orderId,
            complaintId,
            status: COMPLAINT_STATUS.NEW,
            userId: order.customer,
            customerId: order.customer,
            slaDays: config.slaDays,
          });
        } else {
          emitNotificationEvent(NOTIFICATION_EVENTS.COMPLAINT_FEEDBACK_RECEIVED, {
            orderId: order.orderId,
            sellerId: order.seller,
            complaintId,
          });
        }
      });
      afterCommit.push(async () => {
        const adminIds = await getAdminIds();
        if (adminIds.length) {
          emitNotificationEvent(NOTIFICATION_EVENTS.COMPLAINT_ADMIN_NEW, {
            orderId: order.orderId,
            complaintId,
            submitType: type,
            adminIds,
          });
        }
      });
    });
  } finally {
    await session.endSession();
  }

  for (const fn of afterCommit) await fn();
  return { complaint: created };
}

function validateItems(order, items, config) {
  if (!Array.isArray(items) || items.length === 0) {
    throw httpError("Select at least one product", 400);
  }
  const orderItemsById = new Map(
    (order.items || []).map((it) => [String(it._id), it]),
  );
  const seen = new Set();
  return items.map((raw) => {
    const id = String(raw.orderItemId || "");
    const orderItem = orderItemsById.get(id);
    if (!orderItem) throw httpError(`Product ${id} is not part of this order`, 400);
    if (seen.has(id)) throw httpError("A product was selected more than once", 400);
    seen.add(id);

    const reason = ALL_COMPLAINT_REASONS.includes(raw.reason) ? raw.reason : "other";
    const photos = Array.isArray(raw.photos) ? raw.photos.filter(Boolean).map(String) : [];
    if (photos.length > config.maxPhotosPerItem) {
      throw httpError(`At most ${config.maxPhotosPerItem} photos per product`, 400);
    }
    if (config.photosRequired && photos.length === 0) {
      throw httpError("At least one photo is required per product", 400);
    }
    return {
      orderItemId: orderItem._id,
      product: orderItem.product || null,
      productName: orderItem.name || "",
      quantity: orderItem.quantity || 1,
      unitPrice: orderItem.price || 0,
      reason,
      reasonText: reason === "other" ? String(raw.reasonText || "").slice(0, 500) : "",
      photos,
    };
  });
}

// --------------------------- feedback ack ----------------------------------

export async function acknowledgeFeedback({ complaintId, adminId, ctx = {} }) {
  const complaint = await Complaint.findOne({ complaintId });
  if (!complaint) throw httpError("Complaint not found", 404);
  if (complaint.submitType !== COMPLAINT_SUBMIT_TYPE.FEEDBACK) {
    throw httpError("Only feedback can be acknowledged", 400);
  }
  if (complaint.status === COMPLAINT_STATUS.CLOSED) {
    throw httpError("Already acknowledged", 409);
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await writeEvent(session, complaint, {
        actorId: adminId,
        actorRole: "admin",
        action: "feedback_acknowledged",
        fromStatus: complaint.status,
        toStatus: COMPLAINT_STATUS.CLOSED,
        note: "Feedback acknowledged",
        ctx,
      });
      await Complaint.updateOne(
        { _id: complaint._id },
        {
          $set: {
            status: COMPLAINT_STATUS.CLOSED,
            feedbackAcknowledgedAt: new Date(),
            feedbackAcknowledgedBy: adminId,
            closedAt: new Date(),
            closedBy: adminId,
          },
        },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
  return Complaint.findById(complaint._id).lean();
}

// --------------------------- call log --------------------------------------

export async function logCall({ complaintId, adminId, adminName = "", outcome, facts, photosChecked = false, nextStep = "", durationSeconds = 0, ctx = {} }) {
  const complaint = await Complaint.findOne({ complaintId });
  if (!complaint) throw httpError("Complaint not found", 404);
  if (complaint.submitType !== COMPLAINT_SUBMIT_TYPE.COMPLAINT) {
    throw httpError("Call logs apply to complaints, not feedback", 400);
  }
  if (!facts || !String(facts).trim()) throw httpError("Write what the customer said", 400);
  if (![COMPLAINT_STATUS.NEW, COMPLAINT_STATUS.UNDER_REVIEW, COMPLAINT_STATUS.CALL_DONE].includes(complaint.status)) {
    throw httpError(`Cannot log a call while the complaint is ${complaint.status}`, 409);
  }

  const order = await Order.findById(complaint.order).select("orderId customer").lean();
  const session = await mongoose.startSession();
  const afterCommit = [];
  try {
    await session.withTransaction(async () => {
      await CallLog.create(
        [
          {
            complaint: complaint._id,
            party: "customer",
            outcome,
            facts: String(facts).trim(),
            photosChecked: Boolean(photosChecked),
            nextStep,
            durationSeconds: Math.max(0, Number(durationSeconds) || 0),
            by: adminId,
            byName: adminName,
          },
        ],
        { session },
      );

      // NEW -> UNDER_REVIEW (admin picked it up) is recorded implicitly, then
      // the saved call advances to CALL_DONE.
      if (complaint.status === COMPLAINT_STATUS.NEW) {
        await writeEvent(session, complaint, {
          actorId: adminId,
          actorRole: "admin",
          action: "picked_up",
          fromStatus: COMPLAINT_STATUS.NEW,
          toStatus: COMPLAINT_STATUS.UNDER_REVIEW,
          note: "Admin picked up",
          ctx,
        });
      }
      await writeEvent(session, complaint, {
        actorId: adminId,
        actorRole: "admin",
        action: "call_logged",
        fromStatus: complaint.status === COMPLAINT_STATUS.NEW ? COMPLAINT_STATUS.UNDER_REVIEW : complaint.status,
        toStatus: COMPLAINT_STATUS.CALL_DONE,
        note: `Call: ${outcome}`,
        meta: { outcome, photosChecked },
        ctx,
      });
      await Complaint.updateOne(
        { _id: complaint._id },
        {
          $set: {
            status: COMPLAINT_STATUS.CALL_DONE,
            lastCallOutcome: outcome,
            lastCallAt: new Date(),
          },
        },
        { session },
      );

      // CMP-19: a message goes to the customer at EVERY status change — this
      // transition (NEW/UNDER_REVIEW -> CALL_DONE) previously sent none.
      if (order) {
        if (complaint.status === COMPLAINT_STATUS.NEW) {
          afterCommit.push(() =>
            emitNotificationEvent(NOTIFICATION_EVENTS.COMPLAINT_UPDATE, {
              orderId: order.orderId,
              complaintId,
              status: COMPLAINT_STATUS.UNDER_REVIEW,
              userId: order.customer,
              customerId: order.customer,
              message: "Your complaint is now under review by our support team.",
            }),
          );
        }
        afterCommit.push(() =>
          emitNotificationEvent(NOTIFICATION_EVENTS.COMPLAINT_UPDATE, {
            orderId: order.orderId,
            complaintId,
            status: COMPLAINT_STATUS.CALL_DONE,
            userId: order.customer,
            customerId: order.customer,
            message: "We spoke with you and are checking with the concerned party.",
          }),
        );
      }
    });
  } finally {
    await session.endSession();
  }
  for (const fn of afterCommit) await fn();
  return Complaint.findById(complaint._id).lean();
}

// --------------------------- assign / reassign -----------------------------

export async function assignCulprit({ complaintId, adminId, culprit, amount = 0, recoveryTicketRef = "", note = "", ctx = {} }) {
  const complaint = await Complaint.findOne({ complaintId });
  if (!complaint) throw httpError("Complaint not found", 404);
  if (!Object.values(COMPLAINT_CULPRIT).includes(culprit)) {
    throw httpError("Invalid culprit", 400);
  }
  // Routing requires a call log first (status CALL_DONE), or it's a reassign
  // from ASSIGNED / SELLER_REJECTED.
  const canRoute = [COMPLAINT_STATUS.CALL_DONE, COMPLAINT_STATUS.ASSIGNED, COMPLAINT_STATUS.SELLER_REJECTED].includes(
    complaint.status,
  );
  if (!canRoute) {
    throw httpError("Log a call before assigning a culprit", 409);
  }
  const isReassign = [COMPLAINT_STATUS.ASSIGNED, COMPLAINT_STATUS.SELLER_REJECTED].includes(complaint.status);

  const order = await Order.findById(complaint.order);
  if (!order) throw httpError("Order not found", 404);

  // For non-seller culprits the admin sets the refund amount here. For a seller
  // culprit the SELLER approves the final amount (BRD), so amount stays pending.
  const amt = culprit === COMPLAINT_CULPRIT.SELLER ? 0 : roundCurrency(Math.max(0, Number(amount) || 0));
  if (culprit !== COMPLAINT_CULPRIT.SELLER && culprit !== COMPLAINT_CULPRIT.CUSTOMER && !(amt > 0)) {
    throw httpError("Enter the refund amount", 400);
  }

  const session = await mongoose.startSession();
  const afterCommit = [];
  try {
    await session.withTransaction(async () => {
      assertTransition(complaint.status, COMPLAINT_STATUS.ASSIGNED);
      await writeEvent(session, complaint, {
        actorId: adminId,
        actorRole: "admin",
        action: isReassign ? "reassigned" : "assigned",
        fromStatus: complaint.status,
        toStatus: COMPLAINT_STATUS.ASSIGNED,
        note: note || `Culprit: ${culprit}`,
        meta: { culprit, amount: amt, recoveryTicketRef },
        ctx,
      });

      const set = {
        status: COMPLAINT_STATUS.ASSIGNED,
        culprit,
        amount: amt,
        "sellerDecision.decision": null,
        "sellerDecision.amount": 0,
      };
      if (culprit === COMPLAINT_CULPRIT.RIDER_LOGISTICS && recoveryTicketRef) {
        set.recoveryTicketRef = recoveryTicketRef;
      }
      const inc = isReassign ? { reassignCount: 1 } : {};
      await Complaint.updateOne({ _id: complaint._id }, { $set: set, $inc: inc }, { session });

      if (culprit === COMPLAINT_CULPRIT.SELLER) {
        afterCommit.push(() =>
          emitNotificationEvent(NOTIFICATION_EVENTS.COMPLAINT_ASSIGNED_SELLER, {
            orderId: order.orderId,
            complaintId,
            sellerId: order.seller,
          }),
        );
      }
      afterCommit.push(() =>
        emitNotificationEvent(NOTIFICATION_EVENTS.COMPLAINT_UPDATE, {
          orderId: order.orderId,
          complaintId,
          status: COMPLAINT_STATUS.ASSIGNED,
          userId: order.customer,
          customerId: order.customer,
          message: "Your complaint is being looked into.",
        }),
      );
    });
  } finally {
    await session.endSession();
  }
  for (const fn of afterCommit) await fn();
  return Complaint.findById(complaint._id).lean();
}

// --------------------------- seller decision -------------------------------

export async function sellerDecision({ complaintId, sellerStoreId, decision, amount = 0, reason = "", ctx = {} }) {
  const complaint = await Complaint.findOne({ complaintId });
  if (!complaint) throw httpError("Complaint not found", 404);
  if (String(complaint.seller) !== String(sellerStoreId)) {
    throw httpError("This complaint is not against your store", 403);
  }
  if (complaint.culprit !== COMPLAINT_CULPRIT.SELLER || complaint.status !== COMPLAINT_STATUS.ASSIGNED) {
    throw httpError("No seller decision is pending on this complaint", 409);
  }
  const approve = decision === "approved";
  const amt = roundCurrency(Math.max(0, Number(amount) || 0));
  if (approve && !(amt > 0)) throw httpError("Enter the amount to approve", 400);

  const order = await Order.findById(complaint.order);
  const session = await mongoose.startSession();
  const afterCommit = [];
  try {
    await session.withTransaction(async () => {
      const toStatus = approve ? COMPLAINT_STATUS.SELLER_APPROVED : COMPLAINT_STATUS.SELLER_REJECTED;
      assertTransition(complaint.status, toStatus);
      await writeEvent(session, complaint, {
        actorId: sellerStoreId,
        actorRole: "seller",
        action: approve ? "seller_approved" : "seller_rejected",
        fromStatus: complaint.status,
        toStatus,
        note: approve ? `Approved ₹${amt}` : `Rejected: ${reason || "no reason"}`,
        meta: { amount: amt, reason },
        ctx,
      });
      await Complaint.updateOne(
        { _id: complaint._id },
        {
          $set: {
            status: toStatus,
            amount: approve ? amt : 0,
            "sellerDecision.decision": approve ? "approved" : "rejected",
            "sellerDecision.amount": approve ? amt : 0,
            "sellerDecision.reason": reason,
            "sellerDecision.decidedAt": new Date(),
            "sellerDecision.decidedBy": sellerStoreId,
          },
        },
        { session },
      );

      if (approve && order) {
        // Record the complaint deduction on the order so the Phase 4 settlement
        // engine subtracts it from the seller's settled amount. Approval is the
        // seller's resolution of the complaint, so also release the automatic
        // complaint hold. A separate manual admin hold is intentionally kept.
        const release = order.financeFlags?.manualSettlementHold
          ? {}
          : releaseSettlementUpdate(order, (await loadComplaintConfig()).windowHours);
        await Order.updateOne(
          { _id: order._id },
          { $set: { "sellerSettlement.deductions.complaint": amt, ...release } },
          { session },
        );
      }

      if (order) {
        afterCommit.push(() =>
          emitNotificationEvent(NOTIFICATION_EVENTS.COMPLAINT_UPDATE, {
            orderId: order.orderId,
            complaintId,
            status: toStatus,
            userId: order.customer,
            customerId: order.customer,
            message: approve
              ? "We spoke with the seller and are processing your complaint."
              : "Your complaint is being reviewed again by our team.",
          }),
        );
      }
    });
  } finally {
    await session.endSession();
  }
  for (const fn of afterCommit) await fn();
  return Complaint.findById(complaint._id).lean();
}

// --------------------------- refund ----------------------------------------

export async function refundCustomer({ complaintId, adminId, ctx = {} }) {
  const complaint = await Complaint.findOne({ complaintId });
  if (!complaint) throw httpError("Complaint not found", 404);
  if (complaint.culprit === COMPLAINT_CULPRIT.CUSTOMER) {
    throw httpError("False complaint (customer at fault): no refund", 400);
  }
  if (!complaint.culprit) throw httpError("Assign a culprit first", 409);
  if (complaint.culprit === COMPLAINT_CULPRIT.SELLER && complaint.sellerDecision?.decision !== "approved") {
    throw httpError("The seller must approve an amount before refunding", 409);
  }
  if (complaint.status === COMPLAINT_STATUS.REFUNDED) throw httpError("Already refunded", 409);
  const amount = roundCurrency(Math.max(0, Number(complaint.amount) || 0));
  if (!(amount > 0)) throw httpError("No refund amount set", 400);

  const order = await Order.findById(complaint.order);
  if (!order) throw httpError("Order not found", 404);

  const txnNo = `RFND-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const session = await mongoose.startSession();
  const afterCommit = [];
  try {
    await session.withTransaction(async () => {
      assertTransition(complaint.status, COMPLAINT_STATUS.REFUNDED);

      // Credit the customer's wallet (same money path as the legacy dispute
      // flow). Cost booking to the responsible party (seller deduction already
      // recorded; platform/logistics ledger) is finalised in Phase 4/7.
      await User.updateOne(
        { _id: complaint.customer },
        { $inc: { walletBalance: amount } },
        { session },
      );
      await Transaction.create(
        [
          {
            user: complaint.customer,
            userModel: "User",
            order: order._id,
            type: "Refund",
            amount,
            status: "Settled",
            reference: txnNo,
            meta: { complaintId, culprit: complaint.culprit },
          },
        ],
        { session },
      );

      // Who actually bears this cost (BRD CMP-15 / section 9): seller's share
      // is handled separately via sellerDecision's deductions.complaint.
      // Platform and logistics faults post a ledger entry here, tagged with
      // the order, seller and complaint number, so the cost is traceable and
      // not just a wallet credit with no accounting trail.
      if (complaint.culprit === COMPLAINT_CULPRIT.PLATFORM) {
        await createLedgerEntry(
          {
            orderId: order._id,
            actorType: OWNER_TYPE.ADMIN,
            actorId: adminId || null,
            type: LEDGER_TRANSACTION_TYPE.COMPLAINT_PLATFORM_PAID,
            direction: LEDGER_DIRECTION.DEBIT,
            amount,
            description: `Complaint ${complaintId}: platform at fault, refunded ₹${amount} from commission`,
            reference: txnNo,
            metadata: { complaintId, sellerId: order.seller, culprit: complaint.culprit },
          },
          { session },
        );
        // "Order profit reduces" — debit the order's own recorded platform
        // earning so downstream profit/commission reports reflect the cost.
        await Order.updateOne(
          { _id: order._id },
          { $inc: { "paymentBreakdown.platformTotalEarning": -amount } },
          { session },
        );
      } else if (complaint.culprit === COMPLAINT_CULPRIT.RIDER_LOGISTICS) {
        await createLedgerEntry(
          {
            orderId: order._id,
            actorType: OWNER_TYPE.ADMIN,
            actorId: adminId || null,
            type: LEDGER_TRANSACTION_TYPE.COMPLAINT_LOGISTICS_PAID,
            direction: LEDGER_DIRECTION.DEBIT,
            amount,
            description: `Complaint ${complaintId}: logistics at fault, platform paid ₹${amount} now — recovery ticket ${complaint.recoveryTicketRef || "(none)"}`,
            reference: txnNo,
            metadata: {
              complaintId,
              sellerId: order.seller,
              culprit: complaint.culprit,
              recoveryTicketRef: complaint.recoveryTicketRef || "",
            },
          },
          { session },
        );
        // Not deducted from platformTotalEarning here — BRD says this is paid
        // now and recovered later via the logistics partner, not a permanent
        // platform loss like the PLATFORM-fault case above.
      }

      await writeEvent(session, complaint, {
        actorId: adminId,
        actorRole: "admin",
        action: "refunded",
        fromStatus: complaint.status,
        toStatus: COMPLAINT_STATUS.REFUNDED,
        note: `Refund ₹${amount} · ${txnNo}`,
        meta: { amount, txnNo, culprit: complaint.culprit },
        ctx,
      });
      await Complaint.updateOne(
        { _id: complaint._id },
        { $set: { status: COMPLAINT_STATUS.REFUNDED, refundTxnNo: txnNo, refundedAt: new Date() } },
        { session },
      );

      afterCommit.push(() =>
        emitNotificationEvent(NOTIFICATION_EVENTS.COMPLAINT_REFUNDED, {
          orderId: order.orderId,
          complaintId,
          status: COMPLAINT_STATUS.REFUNDED,
          userId: complaint.customer,
          customerId: complaint.customer,
          amount,
          txnNo,
        }),
      );
    });
  } finally {
    await session.endSession();
  }
  for (const fn of afterCommit) await fn();
  return Complaint.findById(complaint._id).lean();
}

// --------------------------- close -----------------------------------------

export async function closeComplaint({ complaintId, adminId, summary, ctx = {} }) {
  const complaint = await Complaint.findOne({ complaintId });
  if (!complaint) throw httpError("Complaint not found", 404);
  if (complaint.submitType !== COMPLAINT_SUBMIT_TYPE.COMPLAINT) {
    throw httpError("Use acknowledge for feedback", 400);
  }
  if (!complaint.culprit) throw httpError("Name a culprit before closing", 400);
  const finalSummary = String(summary || "").trim().slice(0, 1000);
  if (!finalSummary) throw httpError("Write the final summary", 400);
  if (complaint.status === COMPLAINT_STATUS.CLOSED) throw httpError("Already closed", 409);
  // Everyone except a false-complaint customer must be refunded before closing.
  if (complaint.culprit !== COMPLAINT_CULPRIT.CUSTOMER && complaint.status !== COMPLAINT_STATUS.REFUNDED) {
    throw httpError("Refund the customer before closing", 409);
  }

  const config = await loadComplaintConfig();
  const order = await Order.findById(complaint.order);
  const session = await mongoose.startSession();
  const afterCommit = [];
  try {
    await session.withTransaction(async () => {
      assertTransition(complaint.status, COMPLAINT_STATUS.CLOSED);
      await writeEvent(session, complaint, {
        actorId: adminId,
        actorRole: "admin",
        action: "closed",
        fromStatus: complaint.status,
        toStatus: COMPLAINT_STATUS.CLOSED,
        note: `Closed · culprit ${complaint.culprit} · ${finalSummary}`,
        meta: { culprit: complaint.culprit },
        ctx,
      });
      await Complaint.updateOne(
        { _id: complaint._id },
        {
          $set: {
            status: COMPLAINT_STATUS.CLOSED,
            summary: finalSummary,
            closedAt: new Date(),
            closedBy: adminId,
            settlementHeld: false,
          },
        },
        { session },
      );

      // Release the settlement hold now the complaint is closed.
      if (order) {
        const release = releaseSettlementUpdate(order, config.windowHours);
        if (Object.keys(release).length) {
          await Order.updateOne({ _id: order._id }, { $set: release }, { session });
        }
      }

      if (order) {
        afterCommit.push(() =>
          emitNotificationEvent(NOTIFICATION_EVENTS.COMPLAINT_CLOSED, {
            orderId: order.orderId,
            complaintId,
            status: COMPLAINT_STATUS.CLOSED,
            userId: complaint.customer,
            customerId: complaint.customer,
            summary: finalSummary,
          }),
        );
      }
    });
  } finally {
    await session.endSession();
  }
  for (const fn of afterCommit) await fn();
  return Complaint.findById(complaint._id).lean();
}

// --------------------------- reads -----------------------------------------

export async function getComplaintById(complaintId) {
  const complaint = await Complaint.findOne({ complaintId }).lean();
  if (!complaint) throw httpError("Complaint not found", 404);
  const [items, events, calls] = await Promise.all([
    ComplaintItem.find({ complaint: complaint._id }).lean(),
    ComplaintEvent.find({ complaint: complaint._id }).sort({ createdAt: 1 }).lean(),
    CallLog.find({ complaint: complaint._id }).sort({ createdAt: -1 }).lean(),
  ]);
  return { complaint, items, events, calls };
}

export async function getComplaintByOrder(orderId) {
  orderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId }).select("complaintRef").lean();
  if (!order?.complaintRef) return null;
  const complaint = await Complaint.findById(order.complaintRef).lean();
  if (!complaint) return null;
  return getComplaintById(complaint.complaintId);
}

export async function listComplaints({ status, submitType, sellerId, overdue, open, createdAfter, page = 1, limit = 20 } = {}) {
  const query = {};
  if (String(open) === "true") {
    query.status = { $in: OPEN_COMPLAINT_STATUSES };
    query.submitType = COMPLAINT_SUBMIT_TYPE.COMPLAINT;
  } else if (status) query.status = status;
  if (submitType) query.submitType = submitType;
  if (sellerId) query.seller = sellerId;
  if (String(overdue) === "true") query.isOverdue = true;
  if (createdAfter) {
    const seenAt = new Date(createdAfter);
    if (!Number.isNaN(seenAt.getTime())) query.createdAt = { $gt: seenAt };
  }
  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Complaint.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    Complaint.countDocuments(query),
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
}

// --------------------------- SLA sweep (background job) ---------------------

/**
 * Daily sweep: day-5 alert to Admin/Owner, OVERDUE flag after day 7.
 * Returns counts for logging. Safe to run repeatedly (idempotent via the
 * day5AlertSentAt / isOverdue guards).
 */
export async function runComplaintSlaSweep({ now = new Date() } = {}) {
  const config = await loadComplaintConfig();
  const adminIds = await getAdminIds();
  let day5Alerts = 0;
  let overdueFlags = 0;

  // OVERDUE: open complaints past dueAt and not yet flagged.
  const overdueCursor = Complaint.find({
    submitType: COMPLAINT_SUBMIT_TYPE.COMPLAINT,
    status: { $in: OPEN_COMPLAINT_STATUSES },
    isOverdue: false,
    dueAt: { $lt: now },
  }).cursor();
  for await (const c of overdueCursor) {
    await Complaint.updateOne({ _id: c._id }, { $set: { isOverdue: true, overdueAt: now } });
    overdueFlags += 1;
    if (adminIds.length) {
      emitNotificationEvent(NOTIFICATION_EVENTS.COMPLAINT_OVERDUE_ALERT, {
        orderId: c.orderPublicId,
        complaintId: c.complaintId,
        adminIds,
        overdue: true,
      });
    }
  }

  // Day-5 alert: open complaints whose age >= day5AlertDay and not yet alerted.
  if (config.day5AlertEnabled) {
    const day5Threshold = new Date(now.getTime() - config.day5AlertDay * 24 * 3600 * 1000);
    const day5Cursor = Complaint.find({
      submitType: COMPLAINT_SUBMIT_TYPE.COMPLAINT,
      status: { $in: OPEN_COMPLAINT_STATUSES },
      day5AlertSentAt: null,
      openedAt: { $lte: day5Threshold },
    }).cursor();
    for await (const c of day5Cursor) {
      await Complaint.updateOne({ _id: c._id }, { $set: { day5AlertSentAt: now } });
      day5Alerts += 1;
      if (adminIds.length) {
        emitNotificationEvent(NOTIFICATION_EVENTS.COMPLAINT_OVERDUE_ALERT, {
          orderId: c.orderPublicId,
          complaintId: c.complaintId,
          adminIds,
          overdue: false,
        });
      }
    }
  }

  return { day5Alerts, overdueFlags };
}
