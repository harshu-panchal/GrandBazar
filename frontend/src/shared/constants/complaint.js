// Shared labels for the Complaint Window UI (mirrors backend constants/complaint.js).

export const COMPLAINT_REASONS = [
  { value: "item_spoiled", label: "Item spoiled" },
  { value: "item_delayed", label: "Item delayed" },
  { value: "item_missing", label: "Item missing" },
  { value: "wrong_item", label: "Wrong item sent" },
  { value: "damaged_packaging", label: "Damaged or leaked packaging" },
  { value: "short_quantity", label: "Short quantity or weight" },
  { value: "quality_not_as_shown", label: "Quality not as shown" },
  { value: "overcharged", label: "Overcharged price" },
  { value: "rider_behaviour", label: "Rider behaviour" },
  { value: "not_delivered", label: "Order not delivered" },
  { value: "other", label: "Other (type below)" },
];

export const COMPLAINT_STATUS_LABEL = {
  NEW: "New",
  UNDER_REVIEW: "Under review",
  CALL_DONE: "Call done",
  ASSIGNED: "Assigned",
  SELLER_APPROVED: "Seller approved",
  SELLER_REJECTED: "Seller rejected",
  REFUNDED: "Refunded",
  CLOSED: "Closed",
};

// Simple, customer-facing steps (hides the internal back-and-forth — CMP-18).
export const CUSTOMER_STEPS = ["New", "Call done", "Assigned", "Refunded", "Closed"];

export const CUSTOMER_STATUS_STEP = {
  NEW: 0,
  UNDER_REVIEW: 0,
  CALL_DONE: 1,
  ASSIGNED: 2,
  SELLER_APPROVED: 2,
  SELLER_REJECTED: 2,
  REFUNDED: 3,
  CLOSED: 4,
};

export const CULPRITS = [
  { value: "SELLER", label: "Seller" },
  { value: "RIDER_LOGISTICS", label: "Rider / Logistics" },
  { value: "PLATFORM", label: "Platform" },
  { value: "CUSTOMER", label: "Customer (false complaint)" },
];

export const CALL_OUTCOMES = [
  { value: "understood_facts", label: "Called and understood facts" },
  { value: "settled_on_call", label: "Called and settled" },
  { value: "no_answer", label: "No answer" },
  { value: "needs_follow_up", label: "Needs follow-up" },
];
