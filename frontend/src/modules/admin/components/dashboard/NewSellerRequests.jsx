import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, X, Eye } from "lucide-react";
import { toast } from "sonner";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import { adminApi } from "../../services/adminApi";

const kycLabel = (seller) => {
  const docs = seller.documents || [];
  return docs.length >= 3 ? "Verified" : "Pending";
};

const planLabel = (seller) => {
  if (seller.businessModel === "subscription") return "Subscription";
  if (seller.businessModel === "commission") return "Commission";
  return seller.businessModel || "—";
};

const NewSellerRequests = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  const fetchPending = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.getPendingSellers({ status: "pending", page: 1, limit: 8 });
      const payload = res.data?.result || res.data || {};
      setItems(payload.items || []);
    } catch (error) {
      console.error("Failed to load seller requests", error);
      toast.error(error.response?.data?.message || "Failed to load seller requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  const handleApprove = async (id) => {
    if (!window.confirm("Approve this seller application?")) return;
    setProcessingId(id);
    try {
      await adminApi.approveSeller(id);
      toast.success("Seller approved successfully");
      await fetchPending();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to approve seller");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id) => {
    if (!window.confirm("Reject this application?")) return;
    const reason = window.prompt("Optional rejection reason:") || "";
    setProcessingId(id);
    try {
      await adminApi.rejectSeller(id, { reason });
      toast.success("Seller application rejected");
      await fetchPending();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to reject seller");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <Card
      title="New Seller Requests"
      subtitle="Pending applications"
      headerAction={
        <Link to="/admin/sellers/pending" className="text-xs font-semibold text-primary hover:text-primary/80">
          View All
        </Link>
      }
      contentClassName="p-0"
      className="h-full"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] font-bold uppercase text-slate-400 border-b border-slate-100 bg-slate-50/50">
              <th className="px-4 py-3">Seller</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Requested</th>
              <th className="px-4 py-3">KYC</th>
              <th className="px-4 py-3">Shop</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-xs text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-xs text-slate-400">
                  No pending seller requests
                </td>
              </tr>
            ) : (
              items.map((seller) => {
                const busy = processingId === seller.id;
                return (
                  <tr key={seller.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900">{seller.ownerName}</p>
                      <p className="text-[10px] text-slate-400">{seller.email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{seller.city || "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{seller.applicationDate}</td>
                    <td className="px-4 py-3">
                      <Badge variant={kycLabel(seller) === "Verified" ? "success" : "warning"} className="text-[10px]">
                        {kycLabel(seller)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-700 max-w-[140px] truncate">
                      {seller.shopName}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 capitalize">{planLabel(seller)}</td>
                    <td className="px-4 py-3">
                      <Badge variant="warning" className="text-[10px] capitalize">
                        {seller.status || "pending"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleApprove(seller.id)}
                          className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-50 flex items-center justify-center"
                          title="Approve"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleReject(seller.id)}
                          className="h-8 w-8 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 disabled:opacity-50 flex items-center justify-center"
                          title="Reject"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <Link
                          to="/admin/sellers/pending"
                          className="h-8 w-8 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 flex items-center justify-center"
                          title="View"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export default NewSellerRequests;
