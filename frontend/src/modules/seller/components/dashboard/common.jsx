import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInr } from "@/shared/utils/sellerOrderMoney";

export const inr = (v) => `₹${formatInr(Math.round(Number(v || 0)))}`;

/** Small green/red trend chip: "↑ 18.6%" */
export const TrendChip = ({ pct, suffix }) => {
  if (pct === null || pct === undefined) return null;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-semibold",
        up ? "text-emerald-600" : "text-red-500",
      )}
    >
      <Icon className="h-3 w-3" />
      {up ? "+" : ""}
      {pct}%{suffix ? ` ${suffix}` : ""}
    </span>
  );
};

/** Consistent "View All" header link for widget cards */
export const ViewAllLink = ({ onClick, label = "View All" }) => (
  <button
    onClick={onClick}
    className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
  >
    {label}
  </button>
);

/** Icon chip with soft background */
export const IconChip = ({ icon: Icon, className }) => (
  <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", className)}>
    <Icon className="h-4.5 w-4.5" />
  </div>
);

/** Skeleton block for loading states */
export const Skeleton = ({ className }) => (
  <div className={cn("animate-pulse rounded-xl bg-slate-100", className)} />
);

/** Star rating display (supports halves visually via rounding) */
export const Stars = ({ rating, size = "h-3.5 w-3.5" }) => {
  if (rating === null || rating === undefined) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  const full = Math.round(Number(rating));
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          className={cn(size, i < full ? "fill-amber-400" : "fill-slate-200")}
        >
          <path d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L10 14.9l-5.3 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
        </svg>
      ))}
    </span>
  );
};

/** Range select dropdown used by chart cards */
export const RangeSelect = ({ value, onChange, options }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer hover:border-slate-300 focus:ring-2 focus:ring-primary/20"
  >
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);
