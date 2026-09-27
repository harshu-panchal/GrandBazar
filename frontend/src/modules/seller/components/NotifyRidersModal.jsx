/**
 * NotifyRidersModal
 *
 * Confirmation dialog shown to the seller before broadcasting a return-pickup
 * request to nearby delivery partners.
 *
 * Props:
 *   isOpen         – boolean
 *   returnOrder    – the Order document from seller returns list
 *   onConfirm(orderId) – callback; caller owns API call + loading state
 *   onClose()      – callback to dismiss without acting
 *   isLoading      – boolean; disables buttons while API is in-flight
 */

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, RotateCcw, MapPin, ArrowDown, Package, IndianRupee, AlertCircle, Users } from "lucide-react";
import Button from "@shared/components/ui/Button";
import { Loader2 } from "lucide-react";

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatAddress(addr) {
  if (!addr) return "";
  if (typeof addr === "string") return addr;
  return [addr.address, addr.locality, addr.city].filter(Boolean).join(", ");
}

function ReturnItemRow({ item }) {
  return (
    <div className="flex items-center gap-2.5 bg-white border border-amber-100 rounded-xl p-2 min-w-[145px] max-w-[190px] shadow-sm flex-shrink-0">
      <div className="h-9 w-9 rounded-lg bg-amber-50 overflow-hidden flex-shrink-0 border border-amber-100">
        {item.image ? (
          <img src={item.image} alt={item.name || "Item"} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <Package className="w-4 h-4 text-amber-300" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold text-slate-900 truncate leading-snug">{item.name || "Product"}</p>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[10px] font-extrabold text-amber-600">×{item.quantity || 1}</span>
          {item.price > 0 && (
            <span className="text-[10px] font-semibold text-slate-500">₹{Number(item.price).toFixed(0)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

const NotifyRidersModal = ({ isOpen, returnOrder, onConfirm, onClose, isLoading }) => {
  if (!returnOrder) return null;

  const returnItems =
    Array.isArray(returnOrder.returnItems) && returnOrder.returnItems.length > 0
      ? returnOrder.returnItems
      : Array.isArray(returnOrder.items)
        ? returnOrder.items
        : [];

  const refundAmount =
    returnOrder.returnRefundAmount ||
    returnItems.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);

  const commission = returnOrder.returnDeliveryCommission || 30;
  const customerName = returnOrder.customer?.name || "Customer";
  const customerAddress =
    returnOrder.address?.address ||
    returnOrder.address?.completeAddress ||
    formatAddress(returnOrder.address) ||
    "Customer address";

  const sellerName = returnOrder.seller?.shopName || "Your Store";
  const sellerAddress = formatAddress(returnOrder.seller?.address) || "Your store address";

  return (
    <AnimatePresence>
      {isOpen && (
        /* ── backdrop ── */
        <div className="fixed inset-0 z-[350] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-md"
            onClick={() => !isLoading && onClose()}
          />

          {/* ── card ── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="relative z-10 w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: "calc(100dvh - 2rem)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-amber-50/60 shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm shadow-amber-200">
                  <RotateCcw className="h-4.5 w-4.5 text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest leading-none mb-0.5">
                    Notify Riders
                  </p>
                  <h3 className="text-sm font-black text-slate-900 leading-none">
                    Broadcast Return Pickup
                  </h3>
                </div>
              </div>
              <button
                onClick={() => !isLoading && onClose()}
                disabled={isLoading}
                className="p-2 hover:bg-amber-100 rounded-full transition-colors text-slate-500 disabled:opacity-40"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Body — scrollable */}
            <div className="overflow-y-auto overscroll-contain flex-1 px-5 py-4 space-y-4">

              {/* Info banner */}
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl p-3">
                <Users className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs font-semibold text-slate-700 leading-relaxed">
                  All online delivery partners within your store's service radius will receive a
                  <span className="font-black text-amber-700"> full-screen alert</span> with a
                  60-second window to accept this return pickup.
                </p>
              </div>

              {/* Order summary row */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-col gap-0.5">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Order</span>
                  <span className="text-xs font-black text-slate-900">#{returnOrder.orderId}</span>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex flex-col gap-0.5">
                  <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Rider Earnings</span>
                  <div className="flex items-center gap-0.5">
                    <IndianRupee className="h-3 w-3 text-amber-700 shrink-0" />
                    <span className="text-sm font-black text-amber-700">{commission}</span>
                  </div>
                </div>
                {refundAmount > 0 && (
                  <div className="col-span-2 bg-slate-50 border border-slate-200 rounded-2xl p-3 flex items-center justify-between">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Customer Refund Amount</span>
                    <div className="flex items-center gap-0.5">
                      <IndianRupee className="h-3 w-3 text-slate-700 shrink-0" />
                      <span className="text-sm font-black text-slate-800">{refundAmount}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Return reason */}
              {returnOrder.returnReason && (
                <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5">
                  <AlertCircle className="h-3.5 w-3.5 text-orange-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[9px] font-black text-orange-600 uppercase tracking-widest block leading-none mb-0.5">
                      Return Reason
                    </span>
                    <p className="text-xs font-semibold text-slate-800 leading-snug">{returnOrder.returnReason}</p>
                    {returnOrder.returnReasonDetail && (
                      <p className="text-[11px] text-slate-600 italic mt-0.5 line-clamp-2">{returnOrder.returnReasonDetail}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Return items */}
              {returnItems.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Items to Collect ({returnItems.length})
                  </p>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
                    {returnItems.map((item, idx) => (
                      <ReturnItemRow key={idx} item={item} />
                    ))}
                  </div>
                </div>
              )}

              {/* Route preview */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Route for Rider</p>

                {/* Customer pickup */}
                <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-100 rounded-2xl p-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center mt-0.5 shrink-0">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest leading-none mb-0.5">
                      Pickup from Customer
                    </p>
                    <p className="text-xs font-bold text-slate-900 leading-snug">{customerName}</p>
                    <p className="text-[11px] font-medium text-slate-500 leading-tight mt-0.5 line-clamp-2">{customerAddress}</p>
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex justify-center">
                  <ArrowDown className="h-4 w-4 text-amber-400" />
                </div>

                {/* Seller drop */}
                <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-100 rounded-2xl p-3">
                  <MapPin className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black text-rose-700 uppercase tracking-widest leading-none mb-0.5">
                      Drop at Your Store
                    </p>
                    <p className="text-xs font-bold text-slate-900 leading-snug">{sellerName}</p>
                    <p className="text-[11px] font-medium text-slate-500 leading-tight mt-0.5 line-clamp-2">{sellerAddress}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-slate-100 bg-white flex gap-3 items-center justify-end shrink-0">
              <button
                onClick={() => !isLoading && onClose()}
                disabled={isLoading}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-all disabled:opacity-40"
              >
                Close
              </button>
              <Button
                onClick={() => onConfirm(returnOrder.orderId)}
                disabled={isLoading}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs px-5 py-2.5 rounded-xl shadow-md shadow-amber-200 disabled:opacity-60"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Notifying…
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4" />
                    Notify Riders
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default NotifyRidersModal;
