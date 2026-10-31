import { buildCustomerComplaintTimeline } from "../app/controller/complaintController.js";

describe("customer complaint timeline", () => {
  test("maps the internal audit trail to deduplicated public milestones", () => {
    const timeline = buildCustomerComplaintTimeline({
      complaint: {
        status: "CLOSED",
        openedAt: "2026-10-01T10:00:00.000Z",
        closedAt: "2026-10-02T10:00:00.000Z",
      },
      events: [
        { toStatus: "NEW", createdAt: "2026-10-01T10:00:00.000Z", note: "private" },
        { toStatus: "UNDER_REVIEW", createdAt: "2026-10-01T11:00:00.000Z" },
        { toStatus: "CALL_DONE", createdAt: "2026-10-01T12:00:00.000Z" },
        { toStatus: "ASSIGNED", createdAt: "2026-10-01T13:00:00.000Z" },
        { toStatus: "SELLER_APPROVED", createdAt: "2026-10-01T14:00:00.000Z" },
        { toStatus: "REFUNDED", createdAt: "2026-10-01T15:00:00.000Z" },
        { toStatus: "CLOSED", createdAt: "2026-10-02T10:00:00.000Z" },
      ],
    });

    expect(timeline.map(({ key }) => key)).toEqual([
      "RECEIVED",
      "UNDER_REVIEW",
      "CONTACTED",
      "IN_PROGRESS",
      "REFUNDED",
      "RESOLVED",
    ]);
    expect(timeline.every((entry) => Object.keys(entry).sort().join(",") === "at,key,label")).toBe(true);
  });

  test("adds the current milestone for migrated tickets with an incomplete ledger", () => {
    const timeline = buildCustomerComplaintTimeline({
      complaint: {
        status: "CLOSED",
        openedAt: "2026-10-01T10:00:00.000Z",
        closedAt: "2026-10-02T10:00:00.000Z",
      },
      events: [],
    });

    expect(timeline.map(({ key }) => key)).toEqual(["RECEIVED", "RESOLVED"]);
  });
});
