import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ShoppingBag, CreditCard, AlertTriangle, Star, Info } from "lucide-react";
import Card from "@shared/components/ui/Card";
import { cn } from "@/lib/utils";
import { sellerApi } from "../../services/sellerApi";
import { ViewAllLink, Skeleton } from "./common";

const TYPE_STYLES = {
  order: { icon: ShoppingBag, chip: "bg-sky-50 text-sky-600" },
  payment: { icon: CreditCard, chip: "bg-emerald-50 text-emerald-600" },
  alert: { icon: AlertTriangle, chip: "bg-amber-50 text-amber-600" },
  review: { icon: Star, chip: "bg-violet-50 text-violet-600" },
  default: { icon: Info, chip: "bg-slate-100 text-slate-500" },
};

const relativeTime = (dateStr) => {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

const RecentNotifications = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState(null);

  useEffect(() => {
    let cancelled = false;
    sellerApi
      .getNotifications()
      .then((res) => {
        if (cancelled) return;
        const list = res.data?.result?.notifications || [];
        setNotifications(list.slice(0, 6));
      })
      .catch(() => {
        if (!cancelled) setNotifications([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card
      title="Recent Notifications"
      headerAction={<ViewAllLink onClick={() => navigate("/seller/profile")} />}
      contentClassName="p-4"
    >
      {notifications === null ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Bell className="h-8 w-8 text-slate-300" />
          <p className="text-xs text-slate-500 mt-2">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n, idx) => {
            const style = TYPE_STYLES[n.type] || TYPE_STYLES.default;
            const Icon = style.icon;
            return (
              <div key={n._id || idx} className="flex items-start gap-3">
                <div
                  className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                    style.chip,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-xs truncate",
                      n.isRead ? "text-slate-600" : "font-semibold text-slate-900",
                    )}
                  >
                    {n.title || n.message || n.body}
                  </p>
                  {n.title && (n.message || n.body) && (
                    <p className="text-[11px] text-slate-500 truncate">{n.message || n.body}</p>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 shrink-0 pt-0.5">
                  {relativeTime(n.createdAt)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default RecentNotifications;
