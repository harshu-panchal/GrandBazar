import { jest } from "@jest/globals";

// Follow-up audit fixes (CMP-15 / BRD section 9): refunding a complaint where
// the platform or logistics is at fault must post a tagged ledger entry, and
// a PLATFORM-fault refund must reduce the order's recorded platform earning.
// Also: logCall must notify the customer (CMP-19 "every status change").

const mockCreateLedgerEntry = jest.fn(async () => ({}));
const mockOrderUpdateOne = jest.fn(async () => ({}));
const mockEmitNotificationEvent = jest.fn();
const mockComplaintFindOne = jest.fn();
const mockComplaintUpdateOne = jest.fn(async () => ({}));
const mockOrderFindById = jest.fn();

function fakeSession() {
  return {
    withTransaction: async (fn) => fn(),
    endSession: async () => {},
  };
}

// Supports every call shape the service code uses against the SAME
// Order/Complaint.findById mock: a plain `await Model.findById(x)`
// (refundCustomer) and a chained `.select(...).lean()` (logCall, the final
// `Complaint.findById(...).lean()` every exported function returns).
function chainable(value) {
  return {
    select: () => chainable(value),
    lean: async () => value,
    then: (resolve) => resolve(value),
  };
}
const mockComplaintFindById = jest.fn(() => chainable({ complaintId: "C-0001", status: "REFUNDED" }));

jest.unstable_mockModule("mongoose", () => ({
  default: { startSession: async () => fakeSession(), Types: { ObjectId: { isValid: () => true } } },
}));
jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findById: (...a) => mockOrderFindById(...a),
    updateOne: (...a) => mockOrderUpdateOne(...a),
  },
}));
jest.unstable_mockModule("../app/models/complaint.js", () => ({
  default: {
    findOne: (...a) => mockComplaintFindOne(...a),
    updateOne: (...a) => mockComplaintUpdateOne(...a),
    findById: (...a) => mockComplaintFindById(...a),
  },
}));
jest.unstable_mockModule("../app/models/complaintItem.js", () => ({ default: { create: jest.fn() } }));
jest.unstable_mockModule("../app/models/complaintEvent.js", () => ({ default: { create: jest.fn() } }));
jest.unstable_mockModule("../app/models/callLog.js", () => ({ default: { create: jest.fn() } }));
jest.unstable_mockModule("../app/models/customer.js", () => ({ default: { updateOne: jest.fn() } }));
jest.unstable_mockModule("../app/models/admin.js", () => ({
  default: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
}));
jest.unstable_mockModule("../app/models/transaction.js", () => ({ default: { create: jest.fn() } }));
jest.unstable_mockModule("../app/models/setting.js", () => ({
  default: { findOne: () => ({ select: () => ({ lean: async () => ({ complaint: {} }) }) }) },
}));
jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({ requireCanonicalOrderId: async (id) => id }));
jest.unstable_mockModule("../app/utils/sequenceIds.js", () => ({ nextComplaintId: async () => "C-0001" }));
jest.unstable_mockModule("../app/services/finance/ledgerService.js", () => ({
  createLedgerEntry: (...a) => mockCreateLedgerEntry(...a),
}));
jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: (...a) => mockEmitNotificationEvent(...a),
}));

const { refundCustomer, logCall } = await import("../app/services/complaintService.js");

beforeEach(() => {
  jest.clearAllMocks();
  mockOrderFindById.mockImplementation(() =>
    chainable({ _id: "order-db-id", orderId: "ORD1", customer: "cust-1", seller: "seller-1" }),
  );
  mockComplaintFindById.mockImplementation(() => chainable({ complaintId: "C-0001", status: "REFUNDED" }));
});

describe("CMP-15 / section 9: complaint cost ledger posting", () => {
  test("platform at fault: posts a ledger entry AND reduces order platform earning", async () => {
    mockComplaintFindOne.mockResolvedValue({
      _id: "c1",
      complaintId: "C-0001",
      culprit: "PLATFORM",
      status: "ASSIGNED",
      amount: 50,
      customer: "cust-1",
      order: "order-db-id",
    });

    await refundCustomer({ complaintId: "C-0001", adminId: "admin-1" });

    expect(mockCreateLedgerEntry).toHaveBeenCalledTimes(1);
    const [entry] = mockCreateLedgerEntry.mock.calls[0];
    expect(entry.type).toBe("COMPLAINT_PLATFORM_PAID");
    expect(entry.direction).toBe("DEBIT");
    expect(entry.amount).toBe(50);
    expect(entry.metadata.complaintId).toBe("C-0001");

    // Platform earning on the order must be decremented by the same amount.
    const decUpdate = mockOrderUpdateOne.mock.calls.find(
      (c) => c[1]?.$inc?.["paymentBreakdown.platformTotalEarning"] != null,
    );
    expect(decUpdate).toBeTruthy();
    expect(decUpdate[1].$inc["paymentBreakdown.platformTotalEarning"]).toBe(-50);
  });

  test("logistics at fault: posts a ledger entry but does NOT touch platform earning", async () => {
    mockComplaintFindOne.mockResolvedValue({
      _id: "c2",
      complaintId: "C-0002",
      culprit: "RIDER_LOGISTICS",
      status: "ASSIGNED",
      amount: 30,
      customer: "cust-1",
      order: "order-db-id",
      recoveryTicketRef: "RT-99",
    });

    await refundCustomer({ complaintId: "C-0002", adminId: "admin-1" });

    expect(mockCreateLedgerEntry).toHaveBeenCalledTimes(1);
    const [entry] = mockCreateLedgerEntry.mock.calls[0];
    expect(entry.type).toBe("COMPLAINT_LOGISTICS_PAID");
    expect(entry.metadata.recoveryTicketRef).toBe("RT-99");

    const decUpdate = mockOrderUpdateOne.mock.calls.find(
      (c) => c[1]?.$inc?.["paymentBreakdown.platformTotalEarning"] != null,
    );
    expect(decUpdate).toBeFalsy();
  });

  test("seller at fault: no ledger entry posted here (handled via sellerDecision's deduction)", async () => {
    mockComplaintFindOne.mockResolvedValue({
      _id: "c3",
      complaintId: "C-0003",
      culprit: "SELLER",
      status: "ASSIGNED",
      amount: 20,
      customer: "cust-1",
      order: "order-db-id",
      sellerDecision: { decision: "approved" },
    });

    await refundCustomer({ complaintId: "C-0003", adminId: "admin-1" });

    expect(mockCreateLedgerEntry).not.toHaveBeenCalled();
  });
});

describe("CMP-19: a message goes to the customer on every status change", () => {
  test("logging a call (NEW -> CALL_DONE) notifies the customer", async () => {
    mockComplaintFindOne.mockResolvedValue({
      _id: "c4",
      complaintId: "C-0004",
      submitType: "complaint",
      status: "NEW",
      order: "order-db-id",
    });

    await logCall({ complaintId: "C-0004", adminId: "admin-1", outcome: "understood_facts", facts: "Customer said the item was spoiled." });

    const call = mockEmitNotificationEvent.mock.calls.find(([event]) => event === "COMPLAINT_UPDATE");
    expect(call).toBeTruthy();
    expect(call[1].orderId).toBe("ORD1");
    expect(call[1].customerId).toBe("cust-1");
  });
});
