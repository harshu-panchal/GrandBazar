import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import Sidebar from './Sidebar';
import Topbar from './Topbar';
import BottomNav from './BottomNav';
import { sellerApi } from '@/modules/seller/services/sellerApi';
import { useAuth } from "@core/context/AuthContext";
import { motion, AnimatePresence } from 'framer-motion';
import { BellRing, Check, X, Clock, Truck, Bell, RotateCcw, User } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getSellerOrderPayout, formatInr } from '@/shared/utils/sellerOrderMoney';
import { getFulfillmentDisplay } from '@/shared/utils/orderFulfillment';
import SellerEarningsContext, { defaultEarnings } from '@/modules/seller/context/SellerEarningsContext';
import { getOrderSocket, onSellerOrderNew, onSellerOrderReminder, onReturnDropOtp, onOrderStatusUpdate, onSellerReturnRequested } from '@/core/services/orderSocket';
import { getProductImageUrl, handleProductImageError } from "@/core/utils/imageUtils";
import orderAlertSound from '@/assets/sounds/order_alert.mp3';

const POLL_INTERVAL_MS = 15000;

const isApprovedStore = (store) => {
    if (!store) return false;
    const status = store.applicationStatus || (store.isVerified ? 'approved' : 'pending');
    return store.isVerified === true && store.isActive === true && status === 'approved';
};

/** Match server scheduled seller accept window (24h default). */
const SCHEDULED_ACCEPT_WINDOW_SEC = 24 * 60 * 60;

function formatShortOrderId(orderId) {
    if (!orderId) return '';
    const s = String(orderId).replace(/^ORD-/i, '');
    return s.length > 8 ? `#${s.slice(-6).toUpperCase()}` : `#${s.toUpperCase()}`;
}

/** Match server `sellerPendingExpiresAt` — never reset to a full 60s when the modal opens late. */
function secondsLeftUntilSellerExpiry(order) {
    if (!order) return 0;
    const raw = order.sellerPendingExpiresAt ?? order.expiresAt;
    if (!raw) return 60;
    const ms = new Date(raw).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 1000));
}

function isRelaxedFulfillment(order) {
    const ft = String(order?.fulfillmentType || '').toLowerCase();
    return ft === 'scheduled' || ft === 'preorder';
}

/** Scheduled orders may have legacy sellerPendingExpiresAt = schedule.cutoffAt — use 24h from placement instead. */
function resolveAcceptSecondsLeft(order) {
    const raw = secondsLeftUntilSellerExpiry(order);
    if (!isRelaxedFulfillment(order)) return raw;

    const placedMs = new Date(order.createdAt || order.date || 0).getTime();
    if (!Number.isFinite(placedMs) || placedMs <= 0) return raw;

    const relaxedLeft = Math.max(
        0,
        Math.ceil((placedMs + SCHEDULED_ACCEPT_WINDOW_SEC * 1000 - Date.now()) / 1000),
    );

    if (raw > SCHEDULED_ACCEPT_WINDOW_SEC + 60) {
        return relaxedLeft;
    }
    return raw;
}

