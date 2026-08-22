import React, { useEffect, useState } from 'react';
import Card from '@shared/components/ui/Card';
import { inr, Skeleton } from '@shared/components/dashboard/common';
import { adminApi } from '../../services/adminApi';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const DIMENSIONS = [
    { value: 'product', label: 'By Product' },
    { value: 'category', label: 'By Category' },
    { value: 'shop', label: 'By Shop' },
    { value: 'city', label: 'By City' },
];

function todayIso(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
}

const EarningsBreakdownPanel = () => {
    const [dimension, setDimension] = useState('product');
    const [from, setFrom] = useState(todayIso(-90));
    const [to, setTo] = useState(todayIso());
    const [data, setData] = useState({ items: [], totals: {} });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const fetchBreakdown = async () => {
            try {
                setLoading(true);
                const res = await adminApi.getEarningsBreakdown({ dimension, from, to, limit: 20 });
                if (!cancelled && res.data.success) {
                    setData(res.data.result || { items: [], totals: {} });
                }
            } catch (error) {
                if (!cancelled) toast.error(error.response?.data?.message || 'Failed to load earnings breakdown');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchBreakdown();
        return () => { cancelled = true; };
    }, [dimension, from, to]);

    const items = Array.isArray(data.items) ? data.items : [];
    const totals = data.totals || {};
    const secondaryLabel = dimension === 'product' || dimension === 'category' ? 'Seller Payout' : 'Platform Earning';
    const secondaryValue = (row) => (dimension === 'product' || dimension === 'category' ? row.sellerPayout : row.platformEarning);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="ds-h2">Admin Commission Earnings Breakdown</h2>
                    <p className="text-xs text-slate-500 mt-1">
                        Platform commission earned on delivered orders, sliced by where it came from. Delivered, non-cancelled orders only.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        value={from}
                        max={to}
                        onChange={(e) => setFrom(e.target.value)}
                        className="px-3 py-2 bg-white ring-1 ring-slate-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/10"
                    />
                    <span className="text-xs text-slate-400">to</span>
                    <input
                        type="date"
                        value={to}
                        min={from}
                        max={todayIso()}
                        onChange={(e) => setTo(e.target.value)}
                        className="px-3 py-2 bg-white ring-1 ring-slate-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/10"
                    />
                </div>
            </div>

            <div className="flex bg-slate-100 p-1 rounded-xl w-fit overflow-x-auto">
                {DIMENSIONS.map((d) => (
                    <button
                        key={d.value}
                        onClick={() => setDimension(d.value)}
                        className={cn(
                            'px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all whitespace-nowrap',
                            dimension === d.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600',
                        )}
                    >
                        {d.label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-5 border-none ring-1 ring-slate-100 shadow-sm">
                    <p className="ds-label mb-1">Total Commission</p>
                    <h3 className="ds-stat-medium">{loading ? <Skeleton className="h-7 w-24" /> : inr(totals.commission)}</h3>
                </Card>
                <Card className="p-5 border-none ring-1 ring-slate-100 shadow-sm">
                    <p className="ds-label mb-1">{secondaryLabel === 'Seller Payout' ? 'Total Seller Payout' : 'Total Platform Earning'}</p>
                    <h3 className="ds-stat-medium">
                        {loading ? <Skeleton className="h-7 w-24" /> : inr(secondaryLabel === 'Seller Payout' ? totals.sellerPayout : totals.platformEarning)}
                    </h3>
                </Card>
                <Card className="p-5 border-none ring-1 ring-slate-100 shadow-sm">
                    <p className="ds-label mb-1">{dimension === 'product' || dimension === 'category' ? 'Line Items' : 'Orders'}</p>
                    <h3 className="ds-stat-medium">
                        {loading ? <Skeleton className="h-7 w-16" /> : (totals.lineCount ?? totals.orderCount ?? 0).toLocaleString()}
                    </h3>
                </Card>
            </div>

            <Card
                title={`Top ${DIMENSIONS.find((d) => d.value === dimension)?.label.replace('By ', '')}s by Commission`}
                subtitle={`${from} → ${to}`}
                contentClassName="p-4"
            >
                {loading ? (
                    <div className="space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                    </div>
                ) : items.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-10">No earnings recorded in this range yet.</p>
                ) : (
                    <ul className="divide-y divide-slate-50">
                        {items.map((row, i) => (
                            <li key={row.id || row.name || i} className="flex items-center gap-3 py-3">
                                <span className="h-7 w-7 rounded-lg bg-primary/10 text-primary text-xs font-black flex items-center justify-center shrink-0">
                                    {i + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-900 truncate">{row.name}</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">
                                        {(dimension === 'product' || dimension === 'category') ? `${row.orderCount} orders` : `${row.orderCount} orders`}
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-sm font-black text-slate-900">{inr(row.commission)}</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">{secondaryLabel}: {inr(secondaryValue(row))}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
        </div>
    );
};

export default EarningsBreakdownPanel;
