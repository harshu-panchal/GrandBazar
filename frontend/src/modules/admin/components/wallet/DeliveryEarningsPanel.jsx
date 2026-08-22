import React, { useEffect, useState } from 'react';
import Card from '@shared/components/ui/Card';
import { inr, Skeleton } from '@shared/components/dashboard/common';
import { adminApi } from '../../services/adminApi';
import { useNavigate } from 'react-router-dom';
import { Truck, Wallet, Banknote, TrendingUp, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

function todayIso(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
}

const DeliveryEarningsPanel = () => {
    const navigate = useNavigate();
    const [from] = useState(todayIso(-90));
    const [to] = useState(todayIso());
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const fetchSummary = async () => {
            try {
                setLoading(true);
                const res = await adminApi.getDeliveryEarningsSummary({ from, to });
                if (!cancelled && res.data.success) setData(res.data.result);
            } catch (error) {
                if (!cancelled) toast.error(error.response?.data?.message || 'Failed to load delivery earnings summary');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchSummary();
        return () => { cancelled = true; };
    }, [from, to]);

    const online = data?.byPaymentMode?.ONLINE || {};
    const cod = data?.byPaymentMode?.COD || {};

    return (
        <div className="space-y-6">
            <div>
                <h2 className="ds-h2">Delivery Partner Earnings</h2>
                <p className="text-xs text-slate-500 mt-1">
                    What riders earned and what the platform kept from delivery fees, last 90 days (delivered orders).
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="p-5 border-none ring-1 ring-slate-100 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                        <Truck className="h-4 w-4 text-brand-500" />
                        <p className="ds-label">Total Rider Earnings</p>
                    </div>
                    <h3 className="ds-stat-medium">{loading ? <Skeleton className="h-7 w-24" /> : inr(data?.riderEarnings)}</h3>
                    <p className="text-[10px] text-slate-400 mt-1">Base + distance + bonus + tip, across all riders</p>
                </Card>
                <Card className="p-5 border-none ring-1 ring-slate-100 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="h-4 w-4 text-purple-500" />
                        <p className="ds-label">Platform's Logistics Margin</p>
                    </div>
                    <h3 className="ds-stat-medium">{loading ? <Skeleton className="h-7 w-24" /> : inr(data?.platformLogisticsMargin)}</h3>
                    <p className="text-[10px] text-slate-400 mt-1">Delivery + handling fees collected, minus rider pay</p>
                </Card>
                <Card className="p-5 border-none ring-1 ring-slate-100 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                        <Banknote className="h-4 w-4 text-amber-500" />
                        <p className="ds-label">Rider Cash-in-Hand</p>
                    </div>
                    <h3 className="ds-stat-medium">{loading ? <Skeleton className="h-7 w-24" /> : inr(data?.riderWallets?.totalCashInHand)}</h3>
                    <p className="text-[10px] text-slate-400 mt-1">Un-remitted COD cash still with riders</p>
                </Card>
                <Card className="p-5 border-none ring-1 ring-slate-100 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                        <Wallet className="h-4 w-4 text-emerald-500" />
                        <p className="ds-label">Rider Wallet Balances</p>
                    </div>
                    <h3 className="ds-stat-medium">
                        {loading ? <Skeleton className="h-7 w-24" /> : inr((data?.riderWallets?.totalAvailable || 0) + (data?.riderWallets?.totalPending || 0))}
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-1">
                        {loading ? '' : `${inr(data?.riderWallets?.totalAvailable)} available, ${inr(data?.riderWallets?.totalPending)} pending across ${data?.riderWallets?.riderCount || 0} riders`}
                    </p>
                </Card>
            </div>

            <Card title="Split by Payment Mode" subtitle={`${from} → ${to}`} contentClassName="p-5">
                {loading ? (
                    <Skeleton className="h-32 w-full" />
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-50 rounded-2xl">
                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Online-prepaid orders</p>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm"><span className="text-slate-500">Rider earnings</span><span className="font-bold text-slate-900">{inr(online.riderEarnings)}</span></div>
                                <div className="flex justify-between text-sm"><span className="text-slate-500">Platform margin</span><span className="font-bold text-slate-900">{inr(online.platformLogisticsMargin)}</span></div>
                                <div className="flex justify-between text-sm"><span className="text-slate-500">Delivery fee collected</span><span className="font-bold text-slate-900">{inr(online.deliveryFeeCollected)}</span></div>
                                <div className="flex justify-between text-sm"><span className="text-slate-500">Orders</span><span className="font-bold text-slate-900">{online.orderCount || 0}</span></div>
                            </div>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl">
                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">COD orders</p>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm"><span className="text-slate-500">Rider earnings</span><span className="font-bold text-slate-900">{inr(cod.riderEarnings)}</span></div>
                                <div className="flex justify-between text-sm"><span className="text-slate-500">Platform margin</span><span className="font-bold text-slate-900">{inr(cod.platformLogisticsMargin)}</span></div>
                                <div className="flex justify-between text-sm"><span className="text-slate-500">Delivery fee collected</span><span className="font-bold text-slate-900">{inr(cod.deliveryFeeCollected)}</span></div>
                                <div className="flex justify-between text-sm"><span className="text-slate-500">Orders</span><span className="font-bold text-slate-900">{cod.orderCount || 0}</span></div>
                            </div>
                        </div>
                    </div>
                )}
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                    onClick={() => navigate('/admin/cash-collection')}
                    className="w-full p-4 bg-white ring-1 ring-slate-100 rounded-[24px] flex items-center justify-between group hover:ring-primary/20 hover:shadow-lg transition-all"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-50 text-amber-500 rounded-xl"><Banknote className="h-4 w-4" /></div>
                        <div className="text-left">
                            <span className="text-xs font-black text-slate-700 block">Per-Rider Cash Collection</span>
                            <span className="text-[10px] text-slate-400">Live cash-in-hand, settlement history</span>
                        </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300 group-hover:translate-x-1 transition-transform" />
                </button>
                <button
                    onClick={() => navigate('/admin/delivery-funds')}
                    className="w-full p-4 bg-white ring-1 ring-slate-100 rounded-[24px] flex items-center justify-between group hover:ring-primary/20 hover:shadow-lg transition-all"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-brand-50 text-brand-500 rounded-xl"><Wallet className="h-4 w-4" /></div>
                        <div className="text-left">
                            <span className="text-xs font-black text-slate-700 block">Per-Rider Payouts</span>
                            <span className="text-[10px] text-slate-400">Individual ledger, settle payouts</span>
                        </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300 group-hover:translate-x-1 transition-transform" />
                </button>
            </div>
        </div>
    );
};

export default DeliveryEarningsPanel;
