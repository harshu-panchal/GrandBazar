import { jest } from "@jest/globals";

const mockProductFindOne = jest.fn();
const mockEnqueueProductIndex = jest.fn();
const mockInvalidate = jest.fn();

jest.unstable_mockModule("../app/models/product.js", () => ({
  default: {
    findOne: mockProductFindOne,
  },
}));

jest.unstable_mockModule("../app/services/searchSyncService.js", () => ({
  enqueueProductIndex: mockEnqueueProductIndex,
}));

jest.unstable_mockModule("../app/services/cacheService.js", () => ({
  invalidate: mockInvalidate,
  buildKey: jest.fn((...parts) => parts.join(":")),
}));

const {
  publishProductPricing,
  bulkPublishProductPricing,
} = await import("../app/services/productPublishService.js");

describe("productPublishService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects publishing with invalid price", async () => {
    mockProductFindOne.mockResolvedValue({
      _id: "prod-1",
      sellerId: "store-1",
      isPublished: false,
      save: jest.fn(),
    });

    await expect(
      publishProductPricing({
        productId: "prod-1",
        storeId: "store-1",
        price: 0,
        stock: 5,
      }),
    ).rejects.toThrow("Price must be greater than 0");
  });

  it("publishes product with valid pricing", async () => {
    const save = jest.fn();
    const product = {
      _id: "prod-1",
      sellerId: "store-1",
      isPublished: false,
      approvalStatus: "approved",
      save,
    };
    mockProductFindOne.mockResolvedValue(product);

    const result = await publishProductPricing({
      productId: "prod-1",
      storeId: "store-1",
      price: 120,
      salePrice: 99,
      stock: 10,
    });

    expect(result.price).toBe(120);
    expect(result.status).toBe("active");
    expect(result.isPublished).toBe(true);
    expect(save).toHaveBeenCalled();
    expect(mockEnqueueProductIndex).toHaveBeenCalledWith("prod-1");
  });

  it("bulkPublishProductPricing returns partial errors", async () => {
    mockProductFindOne
      .mockResolvedValueOnce({
        _id: "prod-1",
        sellerId: "store-1",
        isPublished: false,
        approvalStatus: "approved",
        save: jest.fn(function saveProduct() {
          Object.assign(this, {
            price: 100,
            stock: 5,
            status: "active",
            isPublished: true,
          });
          return Promise.resolve(this);
        }),
      })
      .mockResolvedValueOnce(null);

    const result = await bulkPublishProductPricing({
      storeId: "store-1",
      items: [
        { productId: "prod-1", price: 100, stock: 5 },
        { productId: "prod-2", price: 50, stock: 2 },
      ],
    });

    expect(result.publishedCount).toBe(1);
    expect(result.errors).toHaveLength(1);
  });
});
