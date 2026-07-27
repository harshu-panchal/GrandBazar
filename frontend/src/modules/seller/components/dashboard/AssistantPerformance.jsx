import React from "react";
import { useNavigate } from "react-router-dom";
import { Users } from "lucide-react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import { Stars, ViewAllLink } from "@shared/components/dashboard/common";

const AssistantPerformance = ({ assistants }) => {
  const navigate = useNavigate();
  if (assistants === null || assistants === undefined) return null;

  return (
    <Card
      title="Assistant Performance"
      headerAction={<ViewAllLink label="View All Assistants" onClick={() => navigate("/seller/staff")} />}
      contentClassName="p-4"
    >
      {assistants.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Users className="h-8 w-8 text-slate-300" />
          <p className="text-xs text-slate-500 mt-2">No assistants added yet</p>
          <button
            onClick={() => navigate("/seller/staff")}
            className="text-xs font-semibold text-primary mt-1 hover:underline"
          >
            Add your first assistant
          </button>
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left pb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Assistant
              </th>
              <th className="text-center pb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Orders
              </th>
              <th className="text-center pb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Acceptance
              </th>
              <th className="text-right pb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Rating
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {assistants.slice(0, 5).map((a) => (
              <tr key={a.id}>
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">
                      {(a.name || "?")
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">{a.name}</p>
                      {!a.isActive && (
                        <Badge variant="secondary" className="text-[9px] px-1 py-0">
                          Inactive
                        </Badge>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-2.5 text-center text-xs font-bold text-slate-900">
                  {a.orders ?? "—"}
                </td>
                <td className="py-2.5 text-center text-xs font-bold text-slate-900">
                  {a.acceptancePct === null || a.acceptancePct === undefined ? "—" : `${a.acceptancePct}%`}
                </td>
                <td className="py-2.5 text-right">
                  {a.rating === null || a.rating === undefined ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-900">
                      {a.rating}
                      <Stars rating={a.rating} size="h-3 w-3" />
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
};

export default AssistantPerformance;
