// Complaint Window constants per the Seller Settlement + Complaint Window BRD
// and the "Complaint ticket – status machine" flow chart.
//
// A delivered order opens a 24h complaint window (configurable via
// Setting.complaint.windowHours). Within it a customer submits either FEEDBACK
// (no hold, no refund) or a COMPLAINT (ticket C-xxxx, 7-day SLA, settlement held).
// Only Admin closes, with at least one named culprit and a final summary.

// Was it submitted as plain feedback or as a formal complaint?
export const COMPLAINT_SUBMIT_TYPE = {
  FEEDBACK: "feedback",
  COMPLAINT: "complaint",
};

// Ticket status machine. OVERDUE is a *flag* on an open ticket past day 7,
// not a status — see Complaint.isOverdue / dueAt.
export const COMPLAINT_STATUS = {
  NEW: "NEW",
  UNDER_REVIEW: "UNDER_REVIEW",
  CALL_DONE: "CALL_DONE",
  ASSIGNED: "ASSIGNED",
  SELLER_APPROVED: "SELLER_APPROVED",
  SELLER_REJECTED: "SELLER_REJECTED",
  REFUNDED: "REFUNDED",
  CLOSED: "CLOSED",
};

// Terminal + open sets for guards.
export const OPEN_COMPLAINT_STATUSES = [
  COMPLAINT_STATUS.NEW,
  COMPLAINT_STATUS.UNDER_REVIEW,
  COMPLAINT_STATUS.CALL_DONE,
  COMPLAINT_STATUS.ASSIGNED,
  COMPLAINT_STATUS.SELLER_APPROVED,
  COMPLAINT_STATUS.SELLER_REJECTED,
  COMPLAINT_STATUS.REFUNDED,
];

// Allowed transitions. Each transition writes an append-only complaint_event
// in the SAME db transaction and sends the customer a message. Admin may
// reassign any number of times (ASSIGNED/SELLER_REJECTED -> ASSIGNED).
export const COMPLAINT_TRANSITIONS = {
  NEW: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["CALL_DONE"],
  CALL_DONE: ["ASSIGNED"],
  ASSIGNED: ["SELLER_APPROVED", "SELLER_REJECTED", "REFUNDED", "CLOSED"],
  SELLER_APPROVED: ["REFUNDED", "ASSIGNED"],
  SELLER_REJECTED: ["ASSIGNED"],
  REFUNDED: ["CLOSED"],
  CLOSED: [],
};

// Who Admin decides is responsible, and who pays:
//  - SELLER: deducted in the seller settlement, linked to the complaint number.
//  - RIDER_LOGISTICS: platform pays now, raises a recovery ticket.
//  - PLATFORM: paid from commission, order profit reduced.
//  - CUSTOMER: false complaint, no refund.
export const COMPLAINT_CULPRIT = {
  SELLER: "SELLER",
  RIDER_LOGISTICS: "RIDER_LOGISTICS",
  PLATFORM: "PLATFORM",
  CUSTOMER: "CUSTOMER",
};

// Per-product reasons (BRD CMP-06). "other" carries free text in reasonText.
export const COMPLAINT_REASON = {
  ITEM_SPOILED: "item_spoiled",
  ITEM_DELAYED: "item_delayed",
  ITEM_MISSING: "item_missing",
  WRONG_ITEM: "wrong_item",
  DAMAGED_PACKAGING: "damaged_packaging",
  SHORT_QUANTITY: "short_quantity",
  QUALITY_NOT_AS_SHOWN: "quality_not_as_shown",
  OVERCHARGED: "overcharged",
  RIDER_BEHAVIOUR: "rider_behaviour",
  NOT_DELIVERED: "not_delivered",
  OTHER: "other",
};

// Call-log outcomes (admin call to customer before routing/closing).
export const CALL_OUTCOME = {
  UNDERSTOOD_FACTS: "understood_facts",
  SETTLED_ON_CALL: "settled_on_call",
  NO_ANSWER: "no_answer",
  NEEDS_FOLLOW_UP: "needs_follow_up",
};

// Max photos per complained product (BRD CMP-07 / validation rule).
export const MAX_PHOTOS_PER_ITEM = 4;

export const ALL_COMPLAINT_SUBMIT_TYPES = Object.values(COMPLAINT_SUBMIT_TYPE);
export const ALL_COMPLAINT_STATUSES = Object.values(COMPLAINT_STATUS);
export const ALL_COMPLAINT_CULPRITS = Object.values(COMPLAINT_CULPRIT);
export const ALL_COMPLAINT_REASONS = Object.values(COMPLAINT_REASON);
export const ALL_CALL_OUTCOMES = Object.values(CALL_OUTCOME);
