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
  Bell,
  Banknote,
  Hourglass,
  History,
  BadgeCheck,
} from "lucide-react";
import { customerApi } from "../services/customerApi";
import { useToast } from "@shared/components/ui/Toast";

const formatDate = (d) => {
  if (!d) return "";
  const date = new Date(d);
  const now = new Date();
  const diff = now - date;
  if (diff < 86400000) {
    return `Today, ${date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
  if (diff < 172800000) {
    return `Yesterday, ${date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const STATUS_STYLES = {
  active: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  reversed: "bg-red-100 text-red-700",
  expired: "bg-slate-100 text-slate-600",
  redeemed: "bg-blue-100 text-blue-700",
  cancelled: "bg-slate-100 text-slate-500",
  registered: "bg-amber-100 text-amber-700",
  first_order: "bg-blue-100 text-blue-700",
  rewarded: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const EmptyState = ({ icon: Icon, title, subtitle, actionLabel, onAction }) => (
  <div className="bg-white rounded-xl p-10 text-center border border-slate-100">
    <Icon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
    <p className="font-semibold text-slate-700">{title}</p>
    {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="mt-4 px-5 py-2 bg-primary-600 text-white rounded-xl text-sm font-bold"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

const GrantCard = ({ g }) => (
  <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
    <div className="flex justify-between items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="font-bold text-slate-800 truncate">
          {g.campaignId?.name || g.rewardSubtype?.replace(/_/g, " ")}
        </p>
        <p className="text-xs text-slate-500 mt-0.5 capitalize">
          {g.campaignType} · {g.rewardSubtype?.replace(/_/g, " ")}
        </p>
        {g.orderPublicId && (
          <p className="text-[10px] text-slate-400 mt-1">Order #{g.orderPublicId}</p>
        )}
        <p className="text-xs text-slate-400 mt-1">{formatDate(g.createdAt)}</p>
        {g.expiresAt && g.status === "active" && (
          <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Expires {formatDate(g.expiresAt)}
          </p>
        )}
        {g.remainingAmount != null &&
          g.campaignType !== "coupon" &&
          g.status === "active" && (
            <p className="text-[10px] text-slate-500 mt-1">
              Remaining ₹{Number(g.remainingAmount || 0).toLocaleString("en-IN")}
            </p>
          )}
      </div>
      <div className="text-right shrink-0">
        <span className="font-black text-lg text-green-600">
          {g.campaignType === "coupon"
            ? g.meta?.couponCode || g.linkedCouponId?.code || "Voucher"
            : `+₹${g.amount}`}
        </span>
        <span
          className={`block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 capitalize ${
            STATUS_STYLES[g.status] || STATUS_STYLES.expired
          }`}
        >
          {g.status}
        </span>
      </div>
    </div>
  </div>
);

const RewardsPage = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [tab, setTab] = useState("overview");
  const [grantFilter, setGrantFilter] = useState("available");
  const [couponView, setCouponView] = useState("available");
  const [historyView, setHistoryView] = useState("rewards");
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [grants, setGrants] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [couponHistory, setCouponHistory] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [notifications, setNotifications] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const [
        summaryRes,
        grantsRes,
        couponsRes,
        couponHistRes,
        txnRes,
        referralsRes,
        notifRes,
      ] = await Promise.all([
        customerApi.getRewardSummary(),
        customerApi.getRewardGrants({ limit: 100 }),
        customerApi.getMyRewardCoupons(),
        customerApi.getCouponHistory({ limit: 50 }),
        customerApi.getRewardTransactions({ limit: 50 }),
        customerApi.getMyReferrals({ limit: 50 }),
        customerApi.getRewardNotifications({ limit: 50 }),
      ]);
      setSummary(summaryRes.data?.result ?? summaryRes.data?.data ?? null);
      setGrants(grantsRes.data?.result?.items ?? grantsRes.data?.result ?? []);
      setCoupons(couponsRes.data?.result ?? []);
      setCouponHistory(
        couponHistRes.data?.result?.items ?? couponHistRes.data?.result ?? [],
      );
      setTransactions(txnRes.data?.result?.items ?? txnRes.data?.result ?? []);
      setReferrals(
        referralsRes.data?.result?.items ?? referralsRes.data?.result ?? [],
      );
      setNotifications(
        notifRes.data?.result?.items ?? notifRes.data?.result ?? [],
      );
    } catch (err) {
      console.error("Rewards load error", err);
      showToast("Failed to load rewards", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const cashbackGrants = useMemo(
    () => grants.filter((g) => g.campaignType === "cashback"),
    [grants],
  );
  const rewardGrants = useMemo(
    () =>
      grants.filter(
        (g) => g.campaignType === "reward" || g.campaignType === "referral",
      ),
    [grants],
  );
  const voucherGrants = useMemo(
    () => grants.filter((g) => g.campaignType === "coupon"),
    [grants],
  );

  const filterGrants = (list, filter) => {
    const now = Date.now();
    const in7 = now + 7 * 86400000;
    switch (filter) {
      case "available":
        return list.filter(
          (g) =>
            g.status === "active" &&
            (!g.expiresAt || new Date(g.expiresAt).getTime() > now),
        );
      case "pending":
        return list.filter((g) => g.status === "pending");
      case "expiring":
        return list.filter(
          (g) =>
            g.status === "active" &&
            g.expiresAt &&
            new Date(g.expiresAt).getTime() >= now &&
            new Date(g.expiresAt).getTime() <= in7,
        );
      case "used":
        return list.filter((g) =>
          ["redeemed", "expired"].includes(g.status),
        );
      case "redeemed":
        return list.filter((g) => g.status === "redeemed");
      case "expired":
        return list.filter((g) => g.status === "expired");
      default:
        return list;
    }
  };

  const copyText = (text, label = "Copied") => {
    navigator.clipboard.writeText(text);
    showToast(label, "success");
  };

  const goTab = (id, filter) => {
    setTab(id);
    if (filter) setGrantFilter(filter);
  };

  const overviewCards = [
    {
      label: "Wallet Balance",
      value: `₹${Number(summary?.walletBalance || 0).toLocaleString("en-IN")}`,
      icon: Wallet,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      onClick: () => goTab("history", null),
    },
    {
      label: "Available Rewards",
      value: summary?.availableRewards ?? 0,
      icon: Sparkles,
      color: "text-green-600",
      bg: "bg-green-50",
      onClick: () => goTab("rewards", "available"),
    },
    {
      label: "Pending Rewards",
      value: summary?.pendingRewards ?? 0,
      icon: Hourglass,
      color: "text-amber-600",
      bg: "bg-amber-50",
      onClick: () => goTab("rewards", "pending"),
    },
    {
      label: "Expiring Soon",
      value: summary?.expiringSoon ?? 0,
      icon: AlertCircle,
      color: "text-orange-600",
      bg: "bg-orange-50",
      onClick: () => goTab("rewards", "expiring"),
    },
    {
      label: "Used Rewards",
      value: summary?.usedRewards ?? 0,
      icon: BadgeCheck,
      color: "text-blue-600",
      bg: "bg-blue-50",
      onClick: () => goTab("rewards", "used"),
    },
    {
      label: "My Coupons",
      value: coupons.filter((c) => c.canUse !== false).length,
      icon: Ticket,
      color: "text-primary-600",
      bg: "bg-primary-50",
      onClick: () => {
        setCouponView("available");
        setTab("coupons");
      },
    },
  ];

  const renderGrantList = (list, emptyTitle) => {
    const filtered = filterGrants(list, grantFilter);
    if (filtered.length === 0) {
      return (
        <EmptyState
          icon={Gift}
          title={emptyTitle}
          subtitle="Shop and complete orders to earn more"
          actionLabel="Start Shopping"
          onAction={() => navigate("/")}
        />
      );
    }
    return filtered.map((g) => <GrantCard key={g._id} g={g} />);
  };

  const grantFilters = [
    { id: "available", label: "Available" },
    { id: "pending", label: "Pending" },
    { id: "expiring", label: "Expiring" },
    { id: "used", label: "Used" },
    { id: "all", label: "All" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <div className="bg-gradient-to-br from-primary-600 via-primary-700 to-violet-800 text-white px-4 pt-6 pb-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-white/80 mb-4 relative z-10"
        >
          <ChevronLeft className="w-5 h-5" /> Back
        </button>
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-black">Rewards Center</h1>
            <p className="text-white/75 text-sm mt-1">
              Cashback · Coupons · Referrals · Alerts
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="p-2 bg-white/10 rounded-xl backdrop-blur"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="mt-6 bg-white/10 rounded-2xl p-5 backdrop-blur border border-white/10 relative z-10 mb-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/70 font-medium">Wallet Balance</p>
              <p className="text-4xl font-black mt-1">
                ₹{Number(summary?.walletBalance || 0).toLocaleString("en-IN")}
              </p>
              <p className="text-xs text-white/60 mt-1">
                Cashback earned ₹
                {Number(summary?.totalCashbackEarned || 0).toLocaleString("en-IN")}
              </p>
            </div>
            <div className="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center">
              <Wallet className="w-7 h-7" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-white/10">
            {[
              { label: "Available", value: summary?.availableRewards ?? 0 },
              { label: "Pending", value: summary?.pendingRewards ?? 0 },
              { label: "Expiring", value: summary?.expiringSoon ?? 0 },
              { label: "Used", value: summary?.usedRewards ?? 0 },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <p className="text-lg font-bold">{item.value}</p>
                <p className="text-[10px] text-white/60 uppercase tracking-wide">
                  {item.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {loading ? (
          <div className="py-16 text-center text-slate-500">
            Loading your rewards...
          </div>
        ) : (
          <>
            {tab !== "overview" && (
              <button
                type="button"
                onClick={() => setTab("overview")}
                className="flex items-center gap-1 text-sm font-bold text-slate-600"
              >
                <ChevronLeft className="w-4 h-4" />
                Back to Overview
              </button>
            )}

            {tab === "overview" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {overviewCards.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={item.onClick}
                      className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm text-left active:scale-[0.98] transition"
                    >
                      <div
                        className={`w-9 h-9 ${item.bg} rounded-lg flex items-center justify-center mb-2`}
                      >
                        <item.icon className={`w-4 h-4 ${item.color}`} />
                      </div>
                      <p className="text-xl font-black text-slate-800">
                        {item.value}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{item.label}</p>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => goTab("cashback", "available")}
                    className="bg-white rounded-xl p-4 border border-slate-100 text-left"
                  >
                    <Banknote className="w-5 h-5 text-emerald-600 mb-2" />
                    <p className="font-bold text-sm">My Cashback</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {cashbackGrants.length} entries
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTab("referrals");
                    }}
                    className="bg-white rounded-xl p-4 border border-slate-100 text-left"
                  >
                    <Users className="w-5 h-5 text-violet-600 mb-2" />
                    <p className="font-bold text-sm">My Referrals</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {summary?.totalReferrals ?? 0} invited
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryView("rewards");
                      setTab("history");
                    }}
                    className="bg-white rounded-xl p-4 border border-slate-100 text-left"
                  >
                    <History className="w-5 h-5 text-slate-600 mb-2" />
                    <p className="font-bold text-sm">Reward History</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {transactions.length} txns
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("alerts")}
                    className="bg-white rounded-xl p-4 border border-slate-100 text-left"
                  >
                    <Bell className="w-5 h-5 text-rose-600 mb-2" />
                    <p className="font-bold text-sm">Notifications</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {notifications.length} alerts
                    </p>
                  </button>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-100">
                  <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-primary-600" />
                    How rewards work
                  </h3>
                  <ol className="space-y-3 text-sm text-slate-600">
                    {[
                      "Cashback & rewards credit after delivery",
                      "Use wallet balance or coupons at checkout",
                      "Refer friends — earn when they order",
                      "Track pending, expiring & used rewards here",
                    ].map((step, i) => (
                      <li key={step} className="flex gap-3">
                        <span className="w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                          {i + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              </>
            )}

            {(tab === "cashback" || tab === "rewards") && (
              <>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {grantFilters.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setGrantFilter(f.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${
                        grantFilter === f.id
                          ? "bg-primary-600 text-white"
                          : "bg-white border border-slate-200 text-slate-600"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                {tab === "cashback"
                  ? renderGrantList(cashbackGrants, "No cashback yet")
                  : renderGrantList(rewardGrants, "No rewards yet")}
              </>
            )}

            {tab === "coupons" && (
              <>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {[
                    { id: "available", label: "My Coupons" },
                    { id: "vouchers", label: "Vouchers" },
                    { id: "history", label: "Coupon History" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setCouponView(f.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${
                        couponView === f.id
                          ? "bg-primary-600 text-white"
                          : "bg-white border border-slate-200 text-slate-600"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {couponView === "history" ? (
                  couponHistory.length === 0 ? (
                    <EmptyState
                      icon={Ticket}
                      title="No coupon history"
                      subtitle="Used coupons will appear here"
                    />
                  ) : (
                    couponHistory.map((row) => (
                      <div
                        key={row._id}
                        className="bg-white rounded-xl p-4 border border-slate-100 flex justify-between gap-3"
                      >
                        <div>
                          <p className="font-mono font-bold text-primary-600">
                            {row.couponCode || row.couponId?.code || "—"}
                          </p>
                          <p className="text-sm text-slate-700 mt-0.5">
                            {row.couponId?.title || "Coupon used"}
                          </p>
                          {row.orderPublicId && (
                            <p className="text-[10px] text-slate-400 mt-1">
                              Order #{row.orderPublicId}
                            </p>
                          )}
                          <p className="text-xs text-slate-400 mt-1">
                            {formatDate(row.redeemedAt || row.createdAt)}
                          </p>
                        </div>
                        <span className="font-black text-green-600">
                          −₹{Number(row.discountAmount || 0)}
                        </span>
                      </div>
                    ))
                  )
                ) : couponView === "vouchers" ? (
                  voucherGrants.length === 0 ? (
                    <EmptyState
                      icon={Ticket}
                      title="No digital vouchers"
                      subtitle="Reward vouchers issued to you show here"
                    />
                  ) : (
                    voucherGrants.map((g) => <GrantCard key={g._id} g={g} />)
                  )
                ) : coupons.length === 0 ? (
                  <EmptyState
                    icon={Ticket}
                    title="No coupons available"
                    subtitle="Check back for promotional offers"
                  />
                ) : (
                  coupons.map((c) => (
                    <div
                      key={c._id}
                      className="bg-white rounded-xl p-4 border border-slate-100 border-l-4 border-l-primary-500 shadow-sm"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-mono font-black text-primary-600 text-lg tracking-wider">
                            {c.code}
                          </p>
                          <p className="font-semibold text-slate-800 mt-1">
                            {c.title || "Special Offer"}
                          </p>
                          <p className="text-sm text-slate-500 mt-0.5">
                            {c.description}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2 text-[10px]">
                            {c.discountType === "percentage" && (
                              <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-bold">
                                {c.discountValue}% OFF
                              </span>
                            )}
                            {c.discountType === "fixed" && (
                              <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-bold">
                                ₹{c.discountValue} OFF
                              </span>
                            )}
                            {c.discountType === "free_delivery" && (
                              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                                FREE DELIVERY
                              </span>
                            )}
                            {c.source === "digital_voucher" && (
                              <span className="bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full font-bold">
                                Digital Voucher
                              </span>
                            )}
                            {c.minOrderValue > 0 && (
                              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                                Min ₹{c.minOrderValue}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-2">
                            Valid till {formatDate(c.validTill || c.expiresAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            copyText(c.code, `Coupon ${c.code} copied!`)
                          }
                          className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200"
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
                )}
              </>
            )}

            {tab === "referrals" && (
              <>
                <div className="bg-gradient-to-r from-violet-500 to-primary-600 text-white rounded-2xl p-5">
                  <p className="text-sm text-white/80">Your referral code</p>
                  <div className="flex items-center justify-between mt-2 gap-3">
                    <p className="text-2xl font-black tracking-widest">
                      {summary?.referralCode || "—"}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        summary?.referralCode &&
                        copyText(summary.referralCode, "Referral code copied")
                      }
                      className="p-2 bg-white/20 rounded-xl"
                    >
                      <Copy className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/20 text-center">
                    <div>
                      <p className="text-xl font-bold">
                        {summary?.totalReferrals ?? 0}
                      </p>
                      <p className="text-[10px] text-white/70 uppercase">
                        Invited
                      </p>
                    </div>
                    <div>
                      <p className="text-xl font-bold">
                        {summary?.rewardedReferrals ?? 0}
                      </p>
                      <p className="text-[10px] text-white/70 uppercase">
                        Rewarded
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate("/refer-and-earn")}
                    className="mt-4 w-full py-2.5 bg-white text-primary-700 rounded-xl font-bold text-sm"
                  >
                    Open Refer & Earn
                  </button>
                </div>

                <h3 className="font-bold text-slate-800 text-sm pt-1">
                  Referral History
                </h3>
                {referrals.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title="No referrals yet"
                    subtitle="Share your code to invite friends"
                  />
                ) : (
                  referrals.map((r) => (
                    <div
                      key={r._id}
                      className="bg-white rounded-xl p-4 border border-slate-100 flex justify-between gap-3"
                    >
                      <div>
                        <p className="font-semibold text-slate-800">
                          {r.refereeId?.name ||
                            r.refereeId?.phone ||
                            "Friend"}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {formatDate(r.createdAt)} · {r.channel || "code"}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-1 rounded-full h-fit capitalize ${
                          STATUS_STYLES[r.status] || STATUS_STYLES.pending
                        }`}
                      >
                        {String(r.status || "").replace(/_/g, " ")}
                      </span>
                    </div>
                  ))
                )}
              </>
            )}

            {tab === "history" && (
              <>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {[
                    { id: "rewards", label: "Reward History" },
                    { id: "coupons", label: "Coupon History" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setHistoryView(f.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${
                        historyView === f.id
                          ? "bg-primary-600 text-white"
                          : "bg-white border border-slate-200 text-slate-600"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {historyView === "coupons" ? (
                  couponHistory.length === 0 ? (
                    <EmptyState
                      icon={Ticket}
                      title="No coupon history"
                      subtitle="Used coupons appear here"
                    />
                  ) : (
                    couponHistory.map((row) => (
                      <div
                        key={row._id}
                        className="bg-white rounded-xl p-4 border border-slate-100 flex justify-between gap-3"
                      >
                        <div>
                          <p className="font-mono font-bold text-primary-600">
                            {row.couponCode || row.couponId?.code}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {formatDate(row.redeemedAt || row.createdAt)}
                          </p>
                        </div>
                        <span className="font-black text-green-600">
                          −₹{Number(row.discountAmount || 0)}
                        </span>
                      </div>
                    ))
                  )
                ) : transactions.length === 0 ? (
                  <EmptyState
                    icon={Clock}
                    title="No reward history"
                    subtitle="Wallet credits and debits appear here"
                  />
                ) : (
                  transactions.map((t) => (
                    <div
                      key={t._id}
                      className="bg-white rounded-xl p-4 border border-slate-100 flex items-center gap-3"
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          t.type === "credit" ? "bg-green-50" : "bg-red-50"
                        }`}
                      >
                        {t.type === "credit" ? (
                          <ArrowDownLeft className="w-5 h-5 text-green-600" />
                        ) : (
                          <ArrowUpRight className="w-5 h-5 text-red-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">
                          {t.reason || t.type}
                        </p>
                        {t.orderPublicId && (
                          <p className="text-[10px] text-slate-400">
                            Order #{t.orderPublicId}
                          </p>
                        )}
                        <p className="text-xs text-slate-400">
                          {formatDate(t.createdAt)}
                        </p>
                        {t.balanceAfter != null && (
                          <p className="text-[10px] text-slate-400">
                            Balance: ₹{t.balanceAfter}
                          </p>
                        )}
                      </div>
                      <span
                        className={`font-black text-base shrink-0 ${
                          t.type === "credit" ? "text-green-600" : "text-red-500"
                        }`}
                      >
                        {t.type === "credit" ? "+" : "-"}₹{t.amount}
                      </span>
                    </div>
                  ))
                )}
              </>
            )}

            {tab === "alerts" && (
              <>
                <h3 className="font-bold text-slate-800 text-sm">
                  Reward Notifications
                </h3>
                {notifications.length === 0 ? (
                  <EmptyState
                    icon={Bell}
                    title="No reward alerts yet"
                    subtitle="Cashback, expiry and referral alerts show here"
                  />
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`bg-white rounded-xl p-4 border border-slate-100 ${
                        n.isRead ? "opacity-80" : "border-l-4 border-l-primary-500"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
                          <Bell className="w-5 h-5 text-primary-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 text-sm">
                            {n.title}
                          </p>
                          <p className="text-sm text-slate-600 mt-0.5">
                            {n.body}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-2">
                            {formatDate(n.createdAt)} ·{" "}
                            {String(n.type || "").replace(/_/g, " ")}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </>
        )}
      </div>

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
