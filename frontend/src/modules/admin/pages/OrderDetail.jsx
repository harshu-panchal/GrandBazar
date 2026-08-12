import React, { useState, useEffect, useRef, useMemo } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useSettings } from '@core/context/SettingsContext';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import { adminApi } from '../services/adminApi';
import LiveTrackingMap from '@/modules/customer/components/order/LiveTrackingMap';
import {
    ChevronLeft,
    Box,
    Truck,
    User,
    Building2,
    Calendar,
    Clock,
    ShoppingBag,
    Printer,
    Download,
    Mail,
    Phone,
    Copy,
    CreditCard,
    AlertCircle,
    Package,
    Navigation,
    Store,
    Info,
    MapPin,
    Globe,
    Camera,
    CheckCircle2,
    XCircle,
    ArrowRightLeft,
    RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@shared/components/ui/Toast';
import { getFulfillmentDisplay, resolveFulfillmentMethod } from '@/shared/utils/orderFulfillment';
import { getOrderStoreReassignment } from '@/shared/utils/orderStatus';
import { joinOrderRoom, leaveOrderRoom, onOrderStatusUpdate } from '@core/services/orderSocket';

const REASSIGNABLE_WORKFLOW = new Set([
    'SELLER_PENDING',
    'SELLER_ACCEPTED',
    'SCHEDULED_HOLD',
    'DELIVERY_SEARCH',
    'EXTERNAL_LOGISTICS_PENDING',
]);

const OrderDetail = () => {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { settings } = useSettings();
    const [order, setOrder] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [externalProvider, setExternalProvider] = useState("");
    const [externalTracking, setExternalTracking] = useState("");
    const [isAssigningExternal, setIsAssigningExternal] = useState(false);
    const [isReviewingCancel, setIsReviewingCancel] = useState(false);
    const [reassignOpen, setReassignOpen] = useState(false);
    const [reassignCandidates, setReassignCandidates] = useState([]);
    const [reassignLoading, setReassignLoading] = useState(false);
    const [selectedStoreId, setSelectedStoreId] = useState("");
    const [reassignNote, setReassignNote] = useState("");
    const [isReassigning, setIsReassigning] = useState(false);
    // Admin-side "item unavailable" partial cancellation — same endpoint the
    // seller uses, so an admin can act on a seller's behalf without waiting.
    const [cancelItemsMode, setCancelItemsMode] = useState(false);
    const [cancelItemIndexes, setCancelItemIndexes] = useState([]);
    const [cancelItemsReason, setCancelItemsReason] = useState("");
    const [cancelItemsSaving, setCancelItemsSaving] = useState(false);
    const [availableRiders, setAvailableRiders] = useState([]);
    const [selectedRiderId, setSelectedRiderId] = useState("");
    const [isAssigningRider, setIsAssigningRider] = useState(false);
    const [showRiderSelector, setShowRiderSelector] = useState(false);
    const invoiceRef = useRef(null);

    const sellerLocation = useMemo(() => {
        const coords = order?.seller?.location?.coordinates;
        if (Array.isArray(coords) && coords.length === 2 && Number.isFinite(coords[1]) && Number.isFinite(coords[0])) {
            return { lat: coords[1], lng: coords[0] };
        }
        return null;
    }, [order?.seller?.location]);

    const destinationLocation = useMemo(() => {
        if (order?.address?.location && typeof order.address.location.lat === 'number' && typeof order.address.location.lng === 'number') {
            return { lat: order.address.location.lat, lng: order.address.location.lng };
        }
        if (order?.address?.coordinates && Array.isArray(order.address.coordinates) && order.address.coordinates.length === 2) {
            return { lat: order.address.coordinates[1], lng: order.address.coordinates[0] };
        }
        return null;
    }, [order?.address]);

    const riderLocation = useMemo(() => {
        const deliveryBoy = order?.deliveryBoy || order?.deliveryPartner;
        const coords = deliveryBoy?.location?.coordinates;
        if (Array.isArray(coords) && coords.length === 2 && Number.isFinite(coords[1]) && Number.isFinite(coords[0])) {
            return { lat: coords[1], lng: coords[0] };
        }
        if (deliveryBoy?.location && typeof deliveryBoy.location.lat === 'number' && typeof deliveryBoy.location.lng === 'number') {
            return { lat: deliveryBoy.location.lat, lng: deliveryBoy.location.lng };
        }
        return null;
    }, [order?.deliveryBoy, order?.deliveryPartner]);

    const loadRiders = async () => {
        try {
            const res = await adminApi.getActiveFleet();
            const list = res.data?.results || res.data?.result || res.data || [];
            if (Array.isArray(list) && list.length > 0) {
                setAvailableRiders(list);
            } else {
                const res2 = await adminApi.getDeliveryPartners();
                const list2 = res2.data?.results || res2.data?.result || res2.data || [];
                setAvailableRiders(Array.isArray(list2) ? list2 : []);
            }
        } catch (e) {
            try {
                const res2 = await adminApi.getDeliveryPartners();
                const list2 = res2.data?.results || res2.data?.result || res2.data || [];
                setAvailableRiders(Array.isArray(list2) ? list2 : []);
            } catch (err) {
                console.error("Failed to load delivery partners", err);
            }
        }
    };

    useEffect(() => {
        loadRiders();
    }, []);

    const handleAssignRider = async (riderIdToAssign) => {
        const rId = riderIdToAssign || selectedRiderId;
        if (!rId) {
            showToast("Please select a delivery partner", "error");
            return;
        }
        setIsAssigningRider(true);
        try {
            await adminApi.assignOrderToRider(order.orderId || order._id, rId);
            showToast("Delivery partner assigned successfully", "success");
            setShowRiderSelector(false);
            fetchDetail();
        } catch (error) {
            console.error("Failed to assign rider:", error);
            showToast(error.response?.data?.message || "Failed to assign delivery partner", "error");
        } finally {
            setIsAssigningRider(false);
        }
    };

    const fetchDetail = async () => {
        setIsLoading(true);
        try {
            const response = await adminApi.getOrderDetails(orderId);
            if (response.data.success) {
                setOrder(response.data.result);
            }
        } catch (error) {
            showToast("Failed to load order details", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleStatusUpdate = async (newStatus) => {
        try {
            await adminApi.updateOrderStatus(orderId, { status: newStatus });
            showToast(`Order status updated to ${newStatus}`, "success");
            fetchDetail(); // Refresh data
        } catch (error) {
            console.error("Failed to update status:", error);
            showToast("Failed to update status", "error");
        }
    };

    const handleAssignExternalLogistics = async () => {
        if (!externalProvider) {
            showToast("Provider name is required", "error");
            return;
        }
        setIsAssigningExternal(true);
        try {
            await adminApi.updateOrderStatus(orderId, { 
                externalLogisticsProvider: externalProvider,
                externalTrackingLink: externalTracking 
            });
            showToast(`External logistics assigned successfully`, "success");
            fetchDetail();
        } catch (error) {
            console.error("Failed to assign external logistics:", error);
            showToast("Failed to assign external logistics", "error");
        } finally {
            setIsAssigningExternal(false);
        }
    };

    const toggleCancelItemIndex = (idx) => {
        setCancelItemIndexes((prev) =>
            prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
        );
    };

    const closeCancelItemsEditor = () => {
        setCancelItemsMode(false);
        setCancelItemIndexes([]);
        setCancelItemsReason("");
    };

    const handleApplyCancelItems = async () => {
        if (!cancelItemIndexes.length) {
            showToast("Select at least one item to mark unavailable", "error");
            return;
        }
        if (cancelItemIndexes.length >= order.items.length) {
            showToast("Cannot cancel all items this way — cancel the whole order instead.", "error");
            return;
        }
        if (cancelItemsReason.trim().length < 10) {
            showToast("Please provide a reason (at least 10 characters)", "error");
            return;
        }
        setCancelItemsSaving(true);
        try {
            await adminApi.partialCancelOrder(order.orderId, {
                itemIndexes: cancelItemIndexes,
                reason: cancelItemsReason.trim(),
            });
            showToast("Unavailable item(s) cancelled and customer refunded", "success");
            closeCancelItemsEditor();
            fetchDetail();
        } catch (error) {
            showToast(error?.response?.data?.message || "Failed to cancel item(s)", "error");
        } finally {
            setCancelItemsSaving(false);
        }
    };

    const handleApproveCancellationRequest = async () => {
        if (!order?.cancellationRequest || order.cancellationRequest.status !== 'pending') return;
        const note = window.prompt('Optional admin note for approval:', order.cancellationRequest.reason || '');
        setIsReviewingCancel(true);
        try {
            await adminApi.approveOrderCancellationRequest(order.orderId, { note: note || '' });
            showToast('Cancellation request approved', 'success');
            fetchDetail();
        } catch (error) {
            console.error('Failed to approve cancellation request:', error);
            showToast(error?.response?.data?.message || 'Failed to approve cancellation request', 'error');
        } finally {
            setIsReviewingCancel(false);
        }
    };

    const handleRejectCancellationRequest = async () => {
        if (!order?.cancellationRequest || order.cancellationRequest.status !== 'pending') return;
        const note = window.prompt('Rejection reason (optional):', '');
        setIsReviewingCancel(true);
        try {
            await adminApi.rejectOrderCancellationRequest(order.orderId, { note: note || '' });
            showToast('Cancellation request rejected', 'success');
            fetchDetail();
        } catch (error) {
            console.error('Failed to reject cancellation request:', error);
            showToast(error?.response?.data?.message || 'Failed to reject cancellation request', 'error');
        } finally {
            setIsReviewingCancel(false);
        }
    };

    const canReassignStore = REASSIGNABLE_WORKFLOW.has(
        String(order?.workflowStatus || '').toUpperCase(),
    );

    const loadReassignCandidates = async () => {
        if (!order?.orderId) return;
        setReassignLoading(true);
        setSelectedStoreId("");
        try {
            const res = await adminApi.getOrderReassignCandidates(order.orderId);
            const payload = res.data?.result || {};
            setReassignCandidates(Array.isArray(payload.candidates) ? payload.candidates : []);
            setReassignOpen(true);
            if (!payload.candidates?.length) {
                showToast(payload.message || 'No eligible stores found for this order', 'warning');
            }
        } catch (error) {
            showToast(
                error?.response?.data?.message || 'Failed to load store candidates',
                'error',
            );
        } finally {
            setReassignLoading(false);
        }
    };

    const handleReassignStore = async () => {
        if (!selectedStoreId) {
            showToast('Select a target store first', 'error');
            return;
        }
        const target = reassignCandidates.find((c) => c.storeId === selectedStoreId);
        if (!window.confirm(
            `Move this order to "${target?.shopName || 'selected store'}"? Original store will lose the order and the new store must accept it.`,
        )) {
            return;
        }
        setIsReassigning(true);
        try {
            await adminApi.reassignOrderStore(order.orderId, {
                targetStoreId: selectedStoreId,
                note: reassignNote.trim(),
                reason: 'seller_unavailable',
            });
            showToast('Order moved to the new store successfully', 'success');
            setReassignOpen(false);
            setReassignNote('');
            fetchDetail();
        } catch (error) {
            const missing = error?.response?.data?.result?.missing;
            const detail =
                Array.isArray(missing) && missing.length
                    ? missing.map((m) => m.name || m.reason).join(', ')
                    : '';
            showToast(
                `${error?.response?.data?.message || 'Failed to reassign order'}${detail ? `: ${detail}` : ''}`,
                'error',
            );
        } finally {
            setIsReassigning(false);
        }
    };

    useEffect(() => {
        if (orderId) {
            fetchDetail();
        }
    }, [orderId]);

    // Live updates while this order's detail view is open — join its
    // room (same "order:<id>" room customer/seller/delivery already use)
    // rather than relying only on the admin-wide feed, so changes made by
    // the seller/rider/customer on this exact order reflect immediately.
    useEffect(() => {
        if (!orderId) return undefined;
        const getToken = () => localStorage.getItem('auth_admin');
        joinOrderRoom(orderId, getToken);
        const unsubscribe = onOrderStatusUpdate(getToken, (payload) => {
            if (payload?.orderId && payload.orderId !== orderId) return;
            fetchDetail();
        });
        return () => {
            unsubscribe();
            leaveOrderRoom(orderId, getToken);
        };
    }, [orderId]);

    const getStatusStyles = (status) => {
        switch (status.toLowerCase()) {
            case 'pending': return 'bg-amber-100 text-amber-600 border-amber-200';
            case 'confirmed': return 'bg-brand-100 text-brand-600 border-brand-200';
            case 'packed': return 'bg-brand-100 text-brand-600 border-brand-200';
            case 'out_for_delivery': return 'bg-purple-100 text-purple-600 border-purple-200';
            case 'delivered': return 'bg-brand-100 text-brand-600 border-brand-200';
            case 'cancelled': return 'bg-rose-100 text-rose-600 border-rose-200';
            default: return 'bg-slate-100 text-slate-600 border-slate-200';
        }
    };

    const copyToClipboard = (text, label) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        showToast(`${label} copied to internal clipboard`, 'success');
    };

    const handlePrintInvoice = async () => {
        const element = invoiceRef.current;
        if (!element) return;
        
        showToast("Generating PDF Invoice...", "info");
        
        try {
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                allowTaint: true,
                backgroundColor: "#ffffff",
                onclone: (clonedDoc) => {
                    // Forcefully remove any elements or styles that might use oklch
                    // html2canvas crashes when it encounters oklch color functions in stylesheets
                    const styleSheets = clonedDoc.styleSheets;
                    for (let i = 0; i < styleSheets.length; i++) {
                        try {
                            const rules = styleSheets[i].cssRules || styleSheets[i].rules;
                            for (let j = rules.length - 1; j >= 0; j--) {
                                if (rules[j].cssText && rules[j].cssText.includes('oklch')) {
                                    styleSheets[i].deleteRule(j);
                                }
                            }
                        } catch (e) {
                            // Skip cross-origin stylesheets that we can't access
                        }
                    }
                    
                    // Also explicitly reset root variables just in case
                    const style = clonedDoc.createElement('style');
                    style.innerHTML = `
                        :root {
                            --primary: var(--primary) !important;
                            --secondary: #64748b !important;
                            --background: #ffffff !important;
                            --foreground: #0f172a !important;
                        }
                    `;
                    clonedDoc.head.appendChild(style);
                }
            });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Invoice_${order.orderId}.pdf`);
            showToast("Invoice downloaded successfully", "success");
        } catch (error) {
            console.error("PDF generation failed:", error);
            showToast("Failed to generate PDF", "error");
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-[400px] flex flex-col items-center justify-center gap-4">
                <div className="h-12 w-12 border-4 border-fuchsia-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-[4px]">Accessing Intelligence...</p>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="min-h-[400px] flex flex-col items-center justify-center gap-4 text-center p-8">
                <AlertCircle className="h-16 w-16 text-rose-200" />
                <h2 className="text-xl font-black text-slate-900 uppercase">Order Node Not Found</h2>
                <button onClick={() => navigate(-1)} className="ds-btn ds-btn-md bg-slate-900 text-white mt-4">Return to List</button>
            </div>
        );
    }

    const fulfillment = getFulfillmentDisplay(order);
    const storeReassignment = getOrderStoreReassignment(order);

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
            {/* Control Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-1">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-3 bg-white ring-1 ring-slate-200 rounded-2xl hover:bg-slate-50 transition-all text-slate-400 group"
                    >
                        <ChevronLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Order #{order.orderId}</h1>
                            <div className="relative inline-block w-44">
                                <select
                                    value={order.status}
                                    onChange={(e) => handleStatusUpdate(e.target.value)}
                                    className={cn(
                                        "w-full text-[10px] pl-3 pr-8 py-1.5 rounded-xl font-black uppercase tracking-widest border appearance-none cursor-pointer focus:ring-2 focus:ring-offset-1 transition-all outline-none shadow-sm",
                                        getStatusStyles(order.status)
                                    )}
                                >
                                    <option value="pending">Pending</option>
                                    <option value="confirmed">Confirmed</option>
                                    <option value="packed">Packed</option>
                                    <option value="out_for_delivery">Out for Delivery</option>
                                    <option value="delivered">Delivered</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                                <Info className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none opacity-60" />
                            </div>
                            {storeReassignment && (
                                <Badge className="bg-violet-100 text-violet-800 border border-violet-200 text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                                    <ArrowRightLeft className="h-3 w-3" />
                                    Reassigned
                                </Badge>
                            )}
                        </div>
                        <p className="text-[11px] font-bold text-slate-400 mt-1 uppercase tracking-widest flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(order.createdAt).toLocaleDateString()} • <Clock className="h-3.5 w-3.5 ml-1" /> {new Date(order.createdAt).toLocaleTimeString()}
                        </p>
                        {storeReassignment && (
                            <p className="mt-1.5 text-[11px] font-bold text-violet-700">
                                Moved from {storeReassignment.fromShopName} → {storeReassignment.toShopName}
                                {storeReassignment.reassignedAt
                                    ? ` · ${new Date(storeReassignment.reassignedAt).toLocaleString('en-IN')}`
                                    : ''}
                            </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Badge className={cn('text-[9px] font-black uppercase border', fulfillment.typeBadgeClassName)}>
                                {fulfillment.typeLabel}
                            </Badge>
                            <Badge className={cn('text-[9px] font-black uppercase border', fulfillment.methodBadgeClassName)}>
                                {fulfillment.methodLabel}
                            </Badge>
                            <span className="text-[10px] font-bold text-slate-500 normal-case tracking-normal">
                                {fulfillment.detail}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={handlePrintInvoice}
                        className="flex items-center gap-2 px-5 py-3 bg-white ring-1 ring-slate-200 text-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm"
                    >
                        <Printer className="h-4 w-4 text-slate-400" />
                        Print Invoice
                    </button>
                </div>

            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Live Order Tracking Google Map Card - Only shown when order is active / in-transit */}
                    {!['delivered', 'completed', 'cancelled', 'returned'].includes((order.status || order.workflowStatus || '').toLowerCase()) && (
                        <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-2xl overflow-hidden p-0 text-left">
                            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-3">
                                    <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-sm shrink-0">
                                        <MapPin className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                            Live Order Route & Tracking
                                        </h3>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                                            Real-time Geolocation (Store ➔ Rider ➔ Customer)
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[9px] font-black uppercase tracking-wider">
                                        📍 Live Map Active
                                    </Badge>
                                    {(destinationLocation || sellerLocation) && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const target = destinationLocation || sellerLocation;
                                                window.open(
                                                    `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`,
                                                    "_blank"
                                                );
                                            }}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-slate-800 transition-colors shadow-sm active:scale-95"
                                        >
                                            <Globe className="h-3 w-3" />
                                            Open Google Maps
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Interactive Google Map Component */}
                            <div className="h-[380px] w-full relative bg-slate-100">
                                <LiveTrackingMap
                                    status={order.status || order.workflowStatus || "out_for_delivery"}
                                    eta={order.deliveryEta?.label || "10-20 mins"}
                                    riderName={order.deliveryBoy?.name || order.deliveryPartner?.name || "Rider"}
                                    riderLocation={riderLocation}
                                    sellerLocation={sellerLocation}
                                    destinationLocation={destinationLocation}
                                    routePhase={['out_for_delivery', 'delivered'].includes((order.status || '').toLowerCase()) ? 'delivery' : 'pickup'}
                                    onOpenInMaps={({ destinationLocation: dest }) => {
                                        const target = dest || destinationLocation || sellerLocation;
                                        if (target) {
                                            window.open(`https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`, "_blank");
                                        }
                                    }}
                                />
                            </div>

                            {/* Geolocation Quick Node Status Strip */}
                            <div className="p-4 bg-slate-50/80 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-slate-100 shadow-sm">
                                    <div className="h-7 w-7 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 font-black text-xs">
                                        🏬
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Store Node</p>
                                        <p className="text-xs font-black text-slate-800 truncate">
                                            {order.seller?.shopName || "Store Location"}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-slate-100 shadow-sm">
                                    <div className="h-7 w-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 font-black text-xs">
                                        🛵
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Delivery Fleet</p>
                                        <p className="text-xs font-black text-slate-800 truncate">
                                            {order.deliveryBoy?.name || order.deliveryPartner?.name || "Rider Unassigned"}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-slate-100 shadow-sm">
                                    <div className="h-7 w-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 font-black text-xs">
                                        📍
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Destination</p>
                                        <p className="text-xs font-black text-slate-800 truncate">
                                            {order.address?.city || order.address?.address || "Customer Location"}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* Items Section */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl overflow-hidden">
                        <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between gap-3 flex-wrap">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                <Box className="h-4 w-4 text-brand-500" />
                                Items in Order
                            </h3>
                            <div className="flex items-center gap-2">
                                <Badge className="bg-brand-50 text-brand-700 border-none text-[9px] font-black">{order.items.length} ITEMS</Badge>
                                {(() => {
                                    const canCancelItems =
                                        !['delivered', 'cancelled', 'out_for_delivery', 'returned'].includes((order.status || '').toLowerCase())
                                        && !order.deliveryBoy
                                        && order.items.length > 1;
                                    if (!canCancelItems) return null;
                                    return cancelItemsMode ? (
                                        <button
                                            onClick={closeCancelItemsEditor}
                                            className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100 transition-all"
                                        >
                                            Cancel Edit
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setCancelItemsMode(true)}
                                            className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-rose-600 text-white hover:bg-rose-700 transition-all"
                                        >
                                            Item Unavailable
                                        </button>
                                    );
                                })()}
                            </div>
                        </div>
                        {cancelItemsMode && (
                            <div className="px-6 py-4 bg-rose-50/50 border-b border-rose-100 space-y-3">
                                <p className="text-[11px] text-rose-900 leading-relaxed">
                                    Select the item(s) that are unavailable. The customer is refunded for exactly those items and the remaining items continue as normal — stock reserved for the cancelled item(s) is released.
                                </p>
                                <textarea
                                    value={cancelItemsReason}
                                    onChange={(e) => setCancelItemsReason(e.target.value)}
                                    placeholder="Why is this item unavailable? (shared with customer)"
                                    rows={2}
                                    className="w-full text-xs border border-rose-200 rounded-xl p-3 bg-white focus:outline-none focus:ring-2 focus:ring-rose-200"
                                />
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-bold text-rose-400">{cancelItemsReason.trim().length}/10 characters minimum · {cancelItemIndexes.length} selected</p>
                                    <button
                                        onClick={handleApplyCancelItems}
                                        disabled={cancelItemsSaving || !cancelItemIndexes.length || cancelItemsReason.trim().length < 10}
                                        className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-rose-600 text-white hover:bg-rose-700 transition-all disabled:opacity-50"
                                    >
                                        {cancelItemsSaving ? "Cancelling..." : `Cancel ${cancelItemIndexes.length || ''} Item${cancelItemIndexes.length === 1 ? '' : 's'}`}
                                    </button>
                                </div>
                            </div>
                        )}
                        <div className="p-0 overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50">
                                        {cancelItemsMode && (
                                            <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-10"></th>
                                        )}
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Product Node</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Unit Price</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Qty</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Aggregate</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {order.items.map((item, idx) => (
                                        <tr key={item._id || idx} className="group hover:bg-slate-50/30 transition-all">
                                            {cancelItemsMode && (
                                                <td className="px-4 py-5">
                                                    <input
                                                        type="checkbox"
                                                        checked={cancelItemIndexes.includes(idx)}
                                                        onChange={() => toggleCancelItemIndex(idx)}
                                                        className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-400"
                                                    />
                                                </td>
                                            )}
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-14 w-14 bg-slate-50 rounded-2xl flex items-center justify-center ds-h1 shadow-inner border border-slate-100 group-hover:scale-110 transition-transform overflow-hidden">
                                                        {item.image ? (
                                                            <img src={item.image} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <Package className="h-6 w-6 text-slate-200" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black text-slate-900">{item.name}</h4>
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">ID: {item.product?._id || item.product}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 text-center text-sm font-bold text-slate-600">₹{item.price}</td>
                                            <td className="px-6 py-5 text-center">
                                                <span className="bg-slate-100 px-3 py-1 rounded-lg text-xs font-black text-slate-700">x{item.quantity}</span>
                                            </td>
                                            <td className="px-6 py-5 text-right text-sm font-black text-slate-900">₹{item.price * item.quantity}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 bg-slate-50/50 flex flex-col items-end gap-3 text-right">
                            <div className="flex items-center justify-between w-full max-w-[240px]">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subtotal</span>
                                <span className="text-sm font-black text-slate-700">₹{order.pricing?.subtotal || 0}</span>
                            </div>
                            <div className="flex items-center justify-between w-full max-w-[240px]">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Delivery Fee</span>
                                <span className="text-sm font-bold text-brand-600">₹{order.pricing?.deliveryFee || 0}</span>
                            </div>
                            <div className="h-px w-full max-w-[240px] bg-slate-200 my-2" />
                            <div className="flex items-center justify-between w-full max-w-[240px]">
                                <span className="text-xs font-black text-slate-900 uppercase tracking-tight">Total Payable</span>
                                <span className="text-2xl font-black text-fuchsia-600">₹{order.pricing?.total || 0}</span>
                            </div>
                        </div>
                    </Card>

                    {/* Shop Details */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-2xl p-6">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Store className="h-4 w-4" />
                            Shop Node Information
                        </h4>
                        <div className="flex items-center gap-4">
                            <div className="h-16 w-16 bg-orange-50 rounded-2xl flex items-center justify-center ds-h2 font-black text-orange-600 uppercase">
                                {order.seller?.shopName?.[0] || 'S'}
                            </div>
                            <div className="text-left flex-1 min-w-0">
                                <h3 className="text-lg font-black text-slate-900 leading-tight">{order.seller?.shopName || 'Unknown Shop'}</h3>
                                <p className="text-xs font-bold text-brand-600 uppercase tracking-tighter">Verified Anchor Partner</p>
                                <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">OWNER: {order.seller?.name}</p>
                            </div>
                        </div>

                        {canReassignStore && (
                            <div className="mt-5 pt-5 border-t border-slate-100 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-black text-slate-800 uppercase tracking-wide">
                                            Shift to another store
                                        </p>
                                        <p className="text-[11px] text-slate-500 mt-1">
                                            Use when the current seller/store is off or cannot fulfill. Target store must have matching products + stock and fall within the customer's delivery range.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={loadReassignCandidates}
                                        disabled={reassignLoading}
                                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-slate-800 disabled:opacity-50"
                                    >
                                        {reassignLoading ? (
                                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <ArrowRightLeft className="h-3.5 w-3.5" />
                                        )}
                                        Reassign
                                    </button>
                                </div>

                                {reassignOpen && (
                                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-3">
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                            Target store
                                        </label>
                                        <select
                                            value={selectedStoreId}
                                            onChange={(e) => setSelectedStoreId(e.target.value)}
                                            className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold outline-none"
                                        >
                                            <option value="">Select store…</option>
                                            {reassignCandidates.map((c) => {
                                                const blockers = [];
                                                if (!c.productsAvailable && !c.stockOk) {
                                                    blockers.push('low stock / missing products');
                                                } else if (!c.productsAvailable) {
                                                    blockers.push('incomplete catalog match');
                                                }
                                                if (c.inCustomerRange === false) {
                                                    blockers.push(
                                                        c.rangeReason || 'out of customer range',
                                                    );
                                                }
                                                const distanceLabel =
                                                    c.distanceKm != null
                                                        ? ` · ${c.distanceKm} km`
                                                        : '';
                                                return (
                                                <option
                                                    key={c.storeId}
                                                    value={c.storeId}
                                                    disabled={!c.canReassign}
                                                >
                                                    {c.shopName}
                                                    {c.locality ? ` · ${c.locality}` : ''}
                                                    {distanceLabel}
                                                    {` · ${c.coveragePct}% match`}
                                                    {c.canReassign
                                                        ? ''
                                                        : blockers.length
                                                          ? ` (${blockers.join('; ')})`
                                                          : ' (not eligible)'}
                                                    {c.isOpenNow ? '' : ' · closed now'}
                                                </option>
                                                );
                                            })}
                                        </select>
                                        <textarea
                                            value={reassignNote}
                                            onChange={(e) => setReassignNote(e.target.value)}
                                            rows={2}
                                            placeholder="Optional note (e.g. seller off / holiday)"
                                            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold outline-none resize-none"
                                        />
                                        <div className="flex justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setReassignOpen(false)}
                                                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-[10px] font-black uppercase text-slate-700 hover:bg-slate-50"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleReassignStore}
                                                disabled={isReassigning || !selectedStoreId}
                                                className="px-3 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-black disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed"
                                            >
                                                {isReassigning ? 'Moving…' : 'Confirm shift'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>

                    {/* Logistical Nodes */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl p-6">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-8 flex items-center gap-3">
                            <Navigation className="h-4 w-4 text-brand-500" />
                            Logistical Real-time State
                        </h3>
                        <div className="space-y-6 relative ml-4">
                            <div className="absolute top-0 bottom-0 left-[7.5px] w-0.5 bg-slate-100" />
                            {storeReassignment && (
                                <div className="flex gap-6 relative">
                                    <div className="h-4 w-4 rounded-full ring-4 ring-white z-10 mt-1 bg-violet-500 shadow-lg shadow-violet-200" />
                                    <div className="flex-1 pb-4">
                                        <div className="flex items-center justify-between mb-1">
                                            <h4 className="text-xs font-black uppercase tracking-tight text-slate-900 flex items-center gap-2">
                                                <ArrowRightLeft className="h-3.5 w-3.5 text-violet-600" />
                                                Store Reassigned
                                            </h4>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">
                                                {storeReassignment.reassignedAt
                                                    ? new Date(storeReassignment.reassignedAt).toLocaleString('en-IN')
                                                    : ''}
                                            </span>
                                        </div>
                                        <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
                                            Moved from <span className="text-slate-800">{storeReassignment.fromShopName}</span>
                                            {' '}→{' '}
                                            <span className="text-slate-800">{storeReassignment.toShopName}</span>.
                                            Order reset to seller pending for acceptance.
                                        </p>
                                        {storeReassignment.note ? (
                                            <p className="text-[10px] font-semibold text-slate-400 mt-1 italic">
                                                {storeReassignment.note}
                                            </p>
                                        ) : null}
                                    </div>
                                </div>
                            )}
                            <div className="flex gap-6 relative">
                                <div className="h-4 w-4 rounded-full ring-4 ring-white z-10 mt-1 bg-brand-500 shadow-lg shadow-brand-200" />
                                <div className="flex-1 pb-4">
                                    <div className="flex items-center justify-between mb-1">
                                        <h4 className="text-xs font-black uppercase tracking-tight text-slate-900">
                                            Status: {order.status.replace(/_/g, ' ')}
                                        </h4>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">{new Date(order.updatedAt).toLocaleTimeString()}</span>
                                    </div>
                                    <p className="text-[11px] font-bold text-slate-400 leading-relaxed italic">"System verified current logistical state as {order.status}."</p>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                    {/* Customer Node */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-2xl p-6">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <User className="h-4 w-4" />
                            Customer Node Information
                        </h4>
                        <div className="flex items-center gap-4">
                            <img 
                                src="https://cdn-icons-png.flaticon.com/512/149/149071.png" 
                                alt="" 
                                className="h-16 w-16 rounded-2xl bg-slate-50 ring-2 ring-white shadow-sm object-cover" 
                            />
                            <div className="text-left">
                                <h3 className="text-lg font-black text-slate-900 leading-tight">
                                    {order.customer?.name}
                                </h3>
                                <p className="text-xs font-bold text-slate-400">
                                    Node ID: {order.customer?._id}
                                </p>
                            </div>
                        </div>
                        <div className="space-y-6 text-left mt-6">
                            {(() => {
                                const fulfillment = getFulfillmentDisplay(order);
                                return (
                                    <div className="p-4 bg-brand-50 rounded-2xl border border-brand-100 space-y-2">
                                        <span className="text-[10px] font-black text-brand-700 uppercase tracking-widest">
                                            Delivery Type
                                        </span>
                                        <div className="flex flex-wrap gap-1.5">
                                            <Badge className={cn('text-[9px] font-black uppercase border', fulfillment.typeBadgeClassName)}>
                                                {fulfillment.typeLabel}
                                            </Badge>
                                            <Badge className={cn('text-[9px] font-black uppercase border', fulfillment.methodBadgeClassName)}>
                                                {fulfillment.methodLabel}
                                            </Badge>
                                        </div>
                                        <p className="text-xs font-bold text-slate-600">
                                            {fulfillment.detail}
                                        </p>
                                    </div>
                                );
                            })()}
                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-3">
                                    <Mail className="h-3.5 w-3.5" /> {order.customer?.email}
                                </span>
                                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-3">
                                    <Phone className="h-3.5 w-3.5" /> {order.customer?.phone}
                                </span>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        Destination Protocol
                                    </span>
                                    {order?.address?.location &&
                                        typeof order.address.location.lat === "number" &&
                                        typeof order.address.location.lng === "number" && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const { lat, lng } = order.address.location;
                                                    window.open(
                                                        `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
                                                        "_blank",
                                                    );
                                                }}
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-primary hover:bg-primary/5 transition-colors"
                                            >
                                                <MapPin className="h-3 w-3" />
                                                Open in Maps
                                            </button>
                                        )}
                                </div>
                                <p className="text-xs font-bold text-slate-600 leading-relaxed italic">
                                    "{order.address?.address}, {order.address?.landmark}, {order.address?.city}"
                                </p>
                            </div>
                            {order.address?.type === "Other" &&
                                (order.address?.name || order.address?.phone) && (
                                    <div className="p-4 bg-brand-50 rounded-2xl border border-brand-100 space-y-2">
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <span className="text-[10px] font-black text-brand-700 uppercase tracking-widest">
                                                Recipient (Order For Someone Else)
                                            </span>
                                        </div>
                                        <p className="text-xs font-black text-slate-800">
                                            {order.address?.name}
                                        </p>
                                        {order.address?.phone && (
                                            <p className="text-[11px] font-bold text-brand-700 flex items-center gap-2">
                                                <Phone className="h-3.5 w-3.5" />
                                                {order.address.phone}
                                            </p>
                                        )}
                                    </div>
                                )}
                        </div>
                    </Card>

                    {/* Delivery Partner Node Information Card */}
                    {(() => {
                        const deliveryBoy = order.deliveryBoy || order.deliveryPartner;
                        const hasInternalRider = Boolean(deliveryBoy && (deliveryBoy.name || deliveryBoy._id));
                        const hasExternalLogistics = Boolean(order.externalLogisticsProvider);

                        return (
                            <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-2xl p-6 text-left space-y-4">
                                <div className="flex items-center justify-between gap-2">
                                    <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <Truck className="h-4 w-4 text-emerald-600 shrink-0" />
                                        Delivery Partner Information
                                    </h4>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {hasInternalRider ? (
                                            <Badge variant="success" className="text-[8px] font-black uppercase tracking-widest px-2.5 py-0.5">
                                                {order.status === "out_for_delivery" ? "OUT FOR DELIVERY" : order.status === "delivered" ? "DELIVERED" : "ASSIGNED"}
                                            </Badge>
                                        ) : hasExternalLogistics ? (
                                            <Badge variant="success" className="text-[8px] font-black uppercase tracking-widest px-2.5 py-0.5">
                                                EXTERNAL LOGISTICS
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary" className="text-[8px] font-black uppercase tracking-widest px-2.5 py-0.5">
                                                UNASSIGNED
                                            </Badge>
                                        )}
                                    </div>
                                </div>

                                {/* Internal Delivery Partner / Rider details */}
                                {hasInternalRider && (
                                    <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-100/90 space-y-3">
                                        <div className="flex items-center gap-3.5">
                                            <div className="h-13 w-13 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-black text-xl flex items-center justify-center shrink-0 shadow-md ring-2 ring-white overflow-hidden relative">
                                                {deliveryBoy.profileImage ? (
                                                    <img
                                                        src={deliveryBoy.profileImage}
                                                        alt={deliveryBoy.name}
                                                        className="h-full w-full object-cover"
                                                        onError={(e) => {
                                                            e.currentTarget.style.display = "none";
                                                        }}
                                                    />
                                                ) : null}
                                                <span className="leading-none">{String(deliveryBoy.name || "D").charAt(0).toUpperCase()}</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <h5 className="text-base font-black text-slate-900 truncate leading-tight">{deliveryBoy.name}</h5>
                                                    {deliveryBoy.isOnline !== undefined && (
                                                        <span className={cn("text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0", deliveryBoy.isOnline ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200")}>
                                                            {deliveryBoy.isOnline ? "Online" : "Offline"}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] font-bold text-slate-400 truncate mt-0.5">
                                                    Partner ID: <span className="font-mono text-slate-600">{deliveryBoy._id || deliveryBoy.id || "N/A"}</span>
                                                </p>
                                            </div>
                                        </div>

                                        <div className="space-y-2 pt-2 border-t border-slate-200/60">
                                            {/* Phone Row */}
                                            {deliveryBoy.phone && (
                                                <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <div className="h-7 w-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                                            <Phone className="h-3.5 w-3.5" />
                                                        </div>
                                                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Phone</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <a
                                                            href={`tel:${deliveryBoy.phone}`}
                                                            className="text-xs font-black text-slate-800 hover:text-emerald-600 transition-colors"
                                                        >
                                                            {deliveryBoy.phone}
                                                        </a>
                                                        <button
                                                            type="button"
                                                            onClick={() => copyToClipboard(deliveryBoy.phone, "Phone number")}
                                                            className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
                                                            title="Copy Phone"
                                                        >
                                                            <Copy className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Vehicle Row */}
                                            {(deliveryBoy.vehicleNumber || deliveryBoy.vehicleType) && (
                                                <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <div className="h-7 w-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                                            <Truck className="h-3.5 w-3.5" />
                                                        </div>
                                                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Vehicle</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        {deliveryBoy.vehicleType && (
                                                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-wider border border-indigo-100">
                                                                {deliveryBoy.vehicleType}
                                                            </span>
                                                        )}
                                                        {deliveryBoy.vehicleNumber && (
                                                            <span className="text-xs font-black text-slate-800 tracking-tight">
                                                                {deliveryBoy.vehicleNumber}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Email Row */}
                                            {deliveryBoy.email && (
                                                <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <div className="h-7 w-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                                                            <Mail className="h-3.5 w-3.5" />
                                                        </div>
                                                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Email</span>
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-700 truncate max-w-[180px] sm:max-w-[220px]">
                                                        {deliveryBoy.email}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Zone Row */}
                                            {deliveryBoy.currentArea && (
                                                <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <div className="h-7 w-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                                                            <MapPin className="h-3.5 w-3.5" />
                                                        </div>
                                                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Zone</span>
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-700 truncate max-w-[180px] sm:max-w-[220px]">
                                                        {deliveryBoy.currentArea}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* External Logistics Details */}
                                {hasExternalLogistics && (
                                    <div className="p-4 bg-brand-50/60 rounded-2xl border border-brand-100 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black text-brand-700 uppercase tracking-widest flex items-center gap-1.5">
                                                <Globe className="h-3.5 w-3.5" /> External Provider
                                            </span>
                                        </div>
                                        <p className="text-sm font-black text-slate-900">{order.externalLogisticsProvider}</p>
                                        {order.externalTrackingLink && (
                                            <a
                                                href={order.externalTrackingLink}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-brand-600 text-white text-xs font-bold hover:bg-brand-700 transition-colors shadow-sm"
                                            >
                                                Track Package
                                            </a>
                                        )}
                                    </div>
                                )}

                                {/* Delivery Partner Selector / Assignment Action */}
                                <div className="pt-3 border-t border-slate-100 space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                                            {hasInternalRider ? "Partner Operations" : "Partner Assignment"}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setShowRiderSelector(!showRiderSelector)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-slate-800 transition-all shadow-sm active:scale-95"
                                        >
                                            <RefreshCw className={cn("h-3 w-3", showRiderSelector && "animate-spin")} />
                                            {showRiderSelector ? "Close Selector" : hasInternalRider ? "Reassign Rider" : "Assign Fleet Rider"}
                                        </button>
                                    </div>

                                    {showRiderSelector && (
                                        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                            <label className="block text-[10px] font-black text-slate-600 uppercase tracking-widest">
                                                Select Active Delivery Partner
                                            </label>
                                            <select
                                                value={selectedRiderId}
                                                onChange={(e) => setSelectedRiderId(e.target.value)}
                                                className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                                            >
                                                <option value="">Choose a partner from active fleet...</option>
                                                {availableRiders.map((r) => (
                                                    <option key={r._id || r.id} value={r._id || r.id}>
                                                        {r.name} ({r.phone || "No phone"}) {r.vehicleType ? `· ${r.vehicleType.toUpperCase()}` : ""} {r.isOnline ? "· Online" : ""}
                                                    </option>
                                                ))}
                                            </select>

                                            <div className="flex justify-end gap-2 pt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowRiderSelector(false)}
                                                    className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-[10px] font-black uppercase text-slate-600 hover:bg-slate-100 transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleAssignRider()}
                                                    disabled={isAssigningRider || !selectedRiderId}
                                                    className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-emerald-700 transition-colors disabled:opacity-50"
                                                >
                                                    {isAssigningRider ? "Assigning..." : "Confirm Assignment"}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {!hasExternalLogistics && !showRiderSelector && (
                                        <details className="text-xs group">
                                            <summary className="cursor-pointer text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-wider list-none flex items-center justify-between py-1.5 px-1 rounded-lg hover:bg-slate-50 transition-colors">
                                                <span>+ Assign External Logistics (Dunzo / Porter / Delhivery)</span>
                                                <span className="group-open:rotate-180 transition-transform text-[10px]">▼</span>
                                            </summary>
                                            <div className="mt-2 space-y-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/60">
                                                <div>
                                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Logistics Provider Name</label>
                                                    <input
                                                        type="text"
                                                        value={externalProvider}
                                                        onChange={(e) => setExternalProvider(e.target.value)}
                                                        placeholder="e.g., Porter, Dunzo, Delhivery"
                                                        className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-brand-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tracking URL (Optional)</label>
                                                    <input
                                                        type="url"
                                                        value={externalTracking}
                                                        onChange={(e) => setExternalTracking(e.target.value)}
                                                        placeholder="https://..."
                                                        className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-brand-500"
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={handleAssignExternalLogistics}
                                                    disabled={isAssigningExternal || !externalProvider}
                                                    className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-colors disabled:opacity-50"
                                                >
                                                    {isAssigningExternal ? "Saving..." : "Save External Partner"}
                                                </button>
                                            </div>
                                        </details>
                                    )}
                                </div>
                            </Card>
                        );
                    })()}

                    {/* Payment Vector */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-2xl overflow-hidden text-left">
                        <div className="p-6 bg-slate-900 text-white">
                            <h4 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-white">
                                <CreditCard className="h-4 w-4 text-brand-400" />
                                Payment Vector
                            </h4>
                        </div>
                        <div className="p-4 space-y-6">
                            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Protocol Summary</span>
                                <Badge className={cn("border-none text-[8px] font-black uppercase", order.payment?.status === 'completed' ? 'bg-brand-100 text-brand-700' : 'bg-amber-100 text-amber-700')}>
                                    {order.payment?.status || 'PENDING'}
                                </Badge>
                            </div>
                            <div className="flex items-center justify-between px-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">TXN Hash</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black text-slate-700 truncate max-w-[100px]">{order.payment?.transactionId || 'N/A'}</span>
                                    <button onClick={() => copyToClipboard(order.payment?.transactionId, 'Transaction ID')} className="p-1.5 hover:bg-slate-50 rounded-md text-slate-300"><Copy className="h-3 w-3" /></button>
                                </div>
                            </div>
                            <div className="flex items-center justify-between px-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gateway Method</span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">{order.payment?.method || 'CASH'}</span>
                            </div>
                        </div>
                    </Card>

                    {/* Intelligence Notes */}
                    <Card className="border-none shadow-xl ring-1 ring-amber-100 bg-amber-50/30 rounded-xl p-6 text-left">
                        <h4 className="text-[10px] font-black text-amber-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Info className="h-4 w-4" />
                            Intelligence Notes
                        </h4>
                        <p className="text-xs font-bold text-amber-800 leading-relaxed italic">
                            "{order.cancelReason ? `Cancellation Payload: ${order.cancelReason}` : `Delivery window scheduled for ${order.timeSlot}. Instructions: Follow local logistical protocols.`}"
                        </p>
                    </Card>

                    {order.cancellationRequest?.status && order.cancellationRequest.status !== 'none' && (
                        <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl p-6 text-left">
                            <div className="flex items-start justify-between gap-4 mb-4">
                                <div>
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                        <AlertCircle className="h-4 w-4" />
                                        Cancellation Request
                                    </h4>
                                    <p className="text-sm font-black text-slate-900 uppercase">
                                        {order.cancellationRequest.status === 'pending' ? 'Pending Admin Action' : order.cancellationRequest.status}
                                    </p>
                                </div>
                                <Badge
                                    className={cn(
                                        "border-none text-[8px] font-black uppercase tracking-widest",
                                        order.cancellationRequest.status === 'pending'
                                            ? 'bg-amber-100 text-amber-700'
                                            : order.cancellationRequest.status === 'approved'
                                                ? 'bg-brand-100 text-brand-700'
                                                : 'bg-rose-100 text-rose-700'
                                    )}
                                >
                                    {order.cancellationRequest.status}
                                </Badge>
                            </div>
                            <div className="space-y-2 text-xs font-bold text-slate-600">
                                <p>Reason: {order.cancellationRequest.reason || 'Not provided'}</p>
                                {order.cancellationRequest.requestedAt && (
                                    <p>Requested at: {new Date(order.cancellationRequest.requestedAt).toLocaleString()}</p>
                                )}
                                {order.cancellationRequest.adminNote && (
                                    <p>Admin note: {order.cancellationRequest.adminNote}</p>
                                )}
                            </div>
                            {order.cancellationRequest.status === 'pending' && (
                                <div className="mt-5 flex gap-3">
                                    <button
                                        onClick={handleApproveCancellationRequest}
                                        disabled={isReviewingCancel}
                                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-brand-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-700 transition-all disabled:opacity-50"
                                    >
                                        <CheckCircle2 className="h-4 w-4" />
                                        {isReviewingCancel ? 'Processing...' : 'Approve'}
                                    </button>
                                    <button
                                        onClick={handleRejectCancellationRequest}
                                        disabled={isReviewingCancel}
                                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 transition-all disabled:opacity-50"
                                    >
                                        <XCircle className="h-4 w-4" />
                                        {isReviewingCancel ? 'Processing...' : 'Reject'}
                                    </button>
                                </div>
                            )}
                        </Card>
                    )}

                    {/* Proof Images Section */}
                    {(order.pickupProofImages?.length > 0 || order.deliveryProofImages?.length > 0) && (
                        <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl p-6 text-left">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Camera className="h-4 w-4" />
                                Operational Proofs
                            </h4>
                            <div className="space-y-4">
                                {order.pickupProofImages?.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2">Pickup Proof (Seller to Rider)</p>
                                        <div className="flex gap-2 overflow-x-auto pb-2">
                                            {order.pickupProofImages.map((img, idx) => (
                                                <a key={idx} href={img} target="_blank" rel="noreferrer" className="block shrink-0">
                                                    <img src={img} alt={`Pickup Proof ${idx + 1}`} className="h-24 w-24 object-cover rounded-xl border border-slate-200" />
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {order.deliveryProofImages?.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2">Delivery Proof (Rider to Customer)</p>
                                        <div className="flex gap-2 overflow-x-auto pb-2">
                                            {order.deliveryProofImages.map((img, idx) => (
                                                <a key={idx} href={img} target="_blank" rel="noreferrer" className="block shrink-0">
                                                    <img src={img} alt={`Delivery Proof ${idx + 1}`} className="h-24 w-24 object-cover rounded-xl border border-slate-200" />
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Card>
                    )}
                </div>
            </div>

            {/* Hidden Printable Invoice Template */}
            <div className="fixed -left-[9999px] top-0">
                <div 
                    ref={invoiceRef}
                    className="w-[800px] bg-white p-1"
                    style={{ backgroundColor: "#f8fafc" }}
                >
                    {/* Inner Paper with Border */}
                    <div style={{ 
                        backgroundColor: "#ffffff", 
                        margin: "40px",
                        padding: "65px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "2px",
                        boxShadow: "0 0 10px rgba(0,0,0,0.02)",
                        fontFamily: "'Inter', system-ui, sans-serif",
                        color: "#1e293b",
                        minHeight: "1050px"
                    }}>
                        {/* Header: Centered Brand */}
                        <div style={{ textAlign: "center", marginBottom: "50px" }}>
                            {settings?.logoUrl ? (
                                <img src={settings.logoUrl} alt="Logo" width="130" style={{ display: "inline-block", marginBottom: "16px" }} crossOrigin="anonymous" />
                            ) : (
                                <div style={{ fontSize: "26px", fontWeight: "900", color: "#0f172a", marginBottom: "4px" }}>{settings?.appName || 'NOYO KART'}</div>
                            )}
                            <div style={{ fontSize: "10px", color: "#64748b", fontWeight: "800", textTransform: "uppercase", letterSpacing: "3px" }}>Official Tax Invoice</div>
                        </div>

                        {/* Top Meta Details */}
                        <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: "50px", borderBottom: "1px solid #f1f5f9", paddingBottom: "25px" }}>
                            <tr>
                                <td width="50%" style={{ verticalAlign: "bottom" }}>
                                    <div style={{ fontSize: "28px", fontWeight: "900", color: "#0f172a" }}>INVOICE</div>
                                </td>
                                <td width="50%" align="right" style={{ verticalAlign: "bottom" }}>
                                    <div style={{ fontSize: "12px", fontWeight: "700", marginBottom: "4px" }}>Reference: <span style={{ color: "#2563eb" }}>#{order.orderId}</span></div>
                                    <div style={{ fontSize: "10px", color: "#64748b", fontWeight: "700" }}>Issued: {new Date(order.createdAt).toLocaleDateString()}</div>
                                </td>
                            </tr>
                        </table>

                        {/* Address Grid */}
                        <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: "55px" }}>
                            <tr>
                                <td width="48%" style={{ verticalAlign: "top", paddingRight: "25px" }}>
                                    <div style={{ fontSize: "9px", fontWeight: "900", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "12px" }}>Billed To</div>
                                    <div style={{ fontSize: "16px", fontWeight: "800", color: "#0f172a", marginBottom: "8px" }}>{order.customer?.name}</div>
                                    <div style={{ fontSize: "12px", color: "#475569", lineHeight: "1.7" }}>
                                        {order.address?.address},<br />
                                        {order.address?.landmark && `${order.address.landmark}, `}{order.address?.city}
                                    </div>
                                    <div style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", marginTop: "15px" }}>Contact: {order.customer?.phone}</div>
                                </td>
                                <td width="4%" style={{ borderLeft: "1px solid #f1f5f9" }}></td>
                                <td width="48%" style={{ verticalAlign: "top", paddingLeft: "25px" }}>
                                    <div style={{ fontSize: "9px", fontWeight: "900", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "12px" }}>Shipped From</div>
                                    <div style={{ fontSize: "16px", fontWeight: "800", color: "#0f172a", marginBottom: "8px" }}>{order.seller?.shopName || 'Partner Merchant'}</div>
                                    <div style={{ fontSize: "12px", color: "#475569", lineHeight: "1.7" }}>
                                        {settings?.address || 'Verified Business Location'}<br />
                                        Inventory Fulfillment Center
                                    </div>
                                    <div style={{ fontSize: "11px", fontWeight: "800", color: "#2563eb", marginTop: "15px" }}>{settings?.taxId ? `GSTIN: ${settings.taxId}` : 'Tax Verified Partner'}</div>
                                </td>
                            </tr>
                        </table>

                        {/* Manifest Table */}
                        <div style={{ marginBottom: "50px" }}>
                            <table width="100%" cellPadding="0" cellSpacing="0" style={{ borderCollapse: "collapse" }}>
                                <thead>
                                    <tr style={{ backgroundColor: "#f8fafc", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" }}>
                                        <th align="left" style={{ padding: "16px 20px", fontSize: "11px", fontWeight: "900", color: "#475569", textTransform: "uppercase" }}>Description</th>
                                        <th align="center" style={{ padding: "16px 20px", fontSize: "11px", fontWeight: "900", color: "#475569", textTransform: "uppercase" }}>Unit Rate</th>
                                        <th align="center" style={{ padding: "16px 20px", fontSize: "11px", fontWeight: "900", color: "#475569", textTransform: "uppercase" }}>Qty</th>
                                        <th align="right" style={{ padding: "16px 20px", fontSize: "11px", fontWeight: "900", color: "#475569", textTransform: "uppercase" }}>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {order.items.map((item, idx) => (
                                        <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                            <td style={{ padding: "18px 20px" }}>
                                                <div style={{ fontSize: "13px", fontWeight: "700", color: "#0f172a" }}>{item.name}</div>
                                                <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "4px" }}>Item Ref: {item.product?._id?.slice(-8).toUpperCase() || item._id?.slice(-8).toUpperCase()}</div>
                                            </td>
                                            <td align="center" style={{ padding: "18px 20px", fontSize: "13px", color: "#475569", fontWeight: "700" }}>₹{item.price}</td>
                                            <td align="center" style={{ padding: "18px 20px", fontSize: "13px", color: "#475569", fontWeight: "800" }}>{item.quantity}</td>
                                            <td align="right" style={{ padding: "18px 20px", fontSize: "14px", fontWeight: "900", color: "#0f172a" }}>₹{item.price * item.quantity}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Totals Summary */}
                        <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: "60px" }}>
                            <tr>
                                <td width="50%" style={{ verticalAlign: "top" }}>
                                    <div style={{ backgroundColor: "#f8fafc", padding: "25px", borderRadius: "8px", border: "1px solid #f1f5f9" }}>
                                        <div style={{ fontSize: "10px", color: "#94a3b8", fontWeight: "900", textTransform: "uppercase", marginBottom: "12px", letterSpacing: "1.5px" }}>Transaction Detail</div>
                                        <div style={{ fontSize: "12px", color: "#475569", marginBottom: "8px" }}>Method: <b style={{ color: "#0f172a" }}>{order.paymentMode || order.payment?.method || 'CASH'}</b></div>
                                        <div style={{ fontSize: "12px", color: "#475569" }}>Status: <b style={{ color: "#0f172a", textTransform: "uppercase" }}>{order.paymentStatus || order.payment?.status || 'PENDING'}</b></div>
                                    </div>
                                </td>
                                <td width="10%"></td>
                                <td width="40%" style={{ verticalAlign: "top" }}>
                                    <table width="100%" cellPadding="8" cellSpacing="0">
                                        <tr>
                                            <td align="left" style={{ fontSize: "12px", color: "#64748b", fontWeight: "700" }}>Subtotal Aggregate</td>
                                            <td align="right" style={{ fontSize: "13px", fontWeight: "800", color: "#0f172a" }}>₹{order.pricing?.subtotal || 0}</td>
                                        </tr>
                                        <tr>
                                            <td align="left" style={{ fontSize: "12px", color: "#64748b", fontWeight: "700" }}>Logistics Cost</td>
                                            <td align="right" style={{ fontSize: "13px", fontWeight: "800", color: "#2563eb" }}>+ ₹{order.pricing?.deliveryFee || 0}</td>
                                        </tr>
                                        <tr>
                                            <td colSpan="2" style={{ padding: "12px 0" }}><div style={{ height: "1px", backgroundColor: "#e2e8f0" }}></div></td>
                                        </tr>
                                        <tr>
                                            <td align="left" style={{ fontSize: "15px", fontWeight: "900", color: "#0f172a" }}>Grand Total</td>
                                            <td align="right" style={{ fontSize: "24px", fontWeight: "900", color: "#2563eb" }}>₹{order.pricing?.total || 0}</td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>

                        {/* Footer: Centered Verification */}
                        <div style={{ marginTop: "auto", paddingTop: "40px", borderTop: "1px solid #f1f5f9", textAlign: "center" }}>
                            <div style={{ fontSize: "12px", color: "#64748b", fontWeight: "800", textTransform: "uppercase", letterSpacing: "3px" }}>
                                Thank you for your business
                            </div>
                            <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "10px", fontWeight: "600" }}>
                                This is a system-generated commercial invoice. No physical signature required.
                            </div>
                            <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "5px" }}>
                                {settings?.appName || 'Noyo Kart'} • Customer Support: support@appzeto.com
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderDetail;
