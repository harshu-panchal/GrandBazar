import Order from "../models/order.js";
import Product from "../models/product.js";
import { requireCanonicalOrderId } from "../utils/orderLookup.js";

function resolveCurrentPrice(source) {
  const sale = Number(source.salePrice || 0);
  const base = Number(source.price || 0);
  return sale > 0 && sale < base ? sale : base;
}

export async function buildReorderManifest(customerId, orderId) {
  const canonicalOrderId = await requireCanonicalOrderId(orderId);
  const order = await Order.findOne({ orderId: canonicalOrderId, customer: customerId }).lean();
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  const addable = [];
  const unavailable = [];

  for (const item of order.items || []) {
    const product = await Product.findById(item.product).lean();

    if (!product) {
      unavailable.push({ name: item.name, reason: "Product no longer available" });
      continue;
    }
    if (product.status !== "active") {
      unavailable.push({ name: item.name, reason: "Product no longer available" });
      continue;
    }
    if (product.approvalStatus === "rejected") {
      unavailable.push({ name: item.name, reason: "Product no longer available" });
      continue;
    }

    const variantSku = String(item.variantSlot || "").trim();
    let price;
    let stock;
    let variantName = "";

    if (variantSku) {
      const variant = (product.variants || []).find(
        (v) => String(v.sku || "").trim() === variantSku || String(v.name || "").trim() === variantSku,
      );
      if (!variant) {
        unavailable.push({ name: item.name, reason: "This variant is no longer available" });
        continue;
      }
      price = resolveCurrentPrice(variant);
      stock = Number(variant.stock || 0);
      variantName = variant.name || "";
    } else {
      price = resolveCurrentPrice(product);
      stock = Number(product.stock || 0);
    }

    if (stock <= 0) {
      unavailable.push({ name: item.name, reason: "Out of stock" });
      continue;
    }

    const requestedQuantity = Number(item.quantity || 1);
    const quantity = Math.min(requestedQuantity, stock);

    addable.push({
      productId: product._id,
      sellerId: order.seller,
      variantSku,
      variantName,
      name: product.name,
      image: product.mainImage,
      price,
      quantity,
      quantityAdjusted: quantity < requestedQuantity,
      priceChanged: Number(price) !== Number(item.price),
      originalPrice: Number(item.price || 0),
    });
  }

  return { orderId: canonicalOrderId, addable, unavailable };
}
