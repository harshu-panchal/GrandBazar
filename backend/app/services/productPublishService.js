import Product from "../models/product.js";
import { enqueueProductIndex } from "./searchSyncService.js";
import { invalidate, buildKey } from "./cacheService.js";
import { assertCanPublishProduct } from "./subscriptionService.js";
export async function publishProductPricing({
  productId,
  storeId,
  price,
  salePrice = 0,
  stock = 0,
}) {
  const product = await Product.findOne({ _id: productId, sellerId: storeId });
  if (!product) {
    throw new Error("Product not found");
  }

  if (product.isPublished === true) {
    throw new Error("Product is already published");
  }

  const parsedPrice = Number(price);
  const parsedStock = Number(stock);
  const parsedSalePrice = Number(salePrice) || 0;

  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
    throw new Error("Price must be greater than 0");
  }

  if (!Number.isFinite(parsedStock) || parsedStock < 0) {
    throw new Error("Stock must be 0 or greater");
  }

  await assertCanPublishProduct(storeId, 1);

  product.price = parsedPrice;
  product.salePrice = parsedSalePrice;
  product.stock = parsedStock;
  product.status = "active";
  product.isPublished = true;
  if (!product.approvalStatus || product.approvalStatus === "pending") {
    product.approvalStatus = "approved";
  }

  await product.save();

  await enqueueProductIndex(product._id.toString());
  await invalidate(`cache:catalog:product:${product._id.toString()}`);

  try {
    await invalidate(buildKey("catalog", "productList", "*"));
    await invalidate("cache:offersections:public:*");
  } catch {
    // non-fatal cache invalidation
  }

  return product;
}

export async function bulkPublishProductPricing({ storeId, items = [] }) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error("At least one product pricing item is required");
  }

  const published = [];
  const errors = [];

  for (const item of items) {
    try {
      const product = await publishProductPricing({
        productId: item.productId,
        storeId,
        price: item.price,
        salePrice: item.salePrice,
        stock: item.stock,
      });
      published.push(product._id);
    } catch (error) {
      errors.push({
        productId: item.productId,
        error: error.message,
      });
    }
  }

  return {
    published,
    errors,
    publishedCount: published.length,
  };
}

export async function getUnpublishedProductsForStore(storeId) {
  return Product.find({
    sellerId: storeId,
    isPublished: false,
  })
    .sort({ createdAt: -1 })
    .lean();
}
