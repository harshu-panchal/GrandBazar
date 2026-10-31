import { AlertCircle, Check, Clock3, Headphones, IndianRupee, RotateCw } from "lucide-react";

const STEPS = [
  { key: "RECEIVED", label: "Complaint received" },
  { key: "UNDER_REVIEW", label: "Under review" },
  { key: "CONTACTED", label: "Customer contacted" },
  { key: "IN_PROGRESS", label: "Resolution in progress" },
  { key: "REFUNDED", label: "Refund processed" },
  { key: "RESOLVED", label: "Resolved" },
];

const formatDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function ComplaintStatusTracker({ data, loading, error, onRetry }) {
  if (loading && !data) {
    return (
      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
          <RotateCw size={17} className="animate-spin" /> Loading complaint status...
        </div>
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="rounded-3xl border border-rose-100 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="mt-0.5 text-rose-500" />
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-900">Complaint status is unavailable</p>
            <p className="mt-1 text-xs text-slate-500">{error}</p>
          </div>
          <button type="button" onClick={onRetry} className="text-xs font-bold text-brand-600">Retry</button>
        </div>
      </section>
    );
  }

  const complaint = data?.complaint;
  if (!complaint || complaint.submitType !== "complaint") return null;

  const reached = new Map((data.timeline || []).map((entry) => [entry.key, entry]));
  const isResolved = complaint.status === "CLOSED";
  const hasRefund = reached.has("REFUNDED") || Boolean(complaint.refundTxnNo);
  const currentKey = data.timeline?.at(-1)?.key || "RECEIVED";

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-r from-rose-50 to-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <Headphones size={20} />
            </div>
            <div>
              <h2 className="font-black text-slate-900">Complaint tracking</h2>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">Ticket #{complaint.complaintId}</p>
            </div>
          </div>
          <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${isResolved ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            {isResolved ? "Resolved" : "In progress"}
          </span>
        </div>
        {complaint.isOverdue && !isResolved && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            This complaint has passed its expected resolution date. Our support team is following up.
          </p>
        )}
      </div>

      <div className="p-5">
        <div className="ml-1">
          {STEPS.map((step, index) => {
            const milestone = reached.get(step.key);
            const refundSkipped = step.key === "REFUNDED" && isResolved && !hasRefund;
            const complete = Boolean(milestone);
            const active = !isResolved && step.key === currentKey;
            const last = index === STEPS.length - 1;
            return (
              <div key={step.key} className="relative flex min-h-[68px] gap-4">
                {!last && <span className={`absolute left-[15px] top-8 h-[calc(100%-16px)] w-0.5 ${complete && !refundSkipped ? "bg-rose-500" : "bg-slate-200"}`} />}
                <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${complete ? "border-rose-500 bg-rose-500 text-white" : active ? "border-rose-500 bg-white text-rose-500" : "border-slate-200 bg-white text-slate-300"}`}>
                  {complete ? <Check size={16} strokeWidth={3} /> : active ? <Clock3 size={15} /> : <span className="h-2 w-2 rounded-full bg-current" />}
                </span>
                <div className="min-w-0 pb-5 pt-1">
                  <p className={`text-sm font-bold ${complete || active ? "text-slate-900" : "text-slate-400"}`}>
                    {refundSkipped ? "Refund not required" : step.label}
                  </p>
                  {milestone?.at && <p className="mt-1 text-xs text-slate-500">{formatDateTime(milestone.at)}</p>}
                  {active && <p className="mt-1 text-xs font-semibold text-rose-600">Current status</p>}
                </div>
              </div>
            );
          })}
        </div>

        {Number(complaint.amount) > 0 && (
          <div className="mt-1 flex items-center gap-3 rounded-2xl bg-emerald-50 p-3 text-emerald-800">
            <IndianRupee size={18} />
            <div>
              <p className="text-xs font-bold">Refund amount: ₹{Number(complaint.amount).toLocaleString("en-IN")}</p>
              {complaint.refundTxnNo && <p className="mt-0.5 text-[11px]">Transaction: {complaint.refundTxnNo}</p>}
            </div>
          </div>
        )}
        {isResolved && complaint.summary && (
          <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Resolution</p>
            <p className="mt-1 text-sm text-slate-700">{complaint.summary}</p>
          </div>
        )}
      </div>
    </section>
  );
}
