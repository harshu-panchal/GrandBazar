import React from "react";
import {
  CheckCircle2,
  XCircle,
  Wallet,
  CreditCard,
  UserPlus,
  Scale,
} from "lucide-react";
import Card from "@shared/components/ui/Card";
import { timeAgo } from "@shared/components/dashboard/common";
import { cn } from "@/lib/utils";

const TYPE_META = {
  approval: { icon: CheckCircle2, chip: "bg-emerald-50 text-emerald-600" },
  rejection: { icon: XCircle, chip: "bg-red-50 text-red-500" },
  payout: { icon: Wallet, chip: "bg-blue-50 text-blue-600" },
  subscription: { icon: CreditCard, chip: "bg-purple-50 text-purple-600" },
  registration: { icon: UserPlus, chip: "bg-sky-50 text-sky-600" },
  dispute: { icon: Scale, chip: "bg-amber-50 text-amber-600" },
};

const ActivityFeed = ({ activityFeed }) => {
  const list = activityFeed || [];

  return (
    <Card title="Activity Feed" contentClassName="p-4" className="h-full">
      {list.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6">No recent activity</p>
      ) : (
        <ul className="space-y-3">
          {list.map((event, i) => {
            const meta = TYPE_META[event.type] || TYPE_META.registration;
            const Icon = meta.icon;
            return (
              <li key={`${event.message}-${i}`} className="flex items-start gap-2.5">
                <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", meta.chip)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-700 leading-snug">{event.message}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(event.at)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};

export default ActivityFeed;
