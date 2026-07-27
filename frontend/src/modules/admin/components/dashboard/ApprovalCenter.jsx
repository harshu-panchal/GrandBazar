import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import Card from "@shared/components/ui/Card";

const ApprovalCenter = ({ approvalCenter }) => {
  const items = approvalCenter || [];

  return (
    <Card title="Approval Center" subtitle="Pending actions" contentClassName="p-4" className="h-full">
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              to={item.link}
              className="flex items-center gap-2 py-2.5 px-2 rounded-lg hover:bg-slate-50 transition-colors group"
            >
              <span className="text-xs text-slate-700 flex-1">{item.label}</span>
              <span
                className={`text-xs font-bold min-w-[1.5rem] text-center rounded-full px-2 py-0.5 ${
                  item.count > 0 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                {item.count}
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-primary" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
};

export default ApprovalCenter;
