import { useEffect, useState } from "react";
import { X, Minus, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { customerApi } from "../../services/customerApi";
import { useLocation as useAppLocation } from "../../context/LocationContext";
import { applyCloudinaryTransform } from "@/core/utils/imageUtils";

const RUPEE = "₹";

export default function AddOrderItemsModal({ order, onClose, onAdded }) {
  const { currentLocation } = useAppLocation();
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [quantities, setQuantities] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const sellerId = order?.seller?._id || order?.seller;

  useEffect(() => {
    let cancelled = false;
    const hasValidLocation =
      Number.isFinite(currentLocation?.latitude) && Number.isFinite(currentLocation?.longitude);

    async function fetchProducts() {
      setIsLoading(true);
      try {
        const res = hasValidLocation
          ? await customerApi.getProducts({
              sellerId,
              lat: currentLocation.latitude,
              lng: currentLocation.longitude,
              limit: 100,
            })
          : { data: { success: true, result: { items: [] } } };
        if (cancelled) return;
        const items = res.data?.result?.items || res.data?.result || [];
        const inStockOnly = (Array.isArray(items) ? items : []).filter((product) => {
          const variants = Array.isArray(product?.variants) ? product.variants : [];
          if (variants.length > 0) {
            return variants.some((v) => Number(v?.stock || 0) > 0);
          }
          return Number(product?.stock || 0) > 0;
        });
        setProducts(inStockOnly);
      } catch {
        if (!cancelled) toast.error("Could not load items for this store");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    if (sellerId) fetchProducts();
    return () => {
      cancelled = true;
    };
  }, [sellerId, currentLocation?.latitude, currentLocation?.longitude]);

  const setQty = (productId, qty) => {
    setQuantities((prev) => {
      const next = { ...prev };
      if (qty <= 0) {
        delete next[productId];
      } else {
        next[productId] = qty;
      }
      return next;
    });
  };

  const selectedEntries = Object.entries(quantities).filter(([, qty]) => qty > 0);
  const selectedCount = selectedEntries.reduce((sum, [, qty]) => sum + qty, 0);

  const handleSubmit = async () => {
    if (selectedEntries.length === 0) {
      toast.error("Select at least one item to add");
      return;
    }
    try {
      setSubmitting(true);
      const items = selectedEntries.map(([productId, quantity]) => ({
        product: productId,
        quantity,
      }));
      const res = await customerApi.addOrderItems(order.orderId, { items });
      toast.success("Items added to your order");
      onAdded?.(res.data?.result);
      onClose?.();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Could not add items to this order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="flex h-[85vh] w-full flex-col rounded-t-2xl bg-white sm:h-[80vh] sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-900">Add items to this order</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-slate-100">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={28} className="animate-spin text-primary" />
            </div>
          ) : products.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">
              No items available from this store right now.
            </p>
          ) : (
            <div className="space-y-2">
              {products.map((product) => {
                const qty = quantities[product._id] || 0;
                const price = product.salePrice || product.price || 0;
                return (
                  <div
                    key={product._id}
                    className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5"
                  >
                    <img
                      src={applyCloudinaryTransform(product.mainImage, { width: 80 })}
                      alt={product.name}
                      className="h-12 w-12 flex-shrink-0 rounded-lg object-cover bg-slate-50"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{product.name}</p>
                      <p className="text-xs font-bold text-slate-500">
                        {RUPEE}
                        {Number(price).toFixed(0)}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <button
                        type="button"
                        disabled={qty === 0}
                        onClick={() => setQty(product._id, qty - 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-600 disabled:opacity-30"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-4 text-center text-sm font-bold text-slate-800">{qty}</span>
                      <button
                        type="button"
                        onClick={() => setQty(product._id, qty + 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 p-4">
          <button
            type="button"
            disabled={submitting || selectedEntries.length === 0}
            onClick={handleSubmit}
            className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {submitting
              ? "Adding..."
              : selectedCount > 0
              ? `Add ${selectedCount} item${selectedCount > 1 ? "s" : ""} to order`
              : "Add to order"}
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            Paid first from your wallet — any remaining amount is collected at delivery.
          </p>
        </div>
      </div>
    </div>
  );
}
