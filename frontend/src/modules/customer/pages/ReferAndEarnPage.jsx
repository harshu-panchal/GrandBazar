import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Copy, Share2, Users } from "lucide-react";
import { customerApi } from "../services/customerApi";
import { useToast } from "@shared/components/ui/Toast";

const ReferAndEarnPage = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [referrals, setReferrals] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [codeRes, refRes] = await Promise.all([
          customerApi.getReferralCode(),
          customerApi.getMyReferrals({ limit: 20 }),
        ]);
        setData(codeRes.data?.result ?? null);
        setReferrals(refRes.data?.result?.items ?? []);
      } catch (err) {
        console.error(err);
      }
    };
    load();
  }, []);

  const shareLink = data?.shareLink || "";

  const copyCode = () => {
    navigator.clipboard.writeText(data?.referralCode || "");
    showToast("Referral code copied!", "success");
  };

  const shareLinkFn = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join GrandBazar",
          text: `Use my referral code ${data?.referralCode} to get rewards!`,
          url: shareLink,
        });
      } catch {
        /* cancelled */
      }
    } else {
      navigator.clipboard.writeText(shareLink);
      showToast("Link copied!", "success");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="bg-gradient-to-br from-violet-600 to-primary-700 text-white px-4 pt-6 pb-10">
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1 text-white/80 mb-4">
          <ChevronLeft className="w-5 h-5" /> Back
        </button>
        <h1 className="text-2xl font-bold">Refer & Earn</h1>
        <p className="text-white/80 text-sm mt-1">Invite friends and earn rewards together</p>
      </div>

      <div className="px-4 -mt-6 space-y-4">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-center">
          <p className="text-sm text-slate-500 mb-2">Your Referral Code</p>
          <p className="text-3xl font-black font-mono text-primary-600 tracking-wider">
            {data?.referralCode || "—"}
          </p>
          <div className="flex gap-3 mt-4 justify-center">
            <button
              type="button"
              onClick={copyCode}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg text-sm font-medium"
            >
              <Copy className="w-4 h-4" /> Copy Code
            </button>
            <button
              type="button"
              onClick={shareLinkFn}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium"
            >
              <Share2 className="w-4 h-4" /> Share Link
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl p-4 border border-slate-100 text-center">
            <Users className="w-6 h-6 text-primary-600 mx-auto mb-1" />
            <p className="text-2xl font-bold">{data?.totalReferrals ?? 0}</p>
            <p className="text-xs text-slate-500">Total Referrals</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-100 text-center">
            <p className="text-2xl font-bold text-green-600">{data?.rewardedReferrals ?? 0}</p>
            <p className="text-xs text-slate-500">Rewards Earned</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 font-semibold">Referral History</div>
          {referrals.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-6">No referrals yet</p>
          ) : (
            referrals.map((r) => (
              <div key={r._id} className="px-4 py-3 border-b border-slate-50 flex justify-between">
                <div>
                  <p className="font-medium text-sm">{r.refereeId?.name || "Friend"}</p>
                  <p className="text-xs text-slate-400 capitalize">{r.status}</p>
                </div>
                <span className="text-xs text-slate-500">
                  {new Date(r.createdAt).toLocaleDateString("en-IN")}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ReferAndEarnPage;
