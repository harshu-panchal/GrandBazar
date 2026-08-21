import React, { useState, useMemo, useEffect, useRef } from 'react';
import Card from '@shared/components/ui/Card';
import Button from '@shared/components/ui/Button';
import Badge from '@shared/components/ui/Badge';
import Input from '@shared/components/ui/Input';
import {
    HiOutlineMagnifyingGlass,
    HiOutlineEye,
    HiOutlinePrinter,
    HiOutlineCheck,
    HiOutlineXMark,
    HiOutlineTruck,
    HiOutlineBanknotes,
    HiOutlineClock,
    HiOutlineArchiveBoxXMark,
    HiOutlineChartBar,
    HiOutlineChevronDown,
    HiOutlineChevronRight,
    HiOutlineInboxStack,
    HiOutlineMapPin,
    HiOutlinePhone,
    HiOutlineCalendarDays,
    HiOutlineCamera
} from 'react-icons/hi2';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// Orders Page

import { MagicCard } from '@/components/ui/magic-card';
import { BlurFade } from '@/components/ui/blur-fade';
import ShimmerButton from '@/components/ui/shimmer-button';
import { sellerApi } from '../services/sellerApi';
import { useToast } from '@shared/components/ui/Toast';
import { getLegacyStatusFromOrder, getOrderStatusLabel, isScheduledHoldOrder, canSellerManuallyUpdateStatus, canSellerSplitOrReplace, getOrderStoreReassignment } from '@/shared/utils/orderStatus';
import { getFulfillmentDisplay, resolveFulfillmentMethod } from '@/shared/utils/orderFulfillment';
import { getSellerOrderPayout, getCustomerOrderTotal, formatInr } from '@/shared/utils/sellerOrderMoney';
import { Loader2 } from 'lucide-react';
import Pagination from '@shared/components/ui/Pagination';
import { DatePicker } from "@/components/ui/date-picker";
import { onSellerOrderNew, onOrderStatusUpdate } from "@core/services/orderSocket";

const ORDER_EDITABLE_STATUSES = new Set([
    'pending',
    'confirmed',
    'packed',
    'out_for_delivery',
    'delivered',
    'cancelled',
]);

/** Whether OrderStatusControl will render its own read-only status pill for this order —
 * used so callers can skip a redundant duplicate badge showing the same status text. */
function orderStatusControlShowsOwnBadge(order) {
    const normalizedStatus = String(order?.status || '').toLowerCase();
    return !ORDER_EDITABLE_STATUSES.has(normalizedStatus);
}

function OrderStatusControl({ order, onStatusUpdate, compact = false }) {
    const { showToast } = useToast();
    const method = resolveFulfillmentMethod(order);
    const normalizedStatus = String(order?.status || '').toLowerCase();
    const isPlatform = method === 'platform_logistics';
    const isPending = normalizedStatus === 'pending';

    // Platform delivery: seller only accepts/rejects while pending; rider drives later statuses.
    const platformLocked = isPlatform && !isPending;
    const readOnly = !canSellerManuallyUpdateStatus(order) || platformLocked;

    const sellerDeliveryOptions = [
        { value: 'pending', label: 'Pending' },
        { value: 'confirmed', label: 'Confirmed' },
        { value: 'packed', label: 'Packed' },
        { value: 'out_for_delivery', label: compact ? 'Out' : 'Out for Delivery' },
        { value: 'delivered', label: 'Delivered' },
        { value: 'cancelled', label: 'Cancelled' },
    ];
    const pendingOnlyOptions = [
        { value: 'pending', label: 'Pending' },
        { value: 'confirmed', label: 'Confirmed' },
        { value: 'cancelled', label: 'Cancelled' },
    ];
    const statusOptions = isPlatform && isPending
        ? pendingOnlyOptions
        : sellerDeliveryOptions.filter((o) => {
            if (isPending) return ['pending', 'confirmed', 'cancelled'].includes(o.value);
            if (normalizedStatus === 'confirmed') {
                return ['confirmed', 'packed', 'out_for_delivery', 'delivered', 'cancelled'].includes(o.value);
            }
            if (normalizedStatus === 'packed') {
                return ['packed', 'out_for_delivery', 'delivered', 'cancelled'].includes(o.value);
            }
            if (normalizedStatus === 'out_for_delivery') {
                return ['out_for_delivery', 'delivered', 'cancelled'].includes(o.value);
            }
            return o.value === normalizedStatus;
        });

    const requiresDisplayOnly = !ORDER_EDITABLE_STATUSES.has(normalizedStatus);

    if (readOnly || requiresDisplayOnly) {
        const isScheduled = isScheduledHoldOrder(order) || order.status === 'scheduled';
        return (
            <div className={compact ? 'text-right' : ''}>
                <span
                    className={cn(
                        'inline-flex items-center rounded-full font-black uppercase tracking-widest',
                        compact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1.5 text-[10px]',
                        isScheduled
                            ? 'bg-blue-100 text-blue-700'
                            : platformLocked
                                ? 'bg-brand-100 text-brand-700'
                                : requiresDisplayOnly
                                    ? 'bg-violet-100 text-violet-700'
                                    : 'bg-amber-100 text-amber-700',
                    )}
                >
                    {order.statusLabel || (isScheduled ? 'Scheduled' : (normalizedStatus || 'On hold'))}
                </span>
                {isScheduled && (
                    <p className="text-[10px] font-semibold text-slate-500 mt-1">
                        Awaiting delivery slot
                    </p>
                )}
                {platformLocked && (
                    <p className="text-[10px] font-semibold text-slate-500 mt-1">
                        Updated by delivery partner
                    </p>
                )}
                {platformLocked && ['delivery_search', 'delivery_assigned'].includes(String(order.workflowStatus || '').toLowerCase()) && (
                    order.sellerPackedAt ? (
                        <p className="text-[10px] font-bold text-emerald-600 mt-1">Packed ✓</p>
                    ) : (
                        <button
                            type="button"
                            onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                    await sellerApi.markOrderPacked(order.id || order._id || order.orderId);
                                    showToast('Marked as packed — rider notified', 'success');
                                    // The seller-room socket push from the backend triggers this page's
                                    // existing order:status:update listener, which refetches the list.
                                } catch (err) {
                                    showToast(err?.response?.data?.message || 'Failed to mark as packed', 'error');
                                }
                            }}
                            className="mt-1.5 px-2.5 py-1 rounded-lg bg-brand-600 text-white text-[9px] font-black uppercase tracking-wide hover:bg-brand-700 transition-colors"
                        >
                            Mark as Packed
                        </button>
                    )
                )}
                {requiresDisplayOnly && !isScheduled && !platformLocked && (
                    <p className="text-[10px] font-semibold text-slate-500 mt-1">
                        Customer-approved partial update
                    </p>
                )}
            </div>
        );
    }

    const selectClass = compact
        ? 'w-full min-w-[100px] text-[10px] pl-2 pr-6 py-1.5 rounded-lg font-black uppercase cursor-pointer appearance-none border outline-none'
        : 'w-full text-[10px] pl-2.5 pr-8 py-1.5 rounded-full font-black uppercase tracking-widest cursor-pointer appearance-none focus:ring-2 focus:ring-offset-1 transition-all border-none outline-none shadow-sm';

    return (
        <div className={compact ? '' : 'relative inline-block w-36'}>
            <select
                value={order.status}
                onChange={(e) => onStatusUpdate(order.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                    selectClass,
                    order.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        order.status === 'confirmed' ? 'bg-brand-100 text-brand-700' :
                            order.status === 'packed' ? 'bg-brand-100 text-brand-700' :
                                order.status === 'out_for_delivery' ? 'bg-purple-100 text-purple-700' :
                                    order.status === 'delivered' ? 'bg-brand-100 text-brand-700' :
                                        order.status === 'cancelled' ? 'bg-rose-100 text-rose-700' :
                                            'bg-slate-100 text-slate-700',
                )}
            >
                {statusOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>
            {!compact && (
                <HiOutlineChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none opacity-60" />
            )}
        </div>
    );
}

