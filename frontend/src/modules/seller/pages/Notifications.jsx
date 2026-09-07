import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ChevronLeft, ShoppingBag, CreditCard, AlertTriangle, Star, Info } from "lucide-react";
import { useToast } from "@shared/components/ui/Toast";
import { sellerApi } from "../services/sellerApi";

const TYPE_STYLES = {
  order: { icon: ShoppingBag, chip: "bg-sky-50 text-sky-600" },
  payment: { icon: CreditCard, chip: "bg-emerald-50 text-emerald-600" },
  alert: { icon: AlertTriangle, chip: "bg-amber-50 text-amber-600" },
  review: { icon: Star, chip: "bg-violet-50 text-violet-600" },
  default: { icon: Info, chip: "bg-slate-100 text-slate-500" },
};

function formatTimestamp(value) {
  if (!value) return "";
  try {
    const date = new Date(value);
    return `${date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return "";
  }
}

const Notifications = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState(null);

  const fetchNotifications = async () => {
    try {
      const res = await sellerApi.getNotifications();
      setNotifications(res.data?.result?.notifications || []);
    } catch (error) {
      showToast("Failed to load notifications", "error");
      setNotifications([]);
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
      await sellerApi.markNotificationRead(notification.id);
    } catch (error) {
      // Non-fatal — the list still reflects the read state locally.
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await sellerApi.markAllNotificationsRead();
      setNotifications((current) => current.map((n) => ({ ...n, isRead: true })));
    } catch (error) {
      showToast("Failed to mark notifications as read", "error");
    }
  };

  const hasUnread = (notifications || []).some((n) => !n.isRead);

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
        {notifications === null ? (
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
              Orders, payments and store alerts will show up here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => {
              const style = TYPE_STYLES[notification.type] || TYPE_STYLES.default;
              const Icon = style.icon;
              return (
                <div
                  key={notification.id}
                  onClick={() => handleOpenNotification(notification)}
                  role="button"
                  tabIndex={0}
                  className={`relative p-4 rounded-2xl border cursor-pointer transition-colors ${
                    notification.isRead
                      ? "bg-white border-slate-100"
                      : "bg-primary/[0.04] border-primary/20"
                  }`}
                >
                  {!notification.isRead && (
                    <span className="absolute top-4 right-4 w-2 h-2 bg-primary rounded-full" />
                  )}
                  <div className="flex items-start gap-3">
                    <div
                      className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${style.chip}`}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className={`text-sm font-bold ${notification.isRead ? "text-slate-700" : "text-slate-900"}`}>
                        {notification.title}
                      </h3>
                      <p className={`text-xs mt-0.5 leading-relaxed ${notification.isRead ? "text-slate-500" : "text-slate-700"}`}>
                        {notification.message || notification.body}
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

export default Notifications;
