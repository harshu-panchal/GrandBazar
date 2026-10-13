import React, { useEffect, useState, useCallback, useMemo } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import PageHeader from "@shared/components/ui/PageHeader";
import StatCard from "@shared/components/ui/StatCard";
import {
  HiOutlineShoppingCart,
  HiOutlineTruck,
  HiOutlineClipboardDocumentCheck,
  HiOutlineBanknotes,
  HiOutlineClock,
} from "react-icons/hi2";
import { toast } from "sonner";
import { useAuth } from "@core/context/AuthContext";
import { adminApi } from "../services/adminApi";

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const formatTime = (value) =>
  value ? new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

const OPERATOR_ROLE_NAMES = ["operator_l1", "operator_l2", "operator_l3", "operator_l4"];
const CAPABILITY_ROWS = [
  { label: "Monitor orders & own audit log", key: "operations.monitor" },
  { label: "Reroute, reschedule, assign rider, credit within limit", key: "operations.intervene" },
  { label: "Shop controls, reassign store, approve L2 requests", key: "operations.manage_shops" },
  { label: "Payments & settlement, Maker-Checker approvals", key: "operations.payments" },
];

// Operations Console — the mock's tiered live-ops screen, rebuilt on real
// data: unassigned/active orders from the existing delivery endpoints, the
// credit/refund + Maker-Checker flow from Phase 2, and the unified audit
// log from Phase 4. Deliberately has no "zone load" panel — this app has
// no zone concept, so that panel would have to be fabricated data.
const OperationsConsole = () => {
  const { user } = useAuth();
  const isOwner = user?.role === "admin" || user?.role === "superadmin";
  const can = useCallback((key) => isOwner || (user?.allowedPermissions || []).includes(key), [isOwner, user]);

  const [unassigned, setUnassigned] = useState({ items: [], total: 0 });
  const [fleet, setFleet] = useState({ items: [], total: 0 });
  const [approvals, setApprovals] = useState({ items: [], total: 0 });
  const [auditLog, setAuditLog] = useState({ items: [] });
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  const [creditForm, setCreditForm] = useState({ orderId: "", amount: "", reason: "", type: "credit" });
  const [submittingCredit, setSubmittingCredit] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const calls = [
        adminApi.getUnassignedOrders({ limit: 10 }),
        adminApi.getActiveFleet({ limit: 10 }),
        adminApi.getOperationsAuditLog({ limit: 10 }),
      ];
      if (can("operations.manage_shops") || can("operations.payments")) {
        calls.push(adminApi.getOperationsApprovals({ status: "pending", limit: 10 }));
      }
      const [unassignedRes, fleetRes, auditRes, approvalsRes] = await Promise.all(calls);

      if (unassignedRes?.data?.success) setUnassigned(unassignedRes.data.result || { items: [], total: 0 });
      if (fleetRes?.data?.success) setFleet(fleetRes.data.result || { items: [], total: 0 });
      if (auditRes?.data?.success) setAuditLog(auditRes.data.result || { items: [] });
      if (approvalsRes?.data?.success) setApprovals(approvalsRes.data.result || { items: [], total: 0 });

      if (isOwner) {
        const rolesRes = await adminApi.getAdminRoles();
        if (rolesRes?.data?.success) {
          const all = rolesRes.data.result || rolesRes.data.results || [];
          setRoles(all.filter((r) => OPERATOR_ROLE_NAMES.includes(r.name)));
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load Operations Console");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleCreditSubmit = async (e) => {
    e.preventDefault();
    if (!creditForm.orderId.trim() || !(Number(creditForm.amount) > 0) || !creditForm.reason.trim()) {
      toast.error("Order ID, amount and a reason are all required");
      return;
    }
    setSubmittingCredit(true);
    try {
      const res = await adminApi.createOperationsCredit(creditForm);
      const result = res.data?.result;
      if (result?.executed) {
        toast.success(`Credit of ${formatMoney(result.amount)} issued`);
      } else {
        toast.success("Above your limit — sent for approval to the next tier");
      }
      setCreditForm({ orderId: "", amount: "", reason: "", type: "credit" });
      fetchAll();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to submit credit/refund");
    } finally {
      setSubmittingCredit(false);
    }
  };

  const handleReview = async (id, approve) => {
    try {
      if (approve) {
        await adminApi.approveOperationsApproval(id);
        toast.success("Approved — credit issued");
      } else {
        const note = window.prompt("Reason for rejecting this request?");
        if (!note || !note.trim()) {
          toast.error("A reason is required to reject");
          return;
        }
        await adminApi.rejectOperationsApproval(id, note);
        toast.success("Rejected");
      }
      fetchAll();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to review request");
    }
  };

  const moneyLimitLabel = useMemo(() => {
    if (isOwner) return "Unlimited";
    return "Set by your role (see Staff & Roles)";
  }, [isOwner]);

  if (loading && !unassigned.items.length && !fleet.items.length) {
    return <div className="p-6 text-sm text-slate-500">Loading Operations Console…</div>;
  }

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Operations Console"
        description="Live order-ops view scoped to your tier — monitor, intervene, approve."
        badge={<Badge variant="info">Operations</Badge>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Unassigned Orders" value={unassigned.total} icon={HiOutlineShoppingCart} color="text-amber-600" bg="bg-amber-50" />
        <StatCard label="Active Deliveries" value={fleet.total} icon={HiOutlineTruck} color="text-sky-600" bg="bg-sky-50" />
        {(can("operations.manage_shops") || can("operations.payments")) && (
          <StatCard label="Pending Approvals" value={approvals.total} icon={HiOutlineClipboardDocumentCheck} color="text-red-600" bg="bg-red-50" />
        )}
        <StatCard label="Your Credit Limit" value={moneyLimitLabel} icon={HiOutlineBanknotes} color="text-emerald-600" bg="bg-emerald-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-none shadow-sm">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-slate-800">Unassigned Orders</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {unassigned.items.length === 0 ? (
              <li className="px-4 py-6 text-center text-slate-400 text-sm">Nothing waiting for a rider.</li>
            ) : (
              unassigned.items.map((o) => (
                <li key={o.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <b>#{o.id}</b>
                    <span className="text-slate-400"> · {o.seller?.name} · {o.customer?.name}</span>
                  </div>
                  <span className="text-slate-400">{formatTime(o.createdAt)}</span>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card className="border-none shadow-sm">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-slate-800">Active Fleet</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {fleet.items.length === 0 ? (
              <li className="px-4 py-6 text-center text-slate-400 text-sm">No riders currently out on delivery.</li>
            ) : (
              fleet.items.map((f) => (
                <li key={f.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <b>{f.deliveryBoy?.name}</b>
                    <span className="text-slate-400"> · #{f.id} · {f.seller?.name}</span>
                  </div>
                  <Badge variant="info">{f.status}</Badge>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>

      {can("operations.intervene") && (
        <Card className="border-none shadow-sm">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-slate-800">Issue Credit / Refund</h3>
          </div>
          <form onSubmit={handleCreditSubmit} className="p-4 flex flex-wrap gap-3 items-end">
            <input
              type="text" placeholder="Order ID" value={creditForm.orderId}
              onChange={(e) => setCreditForm((p) => ({ ...p, orderId: e.target.value }))}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/30 min-w-[160px]"
            />
            <select
              value={creditForm.type}
              onChange={(e) => setCreditForm((p) => ({ ...p, type: e.target.value }))}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
            >
              <option value="credit">Credit</option>
              <option value="refund">Refund</option>
            </select>
            <input
              type="number" placeholder="Amount ₹" value={creditForm.amount}
              onChange={(e) => setCreditForm((p) => ({ ...p, amount: e.target.value }))}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none w-32"
            />
            <input
              type="text" placeholder="Reason (required)" value={creditForm.reason}
              onChange={(e) => setCreditForm((p) => ({ ...p, reason: e.target.value }))}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none flex-1 min-w-[200px]"
            />
            <button type="submit" disabled={submittingCredit} className="px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-50">
              {submittingCredit ? "Submitting…" : "Submit"}
            </button>
          </form>
          <p className="px-4 pb-4 text-xs text-slate-500">Above your role's money limit, this is sent to the next tier for approval instead of executing.</p>
        </Card>
      )}

      {(can("operations.manage_shops") || can("operations.payments")) && (
        <Card className="border-none shadow-sm">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-slate-800">Approval Queue</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {approvals.items.length === 0 ? (
              <li className="px-4 py-6 text-center text-slate-400 text-sm">Nothing pending.</li>
            ) : (
              approvals.items.map((a) => (
                <li key={a._id} className="flex items-center justify-between px-4 py-3 text-sm gap-3">
                  <div className="flex-1">
                    <b>{formatMoney(a.amount)}</b> {a.type} · #{a.orderId?.shortOrderId || a.orderId}
                    <div className="text-slate-400 text-xs">{a.reason} · requested by {a.requestedBy?.name}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleReview(a._id, true)} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium">Approve</button>
                    <button onClick={() => handleReview(a._id, false)} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium">Reject</button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </Card>
      )}

      <Card className="border-none shadow-sm">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-semibold text-slate-800">{isOwner ? "Audit Log" : "Your Audit Log"}</h3>
        </div>
        <ul className="divide-y divide-gray-100">
          {auditLog.items.length === 0 ? (
            <li className="px-4 py-6 text-center text-slate-400 text-sm">No actions logged yet.</li>
          ) : (
            auditLog.items.map((log) => (
              <li key={log._id} className="flex items-center justify-between px-4 py-3 text-sm gap-3">
                <div>
                  <b>{log.actorId?.name || "Unknown"}</b>
                  <span className="text-slate-400"> · {log.action.replace(/_/g, " ")} {log.orderId ? `· #${log.orderId.shortOrderId || log.orderId}` : ""}</span>
                  {log.reason && <div className="text-slate-400 text-xs">{log.reason}</div>}
                </div>
                <span className="text-slate-400 flex items-center gap-1 whitespace-nowrap"><HiOutlineClock className="w-3.5 h-3.5" />{formatTime(log.createdAt)}</span>
              </li>
            ))
          )}
        </ul>
      </Card>

      {isOwner && roles.length > 0 && (
        <Card className="border-none shadow-sm">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-slate-800">Operator Permission Matrix</h3>
            <p className="text-xs text-slate-400 mt-1">Read-only — edit under Staff &amp; Roles.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 border-b border-gray-100">
                  <th className="px-4 py-3">Capability</th>
                  {roles.map((r) => <th key={r._id} className="px-4 py-3">{r.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {CAPABILITY_ROWS.map((row) => (
                  <tr key={row.key}>
                    <td className="px-4 py-3">{row.label}</td>
                    {roles.map((r) => (
                      <td key={r._id} className="px-4 py-3 text-center">
                        {(r.permissions || []).includes(row.key) ? "●" : "○"}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td className="px-4 py-3">Money limit</td>
                  {roles.map((r) => (
                    <td key={r._id} className="px-4 py-3 text-center">
                      {r.moneyLimit === null || r.moneyLimit === undefined ? "Unlimited" : formatMoney(r.moneyLimit)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-3">2FA required</td>
                  {roles.map((r) => (
                    <td key={r._id} className="px-4 py-3 text-center">{r.requiresTwoFactor ? "●" : "○"}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default OperationsConsole;
