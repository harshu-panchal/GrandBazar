import { jest } from "@jest/globals";

const profileFind = jest.fn();
const assignmentAggregate = jest.fn().mockResolvedValue([]);

jest.unstable_mockModule("../app/models/guestCourierProfile.js", () => ({
  default: { find: profileFind },
}));
jest.unstable_mockModule("../app/models/guestCourierAssignment.js", () => ({
  default: { aggregate: assignmentAggregate },
}));

const { searchGuestCourierDirectory } = await import("../app/services/guestCourierDirectoryService.js");

test("seller courier search uses only that seller's assignment history", async () => {
  const storeId = "507f1f77bcf86cd799439011";
  await searchGuestCourierDirectory("999", 10, [storeId]);

  expect(profileFind).not.toHaveBeenCalled();
  const pipeline = assignmentAggregate.mock.calls[0][0];
  expect(pipeline).toEqual(expect.arrayContaining([
    expect.objectContaining({ $match: { "scopedOrder.seller": { $in: [expect.anything()] } } }),
  ]));
  expect(String(pipeline.find((stage) => stage.$match?.["scopedOrder.seller"]).$match["scopedOrder.seller"].$in[0])).toBe(storeId);
});