const Orders = () => {
    const [orders, setOrders] = useState([]);
    const [summary, setSummary] = useState({
        totalOrders: 0,
        totalAmount: 0,
        pending: 0,
        confirmed: 0,
        packed: 0,
        outForDelivery: 0,
        delivered: 0,
        cancelled: 0,
        returned: 0,
        activeOrders: 0,
    });
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [adjustMode, setAdjustMode] = useState(false);
    const [adjustItems, setAdjustItems] = useState([]);
    const [adjustReason, setAdjustReason] = useState('');
    const [adjustSaving, setAdjustSaving] = useState(false);
    // Dedicated "item unavailable" flow — distinct from Adjust Price. Calls
    // the partial-cancel endpoint so stock is released and the customer sees
    // the proper cancelled-item refund + updated-ETA banner, instead of the
    // generic price-adjustment path.
    const [cancelItemsMode, setCancelItemsMode] = useState(false);
    const [cancelItemsList, setCancelItemsList] = useState([]);
    const [cancelItemIndexes, setCancelItemIndexes] = useState([]);
    const [cancelItemsReason, setCancelItemsReason] = useState('');
    const [cancelItemsSaving, setCancelItemsSaving] = useState(false);
    const [isQuickViewModalOpen, setIsQuickViewModalOpen] = useState(false);
    const [isPickupModalOpen, setIsPickupModalOpen] = useState(false);
    const [pickupImage, setPickupImage] = useState(null);
    const [pickupOtpSending, setPickupOtpSending] = useState(false);
    const [pickupOtpCooldown, setPickupOtpCooldown] = useState(0);
    const [pickupVerifyOtp, setPickupVerifyOtp] = useState('');
    const [pickupOtpVerifying, setPickupOtpVerifying] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [pendingStatusUpdate, setPendingStatusUpdate] = useState(null);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [replacementSaving, setReplacementSaving] = useState(false);
    const [splitSaving, setSplitSaving] = useState(false);
    const [isReplacementModalOpen, setIsReplacementModalOpen] = useState(false);
    const [replacementItemIndex, setReplacementItemIndex] = useState(0);
    const [replacementProducts, setReplacementProducts] = useState([]);
    const [replacementProductsLoading, setReplacementProductsLoading] = useState(false);
    const [replacementProductId, setReplacementProductId] = useState('');
    const [replacementPrice, setReplacementPrice] = useState('');
    const [replacementReason, setReplacementReason] = useState('Item unavailable');
    const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
    const [splitFirstLegIndexes, setSplitFirstLegIndexes] = useState([]);
    const [splitExtraFee, setSplitExtraFee] = useState('20');
    const [splitDeliveryDate, setSplitDeliveryDate] = useState('');
    const [splitWindowLabel, setSplitWindowLabel] = useState('');
    const [splitWindows, setSplitWindows] = useState([]);
    const [splitMaxDaysAhead, setSplitMaxDaysAhead] = useState(7);
    const [isLoadingSplitOptions, setIsLoadingSplitOptions] = useState(false);
    const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
    const [rescheduleTarget, setRescheduleTarget] = useState(null);
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [rescheduleWindow, setRescheduleWindow] = useState('');
    const [rescheduleNote, setRescheduleNote] = useState('');
    const [rescheduleWindows, setRescheduleWindows] = useState([]);
    const [rescheduleMaxDaysAhead, setRescheduleMaxDaysAhead] = useState(7);
    const [isLoadingRescheduleOptions, setIsLoadingRescheduleOptions] = useState(false);
    const [isSubmittingReschedule, setIsSubmittingReschedule] = useState(false);
    const [isCancelReasonModalOpen, setIsCancelReasonModalOpen] = useState(false);
    const [cancelReasonTarget, setCancelReasonTarget] = useState(null);
    const [cancelReasonText, setCancelReasonText] = useState('');
    const [isSubmittingCancelReason, setIsSubmittingCancelReason] = useState(false);
    // Bulk accept/reject — scoped to "pending" orders only, since that's the
    // one transition every order needs regardless of fulfillment method.
    const [selectedOrderIds, setSelectedOrderIds] = useState([]);
    const [isBulkAccepting, setIsBulkAccepting] = useState(false);
    const [isBulkRejecting, setIsBulkRejecting] = useState(false);
    const [isBulkRejectModalOpen, setIsBulkRejectModalOpen] = useState(false);
    const [bulkRejectReason, setBulkRejectReason] = useState('');
    const { showToast } = useToast();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [total, setTotal] = useState(0);
    const hasMountedRef = useRef(false);

    // Initial load: show full-page loader once
    useEffect(() => {
        fetchOrders(page, true).finally(() => {
            hasMountedRef.current = true;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Subsequent changes (page, date filters): update data without full page "refresh"
    useEffect(() => {
        if (!hasMountedRef.current) return;
        fetchOrders(page, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, startDate, endDate]);

    const fetchOrders = async (requestedPage = 1, showPageLoader = false) => {
        try {
            if (showPageLoader) {
                setLoading(true);
            }
            const params = { page: requestedPage };
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;

            const response = await sellerApi.getOrders(params);

            // Backend returns handleResponse(..., { items, page, limit, total, totalPages })
            const payload = response.data.result || {};
            const rawOrders = Array.isArray(payload.items)
                ? payload.items
                : (response.data.results || []);

            const formattedOrders = (rawOrders || []).map(order => ({
                id: order.orderId,
                _id: order._id,
                customer: {
                    name: order.customer?.name || 'Unknown',
                    phone: order.customer?.phone || '',
                    avatar: (order.customer?.name || 'U').charAt(0)
                },
                items: (order.items || []).map(item => ({
                    name: item.name,
                    price: item.price,
                    qty: item.quantity,
                    image: item.image
                })),
                rawItems: (order.items || []).map(item => ({
                    product: item.product?._id || item.product,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    variantSlot: item.variantSlot,
                    image: item.image
                })),
                total: getSellerOrderPayout(order),
                customerTotal: getCustomerOrderTotal(order),
                sellerPayout: getSellerOrderPayout(order),
                status: getLegacyStatusFromOrder(order),
                statusLabel: getOrderStatusLabel(order),
                workflowStatus: order.workflowStatus,
                workflowVersion: order.workflowVersion,
                storeReassignment: getOrderStoreReassignment(order),
                fulfillmentType: order.fulfillmentType || 'instant',
                logisticsMode: order.logisticsMode || null,
                fulfillmentMethod: resolveFulfillmentMethod(order),
                schedule: order.schedule || null,
                reschedule: order.reschedule || null,
                priceAdjustment: order.priceAdjustment || null,
                replacementRequests: order.replacementRequests || [],
                splitDeliveries: order.splitDeliveries || [],
                revisedInvoices: order.revisedInvoices || [],
                date: order.createdAt
                    ? new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '',
                time: order.createdAt
                    ? new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                    : '',
                address: order.address
                    ? `${order.address.address || ''}, ${order.address.city || ''}`.trim()
                    : '',
                location: order.address?.location || null,
                payment: order.payment?.method === 'cash' || order.payment?.method === 'cod'
                    ? 'Cash on Delivery'
                    : 'Online Paid'
            }));

            setOrders(formattedOrders);
            setSummary({
                totalOrders: Number(payload.summary?.totalOrders || payload.total || formattedOrders.length || 0),
                totalAmount: Number(payload.summary?.totalAmount || 0),
                pending: Number(payload.summary?.pending || 0),
                confirmed: Number(payload.summary?.confirmed || 0),
                packed: Number(payload.summary?.packed || 0),
                outForDelivery: Number(payload.summary?.outForDelivery || 0),
                delivered: Number(payload.summary?.delivered || 0),
                cancelled: Number(payload.summary?.cancelled || 0),
                returned: Number(payload.summary?.returned || 0),
                activeOrders: Number(payload.summary?.activeOrders || 0),
            });
            if (typeof payload.total === 'number') {
                setTotal(payload.total);
            } else {
                setTotal(formattedOrders.length);
            }
        } catch (error) {
            console.error("Failed to fetch orders:", error);
            showToast("Failed to fetch orders", "error");
        } finally {
            if (showPageLoader) {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        const getToken = () => localStorage.getItem("auth_seller");
        const unsubscribe = onSellerOrderNew(getToken, (payload) => {
            const orderId = payload?.orderId || payload?.payload?.orderId;
            if (payload?.reassigned || payload?.payload?.reassigned) {
                showToast(
                    orderId
                        ? `Order #${orderId} was reassigned to your store`
                        : "An order was reassigned to your store",
                    "success",
                );
            } else {
                showToast(
                    orderId ? `New order #${orderId} received` : "New order received",
                    "success",
                );
            }
            fetchOrders(page, false);
        });
        return unsubscribe;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page]);

    // Live updates for status changes made by someone else (rider pickup/
    // out-for-delivery/delivered, admin rider assignment) — previously the
    // seller's list only refreshed on their own actions or a brand-new order,
    // so these went stale until a manual reload. Debounced so a burst of
    // events across many orders coalesces into one refetch, mirroring the
    // admin OrdersList.jsx pattern.
    useEffect(() => {
        const getToken = () => localStorage.getItem("auth_seller");
        let debounceTimer = null;
        const unsubscribe = onOrderStatusUpdate(getToken, () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => fetchOrders(page, false), 800);
        });
        return () => {
            clearTimeout(debounceTimer);
            unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page]);

    // Lock page scroll while any order modal is open; keep scrolling inside the modal.
    useEffect(() => {
        const modalOpen =
            isDetailsModalOpen || isQuickViewModalOpen || isPickupModalOpen || isRescheduleModalOpen
            || isCancelReasonModalOpen || isBulkRejectModalOpen || isReplacementModalOpen || isSplitModalOpen;
        if (!modalOpen) return undefined;

        const prevBodyOverflow = document.body.style.overflow;
        const prevHtmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = prevBodyOverflow;
            document.documentElement.style.overflow = prevHtmlOverflow;
        };
    }, [isDetailsModalOpen, isQuickViewModalOpen, isPickupModalOpen, isRescheduleModalOpen, isCancelReasonModalOpen, isBulkRejectModalOpen, isReplacementModalOpen, isSplitModalOpen]);

    const tabs = ['All', 'Pending', 'Scheduled', 'Confirmed', 'Packed', 'Out for Delivery', 'Delivered', 'Cancelled'];
    const todayStr = new Date().toISOString().split('T')[0];

    const safeOrders = useMemo(
        () => (Array.isArray(orders) ? orders : []),
        [orders]
    );

    const filteredOrders = useMemo(() => {
        return safeOrders.filter(order => {
            const matchesSearch = order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.customer.name.toLowerCase().includes(searchTerm.toLowerCase());
            const statusToMatch = activeTab === 'Out for Delivery'
                ? 'out_for_delivery'
                : activeTab.toLowerCase();
            const matchesTab = activeTab === 'All' || order.status.toLowerCase() === statusToMatch;
            return matchesSearch && matchesTab;
        });
    }, [safeOrders, searchTerm, activeTab]);

    const visiblePendingOrderIds = useMemo(() => {
        return filteredOrders
            .slice((page - 1) * pageSize, page * pageSize)
            .filter((o) => o.status === 'pending')
            .map((o) => o.id);
    }, [filteredOrders, page, pageSize]);

    // Clear any selection that's no longer on the visible pending list (page
    // change, status change from elsewhere, live socket refresh, etc.).
    useEffect(() => {
        setSelectedOrderIds((prev) => prev.filter((id) => visiblePendingOrderIds.includes(id)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visiblePendingOrderIds]);

    const toggleOrderSelection = (orderId) => {
        setSelectedOrderIds((prev) =>
            prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId],
        );
    };

    const toggleSelectAllVisiblePending = () => {
        setSelectedOrderIds((prev) =>
            visiblePendingOrderIds.length > 0 && visiblePendingOrderIds.every((id) => prev.includes(id))
                ? []
                : visiblePendingOrderIds,
        );
    };

    const handleBulkAccept = async () => {
        if (selectedOrderIds.length === 0) return;
        setIsBulkAccepting(true);
        try {
            const res = await sellerApi.bulkUpdateOrderStatus({ orderIds: selectedOrderIds, status: 'confirmed' });
            const { succeeded = 0, failed = 0 } = res.data?.result || {};
            showToast(
                failed > 0
                    ? `${succeeded} order(s) accepted, ${failed} failed`
                    : `${succeeded} order(s) accepted`,
                failed > 0 ? 'error' : 'success',
            );
            setSelectedOrderIds([]);
            fetchOrders(page, false);
        } catch (error) {
            showToast(error?.response?.data?.message || 'Bulk accept failed', 'error');
        } finally {
            setIsBulkAccepting(false);
        }
    };

    const openBulkRejectModal = () => {
        if (selectedOrderIds.length === 0) return;
        setBulkRejectReason('');
        setIsBulkRejectModalOpen(true);
    };

    const handleConfirmBulkReject = async () => {
        if (bulkRejectReason.trim().length < 10) {
            showToast('Please provide a cancellation reason (at least 10 characters)', 'error');
            return;
        }
        setIsBulkRejecting(true);
        try {
            const res = await sellerApi.bulkUpdateOrderStatus({
                orderIds: selectedOrderIds,
                status: 'cancelled',
                cancelReason: bulkRejectReason.trim(),
            });
            const { succeeded = 0, failed = 0 } = res.data?.result || {};
            showToast(
                failed > 0
                    ? `${succeeded} order(s) rejected, ${failed} failed`
                    : `${succeeded} order(s) rejected`,
                failed > 0 ? 'error' : 'success',
            );
            setSelectedOrderIds([]);
            setIsBulkRejectModalOpen(false);
            fetchOrders(page, false);
        } catch (error) {
            showToast(error?.response?.data?.message || 'Bulk reject failed', 'error');
        } finally {
            setIsBulkRejecting(false);
        }
    };

    const stats = useMemo(() => [
        {
            label: 'Total Orders',
            value: summary.totalOrders,
            icon: HiOutlineArchiveBoxXMark,
            color: 'text-brand-600',
            bg: 'bg-brand-50'
        },
        {
            label: 'Pending',
            value: summary.pending,
            icon: HiOutlineClock,
            color: 'text-amber-600',
            bg: 'bg-amber-50'
        },
        {
            label: 'Scheduled',
            // o.status was previously (buggily) set to a "scheduled" bucket
            // value that never actually existed on the backend — this count
            // would have silently gone to 0 once that mapping got fixed to
            // match the backend's real "confirmed" collapse. isScheduledHoldOrder
            // reads workflowStatus directly, so it doesn't depend on the bug.
            value: safeOrders.filter((o) => isScheduledHoldOrder(o)).length,
            icon: HiOutlineCalendarDays,
            color: 'text-blue-600',
            bg: 'bg-blue-50'
        },
        {
            label: 'Confirmed',
            value: summary.confirmed,
            icon: HiOutlineCheck,
            color: 'text-brand-600',
            bg: 'bg-brand-50'
        },
        {
            label: 'Delivered',
            value: summary.delivered,
            icon: HiOutlineCheck,
            color: 'text-brand-600',
            bg: 'bg-brand-50'
        }
    ], [summary]);

    const getStatusColor = (status) => {
        const s = status.toLowerCase();
        switch (s) {
            case 'pending': return 'warning';
            case 'confirmed': return 'info';
            case 'scheduled': return 'info';
            case 'packed': return 'primary';
            case 'out_for_delivery': return 'secondary';
            case 'delivered': return 'success';
            case 'cancelled': return 'error';
            default: return 'secondary';
        }
    };

    const handleViewDetails = async (order) => {
        setSelectedOrder(order);
        setAdjustMode(false);
        setAdjustItems([]);
        setAdjustReason('');
        setCustomerPickupOtp('');
        setCustomerPickupQr('');
        setPickupOtpCooldown(0);
        setIsDetailsModalOpen(true);

        try {
            const response = await sellerApi.getOrderDetails(order.id);
            if (response.data?.success) {
                const full = response.data.result || {};
                setSelectedOrder((prev) => ({
                    ...prev,
                    fulfillmentType: full.fulfillmentType || prev?.fulfillmentType,
                    logisticsMode: full.logisticsMode || prev?.logisticsMode,
                    workflowStatus: full.workflowStatus || prev?.workflowStatus,
                    fulfillmentMethod: resolveFulfillmentMethod(full),
                    schedule: full.schedule || prev?.schedule,
                    reschedule: full.reschedule || prev?.reschedule,
                    storeReassignment:
                        getOrderStoreReassignment(full) || prev?.storeReassignment || null,
                    items: Array.isArray(prev?.items)
                        ? prev.items.map((item, idx) => ({
                              ...item,
                              packagingType: full.items?.[idx]?.product?.categoryId?.packagingType || 'standard',
                          }))
                        : prev?.items,
                }));
            }
        } catch (error) {
            console.error('Failed to load order fulfillment details:', error);
        }
    };

    const handleStatusUpdate = async (orderId, newStatus, additionalData = {}) => {
        const normalizedStatus = String(newStatus).toLowerCase();
        const targetOrder = orders.find((o) => o.id === orderId) || (selectedOrder?.id === orderId ? selectedOrder : null);
        const isSelfDelivery = targetOrder ? resolveFulfillmentMethod(targetOrder) === 'seller_delivery' : false;

        if (normalizedStatus === 'out_for_delivery' && !additionalData.pickupProofImages) {
            setPendingStatusUpdate({ orderId, status: newStatus, proofField: 'pickupProofImages' });
            setPickupImage(null);
            setIsPickupModalOpen(true);
            return;
        }

        if (normalizedStatus === 'delivered' && !additionalData.deliveryProofImages) {
            setPendingStatusUpdate({ orderId, status: newStatus, proofField: 'deliveryProofImages' });
            setPickupImage(null);
            setIsPickupModalOpen(true);
            return;
        }

        if (normalizedStatus === 'cancelled' && !additionalData.cancelReason) {
            setCancelReasonTarget(orderId);
            setCancelReasonText('');
            setIsCancelReasonModalOpen(true);
            return;
        }

        try {
            const res = await sellerApi.updateOrderStatus(orderId, {
                status: normalizedStatus,
                ...additionalData
            });
            const isPendingApproval = res.status === 202;
            showToast(
                res.data?.message || `Order status updated to ${newStatus}`,
                "success",
            );
            fetchOrders(); // Refresh orders
            if (selectedOrder && selectedOrder.id === orderId && !isPendingApproval) {
                setSelectedOrder({ ...selectedOrder, status: newStatus });
            }
            if (isPickupModalOpen) {
                setIsPickupModalOpen(false);
                setPendingStatusUpdate(null);
                setPickupImage(null);
            }
            if (isCancelReasonModalOpen) {
                setIsCancelReasonModalOpen(false);
                setCancelReasonTarget(null);
                setCancelReasonText('');
            }
        } catch (error) {
            console.error("Failed to update status:", error);
            showToast(
                error?.response?.data?.message || "Failed to update status",
                "error",
            );
        }
    };

    const handleApproveReschedule = async (order) => {
        try {
            const requested = order?.reschedule?.requestedDeliveryDate;
            await sellerApi.approveReschedule(order._id || order.id, requested ? { deliveryDate: requested } : {});
            showToast("Reschedule approved", "success");
            setIsDetailsModalOpen(false);
            fetchOrders();
        } catch (error) {
            showToast(error?.response?.data?.message || "Failed to approve reschedule", "error");
        }
    };

    const handleRejectReschedule = async (order) => {
        const reason = window.prompt("Reason for rejecting the reschedule request?", "");
        if (reason === null) return;
        try {
            await sellerApi.rejectReschedule(order._id || order.id, { note: reason });
            showToast("Reschedule rejected", "success");
            setIsDetailsModalOpen(false);
            fetchOrders();
        } catch (error) {
            showToast(error?.response?.data?.message || "Failed to reject reschedule", "error");
        }
    };

    const openSellerRescheduleModal = async (order) => {
        setRescheduleTarget(order);
        setRescheduleDate('');
        setRescheduleWindow('');
        setRescheduleNote('');
        setRescheduleWindows([]);
        setIsRescheduleModalOpen(true);
        setIsLoadingRescheduleOptions(true);
        try {
            const res = await sellerApi.getSchedulingSettings();
            const settings = res.data?.result || {};
            setRescheduleWindows(Array.isArray(settings.deliveryWindows) ? settings.deliveryWindows : []);
            setRescheduleMaxDaysAhead(Number(settings.maxDaysAhead) || 7);
        } catch (error) {
            showToast(error?.response?.data?.message || "Failed to load delivery windows", "error");
        } finally {
            setIsLoadingRescheduleOptions(false);
        }
    };

    const closeSellerRescheduleModal = () => {
        if (isSubmittingReschedule) return;
        setIsRescheduleModalOpen(false);
        setRescheduleTarget(null);
    };

    const handleSubmitSellerReschedule = async () => {
        if (!rescheduleTarget || !rescheduleDate || !rescheduleWindow) {
            showToast("Please select a delivery date and window", "error");
            return;
        }
        setIsSubmittingReschedule(true);
        try {
            await sellerApi.sellerReschedule(rescheduleTarget._id || rescheduleTarget.id, {
                deliveryDate: rescheduleDate,
                windowLabel: rescheduleWindow,
                note: rescheduleNote,
            });
            showToast("Order rescheduled", "success");
            setIsRescheduleModalOpen(false);
            setRescheduleTarget(null);
            setIsDetailsModalOpen(false);
            fetchOrders();
        } catch (error) {
            showToast(error?.response?.data?.message || "Failed to reschedule order", "error");
        } finally {
            setIsSubmittingReschedule(false);
        }
    };

    const closeCancelReasonModal = () => {
        if (isSubmittingCancelReason) return;
        setIsCancelReasonModalOpen(false);
        setCancelReasonTarget(null);
        setCancelReasonText('');
    };

    const handleConfirmCancelWithReason = async () => {
        if (cancelReasonText.trim().length < 10) {
            showToast("Please provide a cancellation reason (at least 10 characters)", "error");
            return;
        }
        setIsSubmittingCancelReason(true);
        try {
            await handleStatusUpdate(cancelReasonTarget, 'Cancelled', { cancelReason: cancelReasonText.trim() });
        } finally {
            setIsSubmittingCancelReason(false);
        }
    };

    const openAdjustEditor = (order) => {
        setAdjustItems((order.rawItems || []).map((it) => ({ ...it, quantity: it.quantity })));
        setAdjustReason('');
        setAdjustMode(true);
    };

    const closeAdjustEditor = () => {
        setAdjustMode(false);
        setAdjustItems([]);
        setAdjustReason('');
    };

    const updateAdjustQty = (idx, qty) => {
        setAdjustItems((prev) => {
            const next = [...prev];
            next[idx] = { ...next[idx], quantity: Math.max(0, Number(qty) || 0) };
            return next;
        });
    };

    const adjustPreviewTotal = useMemo(
        () => adjustItems.reduce((sum, it) => sum + Number(it.price || 0) * Number(it.quantity || 0), 0),
        [adjustItems]
    );

    const handleApplyAdjustment = async () => {
        const kept = adjustItems.filter((it) => Number(it.quantity) > 0);
        if (!kept.length) {
            showToast("At least one item must remain. Use cancel for a full cancellation.", "error");
            return;
        }
        if (!adjustReason.trim()) {
            showToast("Please provide a reason for the adjustment", "error");
            return;
        }
        try {
            setAdjustSaving(true);
            await sellerApi.adjustOrder(selectedOrder._id || selectedOrder.id, {
                items: kept.map((it) => ({
                    product: it.product,
                    variantSlot: it.variantSlot,
                    quantity: Number(it.quantity),
                })),
                reason: adjustReason.trim(),
            });
            showToast("Price adjustment applied", "success");
            closeAdjustEditor();
            setIsDetailsModalOpen(false);
            fetchOrders();
        } catch (error) {
            showToast(error?.response?.data?.message || "Failed to apply adjustment", "error");
        } finally {
            setAdjustSaving(false);
        }
    };

    const openCancelItemsEditor = (order) => {
        setCancelItemsList((order.rawItems || []).map((it, idx) => ({ ...it, originalIndex: idx })));
        setCancelItemIndexes([]);
        setCancelItemsReason('');
        setCancelItemsMode(true);
    };

    const closeCancelItemsEditor = () => {
        setCancelItemsMode(false);
        setCancelItemsList([]);
        setCancelItemIndexes([]);
        setCancelItemsReason('');
    };

    const toggleCancelItemIndex = (originalIndex) => {
        setCancelItemIndexes((prev) =>
            prev.includes(originalIndex)
                ? prev.filter((i) => i !== originalIndex)
                : [...prev, originalIndex]
        );
    };

    const handleApplyCancelItems = async () => {
        if (!cancelItemIndexes.length) {
            showToast("Select at least one item to mark unavailable", "error");
            return;
        }
        if (cancelItemIndexes.length >= cancelItemsList.length) {
            showToast("Cannot cancel all items this way — use Cancel Order for a full cancellation.", "error");
            return;
        }
        if (cancelItemsReason.trim().length < 10) {
            showToast("Please provide a reason (at least 10 characters)", "error");
            return;
        }
        try {
            setCancelItemsSaving(true);
            await sellerApi.partialCancelOrder(selectedOrder._id || selectedOrder.id, {
                itemIndexes: cancelItemIndexes,
                reason: cancelItemsReason.trim(),
            });
            showToast("Unavailable item(s) cancelled and customer refunded", "success");
            closeCancelItemsEditor();
            setIsDetailsModalOpen(false);
            fetchOrders();
        } catch (error) {
            showToast(error?.response?.data?.message || "Failed to cancel item(s)", "error");
        } finally {
            setCancelItemsSaving(false);
        }
    };

    const openReplacementModal = async (order) => {
        if (!order?.rawItems?.length) return;
        setReplacementItemIndex(0);
        setReplacementProductId('');
        setReplacementPrice('');
        setReplacementReason('Item unavailable');
        setIsReplacementModalOpen(true);
        setReplacementProductsLoading(true);
        try {
            const productsRes = await sellerApi.getProducts({ limit: 100, status: 'active' });
            let items = productsRes?.data?.result?.items
                || productsRes?.data?.results
                || productsRes?.data?.result
                || [];
            if (!Array.isArray(items)) items = [];
            setReplacementProducts(items);
        } catch {
            setReplacementProducts([]);
        } finally {
            setReplacementProductsLoading(false);
        }
    };

    const closeReplacementModal = () => {
        if (replacementSaving) return;
        setIsReplacementModalOpen(false);
    };

    const handleReplacementProductChange = (productId) => {
        setReplacementProductId(productId);
        const product = replacementProducts.find((p) => String(p._id) === String(productId));
        if (product) {
            setReplacementPrice(String(Number(product.salePrice || product.price || 0)));
        }
    };

    const handleSubmitReplacement = async () => {
        if (!selectedOrder) return;
        const chosenProduct = replacementProducts.find((p) => String(p._id) === String(replacementProductId));
        if (!chosenProduct) {
            showToast('Select a replacement product', 'error');
            return;
        }
        const priceNum = Number(replacementPrice);
        if (!Number.isFinite(priceNum) || priceNum <= 0) {
            showToast('Enter a valid replacement price', 'error');
            return;
        }
        if (!replacementReason.trim()) {
            showToast('Please provide a reason for the replacement', 'error');
            return;
        }

        try {
            setReplacementSaving(true);
            await sellerApi.requestProductReplacement(selectedOrder.id, {
                itemIndex: replacementItemIndex,
                reason: replacementReason.trim(),
                alternatives: [
                    {
                        product: chosenProduct._id,
                        name: chosenProduct.name,
                        price: priceNum,
                        quantity: Number(selectedOrder?.rawItems?.[replacementItemIndex]?.quantity || 1),
                        variantSlot: chosenProduct.variants?.[0]?.sku || '',
                    },
                ],
            });
            showToast('Replacement request sent to customer', 'success');
            setIsReplacementModalOpen(false);
            fetchOrders(page, false);
        } catch (error) {
            showToast(error?.response?.data?.message || 'Failed to create replacement request', 'error');
        } finally {
            setReplacementSaving(false);
        }
    };

    const openSplitModal = async (order) => {
        if (!order || !Array.isArray(order.rawItems) || order.rawItems.length < 2) {
            showToast('At least 2 items required for split delivery', 'error');
            return;
        }
        setSplitFirstLegIndexes([0]);
        setSplitExtraFee('20');
        setSplitDeliveryDate('');
        setSplitWindowLabel('');
        setSplitWindows([]);
        setIsSplitModalOpen(true);
        setIsLoadingSplitOptions(true);
        try {
            const res = await sellerApi.getSchedulingSettings();
            const settings = res.data?.result || {};
            setSplitWindows(Array.isArray(settings.deliveryWindows) ? settings.deliveryWindows : []);
            setSplitMaxDaysAhead(Number(settings.maxDaysAhead) || 7);
        } catch (error) {
            showToast(error?.response?.data?.message || 'Failed to load delivery windows', 'error');
        } finally {
            setIsLoadingSplitOptions(false);
        }
    };

    const closeSplitModal = () => {
        if (splitSaving) return;
        setIsSplitModalOpen(false);
    };

    const toggleSplitFirstLegIndex = (idx) => {
        setSplitFirstLegIndexes((prev) =>
            prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
        );
    };

    const handleSubmitSplitDelivery = async () => {
        if (!selectedOrder || !Array.isArray(selectedOrder.rawItems)) return;
        const totalItems = selectedOrder.rawItems.length;
        if (!splitFirstLegIndexes.length || splitFirstLegIndexes.length >= totalItems) {
            showToast('Select at least one item for the first delivery, leaving at least one for the second', 'error');
            return;
        }
        if (!splitDeliveryDate || !splitWindowLabel) {
            showToast('Select a delivery date and window for the second delivery', 'error');
            return;
        }
        const secondLegIndexes = selectedOrder.rawItems
            .map((_, idx) => idx)
            .filter((idx) => !splitFirstLegIndexes.includes(idx));
        const feeNum = Number(splitExtraFee);

        try {
            setSplitSaving(true);
            await sellerApi.splitOrderDelivery(selectedOrder.id, {
                splits: [
                    {
                        label: 'Part 1 - Immediate',
                        itemIndexes: splitFirstLegIndexes,
                        additionalDeliveryFee: 0,
                    },
                    {
                        label: 'Part 2 - Next delivery',
                        itemIndexes: secondLegIndexes,
                        additionalDeliveryFee: Number.isFinite(feeNum) && feeNum >= 0 ? feeNum : 0,
                        deliveryDate: splitDeliveryDate,
                        windowLabel: splitWindowLabel,
                    },
                ],
            });
            showToast('Split delivery plan created', 'success');
            setIsSplitModalOpen(false);
            fetchOrders(page, false);
        } catch (error) {
            showToast(error?.response?.data?.message || 'Failed to create split delivery', 'error');
        } finally {
            setSplitSaving(false);
        }
    };

    const handlePickupImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showToast('Please select an image file', 'error');
            return;
        }
        
        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder', 'orders/pickup');
            const res = await sellerApi.uploadMedia(formData);
            const url = res.data?.result?.url || res.data?.url;
            if (url) {
                setPickupImage(url);
                showToast('Pickup proof uploaded', 'success');
            }
        } catch (err) {
            console.error(err);
            showToast('Failed to upload pickup proof', 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const confirmPickup = () => {
        if (!pickupImage) {
            showToast('Please upload a proof image first', 'error');
            return;
        }
        if (pendingStatusUpdate) {
            const field = pendingStatusUpdate.proofField || 'pickupProofImages';
            handleStatusUpdate(pendingStatusUpdate.orderId, pendingStatusUpdate.status, {
                [field]: [pickupImage]
            });
        }
    };

    useEffect(() => {
        if (pickupOtpCooldown <= 0) return undefined;
        const iv = setInterval(() => {
            setPickupOtpCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
        }, 1000);
        return () => clearInterval(iv);
    }, [pickupOtpCooldown]);

    const handleSendPickupOtp = async (orderId) => {
        if (pickupOtpSending || pickupOtpCooldown > 0) return;
        setPickupOtpSending(true);
        try {
            await sellerApi.resendPickupOtp(orderId);
            showToast('Pickup code sent to the customer', 'success');
            setPickupOtpCooldown(30);
        } catch (err) {
            showToast(err?.response?.data?.message || 'Failed to send OTP', 'error');
        } finally {
            setPickupOtpSending(false);
        }
    };

    const handleVerifyPickupOtp = async (orderId) => {
        if (pickupOtpVerifying || pickupVerifyOtp.length < 4) return;
        setPickupOtpVerifying(true);
        try {
            await sellerApi.verifyCustomerPickup(orderId, { otp: pickupVerifyOtp });
            showToast('Pickup verified', 'success');
            setPickupVerifyOtp('');
            await fetchOrders();
        } catch (err) {
            showToast(err?.response?.data?.message || 'Incorrect or expired code', 'error');
        } finally {
            setPickupOtpVerifying(false);
        }
    };

    const exportOrders = () => {
        const data = filteredOrders;
        if (!data.length) {
            showToast("No orders to export", "warning");
            return;
        }
        const escapeCsv = (v) => {
            const s = String(v ?? "").replace(/"/g, '""');
            return /[",\n\r]/.test(s) ? `"${s}"` : s;
        };
        const headers = ["Order ID", "Customer", "Phone", "Date", "Time", "Your Earnings (₹)", "Status", "Address", "Payment"];
        const rows = data.map((o) => [
            o.id,
            o.customer?.name ?? "",
            o.customer?.phone ?? "",
            o.date,
            o.time,
            o.total,
            o.status,
            o.address ?? "",
            o.payment ?? "",
        ]);
        const csvContent = [
            headers.map(escapeCsv).join(","),
            ...rows.map((row) => row.map(escapeCsv).join(",")),
        ].join("\n");
        const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`Exported ${data.length} order(s) as CSV`, "success");
    };

    return (
        <div className="space-y-4 sm:space-y-6 pb-20 sm:pb-16">
            <BlurFade delay={0.1}>
                {/* Page Header */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
                    <div className="min-w-0">
                        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 flex flex-wrap items-center gap-2">
                            Order Management
                            <Badge variant="primary" className="text-[10px] px-1.5 py-0 font-bold tracking-wider uppercase bg-brand-100 text-brand-700">Real-time</Badge>
                        </h1>
                        <p className="text-slate-600 text-sm sm:text-base mt-0.5 font-medium">Process and track your customer orders with ease.</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                        <Button
                            onClick={exportOrders}
                            variant="outline"
                            className="flex items-center space-x-1.5 sm:space-x-2 px-3 py-2 sm:px-5 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold text-slate-600 bg-white hover:bg-slate-50 border-slate-200"
                        >
                            <HiOutlinePrinter className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            <span className="hidden sm:inline">EXPORT ALL</span>
                        </Button>
                        <ShimmerButton
                            onClick={() => setIsQuickViewModalOpen(true)}
                            className="px-4 py-2 sm:px-6 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold text-white shadow-xl flex items-center space-x-1.5 sm:space-x-2"
                        >
                            <HiOutlineEye className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-0" />
                            <span className="hidden sm:inline">QUICK VIEW</span>
                        </ShimmerButton>
                    </div>
                </div>
            </BlurFade>

            {/* Quick Stats */}
            {loading ? (
                <div className="min-h-[400px] flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-100 shadow-sm">
                    <Loader2 className="h-10 w-10 text-primary animate-spin" />
                    <p className="text-slate-600 font-bold mt-4 uppercase tracking-widest text-xs">Fetching Active Orders...</p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                        {stats.map((stat, i) => (
                            <BlurFade key={i} delay={0.1 + (i * 0.05)}>
                                <MagicCard
                                    className="border-none shadow-sm ring-1 ring-slate-100 p-0 overflow-hidden group bg-white"
                                    gradientColor={stat.bg.includes('indigo') ? "#eef2ff" : stat.bg.includes('amber') ? "#fffbeb" : stat.bg.includes('emerald') ? "#ecfdf5" : "#fff1f2"}
                                >
                                    <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 relative z-10">
                                        <div className={cn("h-10 w-10 sm:h-12 sm:w-12 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 duration-300 shadow-sm shrink-0", stat.bg, stat.color)}>
                                            <stat.icon className="h-5 w-5 sm:h-6 sm:w-6" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest truncate">{stat.label}</p>
                                            <h4 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">{stat.value}</h4>
                                        </div>
                                    </div>
                                </MagicCard>
                            </BlurFade>
                        ))}
                    </div>

                    {/* Main Content Area */}
                    <BlurFade delay={0.3}>
                        <div className="sm:bg-white sm:shadow-xl sm:ring-1 sm:ring-slate-100 sm:rounded-lg overflow-visible">
                            {/* Tabs */}
                            <div className="border-b border-slate-100 bg-slate-50/30 overflow-x-auto scrollbar-hide">
                                <div className="flex px-3 sm:px-6 items-center min-w-max">
                                    {tabs.map((tab) => (
                                        <button
                                            key={tab}
                                            onClick={() => setActiveTab(tab)}
                                            className={cn(
                                                "relative py-3 sm:py-4 px-2.5 sm:px-4 text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-300",
                                                activeTab === tab
                                                    ? "text-primary scale-105"
                                                    : "text-slate-600 hover:text-slate-700"
                                            )}
                                        >
                                            {tab}
                                            {activeTab === tab && (
                                                <motion.div
                                                    layoutId="tab-underline"
                                                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full mx-2 sm:mx-4"
                                                />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Toolbox */}
                            <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
                                <div className="relative flex-1 group w-full">
                                    <HiOutlineMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600 group-focus-within:text-primary transition-all" />
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Search by Order ID or Customer Name..."
                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-100/50 border-none rounded-lg text-sm font-semibold text-slate-700 placeholder:text-slate-500 focus:ring-2 focus:ring-primary/5 transition-all outline-none"
                                    />
                                </div>
                                <div className="flex gap-3 shrink-0 w-full lg:w-auto items-center justify-end flex-wrap">
                                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end sm:justify-start">
                                        <div className="w-full sm:w-32">
                                            <DatePicker
                                                value={startDate}
                                                max={todayStr}
                                                align="left"
                                                onChange={(value) => {
                                                    if (!value) {
                                                        setStartDate("");
                                                        setPage(1);
                                                        return;
                                                    }
                                                    const today = new Date().toISOString().split("T")[0];
                                                    if (value > today) {
                                                        showToast("Start date cannot be in the future", "error");
                                                        return;
                                                    }
                                                    if (endDate && value > endDate) {
                                                        showToast("Start date cannot be after end date", "error");
                                                        return;
                                                    }
                                                    setPage(1);
                                                    setStartDate(value);
                                                }}
                                                placeholder="From date"
                                            />
                                        </div>
                                        <span className="text-xs font-semibold text-slate-600 hidden sm:inline">
                                            to
                                        </span>
                                        <div className="w-full sm:w-32 mt-2 sm:mt-0">
                                            <DatePicker
                                                value={endDate}
                                                max={todayStr}
                                                min={startDate || undefined}
                                                align="right"
                                                popupClassName="mt-4"
                                                disabled={!startDate}
                                                onChange={(value) => {
                                                    if (!value) {
                                                        setEndDate("");
                                                        setPage(1);
                                                        return;
                                                    }
                                                    const today = new Date().toISOString().split("T")[0];
                                                    if (value > today) {
                                                        showToast("End date cannot be in the future", "error");
                                                        return;
                                                    }
                                                    if (startDate && value < startDate) {
                                                        showToast("End date cannot be before start date", "error");
                                                        return;
                                                    }
                                                    setPage(1);
                                                    setEndDate(value);
                                                }}
                                                placeholder="To date"
                                            />
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { setStartDate(''); setEndDate(''); setPage(1); }}
                                        className="text-xs font-semibold text-slate-600 hover:text-slate-700"
                                    >
                                        Clear dates
                                    </button>
                                </div>
                            </div>

                            {/* Mobile: Card list */}
                            <div className="md:hidden p-3 sm:p-4 space-y-3">
                                {filteredOrders.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 px-4">
                                        <div className="h-14 w-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-3">
                                            <HiOutlineInboxStack className="h-7 w-7" />
                                        </div>
                                        <h3 className="text-sm font-bold text-slate-900">No orders found</h3>
                                        <p className="text-xs text-slate-600 font-medium text-center mt-1">Adjust filters or search.</p>
                                        <Button variant="outline" className="mt-4 rounded-xl text-xs" onClick={() => { setActiveTab('All'); setSearchTerm(''); }}>CLEAR FILTERS</Button>
                                    </div>
                                ) : (
                                <AnimatePresence mode="popLayout">
                                    {filteredOrders
                                        .slice((page - 1) * pageSize, page * pageSize)
                                        .map((order) => (
                                        <motion.div
                                            key={order.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm active:bg-slate-50/50"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1" onClick={() => handleViewDetails(order)}>
                                                    <p className="text-xs font-black text-slate-900 truncate">#{order.id}</p>
                                                    <p className="text-xs font-semibold text-slate-600 mt-0.5 flex items-center gap-1">
                                                        <HiOutlineCalendarDays className="h-3 w-3 shrink-0" />
                                                        {order.date} • {order.time}
                                                    </p>
                                                    {(() => {
                                                        const fulfillment = getFulfillmentDisplay(order);
                                                        return (
                                                            <div className="mt-1.5 flex flex-col gap-0.5">
                                                                <div className="flex flex-wrap gap-1">
                                                                    <Badge className={cn('text-[9px] font-bold uppercase w-fit', fulfillment.typeBadgeClassName)}>
                                                                        {fulfillment.typeLabel}
                                                                    </Badge>
                                                                    <Badge className={cn('text-[9px] font-bold uppercase w-fit', fulfillment.methodBadgeClassName)}>
                                                                        {fulfillment.methodLabel}
                                                                    </Badge>
                                                                </div>
                                                                <span className="text-[10px] font-semibold text-slate-500">{fulfillment.detail}</span>
                                                            </div>
                                                        );
                                                    })()}
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <div className="h-7 w-7 rounded-full bg-slate-900 flex items-center justify-center text-[10px] font-black text-white shrink-0">
                                                            {order.customer.avatar}
                                                        </div>
                                                        <p className="text-xs font-bold text-slate-800 truncate">{order.customer.name}</p>
                                                    </div>
                                                    <p className="text-sm font-black text-slate-900 mt-2">₹{order.total.toLocaleString()}</p>
                                                </div>
                                                <div className="flex flex-col items-end gap-2 shrink-0 max-w-[140px]">
                                                    {!orderStatusControlShowsOwnBadge(order) && (
                                                        <Badge variant={getStatusColor(order.status)} className="text-[10px] font-black uppercase px-2 py-0 text-right whitespace-normal">
                                                            {order.statusLabel || order.status}
                                                        </Badge>
                                                    )}
                                                    {order.storeReassignment && (
                                                        <Badge className="bg-violet-100 text-violet-800 border border-violet-200 text-[8px] font-black uppercase px-2 py-0">
                                                            Reassigned
                                                        </Badge>
                                                    )}
                                                    <OrderStatusControl
                                                        order={order}
                                                        onStatusUpdate={handleStatusUpdate}
                                                        compact
                                                    />
                                                    <button
                                                        onClick={() => handleViewDetails(order)}
                                                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"
                                                    >
                                                        <HiOutlineEye className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                                )}
                            </div>

                            {/* Bulk accept/reject bar — appears once a pending order is checked */}
                            {selectedOrderIds.length > 0 && (
                                <div className="hidden md:flex items-center justify-between gap-3 px-4 lg:px-6 py-3 bg-brand-50 border-b border-brand-100">
                                    <p className="text-xs font-bold text-brand-800">
                                        {selectedOrderIds.length} order{selectedOrderIds.length === 1 ? '' : 's'} selected
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedOrderIds([])}
                                            className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-800"
                                        >
                                            Clear
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isBulkRejecting}
                                            onClick={openBulkRejectModal}
                                            className="px-4 py-1.5 rounded-lg bg-white text-rose-600 ring-1 ring-rose-200 text-xs font-black uppercase hover:bg-rose-50 transition-all disabled:opacity-50"
                                        >
                                            Reject Selected
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isBulkAccepting}
                                            onClick={handleBulkAccept}
                                            className="px-4 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-black uppercase hover:bg-brand-700 transition-all disabled:opacity-50"
                                        >
                                            {isBulkAccepting ? 'Accepting…' : 'Accept Selected'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Desktop: Table */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-left border-collapse min-w-[640px]">
                                    <thead>
                                        <tr className="bg-slate-50/50 border-b border-slate-100">
                                            <th className="px-4 lg:px-3 py-3 lg:py-4 w-8">
                                                {visiblePendingOrderIds.length > 0 && (
                                                    <input
                                                        type="checkbox"
                                                        title="Select all pending orders"
                                                        checked={visiblePendingOrderIds.every((id) => selectedOrderIds.includes(id))}
                                                        onChange={toggleSelectAllVisiblePending}
                                                        className="h-4 w-4 rounded border-slate-300 cursor-pointer accent-brand-600"
                                                    />
                                                )}
                                            </th>
                                            <th className="px-4 lg:px-6 py-3 lg:py-4 text-xs font-bold text-slate-600 uppercase tracking-widest">Order Details</th>
                                            <th className="px-4 lg:px-6 py-3 lg:py-4 text-xs font-bold text-slate-600 uppercase tracking-widest">Customer</th>
                                            <th className="px-4 lg:px-6 py-3 lg:py-4 text-xs font-bold text-slate-600 uppercase tracking-widest">Earnings</th>
                                            <th className="px-4 lg:px-6 py-3 lg:py-4 text-xs font-bold text-slate-600 uppercase tracking-widest">Status</th>
                                            <th className="px-4 lg:px-6 py-3 lg:py-4 text-xs font-bold text-slate-600 uppercase tracking-widest text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        <AnimatePresence mode="popLayout">
                                            {filteredOrders
                                                .slice((page - 1) * pageSize, page * pageSize)
                                                .map((order) => (
                                                <motion.tr
                                                    layout
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.95 }}
                                                    key={order.id}
                                                    className="hover:bg-slate-50/50 transition-colors group"
                                                >
                                                    <td className="px-4 lg:px-3 py-3 lg:py-4" onClick={(e) => e.stopPropagation()}>
                                                        {order.status === 'pending' && (
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedOrderIds.includes(order.id)}
                                                                onChange={() => toggleOrderSelection(order.id)}
                                                                className="h-4 w-4 rounded border-slate-300 cursor-pointer accent-brand-600"
                                                            />
                                                        )}
                                                    </td>
                                                    <td className="px-4 lg:px-6 py-3 lg:py-4">
                                                        <div>
                                                            <span className="text-xs font-bold text-slate-900 group-hover:text-primary transition-colors cursor-pointer" onClick={() => handleViewDetails(order)}>
                                                                #{order.id}
                                                            </span>
                                                            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mt-1">
                                                                <HiOutlineCalendarDays className="h-3 w-3" />
                                                                {order.date} • {order.time}
                                                            </div>
                                                            {(() => {
                                                                const fulfillment = getFulfillmentDisplay(order);
                                                                return (
                                                                    <div className="mt-1.5 flex flex-col gap-0.5">
                                                                        <div className="flex flex-wrap gap-1">
                                                                            <Badge className={cn('text-[9px] font-bold uppercase w-fit', fulfillment.typeBadgeClassName)}>
                                                                                {fulfillment.typeLabel}
                                                                            </Badge>
                                                                            <Badge className={cn('text-[9px] font-bold uppercase w-fit', fulfillment.methodBadgeClassName)}>
                                                                                {fulfillment.methodLabel}
                                                                            </Badge>
                                                                        </div>
                                                                        <span className="text-[10px] font-semibold text-slate-500">{fulfillment.detail}</span>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 lg:px-6 py-3 lg:py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-8 w-8 rounded-full bg-slate-900 flex items-center justify-center text-[10px] font-black text-white shadow-sm ring-2 ring-white">
                                                                {order.customer.avatar}
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-bold text-slate-900">{order.customer.name}</p>
                                                                <p className="text-xs font-semibold text-slate-600">{order.customer.phone}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 lg:px-6 py-3 lg:py-4">
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-bold text-slate-900">₹{order.total.toLocaleString()}</span>
                                                            <span className="text-xs font-semibold text-slate-600">{order.items.length} items</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 lg:px-6 py-3 lg:py-4">
                                                        <div className="flex flex-col items-start gap-1.5">
                                                            <OrderStatusControl
                                                                order={order}
                                                                onStatusUpdate={handleStatusUpdate}
                                                            />
                                                            {order.storeReassignment && (
                                                                <Badge className="bg-violet-100 text-violet-800 border border-violet-200 text-[8px] font-black uppercase px-2 py-0">
                                                                    Reassigned
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 lg:px-6 py-3 lg:py-4 text-right">
                                                        <div className="flex items-center justify-end space-x-1.5">
                                                            <button
                                                                onClick={() => handleViewDetails(order)}
                                                                className="p-1.5 hover:bg-white hover:text-primary rounded-lg transition-all text-slate-600 shadow-sm ring-1 ring-slate-100"
                                                            >
                                                                <HiOutlineEye className="h-4 w-4" />
                                                            </button>
                                                            {order.status === 'pending' && (
                                                                <>
                                                                    <button
                                                                        title="Accept order"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleStatusUpdate(order.id, 'confirmed');
                                                                        }}
                                                                        className="p-1.5 hover:bg-brand-50 hover:text-brand-600 rounded-lg transition-all text-slate-600 shadow-sm ring-1 ring-slate-100"
                                                                    >
                                                                        <HiOutlineCheck className="h-4 w-4" />
                                                                    </button>
                                                                    <button
                                                                        title="Reject order"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleStatusUpdate(order.id, 'cancelled');
                                                                        }}
                                                                        className="p-1.5 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-all text-slate-600 shadow-sm ring-1 ring-slate-100"
                                                                    >
                                                                        <HiOutlineXMark className="h-4 w-4" />
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </motion.tr>
                                            ))}
                                        </AnimatePresence>
                                    </tbody>
                                </table>
                                {filteredOrders.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-20 px-6">
                                        <div className="h-16 w-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4">
                                            <HiOutlineInboxStack className="h-8 w-8" />
                                        </div>
                                        <h3 className="text-sm font-bold text-slate-900">No orders found</h3>
                                        <p className="text-xs text-slate-600 font-medium max-w-xs text-center mt-1">We couldn't find any orders matching your current filters. Try adjusting your search.</p>
                                        <Button variant="outline" className="mt-6 rounded-xl text-xs" onClick={() => { setActiveTab('All'); setSearchTerm(''); }}>CLEAR ALL FILTERS</Button>
                                    </div>
                                )}
                            </div>

                            <div className="p-3 sm:p-4 border-t border-slate-50 bg-slate-50/30 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 px-3 sm:px-6">
                                <p className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest text-center sm:text-left">
                                    Showing {filteredOrders.length} of {total || summary.totalOrders || filteredOrders.length} Orders
                                </p>
                                <div className="flex gap-1 justify-center sm:justify-end">
                                    <button className="p-1.5 rounded-lg border border-slate-200 text-slate-600 opacity-50 cursor-not-allowed" aria-hidden><HiOutlineChevronRight className="h-3.5 w-3.5 rotate-180" /></button>
                                    <button className="p-1.5 rounded-lg border border-slate-200 text-slate-600 opacity-50 cursor-not-allowed" aria-hidden><HiOutlineChevronRight className="h-3.5 w-3.5" /></button>
                                </div>
                            </div>
                        </div>
                    </BlurFade>

                    <div className="mt-3 sm:mt-4 px-2 sm:px-0">
                        <Pagination
                            page={page}
                            totalPages={Math.ceil((total || filteredOrders.length) / pageSize) || 1}
                            total={total || filteredOrders.length}
                            pageSize={pageSize}
                            onPageChange={(p) => setPage(p)}
                            onPageSizeChange={(newSize) => {
                                setPageSize(newSize);
                                setPage(1);
                                fetchOrders(1, false);
                            }}
                            loading={loading}
                        />
                    </div>

                    {/* Order Details Modal */}
                    {/* ... (existing details modal) */}

                    {/* Quick View Summary Modal */}
                    <AnimatePresence>
                        {isQuickViewModalOpen && (
                            <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
                                    onClick={() => setIsQuickViewModalOpen(false)}
                                />
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                    className="w-full max-w-lg relative z-10 bg-white rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
                                >
                                    <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="h-9 w-9 sm:h-10 sm:w-10 bg-primary text-primary-foreground rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
                                                <HiOutlineChartBar className="h-4 w-4 sm:h-5 sm:w-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-sm sm:text-base font-black text-slate-900 truncate">Quick Snapshot</h3>
                                                <p className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest">Today's Performance</p>
                                            </div>
                                        </div>
                                        <button onClick={() => setIsQuickViewModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-600 shrink-0">
                                            <HiOutlineXMark className="h-5 w-5" />
                                        </button>
                                    </div>

                                    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                                        {/* Summary Grid */}
                                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                                            <div className="p-3 sm:p-4 rounded-2xl bg-brand-50 border border-brand-100">
                                                <p className="text-[10px] sm:text-xs font-bold text-brand-400 uppercase tracking-widest mb-1">Total Revenue</p>
                                                <p className="text-base sm:text-xl font-black text-brand-700 truncate">₹{summary.totalAmount.toLocaleString('en-IN')}</p>
                                            </div>
                                            <div className="p-3 sm:p-4 rounded-2xl bg-brand-50 border border-brand-100">
                                                <p className="text-[10px] sm:text-xs font-bold text-brand-400 uppercase tracking-widest mb-1">Avg. Order Value</p>
                                                <p className="text-base sm:text-xl font-black text-brand-700">₹{summary.totalOrders ? (summary.totalAmount / summary.totalOrders).toFixed(0) : '0'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100">
                                        <Button
                                            onClick={() => {
                                                setIsQuickViewModalOpen(false);
                                                setActiveTab('Pending');
                                            }}
                                            className="w-full py-2.5 sm:py-3 text-[10px] sm:text-xs font-bold"
                                        >
                                            VIEW ALL PENDING ORDERS
                                        </Button>
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>

                    {/* Pickup Proof Modal */}
                    <AnimatePresence>
                        {isPickupModalOpen && (
                            <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4">
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
                                    onClick={() => !isUploading && setIsPickupModalOpen(false)}
                                />
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                    className="w-full max-w-sm relative z-10 bg-white rounded-3xl shadow-2xl overflow-hidden"
                                >
                                    <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                            <HiOutlineCamera className="h-5 w-5 text-primary" />
                                            {pendingStatusUpdate?.proofField === 'deliveryProofImages' ? 'Capture Delivery Proof' : 'Capture Pickup Proof'}
                                        </h3>
                                        <button
                                            onClick={() => setIsPickupModalOpen(false)}
                                            disabled={isUploading}
                                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"
                                        >
                                            <HiOutlineXMark className="h-5 w-5" />
                                        </button>
                                    </div>
                                    <div className="p-6 space-y-4 text-center">
                                        <p className="text-xs font-bold text-slate-600">
                                            {pendingStatusUpdate?.proofField === 'deliveryProofImages'
                                                ? 'Please upload a photo confirming the order was delivered to the customer.'
                                                : 'Please upload a photo of the order being handed over to the delivery partner.'}
                                        </p>
                                        <div className="relative h-48 w-full bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 overflow-hidden flex flex-col items-center justify-center group hover:border-primary/50 transition-colors">
                                            {pickupImage ? (
                                                <img src={pickupImage} alt="Delivery Proof" className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="flex flex-col items-center">
                                                    {isUploading ? (
                                                        <Loader2 className="h-8 w-8 text-primary animate-spin" />
                                                    ) : (
                                                        <>
                                                            <HiOutlineCamera className="h-8 w-8 text-slate-300 group-hover:text-primary transition-colors" />
                                                            <span className="text-[10px] font-black text-slate-400 mt-2 uppercase tracking-widest group-hover:text-primary">Tap to Upload</span>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                            <input 
                                                type="file" 
                                                accept="image/*" 
                                                capture="environment"
                                                onChange={handlePickupImageUpload}
                                                disabled={isUploading}
                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                            />
                                        </div>
                                    </div>
                                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
                                        <Button 
                                            variant="outline" 
                                            onClick={() => setIsPickupModalOpen(false)}
                                            className="flex-1 text-xs"
                                            disabled={isUploading}
                                        >
                                            CANCEL
                                        </Button>
                                        <Button
                                            onClick={confirmPickup}
                                            disabled={!pickupImage || isUploading}
                                            className="flex-1 text-xs"
                                        >
                                            {pendingStatusUpdate?.proofField === 'deliveryProofImages' ? 'CONFIRM DELIVERY' : 'CONFIRM HANDOVER'}
                                        </Button>
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {isRescheduleModalOpen && rescheduleTarget && (
                            <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-4">
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
                                    onClick={closeSellerRescheduleModal}
                                />
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                    className="w-full max-w-sm relative z-10 bg-white rounded-3xl shadow-2xl overflow-hidden"
                                >
                                    <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                            <HiOutlineCalendarDays className="h-5 w-5 text-primary" />
                                            Reschedule Delivery
                                        </h3>
                                        <button
                                            onClick={closeSellerRescheduleModal}
                                            disabled={isSubmittingReschedule}
                                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"
                                        >
                                            <HiOutlineXMark className="h-5 w-5" />
                                        </button>
                                    </div>
                                    <div className="p-5 space-y-4">
                                        {isLoadingRescheduleOptions ? (
                                            <div className="flex justify-center py-6">
                                                <Loader2 className="h-6 w-6 text-primary animate-spin" />
                                            </div>
                                        ) : (
                                            <>
                                                <div>
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">New delivery date</label>
                                                    <DatePicker
                                                        value={rescheduleDate}
                                                        onChange={setRescheduleDate}
                                                        min={new Date().toISOString().split('T')[0]}
                                                        max={new Date(Date.now() + rescheduleMaxDaysAhead * 86400000).toISOString().split('T')[0]}
                                                        placeholder="Select date"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Delivery window</label>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {rescheduleWindows.map((w) => (
                                                            <button
                                                                key={w.label}
                                                                type="button"
                                                                onClick={() => setRescheduleWindow(w.label)}
                                                                className={cn(
                                                                    "px-2.5 py-2 rounded-lg text-[11px] font-bold border transition-all",
                                                                    rescheduleWindow === w.label
                                                                        ? "bg-slate-900 text-white border-slate-900"
                                                                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                                                                )}
                                                            >
                                                                {w.label}
                                                            </button>
                                                        ))}
                                                        {rescheduleWindows.length === 0 && (
                                                            <p className="col-span-2 text-xs text-slate-400 font-semibold">No delivery windows configured</p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Note (optional)</label>
                                                    <textarea
                                                        value={rescheduleNote}
                                                        onChange={(e) => setRescheduleNote(e.target.value)}
                                                        rows={2}
                                                        placeholder="Reason for rescheduling…"
                                                        className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 p-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
                                        <Button
                                            variant="outline"
                                            onClick={closeSellerRescheduleModal}
                                            className="flex-1 text-xs"
                                            disabled={isSubmittingReschedule}
                                        >
                                            CANCEL
                                        </Button>
                                        <Button
                                            onClick={handleSubmitSellerReschedule}
                                            disabled={!rescheduleDate || !rescheduleWindow || isSubmittingReschedule}
                                            className="flex-1 text-xs"
                                        >
                                            {isSubmittingReschedule ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'CONFIRM'}
                                        </Button>
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {isCancelReasonModalOpen && (
                            <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-4">
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
                                    onClick={closeCancelReasonModal}
                                />
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                    className="w-full max-w-sm relative z-10 bg-white rounded-3xl shadow-2xl overflow-hidden"
                                >
                                    <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                            <HiOutlineXMark className="h-5 w-5 text-rose-600" />
                                            Cancel Order
                                        </h3>
                                        <button
                                            onClick={closeCancelReasonModal}
                                            disabled={isSubmittingCancelReason}
                                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"
                                        >
                                            <HiOutlineXMark className="h-5 w-5" />
                                        </button>
                                    </div>
                                    <div className="p-5 space-y-3">
                                        <p className="text-xs font-semibold text-slate-600">
                                            Please tell the customer why this order is being cancelled. This reason will be visible to them.
                                        </p>
                                        <textarea
                                            value={cancelReasonText}
                                            onChange={(e) => setCancelReasonText(e.target.value)}
                                            rows={3}
                                            autoFocus
                                            placeholder="e.g. Item out of stock, unable to fulfill this order…"
                                            className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 p-2.5 focus:outline-none focus:ring-2 focus:ring-rose-300"
                                        />
                                        <p className="text-[10px] font-bold text-slate-400">{cancelReasonText.trim().length}/10 characters minimum</p>
                                    </div>
                                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
                                        <Button
                                            variant="outline"
                                            onClick={closeCancelReasonModal}
                                            className="flex-1 text-xs"
                                            disabled={isSubmittingCancelReason}
                                        >
                                            BACK
                                        </Button>
                                        <Button
                                            onClick={handleConfirmCancelWithReason}
                                            disabled={cancelReasonText.trim().length < 10 || isSubmittingCancelReason}
                                            className="flex-1 text-xs bg-rose-600 hover:bg-rose-700"
                                        >
                                            {isSubmittingCancelReason ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'CONFIRM CANCELLATION'}
                                        </Button>
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {isBulkRejectModalOpen && (
                            <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-4">
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
                                    onClick={() => !isBulkRejecting && setIsBulkRejectModalOpen(false)}
                                />
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                    className="w-full max-w-sm relative z-10 bg-white rounded-3xl shadow-2xl overflow-hidden"
                                >
                                    <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                            <HiOutlineXMark className="h-5 w-5 text-rose-600" />
                                            Reject {selectedOrderIds.length} Order{selectedOrderIds.length === 1 ? '' : 's'}
                                        </h3>
                                        <button
                                            onClick={() => setIsBulkRejectModalOpen(false)}
                                            disabled={isBulkRejecting}
                                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"
                                        >
                                            <HiOutlineXMark className="h-5 w-5" />
                                        </button>
                                    </div>
                                    <div className="p-5 space-y-3">
                                        <p className="text-xs font-semibold text-slate-600">
                                            This reason will be sent to every customer whose order is rejected. Each order is processed individually — if one fails, the rest still go through.
                                        </p>
                                        <textarea
                                            value={bulkRejectReason}
                                            onChange={(e) => setBulkRejectReason(e.target.value)}
                                            rows={3}
                                            autoFocus
                                            placeholder="e.g. Item out of stock, unable to fulfill this order…"
                                            className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 p-2.5 focus:outline-none focus:ring-2 focus:ring-rose-300"
                                        />
                                        <p className="text-[10px] font-bold text-slate-400">{bulkRejectReason.trim().length}/10 characters minimum</p>
                                    </div>
                                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
                                        <Button
                                            variant="outline"
                                            onClick={() => setIsBulkRejectModalOpen(false)}
                                            className="flex-1 text-xs"
                                            disabled={isBulkRejecting}
                                        >
                                            BACK
                                        </Button>
                                        <Button
                                            onClick={handleConfirmBulkReject}
                                            disabled={bulkRejectReason.trim().length < 10 || isBulkRejecting}
                                            className="flex-1 text-xs bg-rose-600 hover:bg-rose-700"
                                        >
                                            {isBulkRejecting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'CONFIRM REJECTION'}
                                        </Button>
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {isReplacementModalOpen && selectedOrder && (
                            <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-4">
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
                                    onClick={closeReplacementModal}
                                />
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                    className="w-full max-w-sm relative z-10 bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
                                >
                                    <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                            <HiOutlineArchiveBoxXMark className="h-5 w-5 text-amber-600" />
                                            Request Replacement
                                        </h3>
                                        <button
                                            onClick={closeReplacementModal}
                                            disabled={replacementSaving}
                                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"
                                        >
                                            <HiOutlineXMark className="h-5 w-5" />
                                        </button>
                                    </div>
                                    <div className="p-5 space-y-4 overflow-y-auto">
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Item to replace</label>
                                            <select
                                                value={replacementItemIndex}
                                                onChange={(e) => setReplacementItemIndex(Number(e.target.value))}
                                                className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 p-2.5 focus:outline-none focus:ring-2 focus:ring-amber-300"
                                            >
                                                {(selectedOrder.rawItems || []).map((item, idx) => (
                                                    <option key={idx} value={idx}>
                                                        {item.name || `Item ${idx + 1}`} (Qty {item.quantity})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Replacement product</label>
                                            {replacementProductsLoading ? (
                                                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 py-2">
                                                    <Loader2 className="h-4 w-4 animate-spin" /> Loading your products…
                                                </div>
                                            ) : (
                                                <select
                                                    value={replacementProductId}
                                                    onChange={(e) => handleReplacementProductChange(e.target.value)}
                                                    className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 p-2.5 focus:outline-none focus:ring-2 focus:ring-amber-300"
                                                >
                                                    <option value="">Select a product…</option>
                                                    {replacementProducts.map((p) => (
                                                        <option key={p._id} value={p._id}>
                                                            {p.name} (₹{Number(p.salePrice || p.price || 0)})
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                            {!replacementProductsLoading && replacementProducts.length === 0 && (
                                                <p className="text-[10px] font-bold text-rose-500 mt-1">No active products found to offer as replacement.</p>
                                            )}
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Replacement price</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={replacementPrice}
                                                    onChange={(e) => setReplacementPrice(e.target.value)}
                                                    className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 p-2.5 pl-6 focus:outline-none focus:ring-2 focus:ring-amber-300"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Reason (shared with customer)</label>
                                            <textarea
                                                value={replacementReason}
                                                onChange={(e) => setReplacementReason(e.target.value)}
                                                rows={2}
                                                placeholder="e.g. Item unavailable, out of stock…"
                                                className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 p-2.5 focus:outline-none focus:ring-2 focus:ring-amber-300"
                                            />
                                        </div>
                                    </div>
                                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3 shrink-0">
                                        <Button
                                            variant="outline"
                                            onClick={closeReplacementModal}
                                            className="flex-1 text-xs"
                                            disabled={replacementSaving}
                                        >
                                            CANCEL
                                        </Button>
                                        <Button
                                            onClick={handleSubmitReplacement}
                                            disabled={replacementSaving || !replacementProductId || !replacementPrice}
                                            className="flex-1 text-xs bg-amber-600 hover:bg-amber-700"
                                        >
                                            {replacementSaving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'SEND REQUEST'}
                                        </Button>
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {isSplitModalOpen && selectedOrder && (
                            <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-4">
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
                                    onClick={closeSplitModal}
                                />
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                    className="w-full max-w-sm relative z-10 bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
                                >
                                    <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                            <HiOutlineTruck className="h-5 w-5 text-indigo-600" />
                                            Split Delivery
                                        </h3>
                                        <button
                                            onClick={closeSplitModal}
                                            disabled={splitSaving}
                                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"
                                        >
                                            <HiOutlineXMark className="h-5 w-5" />
                                        </button>
                                    </div>
                                    <div className="p-5 space-y-3 overflow-y-auto">
                                        <p className="text-[10px] text-slate-500 leading-relaxed">
                                            Select the item(s) to send in the first delivery now. Everything else goes in a second delivery.
                                        </p>
                                        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                                            {(selectedOrder.rawItems || []).map((item, idx) => {
                                                const checked = splitFirstLegIndexes.includes(idx);
                                                return (
                                                    <label
                                                        key={idx}
                                                        className={`flex items-center gap-3 p-3 rounded-2xl ring-1 cursor-pointer transition-all ${
                                                            checked ? 'bg-indigo-50 ring-indigo-200' : 'bg-white ring-slate-100'
                                                        }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => toggleSplitFirstLegIndex(idx)}
                                                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400 shrink-0"
                                                        />
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-bold text-slate-900 truncate">{item.name || `Item ${idx + 1}`}</p>
                                                            <p className="text-xs font-semibold text-slate-600 mt-0.5">Qty {item.quantity} · ₹{Number(item.price || 0).toFixed(2)} each</p>
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Extra delivery fee for 2nd part</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={splitExtraFee}
                                                    onChange={(e) => setSplitExtraFee(e.target.value)}
                                                    className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 p-2.5 pl-6 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                                />
                                            </div>
                                        </div>
                                        <div className="rounded-2xl bg-indigo-50/60 ring-1 ring-indigo-100 p-3 space-y-3">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700">2nd delivery — when will these items actually arrive?</p>
                                            {isLoadingSplitOptions ? (
                                                <div className="flex justify-center py-3">
                                                    <Loader2 className="h-5 w-5 text-indigo-500 animate-spin" />
                                                </div>
                                            ) : (
                                                <>
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-500 mb-1 block">Delivery date</label>
                                                        <DatePicker
                                                            value={splitDeliveryDate}
                                                            onChange={setSplitDeliveryDate}
                                                            min={new Date().toISOString().split('T')[0]}
                                                            max={new Date(Date.now() + splitMaxDaysAhead * 86400000).toISOString().split('T')[0]}
                                                            placeholder="Select date"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-500 mb-1 block">Delivery window</label>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            {splitWindows.map((w) => (
                                                                <button
                                                                    key={w.label}
                                                                    type="button"
                                                                    onClick={() => setSplitWindowLabel(w.label)}
                                                                    className={cn(
                                                                        "px-2.5 py-2 rounded-lg text-[11px] font-bold border transition-all",
                                                                        splitWindowLabel === w.label
                                                                            ? "bg-indigo-600 text-white border-indigo-600"
                                                                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                                                                    )}
                                                                >
                                                                    {w.label}
                                                                </button>
                                                            ))}
                                                            {splitWindows.length === 0 && (
                                                                <p className="col-span-2 text-xs text-slate-400 font-semibold">No delivery windows configured — set them up in Delivery Scheduling first.</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3 shrink-0">
                                        <Button
                                            variant="outline"
                                            onClick={closeSplitModal}
                                            className="flex-1 text-xs"
                                            disabled={splitSaving}
                                        >
                                            CANCEL
                                        </Button>
                                        <Button
                                            onClick={handleSubmitSplitDelivery}
                                            disabled={
                                                splitSaving ||
                                                !splitFirstLegIndexes.length ||
                                                splitFirstLegIndexes.length >= (selectedOrder.rawItems || []).length ||
                                                !splitDeliveryDate ||
                                                !splitWindowLabel
                                            }
                                            className="flex-1 text-xs bg-indigo-600 hover:bg-indigo-700"
                                        >
                                            {splitSaving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'CREATE SPLIT'}
                                        </Button>
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {isDetailsModalOpen && selectedOrder && (
                            <div
                                className="fixed inset-0 z-[210] flex items-stretch sm:items-center justify-center p-3 pt-16 sm:p-6 sm:pt-6 lg:p-12 overflow-hidden overscroll-none"
                                onWheel={(e) => e.stopPropagation()}
                                onTouchMove={(e) => e.stopPropagation()}
                            >
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-md"
                                    onClick={() => setIsDetailsModalOpen(false)}
                                />
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                    className="w-full max-w-lg sm:max-w-2xl relative z-10 bg-white rounded-3xl shadow-2xl flex flex-col min-h-0 max-h-[min(90vh,100%)] overflow-hidden"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {/* Modal Header */}
                                    <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-100 shrink-0">
                                        <div className="flex items-center space-x-3">
                                            <div className="h-10 w-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg">
                                                <HiOutlineTruck className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <h3 className="text-base font-black text-slate-900">Order Details</h3>
                                                <div className="flex items-center space-x-2 mt-0.5 flex-wrap">
                                                    <Badge variant={getStatusColor(selectedOrder.status)} className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0">{selectedOrder.statusLabel || selectedOrder.status}</Badge>
                                                    {selectedOrder.storeReassignment && (
                                                        <Badge className="bg-violet-100 text-violet-800 border border-violet-200 text-[9px] font-black uppercase tracking-widest px-1.5 py-0">
                                                            Reassigned
                                                        </Badge>
                                                    )}
                                                    <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">#{selectedOrder.id}</span>
                                                </div>
                                                {selectedOrder.storeReassignment && (
                                                    <p className="text-[11px] font-bold text-violet-700 mt-1.5">
                                                        Assigned to your store from {selectedOrder.storeReassignment.fromShopName}
                                                        {selectedOrder.storeReassignment.reassignedAt
                                                            ? ` · ${new Date(selectedOrder.storeReassignment.reassignedAt).toLocaleString('en-IN')}`
                                                            : ''}
                                                    </p>
                                                )}
                                                {(selectedOrder.date || selectedOrder.time) && (
                                                    <p className="text-[11px] font-bold text-slate-500 mt-1.5 flex items-center gap-1.5">
                                                        <HiOutlineCalendarDays className="h-3.5 w-3.5" />
                                                        {selectedOrder.date}
                                                        {selectedOrder.time && (
                                                            <>
                                                                <span className="text-slate-300">•</span>
                                                                <HiOutlineClock className="h-3.5 w-3.5" />
                                                                {selectedOrder.time}
                                                            </>
                                                        )}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <button onClick={() => setIsDetailsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600">
                                            <HiOutlineXMark className="h-5 w-5" />
                                        </button>
                                    </div>

                                    <div
                                        className="px-4 py-4 sm:px-6 sm:py-5 overflow-y-auto overscroll-contain touch-pan-y flex-1 min-h-0"
                                        tabIndex={0}
                                        onWheel={(e) => e.stopPropagation()}
                                        onTouchMove={(e) => e.stopPropagation()}
                                    >
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
                                            <div className="space-y-3 sm:space-y-4">
                                                <div>
                                                    <div className="flex items-center justify-between gap-2 mb-2">
                                                        <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-2">
                                                            <HiOutlineMapPin className="h-3 w-3 text-primary" /> Delivery Address
                                                        </h4>
                                                        {selectedOrder.location &&
                                                            typeof selectedOrder.location.lat === "number" &&
                                                            typeof selectedOrder.location.lng === "number" && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const { lat, lng } = selectedOrder.location;
                                                                        window.open(
                                                                            `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
                                                                            "_blank",
                                                                        );
                                                                    }}
                                                                    className="text-[10px] font-bold text-primary hover:underline"
                                                                >
                                                                    View on map
                                                                </button>
                                                            )}
                                                    </div>
                                                    <p className="text-xs font-bold text-slate-800 leading-relaxed bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-sm">
                                                        {selectedOrder.address}
                                                    </p>
                                                </div>
                                                <div>
                                                    <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                        <HiOutlinePhone className="h-3 w-3 text-brand-500" /> Contact Info
                                                    </h4>
                                                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-sm">
                                                        <p className="text-xs font-bold text-slate-800">{selectedOrder.customer.name}</p>
                                                        <p className="text-xs font-semibold text-slate-600 mt-0.5">{selectedOrder.customer.phone}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="space-y-3 sm:space-y-4">
                                                <div className="bg-primary/5 p-3 sm:p-4 rounded-3xl border border-primary/10">
                                                    <h4 className="text-xs font-black text-primary uppercase tracking-widest mb-3">Your Earnings</h4>
                                                    <div className="space-y-2">
                                                        <div className="flex justify-between text-sm">
                                                            <span className="font-black text-slate-900">You receive</span>
                                                            <span className="font-black text-primary">₹{formatInr(selectedOrder.sellerPayout ?? selectedOrder.total)}</span>
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 font-medium">
                                                            Customer order value: ₹{formatInr(selectedOrder.customerTotal ?? selectedOrder.total)}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="bg-slate-900 p-3 sm:p-4 rounded-3xl text-white shadow-xl shadow-slate-900/10">
                                                    <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest mb-2">Payment Status</h4>
                                                    <div className="flex items-center gap-2">
                                                        <HiOutlineBanknotes className="h-5 w-5 text-brand-400" />
                                                        <span className="text-xs font-bold tracking-tight">{selectedOrder.payment}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {(() => {
                                            const fulfillment = getFulfillmentDisplay(selectedOrder);
                                            return (
                                                <div className="mb-4 p-3 rounded-2xl bg-brand-50 ring-1 ring-brand-100">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-brand-600 mb-2">
                                                        Delivery type
                                                    </p>
                                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                                        <Badge className={cn('text-[9px] font-bold uppercase', fulfillment.typeBadgeClassName)}>
                                                            {fulfillment.typeLabel}
                                                        </Badge>
                                                        <Badge className={cn('text-[9px] font-bold uppercase', fulfillment.methodBadgeClassName)}>
                                                            {fulfillment.methodLabel}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-xs font-semibold text-slate-700">
                                                        {fulfillment.detail}
                                                    </p>
                                                    {isScheduledHoldOrder(selectedOrder) && (
                                                        <p className="text-xs font-semibold text-blue-700 mt-2">
                                                            Accepted and on hold. Logistics will start automatically before the delivery window.
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        {resolveFulfillmentMethod(selectedOrder) === 'customer_pickup'
                                            && String(selectedOrder.workflowStatus || '').toUpperCase() === 'CUSTOMER_PICKUP_READY' && (
                                            <div className="mb-4 p-3 rounded-2xl bg-emerald-50 ring-1 ring-emerald-100 space-y-2.5">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                                                    Verify Pickup
                                                </p>
                                                <p className="text-xs font-semibold text-slate-700">
                                                    Ask the customer for their pickup code and enter it below to confirm their identity.
                                                </p>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        maxLength={6}
                                                        value={pickupVerifyOtp}
                                                        onChange={(e) => setPickupVerifyOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                        placeholder="Enter code"
                                                        className="flex-1 rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-center text-lg font-black tracking-[0.3em] outline-none focus:ring-2 focus:ring-emerald-300"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleVerifyPickupOtp(selectedOrder.id)}
                                                        disabled={pickupOtpVerifying || pickupVerifyOtp.length < 4}
                                                        className="rounded-xl bg-emerald-600 text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide hover:bg-emerald-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                                    >
                                                        {pickupOtpVerifying ? 'Verifying...' : 'Verify'}
                                                    </button>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSendPickupOtp(selectedOrder.id)}
                                                    disabled={pickupOtpSending || pickupOtpCooldown > 0}
                                                    className="w-full rounded-xl bg-white ring-1 ring-emerald-200 text-emerald-700 px-4 py-2 text-xs font-bold uppercase tracking-wide hover:bg-emerald-50 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                                >
                                                    {pickupOtpSending
                                                        ? 'Sending...'
                                                        : pickupOtpCooldown > 0
                                                            ? `Resend code to customer in ${pickupOtpCooldown}s`
                                                            : "Resend code to customer"}
                                                </button>
                                            </div>
                                        )}
                                        {selectedOrder.reschedule?.status === 'requested' && (
                                            <div className="mb-4 p-3 rounded-2xl bg-amber-50 ring-1 ring-amber-200">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Reschedule Requested</p>
                                                <p className="text-xs font-semibold text-slate-700 mt-1">
                                                    New date: {selectedOrder.reschedule.requestedDeliveryDate ? new Date(selectedOrder.reschedule.requestedDeliveryDate).toLocaleDateString() : '—'}
                                                </p>
                                                <div className="flex gap-2 mt-2">
                                                    <button onClick={() => handleApproveReschedule(selectedOrder)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all">Approve</button>
                                                    <button onClick={() => handleRejectReschedule(selectedOrder)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 transition-all">Reject</button>
                                                </div>
                                            </div>
                                        )}
                                        {!['delivered', 'cancelled', 'returned'].includes((selectedOrder.status || '').toLowerCase())
                                            && selectedOrder.reschedule?.status !== 'requested' && (
                                            <div className="mb-4 p-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200 flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Delivery Schedule</p>
                                                    <p className="text-xs font-semibold text-slate-700 mt-0.5">
                                                        {selectedOrder.schedule?.deliveryDate
                                                            ? `${new Date(selectedOrder.schedule.deliveryDate).toLocaleDateString()} · ${selectedOrder.schedule.windowLabel || ''}`
                                                            : 'Not scheduled'}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => openSellerRescheduleModal(selectedOrder)}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition-all flex items-center gap-1.5 shrink-0"
                                                >
                                                    <HiOutlineCalendarDays className="h-3.5 w-3.5" />
                                                    Reschedule
                                                </button>
                                            </div>
                                        )}
                                        {(() => {
                                            const s = (selectedOrder.status || '').toLowerCase();
                                            const canAdjustPrice =
                                                !['delivered', 'cancelled', 'out_for_delivery', 'returned', 'scheduled'].includes(s)
                                                && canSellerManuallyUpdateStatus(selectedOrder);
                                            const canSplitOrReplace = canSellerSplitOrReplace(selectedOrder);
                                            const canCancelItems = canAdjustPrice && selectedOrder.items.length > 1;
                                            const showItemActions = (canAdjustPrice || canSplitOrReplace) && !adjustMode && !cancelItemsMode;
                                            return (
                                                <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
                                                    <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest">Items Ordered ({selectedOrder.items.length})</h4>
                                                    {showItemActions && (
                                                        <div className="flex flex-wrap justify-end gap-2">
                                                            {canAdjustPrice && (
                                                                <button onClick={() => openAdjustEditor(selectedOrder)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white hover:bg-brand-700 transition-all">Adjust Price</button>
                                                            )}
                                                            {canCancelItems && (
                                                                <button onClick={() => openCancelItemsEditor(selectedOrder)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 transition-all">Item Unavailable</button>
                                                            )}
                                                            {canSplitOrReplace && (
                                                                <>
                                                                    <button onClick={() => openReplacementModal(selectedOrder)} disabled={replacementSaving} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 transition-all disabled:opacity-60">
                                                                        Replacement
                                                                    </button>
                                                                    <button onClick={() => openSplitModal(selectedOrder)} disabled={splitSaving} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-all disabled:opacity-60">
                                                                        Split Delivery
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                    {adjustMode && (
                                                        <button onClick={closeAdjustEditor} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all">Cancel Edit</button>
                                                    )}
                                                    {cancelItemsMode && (
                                                        <button onClick={closeCancelItemsEditor} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all">Cancel Edit</button>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        {cancelItemsMode ? (
                                            <div className="space-y-3">
                                                <p className="text-[10px] text-slate-500 leading-relaxed">
                                                    Select the item(s) that are unavailable. The customer is refunded for exactly those items and the remaining items continue as normal — stock reserved for the cancelled item(s) is released.
                                                </p>
                                                <div className="space-y-2 max-h-52 sm:max-h-64 overflow-y-auto pr-1">
                                                    {cancelItemsList.map((item) => {
                                                        const checked = cancelItemIndexes.includes(item.originalIndex);
                                                        return (
                                                            <label
                                                                key={item.originalIndex}
                                                                className={`flex items-center justify-between gap-2 p-3 rounded-2xl ring-1 cursor-pointer transition-all ${
                                                                    checked ? 'bg-rose-50 ring-rose-200' : 'bg-white ring-slate-100'
                                                                }`}
                                                            >
                                                                <div className="flex items-center gap-3 min-w-0">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={checked}
                                                                        onChange={() => toggleCancelItemIndex(item.originalIndex)}
                                                                        className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-400 shrink-0"
                                                                    />
                                                                    <div className="h-10 w-10 rounded-lg overflow-hidden bg-slate-50 ring-1 ring-slate-200 shrink-0">
                                                                        <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <p className="text-xs font-bold text-slate-900 truncate">{item.name}</p>
                                                                        <p className="text-xs font-semibold text-slate-600 mt-0.5">Qty {item.quantity} · ₹{Number(item.price).toFixed(2)} each</p>
                                                                    </div>
                                                                </div>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                                <textarea
                                                    value={cancelItemsReason}
                                                    onChange={(e) => setCancelItemsReason(e.target.value)}
                                                    placeholder="Why is this item unavailable? (shared with customer)"
                                                    rows={2}
                                                    className="w-full text-xs border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-rose-200"
                                                />
                                                <p className="text-[10px] font-bold text-slate-400">{cancelItemsReason.trim().length}/10 characters minimum</p>
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={closeCancelItemsEditor} disabled={cancelItemsSaving} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all">Discard</button>
                                                    <button
                                                        onClick={handleApplyCancelItems}
                                                        disabled={cancelItemsSaving || !cancelItemIndexes.length || cancelItemsReason.trim().length < 10}
                                                        className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 transition-all flex items-center gap-2 disabled:opacity-50"
                                                    >
                                                        {cancelItemsSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                                        Cancel {cancelItemIndexes.length || ''} Item{cancelItemIndexes.length === 1 ? '' : 's'}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : adjustMode ? (
                                            <div className="space-y-3">
                                                <div className="space-y-2 max-h-52 sm:max-h-64 overflow-y-auto pr-1">
                                                    {adjustItems.map((item, idx) => (
                                                        <div key={idx} className="flex items-center justify-between gap-2 p-3 bg-white ring-1 ring-slate-100 rounded-2xl">
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <div className="h-10 w-10 rounded-lg overflow-hidden bg-slate-50 ring-1 ring-slate-200 shrink-0">
                                                                    <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold text-slate-900 truncate">{item.name}</p>
                                                                    <p className="text-xs font-semibold text-slate-600 mt-0.5">₹{Number(item.price).toFixed(2)} each</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <button onClick={() => updateAdjustQty(idx, Number(item.quantity) - 1)} className="h-7 w-7 rounded-lg bg-slate-100 hover:bg-slate-200 font-black text-slate-700">−</button>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    value={item.quantity}
                                                                    onChange={(e) => updateAdjustQty(idx, e.target.value)}
                                                                    className="w-12 text-center text-xs font-bold border border-slate-200 rounded-lg py-1"
                                                                />
                                                                <button onClick={() => updateAdjustQty(idx, Number(item.quantity) + 1)} className="h-7 w-7 rounded-lg bg-slate-100 hover:bg-slate-200 font-black text-slate-700">+</button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="flex items-center justify-between px-1">
                                                    <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">New Items Subtotal</span>
                                                    <span className="text-sm font-black text-primary">₹{adjustPreviewTotal.toFixed(2)}</span>
                                                </div>
                                                <textarea
                                                    value={adjustReason}
                                                    onChange={(e) => setAdjustReason(e.target.value)}
                                                    placeholder="Reason for adjustment (shared with customer)"
                                                    rows={2}
                                                    className="w-full text-xs border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-brand-200"
                                                />
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={closeAdjustEditor} disabled={adjustSaving} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all">Discard</button>
                                                    <button onClick={handleApplyAdjustment} disabled={adjustSaving} className="px-4 py-2 rounded-xl text-xs font-bold bg-brand-600 text-white hover:bg-brand-700 transition-all flex items-center gap-2">
                                                        {adjustSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                                        Apply Adjustment
                                                    </button>
                                                </div>
                                                <p className="text-[10px] text-slate-400 leading-relaxed">
                                                    Final pricing is recomputed from current product prices. Increases on prepaid orders will request an extra payment; decreases issue a credit note/refund automatically.
                                                </p>
                                            </div>
                                        ) : (
                                        <div className="space-y-3 max-h-52 sm:max-h-64 overflow-y-auto pr-1">
                                            {selectedOrder.items.map((item, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-3 bg-white ring-1 ring-slate-100 rounded-2xl group hover:shadow-md transition-all">
                                                    <div className="flex items-center gap-4">
                                                        <div className="h-12 w-12 rounded-xl overflow-hidden bg-slate-50 ring-1 ring-slate-200">
                                                            <img src={item.image} alt={item.name} className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-bold text-slate-900">{item.name}</p>
                                                            <p className="text-xs font-semibold text-slate-600 mt-0.5">₹{item.price.toFixed(2)} × {item.qty}</p>
                                                            {item.packagingType && item.packagingType !== 'standard' && (
                                                                <span className={cn(
                                                                    "inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider",
                                                                    item.packagingType === 'fragile' ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200" :
                                                                    item.packagingType === 'liquid' ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200" :
                                                                    "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                                                                )}>
                                                                    ⚠ {item.packagingType === 'fragile' ? 'Fragile — pack with care' : item.packagingType === 'liquid' ? 'Liquid — seal well' : 'Perishable — keep cool'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-xs font-black text-slate-900">₹{(item.price * item.qty).toFixed(2)}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        )}

                                        {Array.isArray(selectedOrder.splitDeliveries) && selectedOrder.splitDeliveries.length > 0 && (
                                            <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                                                <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest mb-2">Split Deliveries</h4>
                                                {selectedOrder.splitDeliveries.map((split) => (
                                                    <div key={split.splitId} className="flex items-center justify-between gap-2 p-3 bg-white ring-1 ring-slate-100 rounded-2xl">
                                                        <div>
                                                            <p className="text-xs font-bold text-slate-900">{split.label}</p>
                                                            <p className="text-[10px] font-semibold text-slate-500 mt-0.5">{split.itemIndexes?.length || 0} item(s)</p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant={split.status === 'delivered' ? 'success' : split.status === 'cancelled' ? 'danger' : 'warning'} className="text-[9px]">
                                                                {split.status}
                                                            </Badge>
                                                            {!['delivered', 'cancelled'].includes(split.status) && (
                                                                <select
                                                                    value=""
                                                                    onChange={async (e) => {
                                                                        const nextStatus = e.target.value;
                                                                        if (!nextStatus) return;
                                                                        try {
                                                                            await sellerApi.updateSplitDeliveryStatus(selectedOrder._id || selectedOrder.id, split.splitId, { status: nextStatus });
                                                                            showToast('Split delivery status updated', 'success');
                                                                            fetchOrders(page, false);
                                                                        } catch (error) {
                                                                            showToast(error?.response?.data?.message || 'Failed to update split status', 'error');
                                                                        }
                                                                    }}
                                                                    className="text-[10px] font-bold border border-slate-200 rounded-lg px-2 py-1.5"
                                                                >
                                                                    <option value="">Update status…</option>
                                                                    {['processing', 'out_for_delivery', 'delivered', 'cancelled']
                                                                        .filter((s) => s !== split.status)
                                                                        .map((s) => (
                                                                            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                                                                        ))}
                                                                </select>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Modal Footer */}
                                    <div className="px-4 py-3 sm:px-6 sm:py-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center justify-end shrink-0">
                                        <div className="flex gap-2 items-center">
                                            <button onClick={() => setIsDetailsModalOpen(false)} className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-all">CLOSE</button>
                                            <OrderStatusControl
                                                order={selectedOrder}
                                                onStatusUpdate={handleStatusUpdate}
                                            />
                                        </div>
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>
                </>
            )}
        </div>
    );
};

export default Orders;
