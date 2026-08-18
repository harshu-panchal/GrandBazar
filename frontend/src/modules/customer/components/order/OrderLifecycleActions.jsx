import React, { useState, useEffect } from "react";
import { customerApi } from "../../services/customerApi";
import DeliverySlotPicker from "../checkout/DeliverySlotPicker";
import AddOrderItemsModal from "./AddOrderItemsModal";
import { canCustomerAddItems, getLegacyStatusFromOrder } from "@/shared/utils/orderStatus";
import { toast } from "sonner";

// Complaints share the exact same post-delivery window as returns/refunds
// (see backend/app/utils/returnWindow.js) — same admin setting, same
// countdown semantics as the return-request flow on OrderDetailPage.
export default function OrderLifecycleActions({ order, onRefresh, returnWindowMinutes = 1440 }) {
  const [showReschedule, setShowReschedule] = useState(false);
  const [schedulePayload, setSchedulePayload] = useState(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [paying, setPaying] = useState(false);
  const [reviewingReplacement, setReviewingReplacement] = useState("");
  const [disputeCountdown, setDisputeCountdown] = useState(null);
  const [showAddItems, setShowAddItems] = useState(false);

  const isDelivered = getLegacyStatusFromOrder(order) === "delivered";

  useEffect(() => {
    if (!order || !isDelivered) {
      setDisputeCountdown(null);
      return undefined;
    }
    const windowStart = new Date(order.deliveredAt || order.createdAt).getTime();
    const windowMs = returnWindowMinutes * 60 * 1000;
    const tick = () => {
      const remaining = Math.max(0, windowStart + windowMs - Date.now());
      if (remaining <= 0) {
        setDisputeCountdown(0);
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setDisputeCountdown(`${mins}:${secs.toString().padStart(2, "0")}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [order, isDelivered, returnWindowMinutes]);

  if (!order) return null;

  const legacyStatus = getLegacyStatusFromOrder(order);
  const canReschedule = ["pending", "confirmed", "reschedule_requested", "preorder_confirmed"].includes(
    legacyStatus,
  );
  const awaitingExtra = legacyStatus === "awaiting_extra_payment";
  // The server is always the source of truth and will reject a late
  // request regardless — this just keeps the button from inviting a
  // complaint the backend is going to refuse anyway.
  const canDispute = isDelivered && disputeCountdown !== 0;
  const canAddItems = canCustomerAddItems(order);
  const pendingReplacementRequests = Array.isArray(order.replacementRequests)
    ? order.replacementRequests.filter((request) => request?.customerDecision === "pending")
    : [];

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

  const reviewReplacement = async (requestId, decision, selectedAlternativeIndex = 0) => {
    try {
      setReviewingReplacement(`${requestId}:${decision}`);
      await customerApi.reviewReplacementRequest(order.orderId, requestId, {
        decision,
        selectedAlternativeIndex,
      });
      toast.success(
        decision === "approved"
          ? "Replacement approved. Order price/status updated."
          : "Replacement rejected. Seller has been notified.",
      );
      onRefresh?.();
    } catch (e) {
      toast.error(e.response?.data?.message || "Could not update replacement request");
    } finally {
      setReviewingReplacement("");
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

      {canAddItems && (
        <button
          type="button"
          onClick={() => setShowAddItems(true)}
          className="w-full rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary"
        >
          Add items to this order
        </button>
      )}
      {showAddItems && (
        <AddOrderItemsModal
          order={order}
          onClose={() => setShowAddItems(false)}
          onAdded={() => onRefresh?.()}
        />
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
          {disputeCountdown && disputeCountdown !== 0 && (
            <p className="text-xs font-semibold text-red-600">
              Complaint window ends in {disputeCountdown}
            </p>
          )}
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
      {isDelivered && disputeCountdown === 0 && !order.disputeRef && (
        <p className="text-xs font-semibold text-slate-400">
          The complaint window for this order has closed.
        </p>
      )}

      {pendingReplacementRequests.length > 0 && (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-700">
            Replacement approval required
          </h4>
          {pendingReplacementRequests.map((request) => (
            <div key={request.requestId} className="rounded-lg border border-amber-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-700">
                Seller requested replacement for item #{Number(request.itemIndex) + 1}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{request.reason || "No reason provided"}</p>
              <div className="mt-2 space-y-2">
                {(request.alternatives || []).map((alt, idx) => (
                  <div key={`${request.requestId}-${idx}`} className="rounded-md border border-slate-200 p-2">
                    <p className="text-xs font-semibold text-slate-700">
                      {alt.name || "Alternative product"} - ₹{Number(alt.price || 0).toFixed(2)}
                    </p>
                    <button
                      type="button"
                      disabled={reviewingReplacement === `${request.requestId}:approved`}
                      onClick={() => reviewReplacement(request.requestId, "approved", idx)}
                      className="mt-2 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      Approve this option
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={reviewingReplacement === `${request.requestId}:rejected`}
                onClick={() => reviewReplacement(request.requestId, "rejected")}
                className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-60"
              >
                Reject replacement
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
