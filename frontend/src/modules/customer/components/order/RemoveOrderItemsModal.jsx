import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { customerApi } from "../../services/customerApi";
import { applyCloudinaryTransform } from "@/core/utils/imageUtils";

const RUPEE = "₹";

export default function RemoveOrderItemsModal({ order, onClose, onRemoved }) {
  const [selected, setSelected] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const items = Array.isArray(order?.items) ? order.items : [];
  const toggle = (idx) => {
    setSelected((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const selectedIndexes = Object.entries(selected)
    .filter(([, v]) => v)
    .map(([idx]) => Number(idx));
  const removingAllItems = selectedIndexes.length > 0 && selectedIndexes.length >= items.length;

  const handleSubmit = async () => {
    if (selectedIndexes.length === 0) {
      toast.error("Select at least one item to remove");
      return;
    }
    if (removingAllItems) {
      toast.error("Cancel the whole order instead of removing every item");
      return;
    }
    try {
      setSubmitting(true);
      const res = await customerApi.removeOrderItems(order.orderId, {
        itemIndexes: selectedIndexes,
        reason: "Removed by customer before seller acceptance",
      });
      toast.success("Item removed from your order");
      onRemoved?.(res.data?.result);
      onClose?.();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Could not remove item from this order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="flex h-[70vh] w-full flex-col rounded-t-2xl bg-white sm:h-auto sm:max-h-[80vh] sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-900">Remove items from this order</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-slate-100">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {items.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">No items on this order.</p>
          ) : (
            <div className="space-y-2">
              {items.map((item, idx) => (
                <label
                  key={`${item.product}-${item.variantSlot || ""}-${idx}`}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(selected[idx])}
                    onChange={() => toggle(idx)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <img
                    src={applyCloudinaryTransform(item.image, { width: 80 })}
                    alt={item.name}
                    className="h-12 w-12 flex-shrink-0 rounded-lg object-cover bg-slate-50"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
                    {item.variantSlot && (
                      <p className="truncate text-[11px] font-semibold text-slate-400">{item.variantSlot}</p>
                    )}
                    <p className="text-xs font-bold text-slate-500">
                      Qty {item.quantity} · {RUPEE}
                      {Number(item.price || 0).toFixed(0)}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 p-4">
          <button
            type="button"
            disabled={submitting || selectedIndexes.length === 0}
            onClick={handleSubmit}
            className="w-full rounded-xl bg-red-600 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" /> Removing...
              </span>
            ) : selectedIndexes.length > 0 ? (
              `Remove ${selectedIndexes.length} item${selectedIndexes.length > 1 ? "s" : ""}`
            ) : (
              "Select items to remove"
            )}
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            Any amount already charged for removed items is refunded to your wallet.
          </p>
        </div>
      </div>
    </div>
  );
}
