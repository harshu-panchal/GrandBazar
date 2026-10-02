import React, { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const CANCEL_REASONS = [
  "Changed my mind",
  "Ordered by mistake",
  "Found a better price elsewhere",
  "Delivery is taking too long",
  "Wrong address or delivery details",
  "Other",
];

const CancelOrderModal = ({ isOpen, onClose, onConfirm, isSubmitting, isApprovalFlow }) => {
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");

  const isOther = selectedReason === "Other";
  const finalReason = isOther ? customReason.trim() : selectedReason;
  const canConfirm = Boolean(finalReason) && !isSubmitting;

  const handleClose = () => {
    if (isSubmitting) return;
    setSelectedReason("");
    setCustomReason("");
    onClose?.();
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm?.(finalReason);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-t-[2rem] sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-xl font-black text-slate-800">Cancel Order</h2>
                  <p className="text-sm text-slate-500 font-medium">
                    {isApprovalFlow
                      ? "Tell us why — your request will go to admin for approval."
                      : "Tell us why you're cancelling this order."}
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="p-2 bg-slate-50 rounded-full hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>

              <div className="space-y-2 mb-4">
                {CANCEL_REASONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setSelectedReason(reason)}
                    disabled={isSubmitting}
                    className={`w-full text-left px-4 py-3 rounded-2xl border text-sm font-semibold transition-all ${
                      selectedReason === reason
                        ? "border-rose-300 bg-rose-50 text-rose-700"
                        : "border-slate-100 text-slate-600 hover:border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>

              {isOther && (
                <textarea
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-rose-200"
                  rows={3}
                  placeholder="Please describe your reason"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  disabled={isSubmitting}
                  autoFocus
                />
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="py-3.5 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Go Back
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  className="py-3.5 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={18} className="animate-spin" /> Cancelling...
                    </>
                  ) : (
                    "Confirm Cancel"
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CancelOrderModal;
