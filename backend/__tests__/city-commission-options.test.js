import { jest } from "@jest/globals";

const mockAggregate = jest.fn();
const mockStoreCount = jest.fn();
const mockRatesFind = jest.fn();
const mockRateFindOne = jest.fn();
const mockRateDeleteOne = jest.fn();
const mockHandleResponse = jest.fn();
const mockEnqueueRecalcByCity = jest.fn();
const mockAudit = jest.fn();

jest.unstable_mockModule("../app/models/store.js", () => ({
  default: { aggregate: mockAggregate, countDocuments: mockStoreCount },
}));
jest.unstable_mockModule("../app/models/cityCommission.js", () => ({
  default: { find: mockRatesFind, findOne: mockRateFindOne, deleteOne: mockRateDeleteOne },
}));
jest.unstable_mockModule("../app/utils/helper.js", () => ({
  default: mockHandleResponse,
  handleResponse: mockHandleResponse,
}));
jest.unstable_mockModule("../app/services/auditTrailService.js", () => ({
  recordAuditLog: mockAudit,
}));
jest.unstable_mockModule("../app/queues/pricingQueueProcessors.js", () => ({
  enqueueRecalcBySeller: jest.fn(),
  enqueueRecalcByCity: mockEnqueueRecalcByCity,
}));

const { listCityCommissionOptions, deleteCityCommission } = await import(
  "../app/controller/admin/commissionHierarchyController.js"
);

const lastResponse = () => mockHandleResponse.mock.calls.at(-1);

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreCount.mockResolvedValue(0);
  mockRatesFind.mockReturnValue({ select: () => ({ lean: async () => [] }) });
});

describe("listCityCommissionOptions", () => {
  test("merges spelling variants into one city, counts shops, flags existing rates", async () => {
    mockAggregate.mockResolvedValue([
      { _id: "Indore", count: 2 },
      { _id: "indore", count: 1 },
      { _id: " Ratlam ", count: 1 },
    ]);
    mockStoreCount.mockResolvedValue(13);
    mockRatesFind.mockReturnValue({ select: () => ({ lean: async () => [{ cityKey: "indore" }] }) });

    await listCityCommissionOptions({}, {});

    const [, status, , data] = lastResponse();
    expect(status).toBe(200);
    expect(data.shopsWithoutCity).toBe(13);
    expect(data.cities).toEqual([
      { cityKey: "indore", cityName: "Indore", shopCount: 3, hasRate: true },
      { cityKey: "ratlam", cityName: "Ratlam", shopCount: 1, hasRate: false },
    ]);
  });

  test("ignores blank cities", async () => {
    mockAggregate.mockResolvedValue([{ _id: "  ", count: 4 }]);
    await listCityCommissionOptions({}, {});
    expect(lastResponse()[3].cities).toEqual([]);
  });
});

describe("deleteCityCommission", () => {
  test("deletes the rate, audits it, and recalculates that city's prices", async () => {
    mockRateFindOne.mockReturnValue({ lean: async () => ({ _id: "r1", cityKey: "452020" }) });
    await deleteCityCommission({ params: { cityKey: "452020" }, user: { id: "admin1" } }, {});
    expect(mockRateDeleteOne).toHaveBeenCalledWith({ cityKey: "452020" });
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "CITY_COMMISSION_DELETED" }));
    expect(mockEnqueueRecalcByCity).toHaveBeenCalledWith("452020");
    expect(lastResponse()[1]).toBe(200);
  });

  test("404 when the rate doesn't exist", async () => {
    mockRateFindOne.mockReturnValue({ lean: async () => null });
    await deleteCityCommission({ params: { cityKey: "nowhere" } }, {});
    expect(lastResponse()[1]).toBe(404);
    expect(mockRateDeleteOne).not.toHaveBeenCalled();
  });
});
