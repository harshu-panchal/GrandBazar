import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronLeft, Package, Truck, Wallet, XCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { customerApi } from '../services/customerApi';

const ICON_BY_TYPE = {
    ORDER_PLACED: Package,
    ORDER_CONFIRMED: CheckCircle2,
    ORDER_PACKED: Package,
    OUT_FOR_DELIVERY: Truck,
    DELIVERY_ASSIGNED: Truck,
    ORDER_DELIVERED: CheckCircle2,
    ORDER_CANCELLED: XCircle,
    REFUND_INITIATED: Wallet,
    REFUND_COMPLETED: Wallet,
};

function formatTimestamp(value) {
    if (!value) return '';
    try {
        const date = new Date(value);
        return `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
        return '';
    }
}

const NotificationsPage = () => {
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchNotifications = async () => {
        try {
            setIsLoading(true);
            const res = await customerApi.getNotifications();
            if (res.data.success) {
                setNotifications(res.data.result?.items || res.data.result?.notifications || []);
            }
        } catch (error) {
            toast.error('Failed to load notifications');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, []);

    const handleOpenNotification = async (notification) => {
        if (notification.isRead) return;
        setNotifications((current) =>
            current.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)),
        );
        try {
            await customerApi.markNotificationRead(notification.id);
        } catch (error) {
            // Non-fatal — the list still reflects the read state locally.
        }
    };

    const handleMarkAllRead = async () => {
        try {
            await customerApi.markAllNotificationsRead();
            setNotifications((current) => current.map((n) => ({ ...n, isRead: true })));
        } catch (error) {
            toast.error('Failed to mark notifications as read');
        }
    };

    const hasUnread = notifications.some((n) => !n.isRead);

    return (
        <div className="min-h-screen bg-slate-50 pb-24 font-sans">
            <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-sm px-4 pt-4 pb-3 border-b border-slate-200/60 mb-4 flex items-center gap-2">
                <button
                    onClick={() => navigate(-1)}
                    className="w-10 h-10 flex items-center justify-center hover:bg-slate-200/70 rounded-full transition-colors -ml-1"
                >
                    <ChevronLeft size={22} className="text-slate-800" />
                </button>
                <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Notifications</h1>
                {hasUnread && (
                    <button
                        onClick={handleMarkAllRead}
                        className="ml-auto text-xs font-bold text-primary hover:bg-primary/5 px-3 py-1.5 rounded-full transition-colors"
                    >
                        Mark all read
                    </button>
                )}
            </div>

            <div className="max-w-2xl mx-auto px-4">
                {isLoading ? (
                    <div className="flex justify-center py-20">
                        <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="text-center py-20 px-6">
                        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Bell size={36} className="text-slate-300" />
                        </div>
                        <h3 className="text-lg font-black text-slate-800 mb-2">You're All Caught Up!</h3>
                        <p className="text-slate-500 text-sm max-w-[220px] mx-auto">
                            Order updates, delivery status and refunds will show up here.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {notifications.map((notification) => {
                            const Icon = ICON_BY_TYPE[notification.type] || Bell;
                            return (
                                <div
                                    key={notification.id}
                                    onClick={() => handleOpenNotification(notification)}
                                    role="button"
                                    tabIndex={0}
                                    className={`relative p-4 rounded-2xl border cursor-pointer transition-colors ${
                                        notification.isRead
                                            ? 'bg-white border-slate-100'
                                            : 'bg-primary/[0.04] border-primary/20'
                                    }`}
                                >
                                    {!notification.isRead && (
                                        <span className="absolute top-4 right-4 w-2 h-2 bg-primary rounded-full" />
                                    )}
                                    <div className="flex items-start gap-3">
                                        <div
                                            className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                                notification.isRead
                                                    ? 'bg-slate-100 text-slate-400'
                                                    : 'bg-primary/10 text-primary'
                                            }`}
                                        >
                                            <Icon size={18} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h3 className={`text-sm font-bold ${notification.isRead ? 'text-slate-700' : 'text-slate-900'}`}>
                                                {notification.title}
                                            </h3>
                                            <p className={`text-xs mt-0.5 leading-relaxed ${notification.isRead ? 'text-slate-500' : 'text-slate-700'}`}>
                                                {notification.body}
                                            </p>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-2">
                                                {formatTimestamp(notification.createdAt)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotificationsPage;
