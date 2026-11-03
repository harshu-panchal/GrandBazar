import React, { useEffect, useMemo, useState } from "react";
import { Star, CheckCircle2 } from "lucide-react";
import { customerApi } from "../../services/customerApi";
import { toast } from "sonner";
import { getLegacyStatusFromOrder } from "@/shared/utils/orderStatus";

/**
 * "Rate your order" — shown once an order is delivered. Submits one review
 * per item via the existing product-review endpoint, but with orderId
 * attached so the backend marks it verifiedPurchase (see
 * reviewController.js resolveVerifiedPurchase). Existing product reviews are
 * loaded first so products reviewed from this or an earlier order are never
 * offered for rating again.
 */
function ItemRatingRow({ item, orderId, onReviewed }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [alreadyRated, setAlreadyRated] = useState(false);

  const productId = item.product?._id || item.product;

  if (!productId) return null;

  const handleSubmit = async () => {
    if (!rating) {
      toast.error("Pick a star rating first");
      return;
    }
    setSubmitting(true);
    try {
      await customerApi.submitReview({
        targetType: "product",
        productId,
        orderId,
        rating,
        comment: comment.trim() || "Great product!",
      });
      setDone(true);
      onReviewed(productId);
      toast.success("Thanks for your review!");
    } catch (error) {
      const message = error?.response?.data?.message || "";
      if (message.toLowerCase().includes("already reviewed")) {
        setAlreadyRated(true);
        onReviewed(productId);
      } else {
        toast.error(message || "Failed to submit rating");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (done || alreadyRated) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs font-semibold text-emerald-600">
        <CheckCircle2 size={14} />
        {done ? `Thanks for rating ${item.name}!` : `You've already rated ${item.name}.`}
      </div>
    );
  }

  return (
    <div className="py-2 border-b border-slate-50 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-800 truncate">{item.name}</span>
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => {
                setRating(star);
                setExpanded(true);
              }}
              className="text-amber-400 hover:scale-110 transition-transform"
              aria-label={`Rate ${star} star`}
            >
              <Star size={18} className={rating >= star ? "fill-current" : ""} />
            </button>
          ))}
        </div>
      </div>
      {expanded && (
        <div className="mt-2 space-y-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tell others what you thought (optional)"
            rows={2}
            className="w-full text-xs border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 rounded-xl bg-brand-600 text-white text-xs font-bold hover:bg-brand-700 transition-all disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Submit Rating"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function RateOrderItems({ order }) {
  const legacy = getLegacyStatusFromOrder(order);
  const isDelivered = legacy === "delivered" || legacy === "disputed" || Boolean(order?.deliveredAt);
  const items = Array.isArray(order?.items) ? order.items : [];
  const orderId = order?.orderId || order?._id;
  const [reviewedProductIds, setReviewedProductIds] = useState(() => new Set());
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsLoadFailed, setReviewsLoadFailed] = useState(false);

  useEffect(() => {
    if (!orderId || !isDelivered) {
      setReviewsLoading(false);
      return undefined;
    }

    let cancelled = false;
    setReviewsLoading(true);
    setReviewsLoadFailed(false);
    customerApi.getOrderReviews(orderId, { limit: 200 })
      .then((response) => {
        if (cancelled) return;
        const ids = (response.data?.result?.items || [])
          .map((review) => review.productId?._id || review.productId)
          .filter(Boolean)
          .map(String);
        setReviewedProductIds(new Set(ids));
      })
      .catch(() => {
        if (!cancelled) setReviewsLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setReviewsLoading(false);
      });

    return () => { cancelled = true; };
  }, [isDelivered, orderId]);

  const unreviewedItems = useMemo(
    () => items.filter((item) => {
      const productId = item.product?._id || item.product;
      return productId && !reviewedProductIds.has(String(productId));
    }),
    [items, reviewedProductIds],
  );

  const markReviewed = (productId) => {
    setReviewedProductIds((current) => new Set([...current, String(productId)]));
  };

  if (!isDelivered || !items.length) return null;

  // Never show a fresh rating prompt when existing-review state could not be
  // verified; that could invite a duplicate submission.
  if (reviewsLoading || reviewsLoadFailed) return null;

  if (!unreviewedItems.length) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm font-semibold text-emerald-700">
        <CheckCircle2 size={18} />
        You have reviewed all products in this order.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">
      <h4 className="text-sm font-bold text-slate-800 mb-1">Rate your order</h4>
      <p className="text-xs text-slate-500 mb-2">
        Your ratings are marked as a verified purchase and help other customers.
      </p>
      {unreviewedItems.map((item, idx) => (
        <ItemRatingRow
          key={item.product?._id || item.product || idx}
          item={item}
          orderId={orderId}
          onReviewed={markReviewed}
        />
      ))}
    </div>
  );
}
