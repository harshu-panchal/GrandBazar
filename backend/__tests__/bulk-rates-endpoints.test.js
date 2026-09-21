import { jest } from "@jest/globals";

const mockUpdateMany = jest.fn();
const mockProductFind = jest.fn();
const mockProductUpdateOne = jest.fn();
const mockProductUpdateMany = jest.fn();
const mockProductFindOne = jest.fn();
const mockProductCreate = jest.fn();
const mockCatalogFindById = jest.fn();
const mockCatalogUpdateMany = jest.fn();
const mockInvalidate = jest.fn();
const mockHandleResponse = jest.fn();
const mockEnqueueRecalc = jest.fn();
const mockEnqueueIndex = jest.fn();
const mockComputePrice = jest.fn();

jest.unstable_mockModule("../app/models/category.js", () => ({
  default: { updateMany: mockUpdateMany },
}));
jest.unstable_mockModule("../app/models/catalogProduct.js", () => ({
  default: { updateMany: mockCatalogUpdateMany, findById: mockCatalogFindById },
}));
jest.unstable_mockModule("../app/models/product.js", () => ({
  default: { find: mockProductFind, updateOne: mockProductUpdateOne, updateMany: mockProductUpdateMany, findOne: mockProductFindOne, create: mockProductCreate },
}));
const realHelper = await import("../app/utils/helper.js");
jest.unstable_mockModule("../app/utils/helper.js", () => ({ ...realHelper, handleResponse: mockHandleResponse, default: mockHandleResponse }));
const realCache = await import("../app/services/cacheService.js");
jest.unstable_mockModule("../app/services/cacheService.js", () => ({
  ...realCache,
  buildKey: jest.fn((...parts) => parts.join(":")),
  getOrSet: jest.fn(),
  getTTL: jest.fn(),
  invalidate: mockInvalidate,
}));
const realEntityNameCache = await import("../app/services/entityNameCache.js");
jest.unstable_mockModule("../app/services/entityNameCache.js", () => ({
  ...realEntityNameCache,
  invalidateCategoryName: jest.fn().mockResolvedValue(undefined),
}));
jest.unstable_mockModule("../app/queues/pricingQueueProcessors.js", () => ({
  enqueueRecalcByCategory: mockEnqueueRecalc,
}));
const realSearchSync = await import("../app/services/searchSyncService.js");
jest.unstable_mockModule("../app/services/searchSyncService.js", () => ({
  ...realSearchSync,
  enqueueProductIndex: mockEnqueueIndex,
  enqueueProductRemoval: jest.fn(),
}));
const realCustomerPrice = await import("../app/services/finance/customerPriceService.js");
jest.unstable_mockModule("../app/services/finance/customerPriceService.js", () => ({
  ...realCustomerPrice,
  PRICE_AFFECTING_FIELDS: ["applyCommission", "adminCommission", "adminCommissionType", "adminCommissionValue"],
  computeCustomerPriceFieldsForWrite: mockComputePrice,
}));

const { bulkUpdateCategoryCharges } = await import("../app/controller/categoryController.js");
const { bulkUpdateProductsAdmin } = await import("../app/controller/productController.js");
const { bulkUpdateCatalogCommission, claimCatalogProduct, bulkClaimCatalogProducts } = await import("../app/controller/catalogController.js");

const ID_A = "507f1f77bcf86cd799439011";
const ID_B = "507f1f77bcf86cd799439012";
const lastResponse = () => mockHandleResponse.mock.calls.at(-1);

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateMany.mockResolvedValue({ matchedCount: 2, modifiedCount: 2 });
  mockInvalidate.mockResolvedValue(undefined);
  mockEnqueueRecalc.mockResolvedValue(undefined);
  mockEnqueueIndex.mockResolvedValue(undefined);
  mockComputePrice.mockResolvedValue({ customerPrice: 123 });
  mockProductUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  mockProductUpdateMany.mockResolvedValue({ modifiedCount: 3 });
  mockProductFindOne.mockResolvedValue(null);
  mockProductCreate.mockImplementation(async (doc) => ({ _id: "new-product", ...doc }));
  mockCatalogFindById.mockResolvedValue({
    _id: ID_A,
    name: "Cola",
    status: "active",
    variants: [
      { name: "250ml", weight: "250ml", sku: "cola-1" },
      { name: "500ml", weight: "500ml", sku: "cola-2" },
      { name: "1L", weight: "1L", sku: "cola-3" },
    ],
  });
  mockCatalogUpdateMany.mockResolvedValue({ matchedCount: 2, modifiedCount: 2 });
  mockProductFind.mockReturnValue({
    lean: async () => [
      { _id: ID_A, name: "A", sellerId: "s1" },
      { _id: ID_B, name: "B", sellerId: "s1" },
    ],
  });
});