function formatAcceptCountdown(seconds) {
    if (seconds <= 0) return 'expired';
    if (seconds < 60) return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
    if (seconds < 3600) {
        const mins = Math.ceil(seconds / 60);
        return `${mins} ${mins === 1 ? 'minute' : 'minutes'}`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        const remHours = hours % 24;
        if (remHours === 0) return `${days} ${days === 1 ? 'day' : 'days'}`;
        return `${days}d ${remHours}h`;
    }
    if (mins === 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    return `${hours}h ${mins}m`;
}

function isSellerAlertEligible(order) {
    if (!order?.orderId) return false;
    const ws = String(order.workflowStatus || '').toUpperCase();
    const status = String(order.status || '').toLowerCase();
    const hasExpiry = Boolean(order.sellerPendingExpiresAt ?? order.expiresAt);

    if (hasExpiry && resolveAcceptSecondsLeft(order) <= 0) return false;
    if (ws) return ws === 'SELLER_PENDING';

    // Backward compatibility: older payloads may not include workflowStatus.
    return status === 'pending';
}

const isEarningsRoute = (path) =>
    path.includes('earnings') || path.includes('withdrawals') || path.includes('transactions');

const DashboardLayout = ({ children, navItems, title }) => {
    const [newOrderAlert, setNewOrderAlert] = useState(null);
    const [showDeclineReasonBox, setShowDeclineReasonBox] = useState(false);
    const [declineReason, setDeclineReason] = useState('');
    const [showNotifyBanner, setShowNotifyBanner] = useState(false);

    const { user, logout, role } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    // Prompt sellers to enable order-alert push notifications, since the loud
    // in-tab ringtone can't sound once the tab is backgrounded/closed — a real
    // OS push is the only thing that can reach them then.
    useEffect(() => {
        if (role !== 'seller') return;
        const dismissed = sessionStorage.getItem('seller_notify_banner_dismissed');
        if (dismissed) return;
        const permission = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
        if (permission === 'default') setShowNotifyBanner(true);
    }, [role]);

    const handleEnableOrderNotifications = async () => {
        try {
            const { ensureFcmTokenRegistered } = await import('@core/firebase/pushClient');
            await ensureFcmTokenRegistered({ role, platform: 'web' });
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                toast.success('New-order alerts enabled');
            }
        } catch (error) {
            console.warn('[push] Manual registration failed:', error?.message || error);
        } finally {
            setShowNotifyBanner(false);
            sessionStorage.setItem('seller_notify_banner_dismissed', '1');
        }
    };

    const dismissNotifyBanner = () => {
        setShowNotifyBanner(false);
        sessionStorage.setItem('seller_notify_banner_dismissed', '1');
    };
    const [newReturnAlert, setNewReturnAlert] = useState(null);
    const [shownOrderIds, setShownOrderIds] = useState(() => new Set());
    const [shownReturnOrderIds, setShownReturnOrderIds] = useState(() => new Set());
    const [timeLeft, setTimeLeft] = useState(0);
    const [acceptInFlight, setAcceptInFlight] = useState(false);
    /** Total seconds in this acceptance window (for progress bar), set when modal opens */
    const acceptWindowTotalRef = useRef(60);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [returnDropOtpAlert, setReturnDropOtpAlert] = useState(null); // { orderId, otp, expiresAt }

    const canPollSellerOrders = React.useMemo(() => {
        if (role !== 'seller' || !user) return false;
        if (user.subSellerId) {
            return isApprovedStore(user);
        }
        return (user.stores || []).some(isApprovedStore);
    }, [role, user]);

    const [sellerEarningsData, setSellerEarningsData] = useState(defaultEarnings);
    const [earningsLoading, setEarningsLoading] = useState(false);

    const shownOrderIdsRef = useRef(new Set());
    const shownReturnOrderIdsRef = useRef(new Set());
    const isFirstLoadRef = useRef(true);
    const newOrderAlertRef = useRef(null);
    const newReturnAlertRef = useRef(null);
    const fetchOrdersRef = useRef(null);
    const fetchPendingReturnsRef = useRef(null);
    const isOrdersFetchInFlightRef = useRef(false);
    const earningsFetchedRef = useRef(false);
    const orderRingtoneRef = useRef(null);
    const ringtoneRetryTimerRef = useRef(null);
    const ringtoneUnlockHandlerRef = useRef(null);

    const getOrderRingtone = () => {
        if (!orderRingtoneRef.current) {
            const audio = new Audio(orderAlertSound);
            audio.loop = true;
            audio.preload = 'auto';
            orderRingtoneRef.current = audio;
        }
        return orderRingtoneRef.current;
    };

    const startOrderRingtone = () => {
        const audio = getOrderRingtone();
        audio.loop = true;
        audio.preload = 'auto';
        audio.muted = false;
        audio.volume = 1;
        audio.play().catch(() => { });

        if (!ringtoneRetryTimerRef.current) {
            ringtoneRetryTimerRef.current = setInterval(() => {
                if (!newOrderAlertRef.current) return;
                const currentAudio = getOrderRingtone();
                if (!currentAudio.paused) return;
                currentAudio.play().catch(() => { });
            }, 1200);
        }

        if (!ringtoneUnlockHandlerRef.current && typeof window !== 'undefined' && typeof document !== 'undefined') {
            const unlockPlayback = () => {
                if (!newOrderAlertRef.current) return;
                const currentAudio = getOrderRingtone();
                if (!currentAudio.paused) return;
                currentAudio.play().catch(() => { });
            };
            ringtoneUnlockHandlerRef.current = unlockPlayback;
            window.addEventListener('focus', unlockPlayback);
            document.addEventListener('visibilitychange', unlockPlayback);
            document.addEventListener('pointerdown', unlockPlayback);
            document.addEventListener('touchstart', unlockPlayback);
            document.addEventListener('keydown', unlockPlayback);
        }
    };

    const stopOrderRingtone = () => {
        const audio = orderRingtoneRef.current;
        if (ringtoneRetryTimerRef.current) {
            clearInterval(ringtoneRetryTimerRef.current);
            ringtoneRetryTimerRef.current = null;
        }
        if (ringtoneUnlockHandlerRef.current && typeof window !== 'undefined' && typeof document !== 'undefined') {
            window.removeEventListener('focus', ringtoneUnlockHandlerRef.current);
            document.removeEventListener('visibilitychange', ringtoneUnlockHandlerRef.current);
            document.removeEventListener('pointerdown', ringtoneUnlockHandlerRef.current);
            document.removeEventListener('touchstart', ringtoneUnlockHandlerRef.current);
            document.removeEventListener('keydown', ringtoneUnlockHandlerRef.current);
            ringtoneUnlockHandlerRef.current = null;
        }
        if (!audio) return;
        audio.pause();
        audio.currentTime = 0;
    };

    useEffect(() => {
        shownOrderIdsRef.current = shownOrderIds;
    }, [shownOrderIds]);
    useEffect(() => {
        shownReturnOrderIdsRef.current = shownReturnOrderIds;
    }, [shownReturnOrderIds]);
    useEffect(() => {
        newOrderAlertRef.current = newOrderAlert;
    }, [newOrderAlert]);

    useEffect(() => {
        setShowDeclineReasonBox(false);
        setDeclineReason('');
    }, [newOrderAlert?.orderId]);
    useEffect(() => {
        newReturnAlertRef.current = newReturnAlert;
    }, [newReturnAlert]);

    useEffect(() => {
        if (role !== 'seller' || !canPollSellerOrders) {
            return;
        }

        const fetchOrders = async () => {
            if (isOrdersFetchInFlightRef.current) return;
            isOrdersFetchInFlightRef.current = true;
            try {
                const res = await sellerApi.getOrders();
                if (!res?.data?.success) return;

                const payload = res.data.result || {};
                const rawOrders = Array.isArray(payload.items)
                    ? payload.items
                    : (res.data.results || []);
                const allOrders = Array.isArray(rawOrders) ? rawOrders : [];

                const pendingOrders = allOrders.filter(isSellerAlertEligible);

                if (isFirstLoadRef.current) {
                    const existingIds = new Set(pendingOrders.map((o) => o.orderId).filter(Boolean));
                    shownOrderIdsRef.current = existingIds;
                    isFirstLoadRef.current = false;
                    setShownOrderIds(existingIds);

                    // Catch the seller up on anything still waiting from before this
                    // session started (e.g. they were logged out or away when it came
                    // in) — don't silently mark it "already seen" without ever alerting.
                    if (pendingOrders.length > 0) {
                        const mostUrgent = [...pendingOrders].sort(
                            (a, b) => resolveAcceptSecondsLeft(a) - resolveAcceptSecondsLeft(b),
                        )[0];
                        setNewOrderAlert(mostUrgent);
                        newOrderAlertRef.current = mostUrgent;
                    }
                    return;
                }

                // If the order currently on-screen has been updated (e.g. the customer
                // added items while it was still pending), refresh the displayed amount
                // in place instead of leaving a stale snapshot up.
                if (newOrderAlertRef.current) {
                    const currentAlertId = newOrderAlertRef.current.orderId;
                    const refreshed = allOrders.find((o) => o.orderId === currentAlertId);
                    if (
                        refreshed &&
                        refreshed.paymentBreakdown?.sellerPayoutTotal !== newOrderAlertRef.current.paymentBreakdown?.sellerPayoutTotal
                    ) {
                        setNewOrderAlert(refreshed);
                        newOrderAlertRef.current = refreshed;
                    }
                    return;
                }

                const newOrder = pendingOrders.find((o) => !shownOrderIdsRef.current.has(o.orderId));
                if (!newOrder) return;

                setNewOrderAlert(newOrder);
                setShownOrderIds((prev) => new Set(prev).add(newOrder.orderId));
                shownOrderIdsRef.current = new Set(shownOrderIdsRef.current).add(newOrder.orderId);
                newOrderAlertRef.current = newOrder;
            } catch (error) {
                console.error("Polling Error:", error);
            } finally {
                isOrdersFetchInFlightRef.current = false;
            }
        };

        fetchOrdersRef.current = fetchOrders;
        fetchOrders();

        const fetchPendingReturns = async () => {
            try {
                const res = await sellerApi.getReturns({ status: 'return_requested' });
                const payload = res?.data?.result || {};
                const items = Array.isArray(payload.items)
                    ? payload.items
                    : (res?.data?.results || []);
                for (const order of items) {
                    if (!order?.orderId) continue;
                    if (shownReturnOrderIdsRef.current.has(order.orderId)) continue;
                    if (newReturnAlertRef.current) break; // don't stack alerts
                    const alertPayload = {
                        orderId: order.orderId,
                        returnStatus: order.returnStatus,
                        returnReason: order.returnReason,
                        returnReasonDetail: order.returnReasonDetail,
                        returnRequestedAt: order.returnRequestedAt,
                        customerName: order.address?.name || order.customer?.name || '',
                        customerPhone: order.address?.phone || order.customer?.phone || '',
                        returnItems: (order.returnItems || []).map((item) => ({
                            name: item.name || '',
                            quantity: item.quantity,
                            price: item.price,
                            image: item.image || '',
                            variantSlot: item.variantSlot || '',
                        })),
                    };
                    setNewReturnAlert(alertPayload);
                    newReturnAlertRef.current = alertPayload;
                    setShownReturnOrderIds((prev) => new Set(prev).add(order.orderId));
                    shownReturnOrderIdsRef.current = new Set(shownReturnOrderIdsRef.current).add(order.orderId);
                    break;
                }
            } catch { /* non-critical */ }
        };
        fetchPendingReturnsRef.current = fetchPendingReturns;
        fetchPendingReturns();
    }, [role, canPollSellerOrders]);

    // Resilient fallback when socket events are missed (tab backgrounded/suspended).
    useEffect(() => {
        if (role !== 'seller' || !canPollSellerOrders) return undefined;

        const syncOrders = () => {
            if (fetchOrdersRef.current) fetchOrdersRef.current();
            if (fetchPendingReturnsRef.current) fetchPendingReturnsRef.current();
        };

        const timer = setInterval(syncOrders, POLL_INTERVAL_MS);
        const onFocus = () => syncOrders();
        const onVisible = () => {
            if (document.visibilityState === 'visible') syncOrders();
        };
        const onOnline = () => syncOrders();

        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('online', onOnline);

        return () => {
            clearInterval(timer);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('online', onOnline);
        };
    }, [role, canPollSellerOrders]);

    useEffect(() => {
        if (newOrderAlert) {
            startOrderRingtone();
            return undefined;
        }
        stopOrderRingtone();
        return undefined;
    }, [newOrderAlert]);

    useEffect(() => {
        return () => {
            stopOrderRingtone();
        };
    }, []);

    useEffect(() => {
        if (role === 'seller') return;
        stopOrderRingtone();
    }, [role]);

    useEffect(() => {
        if (role !== 'seller') return undefined;
        const getToken = () => localStorage.getItem('auth_seller');
        getOrderSocket(getToken);

        const handleIncomingOrder = async (incomingOrderOrPayload) => {
            if (!incomingOrderOrPayload) return;
            const orderId = incomingOrderOrPayload.orderId || incomingOrderOrPayload._id;
            if (!orderId) return;

            // If already actively displayed in modal, don't interrupt unless updated
            if (newOrderAlertRef.current?.orderId === orderId) return;

            let orderObj = incomingOrderOrPayload.order || incomingOrderOrPayload;
            if (!orderObj?.items || !orderObj?.workflowStatus) {
                try {
                    const res = await sellerApi.getOrderDetails(orderId);
                    const fetched = res?.data?.result || res?.data?.data || res?.data;
                    if (fetched) orderObj = fetched;
                } catch (e) {
                    console.warn("[DashboardLayout] getOrderDetails failed for incoming order:", e);
                }
            }

            if (orderObj && isSellerAlertEligible(orderObj)) {
                setNewOrderAlert(orderObj);
                newOrderAlertRef.current = orderObj;
                setShownOrderIds((prev) => new Set(prev).add(orderObj.orderId));
                shownOrderIdsRef.current = new Set(shownOrderIdsRef.current).add(orderObj.orderId);
            }
        };

        const unsubscribeSellerNew = onSellerOrderNew(getToken, (payload) => {
            console.log("[DashboardLayout] Received order:new socket event:", payload);
            handleIncomingOrder(payload);
            if (fetchOrdersRef.current) fetchOrdersRef.current();
        });

        // Reminder loop: while an order stays in SELLER_PENDING the backend
        // re-emits every ~5 min. Re-open the accept popup (unless it is
        // already open for the same order) and re-trigger the ringtone.
        const unsubscribeSellerReminder = onSellerOrderReminder(getToken, (payload) => {
            console.log("[DashboardLayout] Received order:reminder:", payload);
            handleIncomingOrder(payload);
        });

        const unsubscribeOrderStatus = onOrderStatusUpdate(getToken, (payload) => {
            if (payload?.orderId && (payload?.itemAdditionRequested || payload?.workflowStatus === 'SELLER_PENDING')) {
                handleIncomingOrder(payload);
                if (fetchOrdersRef.current) fetchOrdersRef.current();
            }
        });

        const unsubscribeDrop = onReturnDropOtp(getToken, (payload) => {
            console.log("[DashboardLayout] Received return drop OTP:", payload);
            setReturnDropOtpAlert(payload);
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.play().catch(() => { });
        });

        const unsubscribeReturn = onSellerReturnRequested(getToken, (payload) => {
            console.log("[DashboardLayout] Received return:requested socket event:", payload);
            if (!payload?.orderId) return;
            if (shownReturnOrderIdsRef.current.has(payload.orderId)) return;
            setNewReturnAlert(payload);
            newReturnAlertRef.current = payload;
            setShownReturnOrderIds((prev) => new Set(prev).add(payload.orderId));
            shownReturnOrderIdsRef.current = new Set(shownReturnOrderIdsRef.current).add(payload.orderId);
            // Play a short chime to grab attention
            try {
                const returnChime = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                returnChime.volume = 0.7;
                returnChime.play().catch(() => { });
            } catch { /* ignore */ }
        });

        return () => {
            unsubscribeSellerNew();
            unsubscribeSellerReminder();
            unsubscribeOrderStatus();
            unsubscribeDrop();
            unsubscribeReturn();
        };
    }, [role]);

    // Single earnings fetch when seller is on earnings/withdrawals/transactions – no duplicate calls
    useEffect(() => {
        if (role !== 'seller' || !isEarningsRoute(location.pathname)) {
            if (!isEarningsRoute(location.pathname)) earningsFetchedRef.current = false;
            return;
        }
        if (earningsFetchedRef.current) return;
        earningsFetchedRef.current = true;
        setEarningsLoading(true);

        sellerApi
            .getEarnings()
            .then((response) => {
                const raw = response?.data?.result ?? response?.data?.data;
                if (response?.data?.success && raw && typeof raw === 'object') {
                    setSellerEarningsData({
                        balances: raw.balances ?? {},
                        ledger: Array.isArray(raw.ledger) ? raw.ledger : [],
                        monthlyChart: Array.isArray(raw.monthlyChart) ? raw.monthlyChart : [],
                        moduleEnabled: raw.moduleEnabled !== false,
                    });
                }
            })
            .catch((err) => console.error("Earnings Fetch Error:", err))
            .finally(() => setEarningsLoading(false));
    }, [role, location.pathname]);

    const refreshEarnings = () => {
        earningsFetchedRef.current = false;
        setEarningsLoading(true);
        sellerApi
            .getEarnings()
            .then((response) => {
                const raw = response?.data?.result ?? response?.data?.data;
                if (response?.data?.success && raw && typeof raw === 'object') {
                    setSellerEarningsData({
                        balances: raw.balances ?? {},
                        ledger: Array.isArray(raw.ledger) ? raw.ledger : [],
                        monthlyChart: Array.isArray(raw.monthlyChart) ? raw.monthlyChart : [],
                        moduleEnabled: raw.moduleEnabled !== false,
                    });
                }
            })
            .catch((err) => console.error("Earnings Fetch Error:", err))
            .finally(() => {
                setEarningsLoading(false);
                earningsFetchedRef.current = true;
            });
    };

    useEffect(() => {
        setIsSidebarOpen(false);
    }, [location.pathname]);

    // Timer: driven by server expiry (sellerPendingExpiresAt), not a local 60s from modal open
    useEffect(() => {
        if (!newOrderAlert) return undefined;

        const left = resolveAcceptSecondsLeft(newOrderAlert);
        if (left <= 0) {
            setNewOrderAlert(null);
            toast.error("This order has already expired — you can no longer accept it.");
            return undefined;
        }

        acceptWindowTotalRef.current = left;
        setTimeLeft(left);

        const timer = setInterval(() => {
            const next = resolveAcceptSecondsLeft(newOrderAlertRef.current);
            setTimeLeft(next);
            if (next <= 0) {
                clearInterval(timer);
                setNewOrderAlert(null);
                toast.error("Order timed out!");
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [newOrderAlert]);

    const handleAcceptOrder = async (orderId) => {
        if (acceptInFlight) return;
        setAcceptInFlight(true);
        try {
            await sellerApi.updateOrderStatus(orderId, { status: 'confirmed' });
            toast.success(`Order #${orderId} Accepted!`);
            stopOrderRingtone();
            setNewOrderAlert(null);
        } catch (error) {
            const msg =
                error?.response?.data?.message ||
                "Failed to accept order";
            const normalizedMsg = String(msg).toLowerCase();
            if (
                normalizedMsg.includes('not available') ||
                normalizedMsg.includes('expired')
            ) {
                stopOrderRingtone();
                setNewOrderAlert(null);
                if (fetchOrdersRef.current) fetchOrdersRef.current();
            }
            toast.error(msg);
        } finally {
            setAcceptInFlight(false);
        }
    };

    const handleDeclineOrder = async (orderId, cancelReason) => {
        try {
            await sellerApi.updateOrderStatus(orderId, { status: 'cancelled', cancelReason });
            toast.error(`Order #${orderId} Declined`);
            stopOrderRingtone();
            setNewOrderAlert(null);
            setDeclineReason('');
            setShowDeclineReasonBox(false);
        } catch (error) {
            const msg =
                error?.response?.data?.message ||
                "Failed to update order";
            toast.error(msg);
        }
    };

    const orderTimerUrgent = newOrderAlert
        ? (isRelaxedFulfillment(newOrderAlert) ? timeLeft < 3600 : timeLeft < 15)
        : false;
    const orderFulfillment = newOrderAlert ? getFulfillmentDisplay(newOrderAlert) : null;

    return (
        <div className="min-h-screen mesh-gradient-light relative overflow-x-hidden">
            {/* Background Blobs for depth */}
            <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px] -z-10 animate-pulse pointer-events-none"></div>
            <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-500/5 rounded-full blur-[120px] -z-10 animate-pulse pointer-events-none" style={{ animationDelay: '2s' }}></div>

            <Sidebar
                items={navItems}
                title={title}
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />
            <div className={cn("transition-all duration-300", (role === "admin" || role === "seller") ? "pl-0 md:pl-72" : "pl-72")}>
                <Topbar onMenuClick={() => setIsSidebarOpen(true)} />
                <main className={cn("p-4 md:p-6 min-h-screen", (role === "admin" || role === "seller") ? "pt-20 md:pt-24 pb-24 md:pb-6" : "pt-20")}>
                    <div className="w-full pb-12">
                        {showNotifyBanner && (
                            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
                                <Bell className="h-5 w-5 text-primary shrink-0" />
                                <p className="flex-1 min-w-[200px] text-sm font-semibold text-slate-700">
                                    Enable notifications so you don't miss new orders when this tab isn't open.
                                </p>
                                <button
                                    onClick={handleEnableOrderNotifications}
                                    className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
                                >
                                    Enable
                                </button>
                                <button
                                    onClick={dismissNotifyBanner}
                                    className="px-3 py-2 rounded-xl text-slate-500 text-xs font-bold hover:bg-slate-100 transition-colors"
                                >
                                    Not now
                                </button>
                            </div>
                        )}
                        <SellerEarningsContext.Provider
                            value={{
                                earningsData: role === 'seller' ? sellerEarningsData : defaultEarnings,
                                earningsLoading: role === 'seller' ? earningsLoading : false,
                                refreshEarnings,
                            }}>
                            {children}
                        </SellerEarningsContext.Provider>
                    </div>
                </main>
            </div>

            {/* Global Order Alert Modal */}
            <AnimatePresence>
                {newOrderAlert && (
                    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col"
                        >
                            <div className="flex flex-col items-center text-center overflow-y-auto no-scrollbar">
                                <div className="h-16 w-16 bg-rose-50 rounded-full flex items-center justify-center mb-3 shadow-inner ring-8 ring-rose-50/50 shrink-0">
                                    <BellRing className="h-8 w-8 text-rose-500 animate-pulse" />
                                </div>

                                <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2">New Order Received!</h2>
                                
                                {orderFulfillment && (
                                    <div className="flex flex-wrap items-center justify-center gap-1.5 mb-2.5">
                                        <span
                                            className={cn(
                                                'inline-flex items-center px-3 py-0.5 rounded-full text-xs font-bold border',
                                                orderFulfillment.typeBadgeClassName,
                                            )}
                                        >
                                            {orderFulfillment.typeLabel}
                                        </span>
                                        <span
                                            className={cn(
                                                'inline-flex items-center px-3 py-0.5 rounded-full text-xs font-bold border',
                                                orderFulfillment.methodBadgeClassName,
                                            )}
                                        >
                                            {orderFulfillment.methodLabel}
                                        </span>
                                    </div>
                                )}

                                <p className="text-slate-500 font-medium text-xs mb-2 flex items-center justify-center gap-1.5">
                                    <span>You have a new order</span>
                                    <span
                                        className="font-mono font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100 text-xs tracking-wider"
                                        title={`Full Order ID: #${newOrderAlert.orderId}`}
                                    >
                                        {formatShortOrderId(newOrderAlert.orderId)}
                                    </span>
                                </p>

                                {(newOrderAlert.address?.name || newOrderAlert.customer?.name) && (
                                    <p className="text-slate-700 font-semibold text-sm mb-3 flex items-center justify-center gap-1.5">
                                        <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                        <span>{newOrderAlert.address?.name || newOrderAlert.customer?.name}</span>
                                    </p>
                                )}

                                {/* Ordered Items List */}
                                {Array.isArray(newOrderAlert.items) && newOrderAlert.items.length > 0 && (
                                    <div className="w-full mb-3 rounded-2xl bg-slate-50 p-3.5 border border-slate-100 text-left">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                                Items Ordered
                                            </span>
                                            <span className="bg-slate-200/80 px-2 py-0.5 rounded-full text-[10px] font-bold text-slate-700">
                                                {newOrderAlert.items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0)}
                                            </span>
                                        </div>
                                        <div className="space-y-2.5 max-h-40 overflow-y-auto pr-1 divide-y divide-slate-100">
                                            {newOrderAlert.items.map((item, idx) => {
                                                const itemName = item.name || item.product?.name || 'Item';
                                                const itemImg = item.image || item.product?.mainImage || item.product?.image || (Array.isArray(item.product?.images) ? item.product.images[0] : '');
                                                const variantLabel = item.variantSlot || item.variantName || item.variantLabel || item.variantSku || '';
                                                const qty = item.quantity || 1;
                                                return (
                                                    <div key={idx} className="flex items-center gap-3 pt-2.5 first:pt-0">
                                                        <img
                                                            src={getProductImageUrl(itemImg)}
                                                            alt={itemName}
                                                            onError={handleProductImageError}
                                                            className="h-10 w-10 rounded-xl object-cover bg-white border border-slate-200 shrink-0 shadow-xs"
                                                        />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-xs font-bold text-slate-900 truncate leading-snug">{itemName}</p>
                                                            {variantLabel && (
                                                                <p className="text-[10px] font-medium text-slate-500 truncate mt-0.5">{variantLabel}</p>
                                                            )}
                                                        </div>
                                                        <div className="shrink-0 text-right">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-800 text-xs font-bold shadow-xs">
                                                                Qty {qty}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Seller Payout (Admin commission hidden) */}
                                <div className="w-full bg-slate-50 rounded-2xl p-3.5 mb-3.5 border border-slate-100 space-y-2 text-left">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">You will receive</span>
                                        <span className="text-xl font-black text-slate-900">₹{formatInr(getSellerOrderPayout(newOrderAlert))}</span>
                                    </div>
                                    {(newOrderAlert?.fulfillmentMethod === 'seller_delivery' || newOrderAlert?.logisticsMode === 'external') && (
                                        <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                                            <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                                🚚 Self Delivery (You deliver)
                                            </span>
                                            <span className="font-semibold text-slate-600">
                                                Incl. ₹{formatInr(newOrderAlert.paymentBreakdown?.deliveryFeeCharged ?? newOrderAlert.pricing?.deliveryFee ?? 0)} delivery fee
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Timer & Progress Bar */}
                                <div className="w-full space-y-2 mb-5">
                                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                        <div
                                            className={cn(
                                                "h-full transition-[width] duration-1000 ease-linear rounded-full",
                                                orderTimerUrgent ? "bg-rose-500" : "bg-rose-500",
                                            )}
                                            style={{
                                                width: `${acceptWindowTotalRef.current > 0 ? (timeLeft / acceptWindowTotalRef.current) * 100 : 0}%`,
                                            }}
                                        />
                                    </div>

                                    <div className="flex items-center justify-center gap-2 text-xs font-bold">
                                        <Clock className={cn("h-3.5 w-3.5", orderTimerUrgent ? "text-rose-500 animate-pulse" : "text-slate-500")} />
                                        <span className={orderTimerUrgent ? "text-rose-500 font-bold" : "text-slate-600 font-semibold"}>
                                            Accept within {formatAcceptCountdown(timeLeft)}
                                        </span>
                                    </div>
                                </div>

                                {showDeclineReasonBox ? (
                                    <div className="w-full space-y-3">
                                        <textarea
                                            autoFocus
                                            value={declineReason}
                                            onChange={(e) => setDeclineReason(e.target.value)}
                                            placeholder="Reason for declining (at least 10 characters)…"
                                            rows={3}
                                            className="w-full rounded-2xl border border-slate-200 p-3 text-xs outline-none focus:ring-2 focus:ring-rose-200 resize-none bg-slate-50"
                                        />
                                        <div className="grid grid-cols-2 gap-3 w-full">
                                            <button
                                                type="button"
                                                onClick={() => setShowDeclineReasonBox(false)}
                                                className="py-3 rounded-2xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors"
                                            >
                                                Back
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeclineOrder(newOrderAlert.orderId, declineReason.trim())}
                                                disabled={declineReason.trim().length < 10}
                                                className="py-3 rounded-2xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors disabled:opacity-50"
                                            >
                                                Confirm Decline
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                <div className="grid grid-cols-2 gap-3 w-full">
                                    <button
                                        type="button"
                                        onClick={() => setShowDeclineReasonBox(true)}
                                        disabled={acceptInFlight}
                                        className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        <X className="h-4 w-4" />
                                        Decline
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleAcceptOrder(newOrderAlert.orderId)}
                                        disabled={acceptInFlight}
                                        className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 shadow-xl shadow-rose-600/20 transition-all active:scale-95 disabled:opacity-70 disabled:pointer-events-none"
                                    >
                                        <Check className="h-4 w-4 stroke-[2.5]" />
                                        {acceptInFlight ? 'Accepting…' : 'Accept'}
                                    </button>
                                </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Global Return Request Alert Modal */}
                {newReturnAlert && (
                    <div className="fixed inset-0 z-[1001] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.85, opacity: 0, y: 30 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.85, opacity: 0, y: 30 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                            className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-amber-100 overflow-hidden max-h-[90vh] flex flex-col"
                        >
                            {/* Header */}
                            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 pt-6 pb-5 flex flex-col items-center text-center shrink-0">
                                <div className="relative h-14 w-14 flex items-center justify-center mb-3">
                                    <div className="absolute inset-0 rounded-full bg-white/30 animate-ping opacity-70" />
                                    <div className="relative h-14 w-14 bg-white/20 rounded-full flex items-center justify-center ring-4 ring-white/30">
                                        <RotateCcw className="h-7 w-7 text-white" />
                                    </div>
                                </div>
                                <h2 className="text-xl font-black text-white tracking-tight mb-0.5">Return Requested!</h2>
                                <p className="text-amber-100 text-xs font-medium">
                                    Order{' '}
                                    <span className="font-mono font-bold text-white bg-white/20 px-2 py-0.5 rounded-md text-xs tracking-wider">
                                        {formatShortOrderId(newReturnAlert.orderId)}
                                    </span>
                                </p>
                            </div>

                            {/* Scrollable body */}
                            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">

                                {/* Customer Info Card */}
                                {(newReturnAlert.customerName || newReturnAlert.customerPhone) && (
                                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Customer</p>
                                        <div className="flex items-center gap-3">
                                            <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0 text-amber-600 font-black text-base">
                                                {(newReturnAlert.customerName || '?').charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                {newReturnAlert.customerName && (
                                                    <p className="text-sm font-bold text-slate-900 truncate">{newReturnAlert.customerName}</p>
                                                )}
                                                {newReturnAlert.customerPhone && (
                                                    <p className="text-xs text-slate-500 font-medium">{newReturnAlert.customerPhone}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Return Items */}
                                {Array.isArray(newReturnAlert.returnItems) && newReturnAlert.returnItems.length > 0 && (
                                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
                                        <div className="flex items-center justify-between mb-2.5">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Items to Return</p>
                                            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                                {newReturnAlert.returnItems.length} {newReturnAlert.returnItems.length === 1 ? 'item' : 'items'}
                                            </span>
                                        </div>
                                        <div className="space-y-2.5 max-h-44 overflow-y-auto pr-1">
                                            {newReturnAlert.returnItems.map((item, idx) => (
                                                <div key={idx} className="flex items-center gap-3 bg-white rounded-xl p-2.5 border border-slate-100">
                                                    {item.image ? (
                                                        <img
                                                            src={getProductImageUrl(item.image)}
                                                            alt={item.name}
                                                            onError={handleProductImageError}
                                                            className="h-11 w-11 rounded-xl object-cover bg-slate-100 border border-slate-200 shrink-0"
                                                        />
                                                    ) : (
                                                        <div className="h-11 w-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                                                            <RotateCcw className="h-4 w-4 text-amber-400" />
                                                        </div>
                                                    )}
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-bold text-slate-900 truncate leading-snug">{item.name || 'Product'}</p>
                                                        {item.variantSlot && (
                                                            <p className="text-[10px] text-slate-500 truncate mt-0.5">{item.variantSlot}</p>
                                                        )}
                                                    </div>
                                                    <div className="shrink-0 text-right space-y-1">
                                                        <div className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                                                            Qty {item.quantity}
                                                        </div>
                                                        {item.price != null && (
                                                            <div className="text-[10px] font-bold text-slate-800">
                                                                ₹{Number(item.price).toFixed(0)}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Return Reason */}
                                {newReturnAlert.returnReason && (
                                    <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3.5 space-y-1.5">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Reason</p>
                                        <p className="text-sm font-semibold text-slate-800 leading-snug">{newReturnAlert.returnReason}</p>
                                        {newReturnAlert.returnReasonDetail && (
                                            <p className="text-xs text-slate-500 leading-relaxed border-t border-amber-100 pt-2">{newReturnAlert.returnReasonDetail}</p>
                                        )}
                                    </div>
                                )}

                                <p className="text-[11px] text-slate-400 font-medium text-center pb-1">
                                    Go to <span className="font-bold text-slate-600">Returns</span> to approve or reject this request.
                                </p>
                            </div>

                            {/* Footer buttons */}
                            <div className="grid grid-cols-2 gap-3 px-5 pb-5 pt-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setNewReturnAlert(null);
                                        newReturnAlertRef.current = null;
                                    }}
                                    className="py-3.5 rounded-2xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 transition-all active:scale-95"
                                >
                                    Dismiss
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setNewReturnAlert(null);
                                        newReturnAlertRef.current = null;
                                        navigate('/seller/returns');
                                    }}
                                    className="py-3.5 rounded-2xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 shadow-lg shadow-amber-500/25 transition-all active:scale-95"
                                >
                                    View Returns
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}


                {/* Global Return Drop OTP Modal */}
                {returnDropOtpAlert && (
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-brand-100"
                        >
                            <div className="flex flex-col items-center text-center">
                                <div className="h-20 w-20 bg-brand-50 rounded-full flex items-center justify-center mb-6 animate-pulse">
                                    <Truck className="h-10 w-10 text-brand-600" />
                                </div>

                                <h2 className="text-2xl font-black text-slate-900 mb-2">Rider at Store!</h2>
                                <p className="text-slate-600 font-medium mb-6">
                                    A rider is at your store for Return <span className="text-brand-600 font-bold">#{returnDropOtpAlert.orderId}</span>.
                                    Please share the OTP below:
                                </p>

                                <div className="flex items-center justify-center gap-3 mb-8">
                                    {returnDropOtpAlert.otp.split('').map((char, i) => (
                                        <div key={i} className="h-16 w-14 bg-slate-50 rounded-2xl shadow-sm border border-brand-100 flex items-center justify-center text-4xl font-black text-slate-900 border-b-4 border-b-brand-600">
                                            {char}
                                        </div>
                                    ))}
                                </div>

                                <p className="text-xs font-bold text-slate-500 italic mb-8">
                                    Confirm receipt of the product by sharing this code.
                                </p>

                                <button
                                    onClick={() => setReturnDropOtpAlert(null)}
                                    className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-black hover:bg-primary/90 shadow-xl shadow-primary/20 transition-all active:scale-95 uppercase tracking-widest text-xs"
                                >
                                    Dismiss Alert
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {(role === "admin" || role === "seller") && <BottomNav navItems={navItems} />}
        </div>
    );
};

export default DashboardLayout;
