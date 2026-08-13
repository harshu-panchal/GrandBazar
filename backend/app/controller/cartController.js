import Cart from "../models/cart.js";
import Product from "../models/product.js";
import Store from "../models/store.js";
import handleResponse from "../utils/helper.js";
import { getApprovedOrLegacyFilter } from "../services/productModerationService.js";
import { isStoreOperationallyOpen } from "../services/deliveryOptionResolver.js";
import {
  assertProductBookableForCart,
  assertCartPreorderRules,
  getAdvanceBookingMapForProductIds,
} from "../services/preOrderCampaignService.js";

const CART_POPULATE_FIELDS =
  "name slug price salePrice mainImage stock status headerId categoryId subcategoryId sellerId variants addons weight";

const CUSTOMER_VISIBLE_PRODUCT_MATCH = {
  status: "active",
  isPublished: { $ne: false },
  isCurrentlyAvailable: { $ne: false },
  ...getApprovedOrLegacyFilter(),
};

function sanitizeCartItems(cart) {
  if (!cart || !Array.isArray(cart.items)) return cart;
  cart.items = cart.items.filter((item) => Boolean(item?.productId));
  return cart;
}

async function getCustomerVisibleProductById(productId) {
  if (!productId) return null;
  return Product.findOne({
    _id: productId,
    ...CUSTOMER_VISIBLE_PRODUCT_MATCH,
  })
    .select("_id name sellerId price salePrice stock variants")
    .lean();
}

