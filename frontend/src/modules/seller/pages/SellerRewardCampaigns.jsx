import React, { useEffect, useMemo, useState } from "react";
import {
  HiOutlineGift,
  HiOutlinePlus,
  HiOutlinePencilSquare,
  HiOutlineInformationCircle,
  HiOutlineBanknotes,
  HiOutlineCheckCircle,
  HiOutlineClock,
} from "react-icons/hi2";
import { Loader2 } from "lucide-react";
import Modal from "@shared/components/ui/Modal";
import Badge from "@shared/components/ui/Badge";
import StatCard from "@shared/components/ui/StatCard";
import PageHeader from "@shared/components/ui/PageHeader";
import Button from "@shared/components/ui/Button";
import Card from "@shared/components/ui/Card";
import { useToast } from "@shared/components/ui/Toast";
import { cn } from "@/lib/utils";
import { sellerApi } from "../services/sellerApi";

const PLATFORM_LIMITS = {
  maxBudget: 50000,
  allowedTypes: ["cashback", "coupon"],
  maxPercent: 15,
  maxFixedReward: 200,
};

const statusVariant = (s) => {
  if (s === "active") return "success";
  if (s === "paused") return "warning";
  if (s === "expired") return "error";
  return "gray";
};

const formatDate = (d) =>
  d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

const emptyForm = () => ({
  name: "",
  description: "",
  campaignType: "cashback",
  status: "draft",
  startAt: "",
  endAt: "",
  budgetLimit: 5000,
  rules: { minPurchase: 200, customerType: "all" },
  rewardConfig: {
    rewardSubtype: "instant_cashback",
    valueType: "percent",
    value: 5,
    maxRewardAmount: 50,
    creditTiming: "on_delivery",
    validityDays: 30,
  },
});

