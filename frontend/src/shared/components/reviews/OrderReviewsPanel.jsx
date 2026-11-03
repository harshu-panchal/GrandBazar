import React from 'react';
import { CheckCircle2, MessageSquareText, Star } from 'lucide-react';

const formatDate = (value) => {
    if (!value) return '';
    return new Date(value).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
};

const Stars = ({ value }) => (
    <div className="flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((star) => (
            <Star
                key={star}
                size={16}
                className={star <= Number(value) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}
            />
        ))}
    </div>
);

const OrderReviewsPanel = ({ reviews = [], loading = false, showStatus = false, className = '' }) => (
    <section className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
        <div className="mb-3 flex items-center gap-2">
            <MessageSquareText size={18} className="text-slate-600" />
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">
                Customer Reviews {reviews.length ? `(${reviews.length})` : ''}
            </h3>
        </div>

        {loading ? (
            <p className="text-sm text-slate-500">Loading reviews…</p>
        ) : reviews.length === 0 ? (
            <p className="text-sm text-slate-500">The customer has not reviewed this order yet.</p>
        ) : (
            <div className="space-y-3">
                {reviews.map((review) => (
                    <article key={review._id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                                <p className="text-sm font-bold text-slate-900">
                                    {review.productId?.name || review.storeId?.shopName || 'Order review'}
                                </p>
                                {review.userId?.name && (
                                    <p className="mt-0.5 text-xs text-slate-500">By {review.userId.name}</p>
                                )}
                            </div>
                            <Stars value={review.rating} />
                        </div>
                        {review.comment ? (
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-slate-700">{review.comment}</p>
                        ) : (
                            <p className="mt-2 text-sm italic text-slate-400">No written comment</p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
                            {review.verifiedPurchase && (
                                <span className="inline-flex items-center gap-1 text-emerald-700">
                                    <CheckCircle2 size={13} /> Verified purchase
                                </span>
                            )}
                            {showStatus && review.status && (
                                <span className="rounded-full bg-slate-200 px-2 py-0.5 capitalize text-slate-700">
                                    {review.status}
                                </span>
                            )}
                            <span>{formatDate(review.createdAt)}</span>
                        </div>
                    </article>
                ))}
            </div>
        )}
    </section>
);

export default OrderReviewsPanel;
