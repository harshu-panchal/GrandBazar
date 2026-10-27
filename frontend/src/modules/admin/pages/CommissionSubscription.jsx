import React, { useEffect, useState, useCallback } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import PageHeader from "@shared/components/ui/PageHeader";
import StatCard from "@shared/components/ui/StatCard";
import { HiOutlineReceiptPercent, HiOutlineDocumentText, HiOutlineUserGroup, HiOutlineClock } from "react-icons/hi2";
import { toast } from "sonner";
import { adminApi } from "../services/adminApi";

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

// Read-only accountant view combining the two existing admin screens that
// hold commission and subscription data (BillingCharges/CityCommissions for
// commission rates, the subscription endpoints for plan revenue) — no new
// backend endpoints, just one consolidated page under the Accountant nav.
const CommissionSubscription = () => {
  const [cityCommissions, setCityCommissions] = useState([]);
  const [overview, setOverview] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [cityRes, overviewRes, paymentsRes] = await Promise.all([
        adminApi.getCityCommissions(),
        adminApi.getSubscriptionOverview(),
        adminApi.getSubscriptionPayments({ status: "CAPTURED", limit: 10 }),
      ]);
      if (cityRes?.data?.success) setCityCommissions(cityRes.data.result || cityRes.data.results || []);
      if (overviewRes?.data?.success) setOverview(overviewRes.data.result);
      if (paymentsRes?.data?.success) {
        const result = paymentsRes.data.result || {};
        setPayments(result.items || result.payments || (Array.isArray(result) ? result : []));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load commission & subscription data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Commission & Subscription"
        description="City-wise commission rates and seller subscription revenue — read-only accountant view."
        badge={<Badge variant="info">Accountant</Badge>}
      />

      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active Subscriptions" value={overview.activeSubscriptions} icon={HiOutlineUserGroup} color="text-brand-600" bg="bg-brand-50" />
          <StatCard label="Active Plans" value={`${overview.activePlanCount} / ${overview.planCount}`} icon={HiOutlineDocumentText} color="text-violet-600" bg="bg-violet-50" />
          <StatCard label="Captured Payments" value={overview.capturedRazorpayPayments} icon={HiOutlineReceiptPercent} color="text-emerald-600" bg="bg-emerald-50" />
          <StatCard label="Pending Payment Requests" value={overview.pendingRequests} icon={HiOutlineClock} color="text-amber-600" bg="bg-amber-50" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-none shadow-sm">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-slate-800">Commission — city-wise rates</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 border-b border-gray-100">
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
                ) : cityCommissions.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">No city commission rates configured.</td></tr>
                ) : (
                  cityCommissions.map((row) => (
                    <tr key={row._id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-700">{row.cityName || row.cityKey}</td>
                      <td className="px-4 py-3">
                        <Badge variant={row.applyCommission && row.enabled ? "success" : "gray"}>
                          {row.applyCommission && row.enabled ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.adminCommissionType === "percentage"
                          ? `${row.adminCommissionValue}%`
                          : formatMoney(row.adminCommissionValue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="border-none shadow-sm">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-slate-800">Subscription — recent captured payments</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {payments.length === 0 ? (
              <li className="px-4 py-6 text-center text-slate-400 text-sm">No subscription payments yet.</li>
            ) : (
              payments.map((p) => (
                <li key={p._id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="text-slate-600">
                    {p.sellerId?.shopName || p.sellerId?.name || "Seller"} · {p.planSnapshot?.name || "Plan"}
                  </span>
                  <span className="font-semibold">{formatMoney(p.amount)}</span>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>

      <p className="text-xs font-bold uppercase text-slate-400">This ledger is always shown apart from seller GMV.</p>
    </div>
  );
};

export default CommissionSubscription;
