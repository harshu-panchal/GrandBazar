import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Package, ShieldCheck, Star, Store, Trash2 } from "lucide-react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Pagination from "@shared/components/ui/Pagination";
import { useToast } from "@shared/components/ui/Toast";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "approved", label: "Published" },
  { value: "pending", label: "Pending" },
  { value: "rejected", label: "Removed" },
];

const statusVariant = { approved: "success", pending: "warning", rejected: "error" };

const ReviewStars = ({ value }) => (
  <div className="flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((star) => (
      <Star key={star} className={cn("h-4 w-4", star <= Number(value) ? "fill-amber-400 text-amber-400" : "text-slate-200")} />
    ))}
  </div>
);

export default function ReviewsPage({ title, description, fetchReviews, updateStatus, canModerate = false }) {
  const { showToast } = useToast();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({ avgRating: 0, verifiedCount: 0 });
  const [status, setStatus] = useState("");
  const [targetType, setTargetType] = useState("");
  const [rating, setRating] = useState("");

  const loadReviews = useCallback(async (requestedPage = 1) => {
    try {
      setLoading(true);
      const response = await fetchReviews({
        page: requestedPage,
        limit: pageSize,
        ...(canModerate && status ? { status } : {}),
        ...(targetType ? { targetType } : {}),
        ...(rating ? { rating } : {}),
      });
      const payload = response?.data?.result || {};
      setReviews(Array.isArray(payload.items) ? payload.items : []);
      setPage(Number(payload.page || requestedPage));
      setTotal(Number(payload.total || 0));
      setTotalPages(Number(payload.totalPages || 1));
      setSummary(payload.summary || { avgRating: 0, verifiedCount: 0 });
    } catch (error) {
      setReviews([]);
      showToast(error?.response?.data?.message || "Failed to load reviews", "error");
    } finally {
      setLoading(false);
    }
  }, [canModerate, fetchReviews, pageSize, rating, showToast, status, targetType]);

  useEffect(() => { loadReviews(1); }, [loadReviews]);

  const changeStatus = async (review, nextStatus) => {
    if (!updateStatus) return;
    if (nextStatus === "rejected" && !window.confirm("Remove this review from public view?")) return;
    try {
      setActionId(`${review._id}:${nextStatus}`);
      await updateStatus(review._id, nextStatus);
      showToast(nextStatus === "approved" ? "Review published" : "Review removed", nextStatus === "approved" ? "success" : "warning");
      await loadReviews(page);
    } catch (error) {
      showToast(error?.response?.data?.message || "Could not update review", "error");
    } finally {
      setActionId("");
    }
  };

  return (
    <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="flex flex-col gap-5 px-1 lg:flex-row lg:items-end lg:justify-between">
        <div><h1 className="ds-h1">{title}</h1><p className="ds-description mt-1">{description}</p></div>
        <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[360px]">
          <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-sm"><p className="text-lg font-black text-slate-900">{total}</p><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Reviews</p></div>
          <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-sm"><p className="text-lg font-black text-amber-500">{Number(summary.avgRating || 0).toFixed(1)}</p><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Average</p></div>
          <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-sm"><p className="text-lg font-black text-emerald-600">{Number(summary.verifiedCount || 0)}</p><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Verified</p></div>
        </div>
      </div>

      <Card className="border border-slate-100 bg-white shadow-sm" contentClassName="p-4">
        <div className="flex flex-wrap gap-3">
          {canModerate && <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-primary/20">{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label} reviews</option>)}</select>}
          <select value={targetType} onChange={(event) => setTargetType(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-primary/20"><option value="">All review types</option><option value="product">Product reviews</option><option value="store">Store reviews</option></select>
          <select value={rating} onChange={(event) => setRating(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-primary/20"><option value="">All ratings</option>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} stars</option>)}</select>
        </div>
      </Card>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : reviews.length === 0 ? (
        <Card className="border border-dashed border-slate-200 bg-white text-center shadow-none" contentClassName="py-14"><Star className="mx-auto mb-3 h-9 w-9 text-slate-200" /><h3 className="text-sm font-black text-slate-700">No reviews found</h3><p className="mt-1 text-xs text-slate-400">Reviews matching these filters will appear here.</p></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {reviews.map((review) => {
            const isStoreReview = review.targetType === "store";
            const item = isStoreReview ? review.storeId : review.productId;
            const itemName = isStoreReview ? item?.shopName : item?.name;
            const itemImage = isStoreReview ? item?.banners?.[0] : (item?.mainImage || item?.images?.[0]);
            return (
              <Card key={review._id} className="border border-slate-100 bg-white shadow-sm" contentClassName="p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                  <div className="flex min-w-0 flex-1 gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-100">{itemImage ? <img src={itemImage} alt="" className="h-full w-full object-cover" /> : isStoreReview ? <Store className="h-6 w-6 text-slate-300" /> : <Package className="h-6 w-6 text-slate-300" />}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-black text-slate-900">{itemName || (isStoreReview ? "Store" : "Deleted product")}</h3><Badge variant="info">{isStoreReview ? "Store" : "Product"}</Badge>{review.verifiedPurchase && <Badge variant="success" className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Verified purchase</Badge>}{canModerate && <Badge variant={statusVariant[review.status] || "gray"}>{review.status || "pending"}</Badge>}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1"><ReviewStars value={review.rating} /><span className="text-xs font-bold text-slate-600">{review.userId?.name || "Customer"}</span><span className="text-[11px] text-slate-400">{new Date(review.createdAt).toLocaleString()}</span>{review.orderId?.orderId && <span className="text-[11px] font-semibold text-slate-400">Order #{review.orderId.orderId}</span>}</div>
                      <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">{review.comment}</p>
                    </div>
                  </div>
                  {canModerate && <div className="flex shrink-0 gap-2 lg:w-40 lg:flex-col">{review.status !== "approved" && <button type="button" disabled={Boolean(actionId)} onClick={() => changeStatus(review, "approved")} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-white disabled:opacity-50"><ShieldCheck className="h-4 w-4" /> Publish</button>}{review.status !== "rejected" && <button type="button" disabled={Boolean(actionId)} onClick={() => changeStatus(review, "rejected")} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-rose-100 bg-white px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-rose-600 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Remove</button>}</div>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Pagination className="mt-6" page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={loadReviews} onPageSizeChange={setPageSize} loading={loading} />
    </div>
  );
}