describe("bulkUpdateCategoryCharges", () => {
  test("writes only the fields sent, keeping legacy + canonical commission in sync", async () => {
    await bulkUpdateCategoryCharges(
      { body: { ids: [ID_A, ID_B], applyCommission: true, adminCommission: 12, gstSlab: 5 } },
      {},
    );
    expect(mockUpdateMany).toHaveBeenCalledWith(
      { _id: { $in: [ID_A, ID_B] } },
      {
        $set: {
          applyCommission: true,
          adminCommissionType: "percentage",
          adminCommission: 12,
          adminCommissionValue: 12,
          gstSlab: 5,
        },
      },
    );
    expect(lastResponse()[1]).toBe(200);
  });

  test("status-only update does not touch commission or trigger a price recalc", async () => {
    await bulkUpdateCategoryCharges({ body: { ids: [ID_A], status: "inactive" } }, {});
    expect(mockUpdateMany).toHaveBeenCalledWith({ _id: { $in: [ID_A] } }, { $set: { status: "inactive" } });
    expect(mockEnqueueRecalc).not.toHaveBeenCalled();
  });

  test("blank fee means 0 and is written as a fixed fee", async () => {
    await bulkUpdateCategoryCharges({ body: { ids: [ID_A], handlingFees: "" } }, {});
    expect(mockUpdateMany.mock.calls[0][1].$set).toEqual({
      handlingFees: 0,
      handlingFeeValue: 0,
      handlingFeeType: "fixed",
    });
  });

  test.each([
    [{ ids: [], status: "active" }, "empty selection"],
    [{ ids: ["nope"], status: "active" }, "bad id"],
    [{ ids: [ID_A], status: "paused" }, "bad status"],
    [{ ids: [ID_A], applyCommission: true, adminCommission: 150 }, "commission over 100"],
    [{ ids: [ID_A], applyCommission: true }, "commission missing"],
    [{ ids: [ID_A], handlingFees: -1 }, "negative fee"],
    [{ ids: [ID_A], gstSlab: 7 }, "invalid GST slab"],
    [{ ids: [ID_A] }, "nothing to update"],
  ])("rejects %j (%s)", async (body) => {
    await bulkUpdateCategoryCharges({ body }, {});
    expect(lastResponse()[1]).toBe(400);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

describe("bulkUpdateProductsAdmin", () => {
  test("commission change recomputes customerPrice per product and re-indexes", async () => {
    await bulkUpdateProductsAdmin(
      { body: { ids: [ID_A, ID_B], applyCommission: true, adminCommission: 8, adminCommissionType: "percentage" } },
      {},
    );
    expect(mockComputePrice).toHaveBeenCalledTimes(2);
    expect(mockProductUpdateOne).toHaveBeenCalledWith(
      { _id: ID_A },
      {
        $set: {
          applyCommission: true,
          adminCommission: 8,
          adminCommissionValue: 8,
          adminCommissionType: "percentage",
          customerPrice: 123,
        },
      },
    );
    expect(mockEnqueueIndex).toHaveBeenCalledTimes(2);
    expect(lastResponse()[1]).toBe(200);
  });

  test("status-only update never touches commission fields or prices", async () => {
    await bulkUpdateProductsAdmin({ body: { ids: [ID_A], status: "inactive" } }, {});
    expect(mockComputePrice).not.toHaveBeenCalled();
    expect(mockProductUpdateOne.mock.calls[0][1]).toEqual({ $set: { status: "inactive" } });
  });

  test("null clears the GST and packaging overrides", async () => {
    await bulkUpdateProductsAdmin(
      { body: { ids: [ID_A], gstSlabOverride: null, packagingCharge: "" } },
      {},
    );
    expect(mockProductUpdateOne.mock.calls[0][1]).toEqual({
      $set: { gstSlabOverride: null, packagingCharge: null },
    });
    expect(mockComputePrice).not.toHaveBeenCalled();
  });

  test.each([
    [{ ids: [ID_A], gstSlabOverride: 9 }, "invalid GST slab"],
    [{ ids: [ID_A], packagingCharge: -5 }, "negative packaging"],
    [{ ids: [ID_A], applyCommission: true, adminCommission: 101 }, "percentage over 100"],
    [{ ids: [ID_A], status: "draft" }, "bad status"],
    [{ ids: [ID_A] }, "nothing to update"],
  ])("rejects %j (%s)", async (body) => {
    await bulkUpdateProductsAdmin({ body }, {});
    expect(lastResponse()[1]).toBe(400);
    expect(mockProductUpdateOne).not.toHaveBeenCalled();
  });
});

describe("bulkUpdateCatalogCommission", () => {
  test("sets commission on catalogue items and propagates it to claimed seller products", async () => {
    await bulkUpdateCatalogCommission(
      { body: { ids: [ID_A, ID_B], applyCommission: true, adminCommission: 7 } },
      {},
    );
    const expected = {
      $set: {
        applyCommission: true,
        adminCommission: 7,
        adminCommissionType: "percentage",
        adminCommissionValue: 7,
      },
    };
    expect(mockCatalogUpdateMany).toHaveBeenCalledWith({ _id: { $in: [ID_A, ID_B] } }, expected);
    expect(mockProductUpdateMany).toHaveBeenCalledWith({ catalogProductId: { $in: [ID_A, ID_B] } }, expected);
    expect(lastResponse()[1]).toBe(200);
  });

  test("turning commission off zeroes the value", async () => {
    await bulkUpdateCatalogCommission({ body: { ids: [ID_A], applyCommission: false } }, {});
    expect(mockCatalogUpdateMany.mock.calls[0][1].$set).toMatchObject({
      applyCommission: false,
      adminCommission: 0,
      adminCommissionValue: 0,
    });
  });

  test.each([
    [{ ids: [], applyCommission: true, adminCommission: 5 }, "empty selection"],
    [{ ids: ["bad"], applyCommission: true, adminCommission: 5 }, "bad id"],
    [{ ids: [ID_A], applyCommission: true, adminCommission: 101 }, "over 100"],
    [{ ids: [ID_A], applyCommission: true }, "value missing"],
    [{ ids: [ID_A] }, "nothing to update"],
  ])("rejects %j (%s)", async (body) => {
    await bulkUpdateCatalogCommission({ body }, {});
    expect(lastResponse()[1]).toBe(400);
    expect(mockCatalogUpdateMany).not.toHaveBeenCalled();
  });
});

describe("claimCatalogProduct with variants", () => {
  const sellerReq = (body) => ({ user: { id: "507f1f77bcf86cd799439099" }, body: { catalogProductId: ID_A, ...body } });

  test("creates every variant and derives product price/stock from them", async () => {
    await claimCatalogProduct(
      sellerReq({
        variants: [
          { name: "250ml", price: 30, salePrice: 0, stock: 10 },
          { name: "500ml", price: 50, salePrice: 40, stock: 5 },
          { name: "1L", price: 90, salePrice: 0, stock: 2 },
        ],
      }),
      {},
    );
    expect(mockProductCreate).toHaveBeenCalledTimes(1);
    const created = mockProductCreate.mock.calls[0][0];
    expect(created.variants.map((v) => v.name)).toEqual(["250ml", "500ml", "1L"]);
    expect(new Set(created.variants.map((v) => v.sku)).size).toBe(3);
    expect(created.price).toBe(30); // cheapest variant
    expect(created.stock).toBe(17); // 10 + 5 + 2
    expect(lastResponse()[1]).toBe(201);
  });

  test("rejects a variant that has no price", async () => {
    await claimCatalogProduct(
      sellerReq({ variants: [{ name: "250ml", price: "", stock: 10 }] }),
      {},
    );
    expect(mockProductCreate).not.toHaveBeenCalled();
    expect(lastResponse()[1]).toBe(400);
  });

  test("rejects duplicate variant names", async () => {
    await claimCatalogProduct(
      sellerReq({
        variants: [
          { name: "1L", price: 90, stock: 1 },
          { name: "1l", price: 95, stock: 1 },
        ],
      }),
      {},
    );
    expect(mockProductCreate).not.toHaveBeenCalled();
    expect(lastResponse()[1]).toBe(400);
  });

  test("still works for a plain single-price claim", async () => {
    await claimCatalogProduct(sellerReq({ price: 100, stock: 4 }), {});
    expect(mockProductCreate.mock.calls[0][0]).toMatchObject({ price: 100, stock: 4, variants: [] });
  });

  test("variants left without a price are not created; own variants can be added", async () => {
    await claimCatalogProduct(
      sellerReq({
        variants: [
          { name: "250ml", price: 30, stock: 10 },
          { name: "500ml", price: "", stock: 10 }, // admin suggestion the seller doesn't sell
          { name: "Family Pack", price: 120, stock: 3 }, // seller's own variant
        ],
      }),
      {},
    );
    const created = mockProductCreate.mock.calls[0][0];
    expect(created.variants.map((v) => v.name)).toEqual(["250ml", "Family Pack"]);
    expect(created.price).toBe(30);
    expect(created.stock).toBe(13);
  });

  test("rejects when no variant is priced and there is no single price", async () => {
    await claimCatalogProduct(
      sellerReq({ variants: [{ name: "250ml", price: "" }, { name: "500ml", price: "" }] }),
      {},
    );
    expect(mockProductCreate).not.toHaveBeenCalled();
    expect(lastResponse()[2]).toMatch(/at least one variant/i);
  });

  test("bulk claim creates priced variants for several items and skips unpriced ones", async () => {
    await bulkClaimCatalogProducts(
      {
        user: { id: "507f1f77bcf86cd799439099" },
        body: {
          products: [
            {
              catalogProductId: ID_A,
              name: "Cola",
              variants: [
                { name: "250ml", price: 30, stock: 10 },
                { name: "500ml", price: "", stock: 10 },
              ],
            },
            { catalogProductId: ID_B, name: "Plain", price: 50, stock: 5 },
          ],
        },
      },
      {},
    );
    expect(mockProductCreate).toHaveBeenCalledTimes(2);
    const [cola, plain] = mockProductCreate.mock.calls.map((c) => c[0]);
    expect(cola.variants.map((v) => v.name)).toEqual(["250ml"]);
    expect(cola).toMatchObject({ price: 30, stock: 10 });
    expect(plain).toMatchObject({ price: 50, stock: 5, variants: [] });
  });

  test("bulk claim reports an item whose variants are all unpriced instead of failing the batch", async () => {
    await bulkClaimCatalogProducts(
      {
        user: { id: "507f1f77bcf86cd799439099" },
        body: {
          products: [
            { catalogProductId: ID_A, name: "Cola", price: 0, variants: [{ name: "250ml", price: "" }] },
            { catalogProductId: ID_B, name: "Plain", price: 50, stock: 5 },
          ],
        },
      },
      {},
    );
    expect(mockProductCreate).toHaveBeenCalledTimes(1);
    const data = lastResponse()[3];
    expect(data.errors[0].error).toMatch(/at least one variant/i);
  });
});

describe("bulk claim keeps both MRP and discount price", () => {
  test("variant and plain items carry salePrice through", async () => {
    await bulkClaimCatalogProducts(
      {
        user: { id: "507f1f77bcf86cd799439099" },
        body: {
          products: [
            {
              catalogProductId: ID_A,
              name: "Cola",
              variants: [{ name: "250ml", price: 40, salePrice: 30, stock: 10 }],
            },
            { catalogProductId: ID_B, name: "Plain", price: 100, salePrice: 80, stock: 5 },
          ],
        },
      },
      {},
    );
    const [cola, plain] = mockProductCreate.mock.calls.map((c) => c[0]);
    expect(cola.variants[0]).toMatchObject({ price: 40, salePrice: 30 });
    expect(cola).toMatchObject({ price: 40, salePrice: 30 });
    expect(plain).toMatchObject({ price: 100, salePrice: 80 });
  });
});

describe("claimed products get their customer (commission-inclusive) price immediately", () => {
  const sellerReq = (body) => ({ user: { id: "507f1f77bcf86cd799439099" }, body: { catalogProductId: ID_A, ...body } });

  test("single claim computes and stores customerPrice", async () => {
    await claimCatalogProduct(sellerReq({ price: 100, stock: 4 }), {});
    expect(mockComputePrice).toHaveBeenCalledTimes(1);
    expect(mockProductUpdateOne).toHaveBeenCalledWith(
      { _id: "new-product" },
      { $set: { customerPrice: 123 } },
    );
  });

  test("bulk claim computes it for every created product", async () => {
    await bulkClaimCatalogProducts(
      {
        user: { id: "507f1f77bcf86cd799439099" },
        body: { products: [{ catalogProductId: ID_A, name: "A", price: 10, stock: 1 }, { catalogProductId: ID_B, name: "B", price: 20, stock: 1 }] },
      },
      {},
    );
    expect(mockComputePrice).toHaveBeenCalledTimes(2);
  });

  test("a failed price computation does not block the claim", async () => {
    mockComputePrice.mockRejectedValueOnce(new Error("boom"));
    await claimCatalogProduct(sellerReq({ price: 100, stock: 4 }), {});
    expect(lastResponse()[1]).toBe(201);
  });
});
