import {
  COMMISSION_FIXED_RULE,
  COMMISSION_TYPE,
} from "../../constants/finance.js";
import {
  calculateCategoryCommission,
  resolveEffectiveCommissionForLineItem,
} from "./pricingService.js";
import Category from "../../models/category.js";
import Store from "../../models/store.js";
import CityCommission from "../../models/cityCommission.js";
import { normalizeCityKey } from "../cityCommissionService.js";

// Fields on a Product/variant document whose change can affect the
// resolved customer-facing price. Callers use this to decide whether an
// update warrants recomputing customerPrice/customerSalePrice.
export const PRICE_AFFECTING_FIELDS = [
  "price",
  "salePrice",
  "variants",
  "applyCommission",
  "adminCommission",
  "adminCommissionType",
  "adminCommissionValue",
  "adminCommissionFixedRule",
  "headerId",
  "categoryId",
  "subcategoryId",
];

function buildOverrideConfig(source, fallbackId, fallbackName) {
  if (!source || source.applyCommission !== true) return null;
  return {
    _id: fallbackId,
    name: fallbackName,
    applyCommission: true,
    adminCommissionType: source.adminCommissionType || COMMISSION_TYPE.PERCENTAGE,
    adminCommissionValue: Number(source.adminCommissionValue ?? 0),
    adminCommission: Number(source.adminCommissionValue ?? source.adminCommission ?? 0),
    adminCommissionFixedRule:
      source.adminCommissionFixedRule || COMMISSION_FIXED_RULE.PER_QTY,
  };
}

function resolveBaseConfig({ overrideConfig, subcategory, storeDoc, cityCommission }) {
  const resolved = resolveEffectiveCommissionForLineItem({
    addonProduct: null,
    productCategory: overrideConfig,
    subcategory,
    shopCommission: storeDoc,
    cityCommission,
  });
  return (
    resolved.category || {
      adminCommissionType: COMMISSION_TYPE.PERCENTAGE,
      adminCommissionValue: 0,
      adminCommissionFixedRule: COMMISSION_FIXED_RULE.PER_QTY,
    }
  );
}

function priceWithCommission(price, baseConfig) {
  const numeric = Number(price);
  if (!Number.isFinite(numeric)) return null;
  return calculateCategoryCommission({ price: numeric, quantity: 1 }, baseConfig).itemSubtotal;
}

/**
 * Computes the denormalized, commission-inclusive customer-facing price for
 * a product and its variants — display/search/sort only, never used to
 * charge a customer (checkout always live-computes via
 * generateOrderPaymentBreakdown). Always resolves STANDARD commission —
 * never a bulk-order rate override or free-tier surcharge, both of which
 * depend on order/cart context that doesn't exist at catalog-display time.
 *
 * @param {object} product - lean Product doc (or plain object with the same
 *   shape) with price/salePrice/variants/commission-override fields.
 * @param {object} ctx
 * @param {Map<string, object>} [ctx.categoryById] - category docs keyed by
 *   String(_id), used to look up product.subcategoryId.
 * @param {object|null} [ctx.storeDoc] - the product's seller's Store doc
 *   (commission-override fields selected).
 * @param {object|null} [ctx.cityCommission] - the seller's city's
 *   CityCommission doc.
 */
export async function computeCustomerPriceForProduct(
  product,
  { categoryById = new Map(), storeDoc = null, cityCommission = null } = {},
) {
  const subcategory = product.subcategoryId
    ? categoryById.get(String(product.subcategoryId))
    : null;

  const productOverride = buildOverrideConfig(
    {
      applyCommission: product.applyCommission,
      adminCommissionType: product.adminCommissionType,
      adminCommissionValue: product.adminCommissionValue ?? product.adminCommission,
      adminCommission: product.adminCommission,
      adminCommissionFixedRule: product.adminCommissionFixedRule,
    },
    product._id,
    product.name,
  );

  const productBaseConfig = resolveBaseConfig({
    overrideConfig: productOverride,
    subcategory,
    storeDoc,
    cityCommission,
  });

  const customerPrice = priceWithCommission(product.price, productBaseConfig);
  const customerSalePrice =
    Number(product.salePrice) > 0
      ? priceWithCommission(product.salePrice, productBaseConfig)
      : null;

  const variantCustomerPrices = new Map();
  for (const variant of Array.isArray(product.variants) ? product.variants : []) {
    const key = variant.sku || variant.name;
    if (!key) continue;

    const variantUsesOwnConfig = variant.applyCommission === true;
    const variantBaseConfig = variantUsesOwnConfig
      ? resolveBaseConfig({
          overrideConfig: buildOverrideConfig(variant, product._id, variant.name || product.name),
          subcategory,
          storeDoc,
          cityCommission,
        })
      : productBaseConfig;

    variantCustomerPrices.set(key, {
      customerPrice: priceWithCommission(variant.price, variantBaseConfig),
      customerSalePrice:
        Number(variant.salePrice) > 0
          ? priceWithCommission(variant.salePrice, variantBaseConfig)
          : null,
    });
  }

  return { customerPrice, customerSalePrice, variantCustomerPrices };
}

/**
 * Single-product convenience wrapper around computeCustomerPriceForProduct
 * for callers that don't already have categoryById/storeDoc/cityCommission
 * loaded — does the DB lookups itself. Meant for the create/update-product
 * request path (one product, cheap) — NOT for bulk recompute jobs, which
 * batch these same lookups across many products (see
 * queues/pricingQueueProcessors.js).
 *
 * @param {object} productLike - plain object with the product's price,
 *   salePrice, variants, commission-override fields, subcategoryId and
 *   sellerId (as they'll be written to the Product document).
 * @returns {{ customerPrice: number|null, customerSalePrice: number|null,
 *   customerPriceComputedAt: Date, variants: Array|undefined }} fields ready
 *   to merge into the product document being created/updated. `variants`
 *   is only present when `productLike.variants` was an array — each entry
 *   is the original variant object with customerPrice/customerSalePrice
 *   added.
 */
export async function computeCustomerPriceFieldsForWrite(productLike) {
  const subcategoryId = productLike.subcategoryId ? String(productLike.subcategoryId) : null;
  const categoryById = new Map();
  if (subcategoryId) {
    const subcategory = await Category.findById(subcategoryId)
      .select("_id name type applyCommission adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule")
      .lean();
    if (subcategory) categoryById.set(subcategoryId, subcategory);
  }

  const sellerId = productLike.sellerId ? String(productLike.sellerId) : null;
  const storeDoc = sellerId
    ? await Store.findById(sellerId)
        .select("applyCommission adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule city")
        .lean()
    : null;

  const cityKey = normalizeCityKey(storeDoc?.city || "");
  const cityCommission = cityKey
    ? await CityCommission.findOne({ cityKey })
        .select("cityKey cityName enabled applyCommission adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule")
        .lean()
    : null;

  const { customerPrice, customerSalePrice, variantCustomerPrices } =
    await computeCustomerPriceForProduct(productLike, { categoryById, storeDoc, cityCommission });

  const result = {
    customerPrice,
    customerSalePrice,
    customerPriceComputedAt: new Date(),
  };

  if (Array.isArray(productLike.variants)) {
    result.variants = productLike.variants.map((variant) => {
      const key = variant.sku || variant.name;
      const computed = key ? variantCustomerPrices.get(key) : null;
      return {
        ...variant,
        customerPrice: computed ? computed.customerPrice : null,
        customerSalePrice: computed ? computed.customerSalePrice : null,
      };
    });
  }

  return result;
}
