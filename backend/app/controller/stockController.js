import Product from "../models/product.js";
import StockHistory from "../models/stockHistory.js";
import handleResponse from "../utils/helper.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import {
    createLowStockAlertCandidate,
    isLowStockAlertsEnabled,
} from "../services/lowStockAlertService.js";

/* ===============================
   ADJUST STOCK MANUALLY
================================ */
export const adjustStock = async (req, res) => {
    try {
        const { productId, type, quantity, note } = req.body;
        const sellerId = req.user.id;

        const product = await Product.findOne({ _id: productId, sellerId });
        if (!product) {
            return handleResponse(res, 404, "Product not found or unauthorized");
        }

        if (Array.isArray(product.variants) && product.variants.length > 0) {
            return handleResponse(
                res,
                400,
                "This product has variants — adjust stock per-variant from the product edit page instead of the total, or it will desync from checkout.",
            );
        }

        const qtyChange = Number(quantity);
        const previousStock = Number(product.stock || 0);
        const finalStock = type === 'Restock' ? product.stock + qtyChange : product.stock - qtyChange;

        if (finalStock < 0) {
            return handleResponse(res, 400, "Stock cannot be negative");
        }

        // 1. Update Product Stock
        product.stock = finalStock;
        await product.save();

        // 2. Create History Entry
        const historyEntry = new StockHistory({
            product: productId,
            seller: sellerId,
            type, // Restock, Correction
            quantity: type === 'Restock' ? qtyChange : -qtyChange,
            note: note || `Manual ${type} adjustment`
        });

        await historyEntry.save();

        if (
            type !== 'Restock' &&
            qtyChange > 0 &&
            await isLowStockAlertsEnabled()
        ) {
            const lowStockAlert = createLowStockAlertCandidate({
                product,
                previousStock,
                currentStock: finalStock,
            });
            if (lowStockAlert) {
                emitNotificationEvent(NOTIFICATION_EVENTS.LOW_STOCK_ALERT, lowStockAlert);
            }
        }

        return handleResponse(res, 200, "Stock adjusted successfully", {
            newStock: product.stock,
            historyEntry
        });

    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   ADJUST VARIANT STOCK MANUALLY
================================ */
export const adjustVariantStock = async (req, res) => {
    try {
        const { productId, variantId, type, quantity, note } = req.body;
        const sellerId = req.user.id;

        const product = await Product.findOne({ _id: productId, sellerId });
        if (!product) {
            return handleResponse(res, 404, "Product not found or unauthorized");
        }

        const variant = product.variants?.id?.(variantId);
        if (!variant) {
            return handleResponse(res, 404, "Variant not found");
        }

        const qtyChange = Number(quantity);
        if (!Number.isFinite(qtyChange) || qtyChange <= 0) {
            return handleResponse(res, 400, "Quantity must be a positive number");
        }

        const previousStock = Number(product.stock || 0);
        const previousVariantStock = Number(variant.stock || 0);
        const finalVariantStock =
            type === 'Restock' ? previousVariantStock + qtyChange : previousVariantStock - qtyChange;

        if (finalVariantStock < 0) {
            return handleResponse(res, 400, "Stock cannot be negative");
        }

        variant.stock = finalVariantStock;
        // Keep the top-level `stock` field in sync with the sum of variants —
        // same invariant productController.js maintains on the edit-product
        // path (checkout/listing visibility gates on this field, not on any
        // single variant's stock).
        product.stock = product.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
        await product.save();

        const historyEntry = new StockHistory({
            product: productId,
            seller: sellerId,
            type,
            quantity: type === 'Restock' ? qtyChange : -qtyChange,
            note: note || `Manual ${type} adjustment (${variant.name || variant.sku || 'variant'})`,
        });
        await historyEntry.save();

        if (
            type !== 'Restock' &&
            qtyChange > 0 &&
            await isLowStockAlertsEnabled()
        ) {
            const lowStockAlert = createLowStockAlertCandidate({
                product,
                previousStock,
                currentStock: product.stock,
                variantSku: variant.sku,
                previousVariantStock,
                currentVariantStock: finalVariantStock,
            });
            if (lowStockAlert) {
                emitNotificationEvent(NOTIFICATION_EVENTS.LOW_STOCK_ALERT, lowStockAlert);
            }
        }

        return handleResponse(res, 200, "Stock adjusted successfully", {
            newVariantStock: variant.stock,
            newProductStock: product.stock,
            historyEntry,
        });

    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   GET STOCK HISTORY LOG
================================ */
export const getStockHistory = async (req, res) => {
    try {
        const sellerId = req.user.id;

        const history = await StockHistory.find({ seller: sellerId })
            .sort({ createdAt: -1 })
            .populate("product", "name sku mainImage");

        return handleResponse(res, 200, "Stock history fetched", history.map(item => ({
            id: item._id,
            productName: item.product?.name || "Deleted Product",
            sku: item.product?.sku || "N/A",
            type: item.type,
            quantity: item.quantity > 0 ? `+${item.quantity}` : `${item.quantity}`,
            date: item.createdAt.toISOString().split('T')[0],
            time: item.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            note: item.note
        })));

    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
