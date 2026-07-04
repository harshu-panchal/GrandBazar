import React, { useState } from "react";
import { customerApi } from "../../services/customerApi";
import DeliverySlotPicker from "../checkout/DeliverySlotPicker";
import { toast } from "sonner";

export default function OrderLifecycleActions({ order, onRefresh }) {
  const [showReschedule, setShowReschedule] = useState(false);
  const [schedulePayload, setSchedulePayload] = useState(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [paying, setPaying] = useState(false);

  if (!order) return null;

  const canReschedule = ["pending", "confirmed", "reschedule_requested", "preorder_confirmed"].includes(
    String(order.status || "").toLowerCase(),
  );
  const awaitingExtra =
    order.status === "awaiting_extra_payment" ||
    order.workflowStatus === "AWAITING_EXTRA_PAYMENT";
  const canDispute = order.status === "delivered" || order.workflowStatus === "DELIVERED";

  const submitReschedule = async () => {
    try {
      const fn =
        order.status === "confirmed" || order.workflowStatus === "SCHEDULED_HOLD"
          ? customerApi.requestReschedule
          : customerApi.rescheduleOrder;
      await fn(order.orderId, {
        deliveryDate: schedulePayload?.deliveryDate,
        windowLabel: schedulePayload?.windowLabel,
        reason: "Customer requested reschedule",
      });
      toast.success("Reschedule submitted");
      setShowReschedule(false);
      onRefresh?.();
    } catch (e) {
      toast.error(e.response?.data?.message || "Reschedule failed");
    }
  };

  const payDifference = async () => {
    try {
      setPaying(true);
      await customerApi.payOrderDifference(order.orderId, {});
      toast.success("Extra payment recorded");
      onRefresh?.();
    } catch (e) {
      toast.error(e.response?.data?.message || "Payment failed");
    } finally {
      setPaying(false);
    }
  };

  const raiseDispute = async () => {
    try {
      await customerApi.raiseDispute(order.orderId, {
        reason: disputeReason,
        reasonCategory: "other",
      });
      toast.success("Dispute raised");
      onRefresh?.();
    } catch (e) {
      toast.error(e.response?.data?.message || "Could not raise dispute");
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-800">Order actions</h3>

      {awaitingExtra && (
        <button
          type="button"
          disabled={paying}
          onClick={payDifference}
          className="w-full rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white"
        >
          Pay difference ₹{order.priceAdjustment?.deltaAmount || 0}
        </button>
      )}

      {canReschedule && (
        <>
          <button
            type="button"
            onClick={() => setShowReschedule((v) => !v)}
            className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold"
          >
            Reschedule delivery
          </button>
          {showReschedule && (
            <div className="space-y-2">
              <DeliverySlotPicker
                sellerId={order.seller?._id || order.seller}
                fulfillmentType={order.fulfillmentType === "preorder" ? "preorder" : "scheduled"}
                onChange={setSchedulePayload}
              />
              <button
                type="button"
                onClick={submitReschedule}
                className="w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white"
              >
                Confirm reschedule
              </button>
            </div>
          )}
        </>
      )}

      {canDispute && !order.disputeRef && (
        <div className="space-y-2">
          <textarea
            className="w-full rounded-xl border border-slate-200 p-2 text-sm"
            placeholder="Describe the issue"
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
          />
          <button
            type="button"
            onClick={raiseDispute}
            className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700"
          >
            Raise dispute
          </button>
        </div>
      )}
    </div>
  );
}
