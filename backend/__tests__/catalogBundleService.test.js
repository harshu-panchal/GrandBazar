import { jest } from "@jest/globals";

const mockCategoryFind = jest.fn();
const mockCatalogBundleFind = jest.fn();
const mockCatalogBundleFindOne = jest.fn();
const mockCatalogBundleCreate = jest.fn();
const mockCatalogBundleFindByIdAndDelete = jest.fn();
const mockStoreBundleImportFind = jest.fn();
const mockStoreBundleImportFindOne = jest.fn();
const mockStoreBundleImportCreate = jest.fn();
const mockStoreBundleImportDeleteMany = jest.fn();
const mockStoreFindById = jest.fn();
const mockCatalogProductFind = jest.fn();
const mockProductFindOne = jest.fn();
const mockProductCountDocuments = jest.fn();
const mockCreateProductFromCatalog = jest.fn();
const mockAssertCanAddProduct = jest.fn();

jest.unstable_mockModule("../app/models/category.js", () => ({
  default: { find: mockCategoryFind, findOne: jest.fn() },
}));

jest.unstable_mockModule("../app/models/catalogBundle.js", () => ({
  default: {
    find: mockCatalogBundleFind,
    findOne: mockCatalogBundleFindOne,
    create: mockCatalogBundleCreate,
    findByIdAndDelete: mockCatalogBundleFindByIdAndDelete,
  },
}));

jest.unstable_mockModule("../app/models/storeBundleImport.js", () => ({
  default: {
    find: mockStoreBundleImportFind,
    findOne: mockStoreBundleImportFindOne,
    create: mockStoreBundleImportCreate,
    deleteMany: mockStoreBundleImportDeleteMany,
  },
}));

jest.unstable_mockModule("../app/models/store.js", () => ({
  default: { findById: mockStoreFindById },
}));

jest.unstable_mockModule("../app/models/catalogProduct.js", () => ({
  default: { find: mockCatalogProductFind },
}));

jest.unstable_mockModule("../app/models/product.js", () => ({
  default: { findOne: mockProductFindOne, countDocuments: mockProductCountDocuments },
}));

jest.unstable_mockModule("../app/services/subscriptionService.js", () => ({
  assertCanAddProduct: mockAssertCanAddProduct,
}));

jest.unstable_mockModule("../app/services/catalogClaimService.js", () => ({
  createProductFromCatalog: mockCreateProductFromCatalog,
}));

jest.unstable_mockModule("../app/services/entityNameCache.js", () => ({
  resolveCategoryName: jest.fn(async () => "Grocery"),
}));

jest.unstable_mockModule("../app/services/cacheService.js", () => ({
  invalidate: jest.fn(),
  buildKey: jest.fn((...parts) => parts.join(":")),
}));

const {
  resolveStoreHeaderIds,
  getAvailableBundlesForStore,
  importBundlesForStore,
  deleteCatalogBundle,
} = await import("../app/services/catalogBundleService.js");

describe("catalogBundleService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProductCountDocuments.mockResolvedValue(0);
  });

  it("resolveStoreHeaderIds maps store category names to header docs", async () => {
    mockCategoryFind.mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ _id: "header-1", name: "Grocery" }]),
    });

    const headers = await resolveStoreHeaderIds({
      categories: ["Grocery"],
    });

    expect(headers).toHaveLength(1);
    expect(String(headers[0]._id)).toBe("header-1");
  });

  it("permanently deletes a bundle and its import tracking records", async () => {
    mockCatalogBundleFindByIdAndDelete.mockResolvedValue({
      _id: "bundle-1",
      name: "Grocery Starter",
    });
    mockStoreBundleImportDeleteMany.mockResolvedValue({ deletedCount: 2 });

    const result = await deleteCatalogBundle("bundle-1");

    expect(mockCatalogBundleFindByIdAndDelete).toHaveBeenCalledWith("bundle-1");
    expect(mockStoreBundleImportDeleteMany).toHaveBeenCalledWith({ bundleId: "bundle-1" });
    expect(result).toEqual({
      id: "bundle-1",
      name: "Grocery Starter",
      deleted: true,
    });
  });

  it("getAvailableBundlesForStore excludes already imported bundles", async () => {
    mockStoreFindById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "store-1",
        categories: ["Grocery"],
        isVerified: true,
        applicationStatus: "approved",
      }),
    });
    mockCategoryFind.mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ _id: "header-1", name: "Grocery" }]),
    });
    mockCatalogBundleFind.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          _id: "bundle-1",
          name: "Grocery Starter",
          headerId: "header-1",
          catalogProductIds: ["cat-1"],
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    });
    mockStoreBundleImportFind.mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ bundleId: "bundle-2" }]),
    });
    mockStoreBundleImportFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    const result = await getAvailableBundlesForStore("store-1");

    expect(result.bundles).toHaveLength(1);
    expect(result.bundles[0].id).toBe("bundle-1");
  });

  it("importBundlesForStore creates draft products and records import", async () => {
    mockStoreFindById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "store-1",
        categories: ["Grocery"],
        isVerified: true,
        applicationStatus: "approved",
      }),
    });
    mockCategoryFind.mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ _id: "header-1", name: "Grocery" }]),
    });
    mockCatalogBundleFind.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          _id: "bundle-1",
          name: "Grocery Starter",
          headerId: "header-1",
          catalogProductIds: ["cat-1"],
          isActive: true,
        },
      ]),
    });
    mockStoreBundleImportFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });
    mockCatalogProductFind.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          _id: "cat-1",
          name: "Apple",
          status: "active",
          headerId: "header-1",
          categoryId: "c-1",
          subcategoryId: "s-1",
        },
      ]),
    });
    mockProductFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });
    mockCreateProductFromCatalog.mockResolvedValue({ _id: "prod-1" });
    mockStoreBundleImportCreate.mockResolvedValue({});

    const result = await importBundlesForStore({
      storeId: "store-1",
      bundleIds: ["bundle-1"],
      accountId: "owner-1",
    });

    expect(result.imported).toBe(1);
    expect(mockCreateProductFromCatalog).toHaveBeenCalledWith(
      expect.objectContaining({
        importSource: "bundle_import",
        isPublished: false,
        status: "inactive",
      }),
    );
    expect(mockStoreBundleImportCreate).toHaveBeenCalled();
    expect(mockAssertCanAddProduct).toHaveBeenCalledWith("store-1", 1);
  });

  it("rejects the whole bundle before creating products when the plan limit is exceeded", async () => {
    mockStoreFindById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "store-1",
        categories: ["Grocery"],
        isVerified: true,
        applicationStatus: "approved",
      }),
    });
    mockCategoryFind.mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ _id: "header-1", name: "Grocery" }]),
    });
    mockCatalogBundleFind.mockReturnValue({
      lean: jest.fn().mockResolvedValue([{
        _id: "bundle-1",
        name: "Large bundle",
        headerId: "header-1",
        catalogProductIds: ["cat-1", "cat-2", "cat-3"],
        isActive: true,
      }]),
    });
    mockStoreBundleImportFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    mockAssertCanAddProduct.mockRejectedValueOnce(
      Object.assign(new Error("Product limit reached for this shop (2)."), { statusCode: 403 }),
    );

    await expect(importBundlesForStore({
      storeId: "store-1",
      bundleIds: ["bundle-1"],
      accountId: "owner-1",
    })).rejects.toThrow("Product limit reached");
    expect(mockCreateProductFromCatalog).not.toHaveBeenCalled();
    expect(mockStoreBundleImportCreate).not.toHaveBeenCalled();
  });
});
