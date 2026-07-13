import React, { useEffect, useMemo, useState } from "react";
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
  Copy,
  ShoppingBag,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { customerApi } from "../services/customerApi";
import { useToast } from "@shared/components/ui/Toast";

const formatDate = (d) => {
  if (!d) return "";
  const date = new Date(d);
  const now = new Date();
  const diff = now - date;
  if (diff < 86400000) return `Today, ${date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
  if (diff < 172800000) return `Yesterday, ${date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const STATUS_STYLES = {
  active: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  reversed: "bg-red-100 text-red-700",
  expired: "bg-slate-100 text-slate-600",
  redeemed: "bg-blue-100 text-blue-700",
};

const TABS = [
  { id: "overview", label: "Overview", icon: Wallet },
  { id: "cashback", label: "My Rewards", icon: Gift },
  { id: "coupons", label: "Coupons", icon: Ticket },
  { id: "history", label: "History", icon: Clock },
];

const RewardsPage = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [tab, setTab] = useState("overview");
  const [grantFilter, setGrantFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [grants, setGrants] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [transactions, setTransactions] = useState([]);

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

  useEffect(() => {
    load();
  }, []);

  const filteredGrants = useMemo(() => {
    if (grantFilter === "all") return grants;
    return grants.filter((g) => g.status === grantFilter);
  }, [grants, grantFilter]);

  const stats = useMemo(() => ({
    active: grants.filter((g) => g.status === "active").length,
    pending: grants.filter((g) => g.status === "pending").length,
    totalEarned: grants.filter((g) => ["active", "redeemed"].includes(g.status)).reduce((s, g) => s + (g.amount || 0), 0),
    availableCoupons: coupons.filter((c) => c.canUse !== false).length,
  }), [grants, coupons]);

  const copyCoupon = (code) => {
    navigator.clipboard.writeText(code);
    showToast(`Coupon ${code} copied!`, "success");
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary-600 via-primary-700 to-violet-800 text-white px-4 pt-6 pb-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1 text-white/80 mb-4 relative z-10">
          <ChevronLeft className="w-5 h-5" /> Back
        </button>
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-black">Rewards Center</h1>
            <p className="text-white/75 text-sm mt-1">Cashback wallet · Coupons · Referrals</p>
          </div>
          <button type="button" onClick={load} className="p-2 bg-white/10 rounded-xl backdrop-blur">
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="mt-6 bg-white/10 rounded-2xl p-5 backdrop-blur border border-white/10 relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/70 font-medium">Available Wallet Balance</p>
              <p className="text-4xl font-black mt-1">₹{(summary?.walletBalance ?? 0).toLocaleString("en-IN")}</p>
            </div>
            <div className="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center">
              <Wallet className="w-7 h-7" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/10">
            <div className="text-center">
              <p className="text-lg font-bold">{summary?.pendingRewards ?? 0}</p>
              <p className="text-[10px] text-white/60 uppercase tracking-wide">Pending</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">{summary?.expiringSoon ?? 0}</p>
              <p className="text-[10px] text-white/60 uppercase tracking-wide">Expiring</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">₹{stats.totalEarned}</p>
              <p className="text-[10px] text-white/60 uppercase tracking-wide">Total Earned</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 -mt-5 relative z-20">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 flex overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 min-w-[76px] py-3.5 text-[11px] font-bold flex flex-col items-center gap-1 transition-colors ${
                tab === id ? "text-primary-600 border-b-2 border-primary-600 bg-primary-50/50" : "text-slate-500"
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
          <div className="py-16 text-center text-slate-500">Loading your rewards...</div>
        ) : (
          <>
            {/* OVERVIEW */}
            {tab === "overview" && (
              <>
                <button
                  type="button"
                  onClick={() => navigate("/refer-and-earn")}
                  className="w-full bg-gradient-to-r from-violet-500 to-primary-600 text-white rounded-2xl p-4 flex items-center justify-between shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                      <Users className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                      <p className="font-bold">Refer & Earn</p>
                      <p className="text-sm text-white/80">
                        {summary?.totalReferrals ?? 0} friends invited · {summary?.rewardedReferrals ?? 0} rewarded
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-bold bg-white/20 px-3 py-1 rounded-full">
                    {summary?.referralCode || "Get Code"} →
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Active Rewards", value: stats.active, icon: Gift, color: "text-green-600", bg: "bg-green-50" },
                    { label: "Available Coupons", value: stats.availableCoupons, icon: Ticket, color: "text-primary-600", bg: "bg-primary-50" },
                    { label: "Pending Cashback", value: stats.pending, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
                    { label: "Lifetime Earned", value: `₹${stats.totalEarned}`, icon: Sparkles, color: "text-violet-600", bg: "bg-violet-50" },
                  ].map((item) => (
                    <div key={item.label} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
                      <div className={`w-9 h-9 ${item.bg} rounded-lg flex items-center justify-center mb-2`}>
                        <item.icon className={`w-4 h-4 ${item.color}`} />
                      </div>
                      <p className="text-xl font-black text-slate-800">{item.value}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{item.label}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-100">
                  <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-primary-600" />
                    How to earn rewards
                  </h3>
                  <ol className="space-y-3 text-sm text-slate-600">
                    {[
                      "Shop and complete your order — rewards credit when order is delivered",
                      "Use coupons at checkout for instant discounts",
                      "Refer friends — both of you earn when they place their first order",
                      "Use wallet balance on your next purchase at checkout",
                    ].map((step, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                          {i + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>

                {grants.slice(0, 3).length > 0 && (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-bold text-slate-800 text-sm">Recent Rewards</h3>
                      <button type="button" onClick={() => setTab("cashback")} className="text-xs text-primary-600 font-semibold">View all</button>
                    </div>
                    {grants.slice(0, 3).map((g) => (
                      <div key={g._id} className="bg-white rounded-xl p-3 border border-slate-100 mb-2 flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-sm">{g.campaignId?.name || g.rewardSubtype?.replace(/_/g, " ")}</p>
                          <p className="text-xs text-slate-400">{formatDate(g.createdAt)}</p>
                        </div>
                        <span className="font-bold text-green-600">+₹{g.amount}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* MY REWARDS */}
            {tab === "cashback" && (
              <>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {["all", "active", "pending", "expired", "reversed"].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setGrantFilter(f)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold capitalize whitespace-nowrap ${
                        grantFilter === f ? "bg-primary-600 text-white" : "bg-white border border-slate-200 text-slate-600"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                {filteredGrants.length === 0 ? (
                  <div className="bg-white rounded-xl p-10 text-center border border-slate-100">
                    <Gift className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="font-semibold text-slate-700">No rewards yet</p>
                    <p className="text-sm text-slate-500 mt-1">Complete orders to earn cashback automatically</p>
                    <button type="button" onClick={() => navigate("/")} className="mt-4 px-5 py-2 bg-primary-600 text-white rounded-xl text-sm font-bold">
                      Start Shopping
                    </button>
                  </div>
                ) : (
                  filteredGrants.map((g) => (
                    <div key={g._id} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex-1">
                          <p className="font-bold text-slate-800">{g.campaignId?.name || g.rewardSubtype?.replace(/_/g, " ")}</p>
                          <p className="text-xs text-slate-500 mt-0.5 capitalize">{g.campaignType} · {g.rewardSubtype?.replace(/_/g, " ")}</p>
                          {g.orderPublicId && (
                            <p className="text-[10px] text-slate-400 mt-1">Order #{g.orderPublicId}</p>
                          )}
                          <p className="text-xs text-slate-400 mt-1">{formatDate(g.createdAt)}</p>
                          {g.expiresAt && (
                            <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              Expires {formatDate(g.expiresAt)}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="font-black text-lg text-green-600">+₹{g.amount}</span>
                          <span className={`block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 capitalize ${STATUS_STYLES[g.status] || STATUS_STYLES.expired}`}>
                            {g.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </>
            )}

            {/* COUPONS */}
            {tab === "coupons" && (
              coupons.length === 0 ? (
                <div className="bg-white rounded-xl p-10 text-center border border-slate-100">
                  <Ticket className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="font-semibold text-slate-700">No coupons available</p>
                  <p className="text-sm text-slate-500 mt-1">Check back for promotional offers</p>
                </div>
              ) : (
                coupons.map((c) => (
                  <div key={c._id} className="bg-white rounded-xl p-4 border border-slate-100 border-l-4 border-l-primary-500 shadow-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-mono font-black text-primary-600 text-lg tracking-wider">{c.code}</p>
                        <p className="font-semibold text-slate-800 mt-1">{c.title || "Special Offer"}</p>
                        <p className="text-sm text-slate-500 mt-0.5">{c.description}</p>
                        <div className="flex flex-wrap gap-2 mt-2 text-[10px]">
                          {c.discountType === "percentage" && (
                            <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-bold">{c.discountValue}% OFF</span>
                          )}
                          {c.discountType === "fixed" && (
                            <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-bold">₹{c.discountValue} OFF</span>
                          )}
                          {c.discountType === "free_delivery" && (
                            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold">FREE DELIVERY</span>
                          )}
                          {c.minOrderValue > 0 && (
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">Min ₹{c.minOrderValue}</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-2">Valid till {formatDate(c.validTill)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyCoupon(c.code)}
                        className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200"
                        title="Copy code"
                      >
                        <Copy className="w-4 h-4 text-slate-600" />
                      </button>
                    </div>
                    {c.canUse === false && (
                      <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Usage limit reached
                      </p>
                    )}
                  </div>
                ))
              )
            )}

            {/* HISTORY */}
            {tab === "history" && (
              transactions.length === 0 ? (
                <div className="bg-white rounded-xl p-10 text-center border border-slate-100">
                  <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="font-semibold text-slate-700">No transactions yet</p>
                  <p className="text-sm text-slate-500 mt-1">Wallet credits and debits appear here</p>
                </div>
              ) : (
                transactions.map((t) => (
                  <div key={t._id} className="bg-white rounded-xl p-4 border border-slate-100 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.type === "credit" ? "bg-green-50" : "bg-red-50"}`}>
                      {t.type === "credit" ? (
                        <ArrowDownLeft className="w-5 h-5 text-green-600" />
                      ) : (
                        <ArrowUpRight className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{t.reason || t.type}</p>
                      {t.orderPublicId && <p className="text-[10px] text-slate-400">Order #{t.orderPublicId}</p>}
                      <p className="text-xs text-slate-400">{formatDate(t.createdAt)}</p>
                      {t.balanceAfter != null && (
                        <p className="text-[10px] text-slate-400">Balance: ₹{t.balanceAfter}</p>
                      )}
                    </div>
                    <span className={`font-black text-base shrink-0 ${t.type === "credit" ? "text-green-600" : "text-red-500"}`}>
                      {t.type === "credit" ? "+" : "-"}₹{t.amount}
                    </span>
                  </div>
                ))
              )
            )}
          </>
        )}
      </div>

      {/* Sticky CTA */}
      {tab === "overview" && !loading && (
        <div className="fixed bottom-20 left-0 right-0 px-4 z-30">
          <button
            type="button"
            onClick={() => navigate("/checkout")}
            className="w-full py-3.5 bg-primary-600 text-white rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5" />
            Use Wallet at Checkout
          </button>
        </div>
      )}
    </div>
  );
};

export default RewardsPage;
