import React, { useEffect, useState } from 'react';
import Card from '@shared/components/ui/Card';
import { inr, Skeleton } from '@shared/components/dashboard/common';
import { adminApi } from '../../services/adminApi';
import { useNavigate } from 'react-router-dom';
import { Store, Wallet, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

function todayIso(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
}

const SellerEarningsPanel = () => {
    const navigate = useNavigate();
    const [from] = useState(todayIso(-90));
    const [to] = useState(todayIso());
    const [data, setData] = useState({ topSellers: [], totals: {}, sellerWallets: {} });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const fetchSummary = async () => {
            try {
                setLoading(true);
                const res = await adminApi.getSellerEarningsSummary({ from, to, limit: 20 });
                if (!cancelled && res.data.success) {
                    setData(res.data.result || { topSellers: [], totals: {}, sellerWallets: {} });
                }
            } catch (error) {
                if (!cancelled) toast.error(error.response?.data?.message || 'Failed to load seller earnings summary');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchSummary();
        return () => { cancelled = true; };
    }, [from, to]);

    const sellers = Array.isArray(data.topSellers) ? data.topSellers : [];
    const wallets = data.sellerWallets || {};
    const totals = data.totals || {};

    return (
        <div className="space-y-6">
            <div>
                <h2 className="ds-h2">Seller Earnings</h2>
                <p className="text-xs text-slate-500 mt-1">
                    What sellers earned platform-wide, last 90 days (delivered orders).
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="p-5 border-none ring-1 ring-slate-100 shadow-sm">
                    <p className="ds-label mb-1">Total Seller Payout (period)</p>
                    <h3 className="ds-stat-medium">{loading ? <Skeleton className="h-7 w-24" /> : inr(totals.sellerPayout)}</h3>
                </Card>
                <Card className="p-5 border-none ring-1 ring-slate-100 shadow-sm">
                    <p className="ds-label mb-1">Commission Charged (period)</p>
                    <h3 className="ds-stat-medium">{loading ? <Skeleton className="h-7 w-24" /> : inr(totals.commission)}</h3>
                </Card>
                <Card className="p-5 border-none ring-1 ring-slate-100 shadow-sm">
                    <p className="ds-label mb-1">Available to Withdraw (all sellers)</p>
                    <h3 className="ds-stat-medium">{loading ? <Skeleton className="h-7 w-24" /> : inr(wallets.totalAvailable)}</h3>
                </Card>
                <Card className="p-5 border-none ring-1 ring-slate-100 shadow-sm">
                    <p className="ds-label mb-1">Pending Payout (all sellers)</p>
                    <h3 className="ds-stat-medium">{loading ? <Skeleton className="h-7 w-24" /> : inr(wallets.totalPending)}</h3>
                </Card>
            </div>

            <Card title="Top Sellers by Commission Paid to Platform" subtitle={`${from} → ${to}`} contentClassName="p-4">
                {loading ? (
                    <div className="space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                    </div>
                ) : sellers.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-10">No seller earnings recorded in this range yet.</p>
                ) : (
                    <ul className="divide-y divide-slate-50">
                        {sellers.map((row, i) => (
                            <li key={row.id || i} className="flex items-center gap-3 py-3">
                                <span className="h-7 w-7 rounded-lg bg-primary/10 text-primary text-xs font-black flex items-center justify-center shrink-0">
                                    {i + 1}
                                </span>
                                <div className="h-8 w-8 rounded-lg bg-brand-50 text-brand-500 flex items-center justify-center shrink-0">
                                    <Store className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-900 truncate">{row.name}</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">{row.orderCount} orders</p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-sm font-black text-slate-900">{inr(row.sellerPayout)}</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">Commission: {inr(row.commission)}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>

            <button
                onClick={() => navigate('/admin/seller-transactions')}
                className="w-full p-4 bg-white ring-1 ring-slate-100 rounded-[24px] flex items-center justify-between group hover:ring-primary/20 hover:shadow-lg transition-all"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-50 text-purple-500 rounded-xl"><Wallet className="h-4 w-4" /></div>
                    <div className="text-left">
                        <span className="text-xs font-black text-slate-700 block">Per-Seller Transactions</span>
                        <span className="text-[10px] text-slate-400">Filter by seller, drill into commission/tax/packaging</span>
                    </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-300 group-hover:translate-x-1 transition-transform" />
            </button>
        </div>
    );
};

export default SellerEarningsPanel;
