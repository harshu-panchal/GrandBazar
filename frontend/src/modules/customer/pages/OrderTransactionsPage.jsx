import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { 
    ChevronLeft, 
    ArrowUpRight, 
    ArrowDownLeft, 
    ReceiptIndianRupee, 
    RotateCcw, 
    CheckCircle2, 
    Clock, 
    AlertCircle, 
    ChevronRight,
    Search,
    Filter,
    ShoppingBag
} from 'lucide-react';
import { customerApi } from '../services/customerApi';
import { cn } from '@/lib/utils';

const PAYMENT_METHOD_LABELS = {
    cash: 'Cash on Delivery (COD)',
    cod: 'Cash on Delivery (COD)',
    online: 'Online Payment',
    wallet: 'Wallet',
};

const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const OrderTransactionsPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    
    // Default to refunds if route is /refunds or query tab=refunds
    const isRefundsRoute = location.pathname.includes('/refunds');
    const initialTab = isRefundsRoute || searchParams.get('tab') === 'refunds' ? 'refunds' : (searchParams.get('tab') || 'all');
    
    const [activeTab, setActiveTab] = useState(initialTab);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const currentParamTab = searchParams.get('tab');
        if (currentParamTab && ['all', 'refunds', 'payments'].includes(currentParamTab)) {
            setActiveTab(currentParamTab);
        } else if (isRefundsRoute) {
            setActiveTab('refunds');
        }
    }, [searchParams, isRefundsRoute]);

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setSearchParams({ tab });
    };

    useEffect(() => {
        let isMounted = true;
        const fetchOrders = async () => {
            try {
                const res = await customerApi.getMyOrders();
                const orderData = res.data?.result?.items || res.data?.results || res.data?.result || [];
                if (isMounted) {
                    setOrders(Array.isArray(orderData) ? orderData : []);
                }
            } catch (error) {
                console.error('Failed to fetch orders for transaction history:', error);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchOrders();
        return () => { isMounted = false; };
    }, []);

    // Transform orders into parsed transaction & refund records
    const { allTransactions, refundItems, paymentItems, refundSummary } = useMemo(() => {
        const refunds = [];
        const payments = [];
        const all = [];

        let totalRefunded = 0;
        let inProgressCount = 0;
        let completedCount = 0;

        orders.forEach((order) => {
            const orderId = order.orderId || order._id;
            const createdAt = order.createdAt;
            const updatedAt = order.updatedAt || order.createdAt;
            const paymentMethod = String(order.payment?.method || order.paymentMethod || 'online').toLowerCase();
            const paymentStatus = String(order.payment?.status || 'completed').toLowerCase();
            const workflowStatus = String(order.workflowStatus || order.status || '').toLowerCase();
            const returnStatus = String(order.returnStatus || '').toLowerCase();
            const orderTotal = Number(order.pricing?.total || order.payableAmount || order.totalAmount || 0);

            // 1. Detect Refunds
            // Case A: Return with refund
            const isReturnRefund = Boolean(returnStatus && returnStatus !== 'none' && returnStatus !== 'rejected');
            const returnRefundAmount = Number(order.returnRefundAmount || order.returnDetails?.returnRefundAmount || order.refundAmount || 0);
            
            // Case B: Cancelled order refund
            const isCancelled = workflowStatus === 'cancelled' || String(order.status || '').toLowerCase() === 'cancelled';
            const cancelRefundAmount = Number(order.refundAmount || (isCancelled && paymentStatus === 'paid' ? orderTotal : 0));

            // Case C: Price adjustment refund
            const priceAdj = order.priceAdjustment;
            const isAdjustmentRefund = priceAdj && priceAdj.direction === 'decrease' && Number(priceAdj.deltaAmount || 0) > 0;
            const adjRefundAmount = isAdjustmentRefund ? Number(priceAdj.deltaAmount) : 0;

            // Case D: Direct payment status refunded
            const isDirectRefund = paymentStatus === 'refunded' || workflowStatus === 'refunded';

            if (isReturnRefund || isCancelled || isAdjustmentRefund || isDirectRefund) {
                const amount = returnRefundAmount || cancelRefundAmount || adjRefundAmount || orderTotal;
                
                if (amount > 0) {
                    const isCompleted = returnStatus === 'refund_completed' || isDirectRefund || (isCancelled && order.refundStatus === 'completed');
                    const isInProgress = !isCompleted && (returnStatus === 'refund_initiated' || returnStatus === 'dropped_at_store' || returnStatus === 'pickup_completed' || returnStatus === 'requested' || returnStatus === 'approved');

                    if (isCompleted) totalRefunded += amount;
                    if (isInProgress) inProgressCount += 1;
                    if (isCompleted) completedCount += 1;

                    let title = 'Order Refund';
                    let description = 'Refund processed for cancelled order';
                    if (isReturnRefund) {
                        title = 'Return Refund';
                        description = order.returnReason ? `Return reason: ${order.returnReason}` : 'Refund for returned product(s)';
                    } else if (isAdjustmentRefund) {
                        title = 'Item Revision Refund';
                        description = 'Refund for removed or modified items';
                    }

                    const refundRecord = {
                        id: `refund-${orderId}`,
                        orderId,
                        rawOrder: order,
                        type: 'refund',
                        title,
                        description,
                        amount,
                        status: isCompleted ? 'Completed' : (isInProgress ? 'In Progress' : 'Initiated'),
                        statusType: isCompleted ? 'success' : 'pending',
                        destination: paymentMethod === 'wallet' ? 'Credited to Wallet' : (paymentMethod === 'cod' ? 'Hand / Cash' : 'Original Payment Source'),
                        date: updatedAt,
                        itemsCount: Array.isArray(order.items) ? order.items.length : 1,
                    };

                    refunds.push(refundRecord);
                    all.push(refundRecord);
                }
            }

            // 2. Regular Payment Record
            if (orderTotal > 0) {
                const paymentRecord = {
                    id: `pay-${orderId}`,
                    orderId,
                    rawOrder: order,
                    type: 'payment',
                    title: 'Order Payment',
                    description: PAYMENT_METHOD_LABELS[paymentMethod] || paymentMethod.toUpperCase(),
                    amount: orderTotal,
                    status: paymentStatus === 'refunded' ? 'Refunded' : (paymentStatus === 'failed' ? 'Failed' : 'Paid'),
                    statusType: paymentStatus === 'refunded' ? 'neutral' : (paymentStatus === 'failed' ? 'error' : 'success'),
                    destination: PAYMENT_METHOD_LABELS[paymentMethod] || 'Paid',
                    date: createdAt,
                    itemsCount: Array.isArray(order.items) ? order.items.length : 1,
                };

                payments.push(paymentRecord);
                // Only add payment to "all" if not already exclusively a refund
                if (!isDirectRefund) {
                    all.push(paymentRecord);
                }
            }
        });

        // Sort by newest date
        all.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        refunds.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        payments.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        return {
            allTransactions: all,
            refundItems: refunds,
            paymentItems: payments,
            refundSummary: {
                totalRefunded,
                inProgressCount,
                completedCount,
                totalCount: refunds.length,
            },
        };
    }, [orders]);

    // Apply active tab & search filter
    const displayedItems = useMemo(() => {
        let list = allTransactions;
        if (activeTab === 'refunds') list = refundItems;
        if (activeTab === 'payments') list = paymentItems;

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter((item) => 
                String(item.orderId || '').toLowerCase().includes(q) ||
                String(item.title || '').toLowerCase().includes(q) ||
                String(item.description || '').toLowerCase().includes(q)
            );
        }

        return list;
    }, [activeTab, allTransactions, refundItems, paymentItems, searchQuery]);

    return (
        <div className="min-h-screen bg-slate-50 pb-28 font-sans">
            {/* Header */}
            <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-md px-4 pt-4 pb-3 border-b border-slate-200/60 flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => navigate('/profile')}
                    className="w-10 h-10 flex items-center justify-center hover:bg-slate-200/70 rounded-full transition-colors -ml-1 text-slate-800"
                    title="Back to Profile"
                >
                    <ChevronLeft size={22} />
                </button>
                <div>
                    <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                        {activeTab === 'refunds' ? 'Refund History' : 'Order Transactions'}
                    </h1>
                    <p className="text-[11px] text-slate-500 font-medium">
                        {activeTab === 'refunds' ? 'Track order refunds, returns & credits' : 'View all payments and refund receipts'}
                    </p>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 pt-3 space-y-4">
                {/* Refund Summary Banner (Shown when on Refunds tab or when refunds exist) */}
                {activeTab === 'refunds' && (
                    <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-5 text-white shadow-lg shadow-emerald-700/15 relative overflow-hidden">
                        <div className="absolute right-0 top-0 w-36 h-36 bg-white/10 rounded-full -translate-y-1/3 translate-x-1/4 pointer-events-none" />
                        <div className="relative z-10 flex items-start justify-between">
                            <div>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/15 text-[11px] font-bold uppercase tracking-wider backdrop-blur-sm mb-1.5">
                                    <RotateCcw size={12} /> Total Refunded
                                </span>
                                <h2 className="text-3xl font-black tracking-tight">
                                    ₹{refundSummary.totalRefunded.toLocaleString('en-IN')}
                                </h2>
                                <p className="text-xs text-white/80 mt-1 font-medium">
                                    {refundSummary.completedCount} completed · {refundSummary.inProgressCount} in progress
                                </p>
                            </div>
                            <div className="h-12 w-12 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center shrink-0">
                                <ReceiptIndianRupee size={26} className="text-white" />
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab Switcher */}
                <div className="flex bg-slate-200/80 p-1 rounded-xl gap-1">
                    <button
                        type="button"
                        onClick={() => handleTabChange('all')}
                        className={cn(
                            "flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                            activeTab === 'all'
                                ? "bg-white text-slate-900 shadow-sm"
                                : "text-slate-600 hover:text-slate-900"
                        )}
                    >
                        <ReceiptIndianRupee size={14} />
                        All ({allTransactions.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => handleTabChange('refunds')}
                        className={cn(
                            "flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                            activeTab === 'refunds'
                                ? "bg-white text-emerald-700 shadow-sm font-extrabold"
                                : "text-slate-600 hover:text-slate-900"
                        )}
                    >
                        <RotateCcw size={14} className={activeTab === 'refunds' ? "text-emerald-600" : ""} />
                        Refunds ({refundItems.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => handleTabChange('payments')}
                        className={cn(
                            "flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                            activeTab === 'payments'
                                ? "bg-white text-slate-900 shadow-sm"
                                : "text-slate-600 hover:text-slate-900"
                        )}
                    >
                        <ArrowDownLeft size={14} />
                        Payments ({paymentItems.length})
                    </button>
                </div>

                {/* Search Bar */}
                <div className="relative">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by Order ID or reason..."
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
                    />
                </div>

                {/* Transactions & Refunds List */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                    {loading ? (
                        <div className="py-16 flex flex-col items-center justify-center text-center px-4 space-y-3">
                            <div className="h-8 w-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
                            <p className="text-xs font-semibold text-slate-500">Loading your transaction records...</p>
                        </div>
                    ) : displayedItems.length === 0 ? (
                        <div className="py-16 flex flex-col items-center justify-center text-center px-6">
                            <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                                {activeTab === 'refunds' ? (
                                    <RotateCcw size={28} className="text-slate-400" />
                                ) : (
                                    <ShoppingBag size={28} className="text-slate-400" />
                                )}
                            </div>
                            <h3 className="text-base font-bold text-slate-800 mb-1">
                                {activeTab === 'refunds' ? 'No Refund History' : 'No Transactions Found'}
                            </h3>
                            <p className="text-xs text-slate-500 max-w-xs mb-4">
                                {activeTab === 'refunds'
                                    ? 'When an order is cancelled or a product is returned, your refund details and credits will appear here.'
                                    : 'Completed payments and order transactions will be listed here.'}
                            </p>
                            {activeTab === 'refunds' && (
                                <button
                                    type="button"
                                    onClick={() => navigate('/orders')}
                                    className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors"
                                >
                                    View Your Orders
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {displayedItems.map((item) => {
                                const isRefund = item.type === 'refund';
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => navigate(`/orders`)}
                                        className="p-4 hover:bg-slate-50/80 transition-colors cursor-pointer group"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-start gap-3 min-w-0">
                                                <div
                                                    className={cn(
                                                        "h-11 w-11 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                                                        isRefund
                                                            ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                                                            : "bg-slate-100 text-slate-700 border border-slate-200"
                                                    )}
                                                >
                                                    {isRefund ? (
                                                        <RotateCcw size={20} className="stroke-[2.2]" />
                                                    ) : (
                                                        <ArrowDownLeft size={20} className="stroke-[2.2]" />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h4 className="font-bold text-slate-900 text-sm truncate">
                                                            {item.title}
                                                        </h4>
                                                        <span
                                                            className={cn(
                                                                "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border",
                                                                item.statusType === 'success'
                                                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                                    : item.statusType === 'pending'
                                                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                                                    : "bg-slate-100 text-slate-700 border-slate-200"
                                                            )}
                                                        >
                                                            {item.status}
                                                        </span>
                                                    </div>
                                                    
                                                    <p className="text-xs text-slate-600 font-medium mt-0.5 leading-snug">
                                                        {item.description}
                                                    </p>

                                                    <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px] text-slate-500">
                                                        <span className="font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                                                            #{item.orderId}
                                                        </span>
                                                        <span>·</span>
                                                        <span>{formatDate(item.date)}</span>
                                                        <span>·</span>
                                                        <span className="text-slate-600 font-medium">
                                                            {item.destination}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="text-right shrink-0">
                                                <div
                                                    className={cn(
                                                        "text-base font-black tracking-tight",
                                                        isRefund ? "text-emerald-600" : "text-slate-900"
                                                    )}
                                                >
                                                    {isRefund ? '+' : '-'}₹{item.amount.toLocaleString('en-IN')}
                                                </div>
                                                <div className="flex items-center justify-end gap-1 text-[11px] text-primary font-bold mt-1 group-hover:translate-x-0.5 transition-transform">
                                                    <span>View Order</span>
                                                    <ChevronRight size={13} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OrderTransactionsPage;
