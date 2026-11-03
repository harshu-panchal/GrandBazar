import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChevronLeft, MessageSquareText, Star } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { customerApi } from '../services/customerApi';
import { formatOrderId } from '@/shared/utils/orderId';

const PAGE_SIZE = 10;

const RatingStars = ({ value }) => (
    <div className="flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((star) => (
            <Star
                key={star}
                size={17}
                className={star <= Number(value) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}
            />
        ))}
    </div>
);

const MyReviewsPage = () => {
    const navigate = useNavigate();
    const [page, setPage] = useState(1);
    const [data, setData] = useState({ items: [], total: 0, totalPages: 1 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError('');
        customerApi.getMyReviews({ page, limit: PAGE_SIZE })
            .then((response) => {
                if (!cancelled) setData(response.data?.result || { items: [], total: 0, totalPages: 1 });
            })
            .catch((requestError) => {
                if (!cancelled) setError(requestError.response?.data?.message || 'Failed to load your reviews');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [page]);

    return (
        <div className="min-h-screen bg-slate-50 pb-24 md:pb-10">
            <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">
                <div className="mx-auto flex max-w-3xl items-center gap-2">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-200"
                        aria-label="Go back"
                    >
                        <ChevronLeft size={22} />
                    </button>
                    <div>
                        <h1 className="text-xl font-semibold text-slate-900">My Reviews</h1>
                        <p className="text-xs text-slate-500">Ratings and feedback you have shared</p>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-3xl space-y-3 px-4 py-5">
                {loading ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading your reviews…</div>
                ) : error ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
                ) : data.items.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
                        <MessageSquareText className="mx-auto mb-3 text-slate-300" size={36} />
                        <h2 className="font-semibold text-slate-900">No reviews yet</h2>
                        <p className="mt-1 text-sm text-slate-500">Your product reviews will appear here after you rate a delivered order.</p>
                        <Link to="/orders" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">View your orders</Link>
                    </div>
                ) : (
                    <>
                        <p className="text-sm text-slate-500">{data.total} review{data.total === 1 ? '' : 's'}</p>
                        {data.items.map((review) => (
                            <article key={review._id} className="rounded-xl border border-slate-200 bg-white p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h2 className="font-semibold text-slate-900">
                                            {review.productId?.name || review.storeId?.shopName || 'Order review'}
                                        </h2>
                                        {review.orderId?.orderId && (
                                            <Link to={`/orders/${review.orderId.orderId}`} className="text-xs font-medium text-primary hover:underline">
                                                Order #{formatOrderId(review.orderId)}
                                            </Link>
                                        )}
                                    </div>
                                    <RatingStars value={review.rating} />
                                </div>
                                {review.comment ? (
                                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{review.comment}</p>
                                ) : (
                                    <p className="mt-3 text-sm italic text-slate-400">No written comment</p>
                                )}
                                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                    {review.verifiedPurchase && (
                                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                                            <CheckCircle2 size={14} /> Verified purchase
                                        </span>
                                    )}
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 capitalize">{review.status}</span>
                                    <span>{new Date(review.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                </div>
                            </article>
                        ))}
                        {data.totalPages > 1 && (
                            <div className="flex items-center justify-between pt-2">
                                <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40">Previous</button>
                                <span className="text-sm text-slate-500">Page {page} of {data.totalPages}</span>
                                <button type="button" disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40">Next</button>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
};

export default MyReviewsPage;
