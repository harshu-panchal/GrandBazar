import { jest } from "@jest/globals";

const mockStoreFindById = jest.fn();
const mockStoreFindByIdAndUpdate = jest.fn();
const mockCityFind = jest.fn();
const mockCityFindOne = jest.fn();
const mockUpsertCityCommission = jest.fn();
const mockHandleResponse = jest.fn();

jest.unstable_mockModule("../app/models/store.js", () => ({
  default: {
    findById: mockStoreFindById,
    findByIdAndUpdate: mockStoreFindByIdAndUpdate,
  },
}));

jest.unstable_mockModule("../app/models/cityCommission.js", () => ({
  default: {
    find: mockCityFind,
    findOne: mockCityFindOne,
  },
}));

jest.unstable_mockModule("../app/services/cityCommissionService.js", () => ({
  normalizeCityKey: (v) => String(v || "").trim().toLowerCase(),
  normalizeCommissionPayload: (payload = {}) => payload,
  upsertCityCommission: mockUpsertCityCommission,
}));

jest.unstable_mockModule("../app/utils/helper.js", () => ({
  default: mockHandleResponse,
}));

const {
  getStoreCommission,
  updateStoreCommission,
  listCityCommissions,
  getCityCommission,
  upsertCityCommissionController,
} = await import("../app/controller/admin/commissionHierarchyController.js");

describe("commission hierarchy controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("gets store commission", async () => {
    mockStoreFindById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439011",
        shopName: "Shop A",
        city: "Indore",
        applyCommission: true,
        adminCommissionType: "percentage",
        adminCommissionValue: 8,
      }),
    });
    await getStoreCommission({ params: { id: "507f1f77bcf86cd799439011" } }, {});
    expect(mockHandleResponse).toHaveBeenCalledWith(
      expect.anything(),
      200,
      "Store commission fetched",
      expect.objectContaining({ shopName: "Shop A" }),
    );
  });

  test("upserts city commission", async () => {
    mockUpsertCityCommission.mockResolvedValue({ cityKey: "indore", adminCommissionValue: 5 });
    await upsertCityCommissionController(
      { params: { cityKey: "indore" }, body: { adminCommissionValue: 5 }, user: { id: "507f1f77bcf86cd799439012" } },
      {},
    );
    expect(mockUpsertCityCommission).toHaveBeenCalled();
    expect(mockHandleResponse).toHaveBeenCalledWith(
      expect.anything(),
      200,
      "City commission upserted",
      expect.objectContaining({ cityKey: "indore" }),
    );
  });

  test("lists city commissions", async () => {
    mockCityFind.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ cityKey: "indore" }]),
    });
    await listCityCommissions({ query: {} }, {});
    expect(mockHandleResponse).toHaveBeenCalledWith(
      expect.anything(),
      200,
      "City commissions fetched",
      expect.any(Array),
    );
  });

  test("updates store commission", async () => {
    mockStoreFindByIdAndUpdate.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: "507f1f77bcf86cd799439011",
        shopName: "Shop A",
        city: "Indore",
        applyCommission: true,
        adminCommissionType: "fixed",
        adminCommissionValue: 20,
        adminCommissionFixedRule: "per_qty",
      }),
    });
    await updateStoreCommission(
      {
        params: { id: "507f1f77bcf86cd799439011" },
        body: {
          applyCommission: true,
          adminCommissionType: "fixed",
          adminCommissionValue: 20,
          adminCommissionFixedRule: "per_qty",
        },
      },
      {},
    );
    expect(mockHandleResponse).toHaveBeenCalledWith(
      expect.anything(),
      200,
      "Store commission updated",
      expect.any(Object),
    );
  });

  test("gets city commission by key", async () => {
    mockCityFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ cityKey: "indore" }),
    });
    await getCityCommission({ params: { cityKey: "indore" } }, {});
    expect(mockHandleResponse).toHaveBeenCalledWith(
      expect.anything(),
      200,
      "City commission fetched",
      expect.objectContaining({ cityKey: "indore" }),
    );
  });
});
