import React from "react";
import { motion } from "framer-motion";
import { CheckCircle, Circle, Clock, PackageCheck, Bike, Truck, Home, ClipboardList, Wallet, XCircle } from "lucide-react";
import { getLegacyStatusFromOrder, getOrderTrackerStep } from "@/shared/utils/orderStatus";

const OrderProgressTracker = ({
  order,
  estimatedArrivalText = "12:45 PM",
  arrivingInText = "8 mins",
  totalDistanceText = "—",
}) => {
  const status = getLegacyStatusFromOrder(order);
  const isCustomerPickup = order?.fulfillmentMethod === "customer_pickup";

  if (status === "cancelled") {
    // financeFlags.cancellationReversed just means the reversal routine ran —
    // it's set even for a plain COD order where nothing was ever collected.
    // Mirror the backend's own gate for whether money actually moved back
    // (reverseOrderFinanceOnCancellation only creates a Refund when online
    // capture happened or a wallet amount was used at checkout).
    const hadPayment =
      (order?.paymentMode === "ONLINE" && order?.financeFlags?.onlinePaymentCaptured) ||
      Number(order?.pricing?.walletAmount || order?.paymentBreakdown?.walletAmount || 0) > 0;
    const refundIssued = Boolean(order?.financeFlags?.cancellationReversed) && hadPayment;
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
            <XCircle size={20} className="text-rose-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-rose-800">Order Cancelled</p>
            {order?.cancelReason && (
              <p className="text-xs text-rose-600 mt-0.5">{order.cancelReason}</p>
            )}
          </div>
        </div>
        {refundIssued && (
          <div className="flex items-center gap-3 border-t border-rose-200 pt-3">
            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <Wallet size={18} className="text-emerald-600" />
            </div>
            <p className="text-xs font-semibold text-emerald-800">
              Refund Initiated — the amount has been credited to your wallet.
            </p>
          </div>
        )}
      </div>
    );
  }

  const showLogistics = !isCustomerPickup;
  const showOutForDelivery = !isCustomerPickup;

  const allSteps = [
    { id: "placed", label: "Order Placed", icon: ClipboardList },
    { id: "received", label: "Order Received", icon: Circle },
    { id: "accepted", label: "Order Accepted", icon: CheckCircle },
    { id: "logistics", label: "Logistics Assigned", icon: Bike, hidden: !showLogistics },
    { id: "packed", label: isCustomerPickup ? "Ready for Pickup" : "Order Packed", icon: PackageCheck },
    { id: "out_for_delivery", label: "Out for Delivery", icon: Truck, hidden: !showOutForDelivery },
    { id: "delivered", label: isCustomerPickup ? "Picked Up" : "Delivered", icon: Home },
  ];
  const steps = allSteps.filter((s) => !s.hidden);

  // Stage indexes from getOrderTrackerStep are defined against the full
  // 7-slot timeline (0=placed .. 6=delivered) — re-map onto whichever steps
  // are actually shown for this order's fulfillment method.
  const fullIndex = getOrderTrackerStep(order);
  const stepFullIndexMap = { placed: 0, received: 1, accepted: 2, logistics: 3, packed: 4, out_for_delivery: 5, delivered: 6 };
  const currentStepPosition = steps.reduce((closest, step, idx) => {
    return stepFullIndexMap[step.id] <= fullIndex ? idx : closest;
  }, 0);

  const getStepStatus = (index) => {
    if (index < currentStepPosition) return "completed";
    if (index === currentStepPosition) return status === "delivered" ? "completed" : "active";
    return "pending";
  };

  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-4">
        {steps.map((step, index) => {
          const stepStatus = getStepStatus(index);
          const Icon = step.icon;
          const isCompleted = stepStatus === "completed";
          const isActive = stepStatus === "active";

          return (
            <div
              key={step.id}
              className="relative transition-opacity duration-200">
              <div className="flex items-center gap-4">
                {/* Icon Circle */}
                <div
                  className={`relative z-10 h-12 w-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isCompleted
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : isActive
                      ? "bg-amber-100 text-amber-600 border-2 border-amber-400"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle size={24} className="fill-current" />
                  ) : isActive ? (
                    <div className="animate-spin">
                      <Icon size={22} />
                    </div>
                  ) : (
                    <Circle size={22} />
                  )}
                </div>

                {/* Label */}
                <div className="flex-1">
                  <p
                    className={`text-sm font-bold ${
                      isCompleted
                        ? "text-slate-900"
                        : isActive
                        ? "text-amber-700"
                        : "text-slate-400"
                    }`}
                  >
                    {step.label}
                  </p>
                  {isActive && (
                    <p className="text-xs text-amber-600 font-medium mt-0.5">
                      In progress...
                    </p>
                  )}
                </div>

                {/* Status Indicator */}
                {isCompleted && (
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center transition-opacity duration-200">
                    <CheckCircle size={14} className="text-primary" />
                  </div>
                )}
              </div>

              {/* Connecting Line */}
              {index < steps.length - 1 && (
                <div className="absolute left-6 top-12 bottom-0 w-0.5 -mb-4">
                  <div
                    className={`h-full w-full ${
                      isCompleted ? "bg-primary" : "bg-slate-200"
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </motion.div>

      {/* ETA Display — not applicable to self-pickup orders */}
      {status !== "delivered" && !isCustomerPickup && (
        <div className="mt-6 pt-5 border-t border-slate-100">
          <div className="flex items-center justify-between bg-amber-50 rounded-2xl p-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <Clock size={20} className="text-amber-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                  Estimated Time
                </p>
                <p className="text-lg font-black text-amber-900">{estimatedArrivalText}</p>
              </div>
            </div>
            <div className="text-right flex flex-col items-end gap-1">
              <div>
                <p className="text-xs text-amber-600 font-semibold">Arriving in</p>
                <p className="text-2xl font-black text-amber-900">{arrivingInText}</p>
              </div>
              <div className="inline-flex items-center rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200">
                Total distance: {totalDistanceText}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderProgressTracker;