const SellerRewardCampaigns = () => {
  const { showToast } = useToast();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const res = await sellerApi.getRewardCampaigns();
      setCampaigns(res.data?.result ?? []);
    } catch {
      showToast("Failed to load campaigns", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const stats = useMemo(() => {
    const active = campaigns.filter((c) => c.status === "active");
    const totalIssued = campaigns.reduce((s, c) => s + (c.stats?.totalAmount || 0), 0);
    const budgetUsed = campaigns.reduce((s, c) => s + (c.budgetUsed || 0), 0);
    return { total: campaigns.length, active: active.length, totalIssued, budgetUsed };
  }, [campaigns]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.rewardConfig.valueType === "percent" && form.rewardConfig.value > PLATFORM_LIMITS.maxPercent) {
      showToast(`Max cashback is ${PLATFORM_LIMITS.maxPercent}%`, "error");
      return;
    }
    if (form.budgetLimit > PLATFORM_LIMITS.maxBudget) {
      showToast(`Budget cannot exceed ₹${PLATFORM_LIMITS.maxBudget.toLocaleString("en-IN")}`, "error");
      return;
    }
    setSaving(true);
    try {
      await sellerApi.createRewardCampaign({
        ...form,
        status: "draft",
        fundingSource: "seller",
      });
      showToast("Campaign created — activate from admin or set status to active", "success");
      setModalOpen(false);
      setForm(emptyForm());
      fetchCampaigns();
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to create campaign", "error");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full px-4 py-2.5 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/30";

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Reward Campaigns"
        description="Create store-sponsored cashback campaigns to boost repeat purchases. All campaigns are funded by your store within platform limits."
        actions={
          <Button onClick={() => setModalOpen(true)} className="flex items-center gap-2">
            <HiOutlinePlus className="w-5 h-5" /> New Campaign
          </Button>
        }
      />

      <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-100">
        <div className="flex gap-3">
          <HiOutlineInformationCircle className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900 dark:text-blue-100">
            <p className="font-bold mb-1">Platform limits for seller campaigns</p>
            <ul className="list-disc list-inside space-y-0.5 text-blue-800/90 dark:text-blue-200/90 text-xs">
              <li>Max budget per campaign: ₹{PLATFORM_LIMITS.maxBudget.toLocaleString("en-IN")}</li>
              <li>Max cashback rate: {PLATFORM_LIMITS.maxPercent}%</li>
              <li>Allowed types: {PLATFORM_LIMITS.allowedTypes.join(", ")}</li>
              <li>Rewards credit automatically when order is delivered</li>
              <li>Reward cost is deducted from your seller settlement</li>
            </ul>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="My Campaigns" value={stats.total} icon={HiOutlineGift} color="text-primary-600" bg="bg-primary-50" />
        <StatCard label="Active" value={stats.active} icon={HiOutlineCheckCircle} color="text-green-600" bg="bg-green-50" />
        <StatCard label="Cashback Issued" value={`₹${stats.totalIssued.toLocaleString("en-IN")}`} icon={HiOutlineBanknotes} color="text-violet-600" bg="bg-violet-50" />
        <StatCard label="Budget Used" value={`₹${stats.budgetUsed.toLocaleString("en-IN")}`} icon={HiOutlineClock} color="text-amber-600" bg="bg-amber-50" />
      </div>

      {loading ? (
        <Card className="p-12 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </Card>
      ) : campaigns.length === 0 ? (
        <Card className="p-12 text-center">
          <HiOutlineGift className="w-14 h-14 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">No campaigns yet</h3>
          <p className="text-slate-500 mt-2 max-w-md mx-auto text-sm">
            Reward your customers with cashback on delivered orders. Campaigns help increase repeat purchases and customer loyalty for your store.
          </p>
          <Button onClick={() => setModalOpen(true)} className="mt-6">
            <HiOutlinePlus className="w-4 h-4 mr-1" /> Create Your First Campaign
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((c) => {
            const budgetPct = c.budgetLimit ? Math.min(100, Math.round(((c.budgetUsed || 0) / c.budgetLimit) * 100)) : 0;
            return (
              <Card key={c._id} className="p-5">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-lg text-slate-800 dark:text-white">{c.name}</h3>
                      <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                      <Badge variant="info" className="capitalize">{c.campaignType}</Badge>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">{c.description || "Store promotional cashback"}</p>
                    <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-600">
                      <span>
                        <strong className="text-primary-600 text-base">
                          {c.rewardConfig?.valueType === "percent" ? `${c.rewardConfig?.value}%` : `₹${c.rewardConfig?.value}`}
                        </strong>{" "}
                        cashback
                      </span>
                      <span>Min order ₹{c.rules?.minPurchase || 0}</span>
                      <span>Max ₹{c.rewardConfig?.maxRewardAmount || "—"} per reward</span>
                      <span>{c.stats?.totalGrants || 0} customers rewarded</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1">
                      <HiOutlineClock className="w-3 h-3" />
                      {formatDate(c.startAt)} → {formatDate(c.endAt)}
                    </p>
                  </div>
                  <div className="md:w-48 shrink-0">
                    <p className="text-xs text-slate-500 mb-1">Budget usage</p>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${budgetPct}%` }} />
                    </div>
                    <p className="text-xs font-medium mt-1">
                      ₹{c.budgetUsed || 0} / ₹{c.budgetLimit || "∞"}
                    </p>
                    <p className="text-xs text-green-600 mt-2">₹{c.stats?.totalAmount || 0} issued total</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Create Reward Campaign" size="lg">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-200">
            Campaign starts as <strong>draft</strong>. Set to active after review. Seller-funded rewards are deducted from your earnings.
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">Campaign Name *</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="e.g. Weekend 5% Cashback" />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={cn(inputCls, "min-h-[60px]")} placeholder="What customers earn and when" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">Start *</label>
              <input type="datetime-local" required value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">End *</label>
              <input type="datetime-local" required value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">Cashback % (max {PLATFORM_LIMITS.maxPercent}%)</label>
              <input
                type="number"
                min="0"
                max={PLATFORM_LIMITS.maxPercent}
                value={form.rewardConfig.value}
                onChange={(e) => setForm({ ...form, rewardConfig: { ...form.rewardConfig, valueType: "percent", value: Number(e.target.value) } })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">Max reward per order (₹)</label>
              <input
                type="number"
                min="0"
                max={PLATFORM_LIMITS.maxFixedReward}
                value={form.rewardConfig.maxRewardAmount}
                onChange={(e) => setForm({ ...form, rewardConfig: { ...form.rewardConfig, maxRewardAmount: Number(e.target.value) } })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">Min order value (₹)</label>
              <input type="number" min="0" value={form.rules.minPurchase} onChange={(e) => setForm({ ...form, rules: { ...form.rules, minPurchase: Number(e.target.value) } })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">Campaign budget (₹)</label>
              <input type="number" min="100" max={PLATFORM_LIMITS.maxBudget} value={form.budgetLimit} onChange={(e) => setForm({ ...form, budgetLimit: Number(e.target.value) })} className={inputCls} />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Create Campaign
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default SellerRewardCampaigns;
