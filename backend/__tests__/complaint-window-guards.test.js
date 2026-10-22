import { jest } from "@jest/globals";

// Phase 2 — Complaint Window guard tests. These cover the BRD "Blocked"
// scenarios (and key routing guards) that are enforced BEFORE any DB
// transaction, so they can be verified with plain model mocks (no replica set).
//   Scenario 4: complaint at hour 25 -> blocked (window closed)
//   Scenario 8: close without a summary -> blocked
//   Scenario 9 (analogue): refund a false complaint / unapproved seller -> blocked
//   Routing: assign before a call log -> blocked

const mockOrderFindOne = jest.fn();
const mockOrderFindById = jest.fn();
const mockComplaintFindOne = jest.fn();

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { findOne: mockOrderFindOne, findById: mockOrderFindById, updateOne: jest.fn() },
}));
jest.unstable_mockModule("../app/models/complaint.js", () => ({
  default: { findOne: mockComplaintFindOne, create: jest.fn(), updateOne: jest.fn(), findById: jest.fn() },
}));
jest.unstable_mockModule("../app/models/complaintItem.js", () => ({ default: { create: jest.fn(), find: jest.fn() } }));
jest.unstable_mockModule("../app/models/complaintEvent.js", () => ({ default: { create: jest.fn(), find: jest.fn() } }));
jest.unstable_mockModule("../app/models/callLog.js", () => ({ default: { create: jest.fn(), find: jest.fn() } }));
jest.unstable_mockModule("../app/models/customer.js", () => ({ default: { updateOne: jest.fn() } }));
jest.unstable_mockModule("../app/models/admin.js", () => ({
  default: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
}));
jest.unstable_mockModule("../app/models/transaction.js", () => ({ default: { create: jest.fn() } }));
jest.unstable_mockModule("../app/models/setting.js", () => ({
  default: {
    findOne: () => ({
      select: () => ({ lean: async () => ({ complaint: { windowHours: 24, slaDays: 7 } }) }),
    }),
  },
}));
jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({
  requireCanonicalOrderId: jest.fn(async (id) => id),
}));
jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: jest.fn(),
}));

const {
  raiseComplaintOrFeedback,
  closeComplaint,
  refundCustomer,
  assignCulprit,
} = await import("../app/services/complaintService.js");

const CUSTOMER = "cust-1";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Complaint Window guards (BRD scenarios)", () => {
  test("Scenario 4: raising a complaint after the 24h window is blocked", async () => {
    mockOrderFindOne.mockResolvedValue({
      _id: "o1",
      orderId: "ORD1",
      customer: CUSTOMER,
      deliveredAt: new Date(Date.now() - 25 * 3600 * 1000), // 25h ago
      complaintWindowClosesAt: new Date(Date.now() - 1 * 3600 * 1000), // closed 1h ago
      items: [{ _id: "i1", name: "Milk", price: 50, quantity: 1 }],
    });

    await expect(
      raiseComplaintOrFeedback({
        orderId: "ORD1",
        customerId: CUSTOMER,
        submitType: "complaint",
        items: [{ orderItemId: "i1", reason: "item_spoiled" }],
      }),
    ).rejects.toThrow(/window has closed/i);
  });

  test("raising within the window + wrong customer is blocked (ownership)", async () => {
    mockOrderFindOne.mockResolvedValue({
      _id: "o1",
      orderId: "ORD1",
      customer: "someone-else",
      deliveredAt: new Date(),
      complaintWindowClosesAt: new Date(Date.now() + 10 * 3600 * 1000),
      items: [{ _id: "i1", name: "Milk", price: 50, quantity: 1 }],
    });
    await expect(
      raiseComplaintOrFeedback({
        orderId: "ORD1",
        customerId: CUSTOMER,
        submitType: "complaint",
        items: [{ orderItemId: "i1", reason: "item_spoiled" }],
      }),
    ).rejects.toThrow(/your own order/i);
  });

  test("Scenario 8: closing without a final summary is blocked", async () => {
    mockComplaintFindOne.mockResolvedValue({
      _id: "c1",
      complaintId: "C-0001",
      submitType: "complaint",
      culprit: "SELLER",
      status: "REFUNDED",
      sellerDecision: { decision: "approved" },
    });
    await expect(
      closeComplaint({ complaintId: "C-0001", adminId: "a1", summary: "   " }),
    ).rejects.toThrow(/final summary/i);
  });

  test("closing without a named culprit is blocked", async () => {
    mockComplaintFindOne.mockResolvedValue({
      _id: "c1",
      complaintId: "C-0001",
      submitType: "complaint",
      culprit: null,
      status: "CALL_DONE",
    });
    await expect(
      closeComplaint({ complaintId: "C-0001", adminId: "a1", summary: "done" }),
    ).rejects.toThrow(/culprit/i);
  });

  test("Scenario 9 analogue: a false complaint (customer at fault) gets no refund", async () => {
    mockComplaintFindOne.mockResolvedValue({
      _id: "c1",
      complaintId: "C-0001",
      culprit: "CUSTOMER",
      status: "ASSIGNED",
      amount: 0,
    });
    await expect(refundCustomer({ complaintId: "C-0001", adminId: "a1" })).rejects.toThrow(
      /no refund/i,
    );
  });

  test("refunding a seller-fault complaint before the seller approves is blocked", async () => {
    mockComplaintFindOne.mockResolvedValue({
      _id: "c1",
      complaintId: "C-0001",
      culprit: "SELLER",
      status: "ASSIGNED",
      amount: 0,
      sellerDecision: { decision: null },
    });
    await expect(refundCustomer({ complaintId: "C-0001", adminId: "a1" })).rejects.toThrow(
      /seller must approve/i,
    );
  });

  test("assigning a culprit before a call log is blocked", async () => {
    mockComplaintFindOne.mockResolvedValue({
      _id: "c1",
      complaintId: "C-0001",
      status: "NEW", // no call logged yet
    });
    await expect(
      assignCulprit({ complaintId: "C-0001", adminId: "a1", culprit: "SELLER" }),
    ).rejects.toThrow(/log a call/i);
  });
});
