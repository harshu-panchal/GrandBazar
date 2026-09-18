import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import { useToast } from "@shared/components/ui/Toast";
import { adminApi } from "../services/adminApi";
import { AlertTriangle, RefreshCw, CheckCircle2 } from "lucide-react";

// The Operator/Admin "stuck orders" queue — previously there was no single
// place any role could see orders that need manual attention (a failed
// automatic rescue, or anything explicitly flagged for review).
const OperationsQueue = () => {
    const { showToast } = useToast();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [resolvingId, setResolvingId] = useState("");

    const fetchQueue = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await adminApi.getOperationsQueue({ limit: 50 });
            if (data.success) {
                setItems(data.result?.items || []);
            }
        } catch (error) {
            showToast("Failed to load operations queue", "error");
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        fetchQueue();
    }, [fetchQueue]);

    const handleResolve = async (orderId) => {
        const note = window.prompt("Resolution note (optional):", "");
        if (note === null) return;
        setResolvingId(orderId);
        try {
            await adminApi.resolveEscalation(orderId, note);
            showToast("Marked as resolved", "success");
            fetchQueue();
        } catch (error) {
            showToast(error.response?.data?.message || "Failed to resolve", "error");
        } finally {
            setResolvingId("");
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                        <AlertTriangle className="h-6 w-6 text-rose-500" />
                        Operations Queue
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Orders that need manual attention — a failed automatic rescue, or anything explicitly escalated.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={fetchQueue}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-wider hover:bg-slate-800"
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </button>
            </div>

            <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-2xl overflow-hidden">
                {loading ? (
                    <div className="p-10 text-center text-sm text-slate-400">Loading…</div>
                ) : items.length === 0 ? (
                    <div className="p-10 text-center text-sm text-slate-400">
                        <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                        Nothing needs attention right now.
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                            <tr>
                                <th className="px-4 py-3 text-left">Order</th>
                                <th className="px-4 py-3 text-left">Customer</th>
                                <th className="px-4 py-3 text-left">Store</th>
                                <th className="px-4 py-3 text-left">Reason</th>
                                <th className="px-4 py-3 text-left">Status</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {items.map((order) => (
                                <tr key={order._id}>
                                    <td className="px-4 py-3 font-bold text-slate-800">
                                        <Link to={`/admin/orders/${order.orderId}`} className="hover:underline">
                                            #{order.orderId}
                                        </Link>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">{order.customer?.name || "—"}</td>
                                    <td className="px-4 py-3 text-slate-600">{order.seller?.shopName || order.seller?.name || "—"}</td>
                                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                                        {order.operationalEscalation?.flagged
                                            ? order.operationalEscalation.reason
                                            : order.cancelReason || "Needs manual reassignment"}
                                    </td>
                                    <td className="px-4 py-3">
                                        <Badge variant={order.needsManualReassignment ? "danger" : "warning"}>
                                            {order.needsManualReassignment ? "Rescue failed" : "Escalated"}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            type="button"
                                            onClick={() => handleResolve(order.orderId)}
                                            disabled={resolvingId === order.orderId}
                                            className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 disabled:opacity-50"
                                        >
                                            Mark resolved
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Card>
        </div>
    );
};

export default OperationsQueue;
