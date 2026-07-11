import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Wallet,
  Gift,
  Ticket,
  Users,
  Clock,
  ChevronLeft,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";
import { customerApi } from "../services/customerApi";

const formatDate = (d) => {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const TABS = [
  { id: "overview", label: "Overview", icon: Wallet },
  { id: "cashback", label: "My Rewards", icon: Gift },
  { id: "coupons", label: "Coupons", icon: Ticket },
  { id: "history", label: "History", icon: Clock },
];

const RewardsPage = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [grants, setGrants] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [summaryRes, grantsRes, couponsRes, txnRes] = await Promise.all([
          customerApi.getRewardSummary(),
          customerApi.getRewardGrants({ limit: 50 }),
          customerApi.getMyRewardCoupons(),
          customerApi.getRewardTransactions({ limit: 50 }),
        ]);
        setSummary(summaryRes.data?.result ?? summaryRes.data?.data ?? null);
        setGrants(grantsRes.data?.result?.items ?? grantsRes.data?.result ?? []);
        setCoupons(couponsRes.data?.result ?? []);
        setTransactions(txnRes.data?.result?.items ?? txnRes.data?.result ?? []);
      } catch (err) {
        console.error("Rewards load error", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="bg-gradient-to-br from-primary-600 to-primary-800 text-white px-4 pt-6 pb-8">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-white/80 mb-4"
        >
          <ChevronLeft className="w-5 h-5" /> Back
        </button>
        <h1 className="text-2xl font-bold">Rewards Center</h1>
        <p className="text-white/80 text-sm mt-1">Cashback, coupons & referrals</p>
        <div className="mt-6 bg-white/10 rounded-2xl p-4 backdrop-blur">
          <p className="text-sm text-white/70">Wallet Balance</p>
          <p className="text-3xl font-black">₹{summary?.walletBalance ?? 0}</p>
          <div className="flex gap-4 mt-3 text-sm">
            <span>{summary?.pendingRewards ?? 0} pending</span>
            <span>{summary?.expiringSoon ?? 0} expiring soon</span>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 min-w-[80px] py-3 text-xs font-semibold flex flex-col items-center gap-1 ${
                tab === id ? "text-primary-600 border-b-2 border-primary-600" : "text-slate-500"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {loading ? (
          <p className="text-slate-500 text-center py-8">Loading...</p>
        ) : (
          <>
            {tab === "overview" && (
              <>
                <button
                  type="button"
                  onClick={() => navigate("/refer-and-earn")}
                  className="w-full bg-white rounded-xl p-4 border border-slate-100 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <Users className="w-8 h-8 text-primary-600" />
                    <div className="text-left">
                      <p className="font-semibold">Refer & Earn</p>
                      <p className="text-sm text-slate-500">
                        {summary?.totalReferrals ?? 0} referrals · Code: {summary?.referralCode || "—"}
                      </p>
                    </div>
                  </div>
                  <span className="text-primary-600 text-sm font-medium">Share →</span>
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-xl p-4 border border-slate-100">
                    <p className="text-sm text-slate-500">Active Rewards</p>
                    <p className="text-xl font-bold">
                      {grants.filter((g) => g.status === "active").length}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl p-4 border border-slate-100">
                    <p className="text-sm text-slate-500">Available Coupons</p>
                    <p className="text-xl font-bold">{coupons.filter((c) => c.canUse).length}</p>
                  </div>
                </div>
              </>
            )}

            {tab === "cashback" &&
              (grants.length === 0 ? (
                <p className="text-slate-500 text-center py-8">No rewards yet. Shop to earn cashback!</p>
              ) : (
                grants.map((g) => (
                  <div key={g._id} className="bg-white rounded-xl p-4 border border-slate-100">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{g.campaignId?.name || g.rewardSubtype}</p>
                        <p className="text-xs text-slate-500">{formatDate(g.createdAt)}</p>
                      </div>
                      <span className="font-bold text-green-600">+₹{g.amount}</span>
                    </div>
                    <span className="text-xs mt-2 inline-block px-2 py-0.5 rounded-full bg-slate-100 capitalize">
                      {g.status}
                    </span>
                  </div>
                ))
              ))}

            {tab === "coupons" &&
              (coupons.length === 0 ? (
                <p className="text-slate-500 text-center py-8">No coupons available</p>
              ) : (
                coupons.map((c) => (
                  <div key={c._id} className="bg-white rounded-xl p-4 border border-slate-100">
                    <p className="font-mono font-bold text-primary-600">{c.code}</p>
                    <p className="text-sm text-slate-600">{c.title || c.description}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Valid till {formatDate(c.validTill)}
                    </p>
                  </div>
                ))
              ))}

            {tab === "history" &&
              (transactions.length === 0 ? (
                <p className="text-slate-500 text-center py-8">No transactions yet</p>
              ) : (
                transactions.map((t) => (
                  <div key={t._id} className="bg-white rounded-xl p-4 border border-slate-100 flex items-center gap-3">
                    {t.type === "credit" ? (
                      <ArrowDownLeft className="w-5 h-5 text-green-600" />
                    ) : (
                      <ArrowUpRight className="w-5 h-5 text-red-500" />
                    )}
                    <div className="flex-1">
                      <p className="font-medium text-sm">{t.reason || t.type}</p>
                      <p className="text-xs text-slate-400">{formatDate(t.createdAt)}</p>
                    </div>
                    <span className={`font-bold ${t.type === "credit" ? "text-green-600" : "text-red-500"}`}>
                      {t.type === "credit" ? "+" : "-"}₹{t.amount}
                    </span>
                  </div>
                ))
              ))}
          </>
        )}
      </div>
    </div>
  );
};

export default RewardsPage;
