import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Copy,
  Share2,
  Users,
  Gift,
  CheckCircle2,
  Clock,
  Smartphone,
  Link2,
  QrCode,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { customerApi } from "../services/customerApi";
import { useToast } from "@shared/components/ui/Toast";

const STEPS = [
  { icon: Share2, title: "Share your code", desc: "Send your referral link or code to friends via WhatsApp, SMS, or social media" },
  { icon: Users, title: "Friend signs up", desc: "They register using your link or enter your code during signup" },
  { icon: Gift, title: "First order delivered", desc: "When they complete their first delivered order, rewards unlock" },
  { icon: Sparkles, title: "Both earn rewards", desc: "You and your friend receive wallet cashback automatically" },
];

const STATUS_LABELS = {
  pending: { label: "Invited", color: "text-slate-500 bg-slate-100" },
  registered: { label: "Signed Up", color: "text-blue-600 bg-blue-50" },
  first_order: { label: "First Order", color: "text-amber-600 bg-amber-50" },
  rewarded: { label: "Rewarded", color: "text-green-600 bg-green-50" },
  rejected: { label: "Rejected", color: "text-red-600 bg-red-50" },
};

const ReferAndEarnPage = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [invitePhone, setInvitePhone] = useState("");
  const [inviting, setInviting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [codeRes, refRes] = await Promise.all([
        customerApi.getReferralCode(),
        customerApi.getMyReferrals({ limit: 30 }),
      ]);
      setData(codeRes.data?.result ?? null);
      setReferrals(refRes.data?.result?.items ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const shareLink = data?.shareLink || "";
  const referralCode = data?.referralCode || "";

  const copyCode = () => {
    navigator.clipboard.writeText(referralCode);
    showToast("Referral code copied!", "success");
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink);
    showToast("Referral link copied!", "success");
  };

  const shareLinkFn = async () => {
    const text = `Join me on GrandBazar! Use code ${referralCode} or sign up here: ${shareLink}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join GrandBazar", text, url: shareLink });
      } catch {
        /* cancelled */
      }
    } else {
      navigator.clipboard.writeText(text);
      showToast("Invite message copied!", "success");
    }
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(`Join GrandBazar with my code *${referralCode}* and earn rewards! ${shareLink}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!invitePhone.trim()) return;
    setInviting(true);
    try {
      await customerApi.inviteReferral({ phone: invitePhone.trim() });
      showToast("Invite link prepared — share with your friend!", "success");
      setInvitePhone("");
    } catch {
      showToast("Could not send invite", "error");
    } finally {
      setInviting(false);
    }
  };

  const conversionRate = data?.totalReferrals
    ? Math.round(((data?.rewardedReferrals || 0) / data.totalReferrals) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="bg-gradient-to-br from-violet-600 via-primary-600 to-indigo-700 text-white px-4 pt-6 pb-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLW9wYWNpdHk9Ii4wNSIvPjwvZz48L3N2Zz4=')] opacity-30" />
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1 text-white/80 mb-4 relative z-10">
          <ChevronLeft className="w-5 h-5" /> Back
        </button>
        <div className="relative z-10">
          <h1 className="text-2xl font-black">Refer & Earn</h1>
          <p className="text-white/80 text-sm mt-1">Invite friends — you both get wallet rewards</p>
        </div>
      </div>

      <div className="px-4 -mt-8 space-y-4 relative z-10">
        {/* Referral code card */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100 text-center">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Your Referral Code</p>
          <p className="text-3xl font-black font-mono text-primary-600 tracking-[0.2em]">
            {loading ? "..." : referralCode || "—"}
          </p>
          <p className="text-xs text-slate-500 mt-2 break-all px-2">{shareLink}</p>
          <div className="grid grid-cols-2 gap-2 mt-5">
            <button type="button" onClick={copyCode} className="flex items-center justify-center gap-2 py-2.5 bg-slate-100 rounded-xl text-sm font-bold text-slate-700">
              <Copy className="w-4 h-4" /> Copy Code
            </button>
            <button type="button" onClick={copyLink} className="flex items-center justify-center gap-2 py-2.5 bg-slate-100 rounded-xl text-sm font-bold text-slate-700">
              <Link2 className="w-4 h-4" /> Copy Link
            </button>
            <button type="button" onClick={shareLinkFn} className="flex items-center justify-center gap-2 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold col-span-2">
              <Share2 className="w-4 h-4" /> Share Invite
            </button>
            <button type="button" onClick={shareWhatsApp} className="flex items-center justify-center gap-2 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold col-span-2">
              <MessageCircle className="w-4 h-4" /> Share on WhatsApp
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Invited", value: data?.totalReferrals ?? 0, icon: Users },
            { label: "Rewarded", value: data?.rewardedReferrals ?? 0, icon: CheckCircle2, highlight: true },
            { label: "Conversion", value: `${conversionRate}%`, icon: Sparkles },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl p-3 border border-slate-100 text-center shadow-sm">
              <s.icon className={`w-5 h-5 mx-auto mb-1 ${s.highlight ? "text-green-600" : "text-primary-600"}`} />
              <p className={`text-xl font-black ${s.highlight ? "text-green-600" : "text-slate-800"}`}>{s.value}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4">How it works</h3>
          <div className="space-y-4">
            {STEPS.map((step, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center shrink-0">
                  <step.icon className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-slate-800">
                    <span className="text-primary-600 mr-1">{i + 1}.</span>
                    {step.title}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Invite channels */}
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-3">Invite via</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { icon: Link2, label: "Link" },
              { icon: QrCode, label: "QR Code", action: copyLink },
              { icon: Smartphone, label: "Mobile" },
            ].map((ch) => (
              <button
                key={ch.label}
                type="button"
                onClick={ch.action || copyLink}
                className="p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <ch.icon className="w-6 h-6 text-primary-600 mx-auto mb-1" />
                <p className="text-xs font-semibold text-slate-600">{ch.label}</p>
              </button>
            ))}
          </div>
          <form onSubmit={handleInvite} className="mt-4 flex gap-2">
            <input
              type="tel"
              value={invitePhone}
              onChange={(e) => setInvitePhone(e.target.value)}
              placeholder="Friend's mobile number"
              className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/30"
            />
            <button
              type="submit"
              disabled={inviting}
              className="px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold disabled:opacity-50"
            >
              Invite
            </button>
          </form>
        </div>

        {/* Referral history */}
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800">Referral History</h3>
            <span className="text-xs text-slate-400">{referrals.length} total</span>
          </div>
          {referrals.length === 0 ? (
            <div className="py-10 text-center">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">No referrals yet</p>
              <p className="text-xs text-slate-400 mt-1">Share your code to start earning</p>
            </div>
          ) : (
            referrals.map((r) => {
              const st = STATUS_LABELS[r.status] || STATUS_LABELS.pending;
              return (
                <div key={r._id} className="px-4 py-3.5 border-b border-slate-50 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-violet-100 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-violet-600">
                        {(r.refereeId?.name || "F").charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{r.refereeId?.name || "Friend"}</p>
                      <p className="text-[10px] text-slate-400 capitalize">{r.channel || "code"} invite</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                    <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-0.5 justify-end">
                      <Clock className="w-3 h-3" />
                      {new Date(r.createdAt).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Terms note */}
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs text-amber-800">
          <p className="font-bold mb-1">Program terms</p>
          <ul className="list-disc list-inside space-y-0.5 text-amber-700/90">
            <li>Self-referrals and duplicate accounts are not eligible</li>
            <li>Rewards release after referee&apos;s first delivered order</li>
            <li>Rewards credit to wallet and can be used at checkout</li>
            <li>Platform may modify or pause the program at any time</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ReferAndEarnPage;