function toSellerIdString(value) {
  if (!value) return "";
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

/**
 * Keep only cart lines that belong to the given seller (single-store cart).
 */
async function keepOnlySellerItems(cart, sellerId) {
  if (!cart?.items?.length || !sellerId) return { removed: 0 };
  const productIds = cart.items.map((item) => item.productId).filter(Boolean);
  const products = await Product.find({ _id: { $in: productIds } })
    .select("_id sellerId")
    .lean();
  const sellerByProductId = new Map(
    products.map((product) => [String(product._id), toSellerIdString(product.sellerId)]),
  );
  const before = cart.items.length;
  cart.items = cart.items.filter((item) => {
    const lineSellerId = sellerByProductId.get(String(item.productId));
    return lineSellerId && lineSellerId === String(sellerId);
  });
  return { removed: before - cart.items.length };
}

/**
 * When any cart line carries a campaignId (see cart.js model), attach the
 * live advance-booking meta (sale/delivery window, remaining allocation) so
 * the Cart page can render Scheduling-Page mode from this one response,
 * without a second round trip. Live-resolved by productId, not trusted from
 * the stored campaignId, so a campaign that has since ended/changed shows
 * up-to-date state (or none, if it's no longer bookable).
 */
async function attachPreorderMetaToCartItems(cart) {
  if (!cart || !Array.isArray(cart.items) || !cart.items.length) return cart;
  const preorderItems = cart.items.filter((item) => item?.campaignId);
  if (!preorderItems.length) return cart;

  const productIds = preorderItems
    .map((item) => item.productId?._id || item.productId)
    .filter(Boolean);
  const bookingMap = await getAdvanceBookingMapForProductIds(productIds);

  cart.items = cart.items.map((item) => {
    if (!item?.campaignId) return item;
    const pid = String(item.productId?._id || item.productId || "");
    return { ...item, advanceBooking: bookingMap.get(pid) || null };
  });
  return cart;
}

async function fetchPopulatedCart(cartId) {
  const cart = await Cart.findById(cartId)
    .populate({
      path: "items.productId",
      select: CART_POPULATE_FIELDS,
      match: CUSTOMER_VISIBLE_PRODUCT_MATCH,
    })
    .lean();

  await attachPreorderMetaToCartItems(cart);
  return sanitizeCartItems(cart);
}

/* ===============================
   GET CUSTOMER CART
================================ */
export const getCart = async (req, res) => {
  try {
    const customerId = req.user.id;
    let cart = await Cart.findOne({ customerId })
      .populate({
        path: "items.productId",
        select: CART_POPULATE_FIELDS,
        match: CUSTOMER_VISIBLE_PRODUCT_MATCH,
      })
      .lean();

    if (!cart) {
      const newCart = await Cart.create({ customerId, items: [] });
      return handleResponse(res, 200, "Cart fetched successfully", newCart);
    }

    return handleResponse(res, 200, "Cart fetched successfully", sanitizeCartItems(cart));
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ADD TO CART
================================ */
export const addToCart = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { productId, quantity = 1, variantSku = "" } = req.body;
    const normalizedVariantSku = String(variantSku || "").trim();
    const customerVisibleProduct = await getCustomerVisibleProductById(productId);
    if (!customerVisibleProduct) {
      return handleResponse(res, 404, "Product is not available for purchase");
    }

    // Reject out-of-stock adds server-side (client-side guard alone can be bypassed).
    const requestedQuantity = Math.max(1, Number(quantity) || 1);
    if (normalizedVariantSku) {
      const matchedVariant = Array.isArray(customerVisibleProduct.variants)
        ? customerVisibleProduct.variants.find(
            (variant) => String(variant?.sku || variant?.name || "").trim() === normalizedVariantSku,
          )
        : null;
      if (!matchedVariant) {
        return handleResponse(res, 404, "Selected variant is not available");
      }
      if (Number(matchedVariant.stock || 0) < requestedQuantity) {
        return handleResponse(
          res,
          400,
          `${customerVisibleProduct.name}${matchedVariant.name ? ` (${matchedVariant.name})` : ""} is out of stock`,
        );
      }
    } else if (Number(customerVisibleProduct.stock || 0) < requestedQuantity) {
      return handleResponse(
        res,
        400,
        `${customerVisibleProduct.name} is out of stock`,
      );
    }

    // Resolve the product's active pre-order campaign (if any) server-side —
    // never trust a client-supplied campaignId. `booking.advanceBooking` is
    // null for a normal (non pre-order) product.
    let booking;
    try {
      booking = await assertProductBookableForCart(productId);
    } catch (bookingError) {
      return handleResponse(
        res,
        bookingError.statusCode || 400,
        bookingError.message,
        bookingError.advanceBooking
          ? { advanceBooking: bookingError.advanceBooking }
          : undefined,
      );
    }
    const incomingCampaignId = booking?.advanceBooking?.campaignId || null;
    const incomingPriceSnapshot =
      customerVisibleProduct.salePrice || customerVisibleProduct.price || null;

    const incomingSellerId = toSellerIdString(customerVisibleProduct.sellerId);
    if (!incomingSellerId) {
      return handleResponse(res, 400, "Product store is missing");
    }

    const store = await Store.findById(incomingSellerId)
      .select("isActive isVerified isOpen availability timezone applicationStatus")
      .lean();
    const operational = isStoreOperationallyOpen(store);
    if (!operational.open) {
      return handleResponse(
        res,
        400,
        operational.message || "This shop is currently closed and not accepting orders",
      );
    }

    let cart = await Cart.findOne({ customerId });

    if (!cart) {
      cart = new Cart({ customerId, items: [] });
    }

    // One store per cart: drop items from any other seller before adding.
    const { removed } = await keepOnlySellerItems(cart, incomingSellerId);

    const itemIndex = cart.items.findIndex(
      (item) =>
        item.productId.toString() === productId &&
        String(item.variantSku || "").trim() === normalizedVariantSku,
    );

    if (itemIndex > -1) {
      cart.items[itemIndex].quantity += quantity;
      cart.items[itemIndex].campaignId = incomingCampaignId;
      cart.items[itemIndex].priceSnapshot = incomingPriceSnapshot;
      cart.items[itemIndex].sellerId = incomingSellerId;
    } else {
      cart.items.push({
        productId,
        variantSku: normalizedVariantSku,
        quantity,
        campaignId: incomingCampaignId,
        priceSnapshot: incomingPriceSnapshot,
        sellerId: incomingSellerId,
      });
    }

    // A cart may not mix a pre-order line with a regular line, nor mix lines
    // from two different pre-order campaigns — give the customer instant
    // feedback here instead of only failing at final checkout.
    try {
      await assertCartPreorderRules(cart.items);
    } catch (preorderRuleError) {
      return handleResponse(
        res,
        preorderRuleError.statusCode || 400,
        preorderRuleError.message,
      );
    }

    await cart.save();
    const updatedCart = await fetchPopulatedCart(cart._id);

    return handleResponse(
      res,
      200,
      removed > 0
        ? "Cart updated for a single store. Previous store items were removed."
        : "Item added to cart",
      {
        ...updatedCart,
        replacedOtherSellerItems: removed > 0,
        removedOtherSellerItemCount: removed,
      },
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   UPDATE QUANTITY
================================ */
export const updateQuantity = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { productId, quantity, variantSku = "" } = req.body;
    const normalizedVariantSku = String(variantSku || "").trim();

    let cart = await Cart.findOne({ customerId });

    if (!cart) {
      return handleResponse(res, 404, "Cart not found");
    }

    const itemIndex = cart.items.findIndex(
      (item) =>
        item.productId.toString() === productId &&
        String(item.variantSku || "").trim() === normalizedVariantSku,
    );

    if (itemIndex > -1) {
      cart.items[itemIndex].quantity = quantity;
      if (cart.items[itemIndex].quantity <= 0) {
        cart.items.splice(itemIndex, 1);
      }
    } else {
      return handleResponse(res, 404, "Product not in cart");
    }

    await cart.save();
    const updatedCart = await fetchPopulatedCart(cart._id);

    return handleResponse(res, 200, "Cart updated successfully", updatedCart);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   REMOVE FROM CART
================================ */
export const removeFromCart = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { productId } = req.params;
    const normalizedVariantSku = String(req.query?.variantSku || "").trim();

    let cart = await Cart.findOne({ customerId });

    if (!cart) {
      return handleResponse(res, 404, "Cart not found");
    }

    cart.items = cart.items.filter((item) => {
      if (item.productId.toString() !== productId) return true;
      // If variantSku is provided, remove only that variant line.
      if (normalizedVariantSku) {
        return String(item.variantSku || "").trim() !== normalizedVariantSku;
      }
      // If no variantSku is provided, keep legacy behavior: remove all lines for that product.
      return false;
    });

    await cart.save();
    const updatedCart = await fetchPopulatedCart(cart._id);

    return handleResponse(res, 200, "Item removed from cart", updatedCart);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   CLEAR CART
================================ */
export const clearCart = async (req, res) => {
  try {
    const customerId = req.user.id;
    let cart = await Cart.findOne({ customerId });

    if (cart) {
      cart.items = [];
      await cart.save();
    }

    return handleResponse(res, 200, "Cart cleared successfully");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
