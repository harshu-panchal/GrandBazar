import React, { useEffect, useMemo, useState } from "react";
import Card from "@shared/components/ui/Card";
import Modal from "@shared/components/ui/Modal";
import Badge from "@shared/components/ui/Badge";
import StatCard from "@shared/components/ui/StatCard";
import PageHeader from "@shared/components/ui/PageHeader";
import Button from "@shared/components/ui/Button";
import { useToast } from "@shared/components/ui/Toast";
import {
  HiOutlinePlus,
  HiOutlineGift,
  HiOutlinePencilSquare,
  HiOutlineTrash,
  HiOutlineMagnifyingGlass,
  HiOutlineFunnel,
  HiOutlineEye,
  HiOutlineBanknotes,
  HiOutlineUsers,
  HiOutlineClock,
  HiOutlineCheckCircle,
  HiOutlineTicket,
  HiOutlineArrowLeft,
} from "react-icons/hi2";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { adminApi } from "../services/adminApi";

const REWARD_TYPE_FAMILIES = [
  {
    id: "cashback_rewards",
    label: "Cashback & Rewards",
    desc: "First purchase, shop/product cashback, festival, milestone, birthday & more",
    icon: "gift",
  },
  {
    id: "coupons",
    label: "Coupons",
    desc: "Flat, percentage, free delivery, welcome & festival coupons",
    icon: "ticket",
  },
  {
    id: "referral",
    label: "Referral Rewards",
    desc: "Customer & partner referral incentives",
    icon: "users",
  },
];

const REWARD_SUBTYPES = [
  // Cashback & Rewards (flow section 3)
  { value: "first_purchase", label: "First Purchase Cashback", family: "cashback_rewards", campaignType: "cashback" },
  { value: "repeat_purchase", label: "Repeat Purchase Cashback", family: "cashback_rewards", campaignType: "cashback" },
  { value: "product_cashback", label: "Product-wise Cashback", family: "cashback_rewards", campaignType: "cashback" },
  { value: "category_cashback", label: "Category-wise Cashback", family: "cashback_rewards", campaignType: "cashback" },
  { value: "brand_cashback", label: "Brand-wise Cashback", family: "cashback_rewards", campaignType: "cashback" },
  { value: "shop_cashback", label: "Shop-wise Cashback", family: "cashback_rewards", campaignType: "cashback" },
  { value: "festival", label: "Festival Cashback", family: "cashback_rewards", campaignType: "cashback" },
  { value: "new_shop_promotion", label: "New Shop Promotion Cashback", family: "cashback_rewards", campaignType: "cashback" },
  { value: "milestone", label: "Milestone Rewards (Orders / Spend)", family: "cashback_rewards", campaignType: "reward" },
  { value: "birthday", label: "Birthday Rewards", family: "cashback_rewards", campaignType: "reward" },
  { value: "digital_voucher", label: "Digital Reward Voucher", family: "cashback_rewards", campaignType: "coupon" },
  { value: "new_shop_reward", label: "New Shop Rewards", family: "cashback_rewards", campaignType: "reward" },
  { value: "instant_cashback", label: "Instant Cashback", family: "cashback_rewards", campaignType: "cashback" },
  { value: "future_cashback", label: "Future / Delayed Cashback", family: "cashback_rewards", campaignType: "cashback" },
  // Coupons (flow section 4)
  { value: "flat_coupon", label: "Flat Discount Coupon", family: "coupons", campaignType: "coupon" },
  { value: "percent_coupon", label: "Percentage Discount Coupon", family: "coupons", campaignType: "coupon" },
  { value: "free_delivery", label: "Free Delivery Coupon", family: "coupons", campaignType: "coupon" },
  { value: "voucher", label: "Cashback Coupon / Voucher", family: "coupons", campaignType: "coupon" },
  // Referral (flow section 5)
  { value: "referral_registration", label: "Referral on Registration", family: "referral", campaignType: "referral" },
  { value: "referral_first_purchase", label: "Referral on First Order", family: "referral", campaignType: "referral" },
];

const CREDIT_TIMINGS = [
  { value: "on_delivery", label: "On delivery" },
  { value: "on_payment", label: "On payment success" },
  { value: "delayed_days", label: "Delayed (days)" },
];

const CAMPAIGN_TYPES = [
  { value: "cashback", label: "Cashback" },
  { value: "reward", label: "Reward" },
  { value: "coupon", label: "Coupon" },
  { value: "referral", label: "Referral" },
];

const STATUSES = ["draft", "active", "paused", "expired"];
const FUNDING_SOURCES = ["platform", "seller", "brand", "shared"];
const CUSTOMER_TYPES = [
  { value: "all", label: "All customers" },
  { value: "new", label: "New customers only" },
  { value: "existing", label: "Existing customers only" },
];

const resolveFamilyFromSubtype = (subtype) =>
  REWARD_SUBTYPES.find((s) => s.value === subtype)?.family || "cashback_rewards";

const parseCsvIds = (value) =>
  String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const joinCsvIds = (arr) => (Array.isArray(arr) ? arr.map(String).join(", ") : "");

const emptyForm = () => ({
  name: "",
  description: "",
  campaignType: "cashback",
  priority: 100,
  status: "draft",
  startAt: "",
  endAt: "",
  timezone: "Asia/Kolkata",
  fundingSource: "platform",
  budgetLimit: "",
  dailyLimit: "",
  monthlyLimit: "",
  sharedFunding: { platformPercent: 50, sellerPercent: 50 },
  rules: {
    minPurchase: 0,
    customerType: "all",
    maxRewardPerCustomer: "",
    maxRewardsPerDay: "",
    milestoneOrderCount: "",
    milestoneSpendAmount: "",
    newShopMaxAgeDays: 30,
    productIdsText: "",
    categoryIdsText: "",
    brandIdsText: "",
    shopIdsText: "",
    cityIdsText: "",
  },
  rewardConfig: {
    rewardSubtype: "",
    valueType: "percent",
    value: 5,
    maxRewardAmount: 100,
    validityDays: 30,
    creditTiming: "on_delivery",
    delayedDays: 0,
  },
});

const statusVariant = (s) => {
  if (s === "active") return "success";
  if (s === "paused") return "warning";
  if (s === "expired") return "error";
  return "gray";
};

const formatDate = (d) =>
  d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

const formatReward = (cfg = {}) => {
  if (!cfg.value) return "—";
  return cfg.valueType === "percent" ? `${cfg.value}%` : `₹${cfg.value}`;
};

const SectionTitle = ({ children }) => (
  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-2 mb-3">
    {children}
  </h3>
);

const RewardCampaigns = () => {
  const { showToast } = useToast();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewCampaign, setViewCampaign] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [wizardStep, setWizardStep] = useState(1); // 1=type family, 2=subtype, 3=config
  const [selectedFamily, setSelectedFamily] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getRewardCampaigns({
        status: statusFilter === "all" ? undefined : statusFilter,
        campaignType: typeFilter === "all" ? undefined : typeFilter,
        search: searchTerm.trim() || undefined,
      });
      setCampaigns(res.data?.results ?? res.data?.result ?? []);
    } catch {
      showToast("Failed to load campaigns", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(fetchCampaigns, 300);
    return () => clearTimeout(t);
  }, [statusFilter, typeFilter, searchTerm]);

  const stats = useMemo(() => {
    const now = new Date();
    const active = campaigns.filter((c) => c.status === "active");
    const paused = campaigns.filter((c) => c.status === "paused");
    const expiringSoon = campaigns.filter((c) => {
      if (!c.endAt || c.status !== "active") return false;
      const days = (new Date(c.endAt) - now) / 86400000;
      return days >= 0 && days <= 7;
    });
    return {
      total: campaigns.length,
      active: active.length,
      paused: paused.length,
      totalIssued: campaigns.reduce((s, c) => s + (c.stats?.totalGrants || 0), 0),
      totalAmount: campaigns.reduce((s, c) => s + (c.stats?.totalAmount || 0), 0),
      budgetUsed: campaigns.reduce((s, c) => s + (c.budgetUsed || 0), 0),
      expiringSoon: expiringSoon.length,
    };
  }, [campaigns]);

  const openModal = (campaign = null) => {
    if (campaign) {
      setEditing(campaign);
      const rules = campaign.rules || {};
      const subtype = campaign.rewardConfig?.rewardSubtype || "";
      setSelectedFamily(resolveFamilyFromSubtype(subtype));
      setWizardStep(3);
      setForm({
        ...emptyForm(),
        ...campaign,
        startAt: campaign.startAt?.substring(0, 16) || "",
        endAt: campaign.endAt?.substring(0, 16) || "",
        budgetLimit: campaign.budgetLimit ?? "",
        dailyLimit: campaign.dailyLimit ?? "",
        monthlyLimit: campaign.monthlyLimit ?? "",
        rules: {
          ...emptyForm().rules,
          ...rules,
          maxRewardPerCustomer: rules.maxRewardPerCustomer ?? "",
          maxRewardsPerDay: rules.maxRewardsPerDay ?? "",
          milestoneOrderCount: rules.milestoneOrderCount ?? "",
          milestoneSpendAmount: rules.milestoneSpendAmount ?? "",
          newShopMaxAgeDays: rules.newShopMaxAgeDays ?? 30,
          productIdsText: joinCsvIds(rules.productIds),
          categoryIdsText: joinCsvIds(rules.categoryIds),
          brandIdsText: joinCsvIds(rules.brandIds),
          shopIdsText: joinCsvIds(rules.shopIds),
          cityIdsText: joinCsvIds(rules.cityIds),
        },
        rewardConfig: { ...emptyForm().rewardConfig, ...(campaign.rewardConfig || {}) },
        sharedFunding: campaign.sharedFunding || emptyForm().sharedFunding,
      });
    } else {
      setEditing(null);
      setForm(emptyForm());
      setSelectedFamily("");
      setWizardStep(1);
    }
    setModalOpen(true);
  };

  const selectFamily = (familyId) => {
    setSelectedFamily(familyId);
    setForm((prev) => ({
      ...prev,
      rewardConfig: { ...prev.rewardConfig, rewardSubtype: "" },
    }));
    setWizardStep(2);
  };

  const selectSubtype = (subtypeMeta) => {
    const nextRules = { ...form.rules };
    if (subtypeMeta.value === "first_purchase") nextRules.customerType = "new";
    else if (subtypeMeta.value === "repeat_purchase") nextRules.customerType = "existing";
    else nextRules.customerType = "all";

    setForm({
      ...form,
      campaignType: subtypeMeta.campaignType,
      rules: nextRules,
      rewardConfig: {
        ...form.rewardConfig,
        rewardSubtype: subtypeMeta.value,
        valueType:
          subtypeMeta.value === "flat_coupon" || subtypeMeta.value === "free_delivery"
            ? "fixed"
            : form.rewardConfig.valueType || "percent",
      },
    });
    setWizardStep(3);
  };

  const familySubtypes = useMemo(
    () => REWARD_SUBTYPES.filter((s) => s.family === selectedFamily),
    [selectedFamily],
  );

  const selectedSubtypeMeta = useMemo(
    () => REWARD_SUBTYPES.find((s) => s.value === form.rewardConfig.rewardSubtype),
    [form.rewardConfig.rewardSubtype],
  );

  const showMilestoneFields = form.rewardConfig.rewardSubtype === "milestone";
  const showNewShopAge =
    form.rewardConfig.rewardSubtype === "new_shop_promotion" ||
    form.rewardConfig.rewardSubtype === "new_shop_reward";
  const showProductScope = ["product_cashback"].includes(form.rewardConfig.rewardSubtype);
  const showCategoryScope = ["category_cashback"].includes(form.rewardConfig.rewardSubtype);
  const showBrandScope = ["brand_cashback"].includes(form.rewardConfig.rewardSubtype);
  const showShopScope = ["shop_cashback", "new_shop_promotion", "new_shop_reward"].includes(
    form.rewardConfig.rewardSubtype,
  );
  const showAnyScope =
    showProductScope ||
    showCategoryScope ||
    showBrandScope ||
    showShopScope ||
    selectedFamily === "coupons";

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.rewardConfig.rewardSubtype) {
      showToast("Please select a reward type first", "error");
      setWizardStep(1);
      return;
    }
    try {
      const payload = {
        ...form,
        budgetLimit: form.budgetLimit !== "" ? Number(form.budgetLimit) : null,
        dailyLimit: form.dailyLimit !== "" ? Number(form.dailyLimit) : null,
        monthlyLimit: form.monthlyLimit !== "" ? Number(form.monthlyLimit) : null,
        priority: Number(form.priority) || 100,
        rules: {
          customerType: form.rules.customerType,
          minPurchase: Number(form.rules.minPurchase) || 0,
          maxRewardPerCustomer: form.rules.maxRewardPerCustomer
            ? Number(form.rules.maxRewardPerCustomer)
            : null,
          maxRewardsPerDay: form.rules.maxRewardsPerDay
            ? Number(form.rules.maxRewardsPerDay)
            : null,
          milestoneOrderCount: form.rules.milestoneOrderCount
            ? Number(form.rules.milestoneOrderCount)
            : null,
          milestoneSpendAmount: form.rules.milestoneSpendAmount
            ? Number(form.rules.milestoneSpendAmount)
            : null,
          newShopMaxAgeDays: form.rules.newShopMaxAgeDays
            ? Number(form.rules.newShopMaxAgeDays)
            : null,
          productIds: parseCsvIds(form.rules.productIdsText),
          categoryIds: parseCsvIds(form.rules.categoryIdsText),
          brandIds: parseCsvIds(form.rules.brandIdsText),
          shopIds: parseCsvIds(form.rules.shopIdsText),
          cityIds: parseCsvIds(form.rules.cityIdsText),
        },
        rewardConfig: {
          ...form.rewardConfig,
          value: Number(form.rewardConfig.value) || 0,
          maxRewardAmount: form.rewardConfig.maxRewardAmount
            ? Number(form.rewardConfig.maxRewardAmount)
            : null,
          validityDays: Number(form.rewardConfig.validityDays) || 30,
          delayedDays: Number(form.rewardConfig.delayedDays) || 0,
        },
      };

      if (editing) {
        await adminApi.updateRewardCampaign(editing._id, payload);
        showToast("Campaign updated successfully", "success");
      } else {
        await adminApi.createRewardCampaign(payload);
        showToast("Campaign created successfully", "success");
      }
      setModalOpen(false);
      fetchCampaigns();
    } catch (err) {
      showToast(err.response?.data?.message || "Save failed", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this campaign permanently?")) return;
    try {
      await adminApi.deleteRewardCampaign(id);
      showToast("Campaign deleted", "success");
      fetchCampaigns();
    } catch {
      showToast("Delete failed", "error");
    }
  };

  const inputCls =
    "w-full px-4 py-2.5 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/30";

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Reward Campaigns"
        description="Configure cashback, loyalty rewards, coupon issuance & referral programs. Campaigns run automatically when orders are delivered."
        actions={
          <Button onClick={() => openModal()} className="flex items-center gap-2">
            <HiOutlinePlus className="w-5 h-5" /> New Campaign
          </Button>
        }
        badge={
          <Badge variant="info">
            <HiOutlineGift className="inline w-3 h-3 mr-1" />
            Reward Engine
          </Badge>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Campaigns" value={stats.total} icon={HiOutlineGift} color="text-primary-600" bg="bg-primary-50" />
        <StatCard
          label="Active Now"
          value={stats.active}
          icon={HiOutlineCheckCircle}
          color="text-green-600"
          bg="bg-green-50"
          description={stats.paused > 0 ? `${stats.paused} paused` : undefined}
        />
        <StatCard label="Rewards Issued" value={stats.totalIssued} icon={HiOutlineUsers} color="text-violet-600" bg="bg-violet-50" description={`₹${stats.totalAmount.toLocaleString("en-IN")} total`} />
        <StatCard label="Budget Consumed" value={`₹${stats.budgetUsed.toLocaleString("en-IN")}`} icon={HiOutlineBanknotes} color="text-amber-600" bg="bg-amber-50" description={stats.expiringSoon ? `${stats.expiringSoon} expiring soon` : undefined} />
      </div>

      <Card className="p-4">
        <div className="flex flex-col lg:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or description..."
              className={cn(inputCls, "pl-10")}
            />
          </div>
          <div className="flex gap-2">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls}>
              <option value="all">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={inputCls}>
              <option value="all">All types</option>
              {CAMPAIGN_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-500">Loading campaigns...</div>
        ) : campaigns.length === 0 ? (
          <div className="py-16 text-center">
            <HiOutlineGift className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold text-slate-700">No campaigns found</p>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              Create your first cashback or referral campaign. Rewards are credited automatically when eligible orders are delivered.
            </p>
            <Button onClick={() => openModal()} className="mt-4">
              <HiOutlinePlus className="w-4 h-4 mr-1" /> Create Campaign
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <th className="px-3 py-3">Campaign</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Reward</th>
                  <th className="px-3 py-3">Schedule</th>
                  <th className="px-3 py-3">Budget</th>
                  <th className="px-3 py-3">Performance</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {campaigns.map((c) => (
                    <motion.tr
                      key={c._id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b border-slate-50 hover:bg-slate-50/80 dark:hover:bg-gray-800/40"
                    >
                      <td className="px-3 py-4">
                        <p className="font-bold text-slate-800 dark:text-white">{c.name}</p>
                        <p className="text-xs text-slate-500 line-clamp-1">{c.description || "No description"}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Priority {c.priority} · {c.fundingSource} funded</p>
                      </td>
                      <td className="px-3 py-4 capitalize">
                        <Badge variant="info">{c.campaignType}</Badge>
                        <p className="text-[10px] text-slate-400 mt-1">{c.rewardConfig?.rewardSubtype?.replace(/_/g, " ")}</p>
                      </td>
                      <td className="px-3 py-4 font-semibold text-primary-600">
                        {formatReward(c.rewardConfig)}
                        {c.rewardConfig?.maxRewardAmount ? (
                          <p className="text-[10px] text-slate-400 font-normal">max ₹{c.rewardConfig.maxRewardAmount}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-4 text-xs text-slate-600">
                        <p>{formatDate(c.startAt)}</p>
                        <p className="text-slate-400">to {formatDate(c.endAt)}</p>
                      </td>
                      <td className="px-3 py-4 text-xs">
                        <p className="font-medium">₹{c.budgetUsed || 0}</p>
                        <p className="text-slate-400">/ {c.budgetLimit ? `₹${c.budgetLimit}` : "∞"}</p>
                      </td>
                      <td className="px-3 py-4 text-xs">
                        <p>{c.stats?.totalGrants || 0} grants</p>
                        <p className="text-green-600">₹{c.stats?.totalAmount || 0}</p>
                      </td>
                      <td className="px-3 py-4">
                        <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex justify-end gap-1 items-center">
                          <button type="button" onClick={() => setViewCampaign(c)} className="p-2 text-slate-400 hover:text-primary-600 rounded-lg" title="View">
                            <HiOutlineEye className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => openModal(c)} className="p-2 text-slate-400 hover:text-primary-600 rounded-lg" title="Edit">
                            <HiOutlinePencilSquare className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => handleDelete(c._id)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg" title="Delete">
                            <HiOutlineTrash className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Campaign" : "Create Reward Campaign"}
        size="lg"
      >
        <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
          {!editing && (
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest">
              {[
                { n: 1, label: "Reward Type" },
                { n: 2, label: "Specific Offer" },
                { n: 3, label: "Configure" },
              ].map((s, idx) => (
                <div key={s.n} className="flex items-center gap-2">
                  {idx > 0 && <div className="h-px w-6 bg-slate-200" />}
                  <span
                    className={cn(
                      "px-2.5 py-1 rounded-full",
                      wizardStep === s.n
                        ? "bg-slate-900 text-white"
                        : wizardStep > s.n
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-400",
                    )}
                  >
                    {s.n}. {s.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {wizardStep === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Select Reward Type</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Choose Cashback & Rewards, Coupons, or Referral first.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {REWARD_TYPE_FAMILIES.map((family) => {
                  const Icon =
                    family.icon === "ticket"
                      ? HiOutlineTicket
                      : family.icon === "users"
                        ? HiOutlineUsers
                        : HiOutlineGift;
                  return (
                    <button
                      key={family.id}
                      type="button"
                      onClick={() => selectFamily(family.id)}
                      className="text-left p-4 rounded-2xl border-2 border-slate-100 hover:border-slate-900 hover:bg-slate-50 transition-all"
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-11 w-11 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{family.label}</p>
                          <p className="text-xs text-slate-500 mt-1">{family.desc}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end pt-2">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setWizardStep(1)}
                className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-900"
              >
                <HiOutlineArrowLeft className="w-4 h-4" /> Change reward type
              </button>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {REWARD_TYPE_FAMILIES.find((f) => f.id === selectedFamily)?.label || "Choose offer"}
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Pick the specific offer. Configuration options appear next.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {familySubtypes.map((sub) => (
                  <button
                    key={sub.value}
                    type="button"
                    onClick={() => selectSubtype(sub)}
                    className="text-left p-4 rounded-2xl border-2 border-slate-100 hover:border-emerald-500 hover:bg-emerald-50/40 transition-all"
                  >
                    <p className="font-bold text-sm text-slate-900">{sub.label}</p>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">
                      {sub.campaignType}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {wizardStep === 3 && (
            <form onSubmit={handleSubmit} className="space-y-6">
              {!editing && (
                <button
                  type="button"
                  onClick={() => setWizardStep(2)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-900"
                >
                  <HiOutlineArrowLeft className="w-4 h-4" /> Change offer type
                </button>
              )}

              <div className="rounded-2xl bg-slate-900 text-white p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                  Selected type
                </p>
                <p className="text-lg font-bold mt-1">
                  {selectedSubtypeMeta?.label || form.rewardConfig.rewardSubtype}
                </p>
              </div>

              <SectionTitle>Basic Information</SectionTitle>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Campaign Name *</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={inputCls}
                    placeholder="e.g. Summer 5% Cashback"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className={cn(inputCls, "min-h-[72px]")}
                    placeholder="Internal notes and customer-facing description"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className={inputCls}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Funding Source</label>
                  <select
                    value={form.fundingSource}
                    onChange={(e) => setForm({ ...form, fundingSource: e.target.value })}
                    className={inputCls}
                  >
                    {FUNDING_SOURCES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">
                    Priority (lower = higher)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>

              <SectionTitle>Schedule</SectionTitle>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">
                    Start Date & Time *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={form.startAt}
                    onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">
                    End Date & Time *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={form.endAt}
                    onChange={(e) => setForm({ ...form, endAt: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>

              <SectionTitle>Reward Configuration</SectionTitle>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Value Type</label>
                  <select
                    value={form.rewardConfig.valueType}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        rewardConfig: { ...form.rewardConfig, valueType: e.target.value },
                      })
                    }
                    className={inputCls}
                  >
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (₹)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Reward Value</label>
                  <input
                    type="number"
                    min="0"
                    value={form.rewardConfig.value}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        rewardConfig: { ...form.rewardConfig, value: Number(e.target.value) },
                      })
                    }
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">
                    Max Reward Cap (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.rewardConfig.maxRewardAmount}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        rewardConfig: {
                          ...form.rewardConfig,
                          maxRewardAmount: Number(e.target.value),
                        },
                      })
                    }
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Credit Timing</label>
                  <select
                    value={form.rewardConfig.creditTiming}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        rewardConfig: { ...form.rewardConfig, creditTiming: e.target.value },
                      })
                    }
                    className={inputCls}
                  >
                    {CREDIT_TIMINGS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Validity (days)</label>
                  <input
                    type="number"
                    min="1"
                    value={form.rewardConfig.validityDays}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        rewardConfig: {
                          ...form.rewardConfig,
                          validityDays: Number(e.target.value),
                        },
                      })
                    }
                    className={inputCls}
                  />
                </div>
                {form.rewardConfig.creditTiming === "delayed_days" && (
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Delay (days)</label>
                    <input
                      type="number"
                      min="1"
                      value={form.rewardConfig.delayedDays}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          rewardConfig: {
                            ...form.rewardConfig,
                            delayedDays: Number(e.target.value),
                          },
                        })
                      }
                      className={inputCls}
                    />
                  </div>
                )}
              </div>

              <SectionTitle>Eligibility Rules</SectionTitle>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Customer Type</label>
                  <select
                    value={form.rules.customerType}
                    onChange={(e) =>
                      setForm({ ...form, rules: { ...form.rules, customerType: e.target.value } })
                    }
                    className={inputCls}
                  >
                    {CUSTOMER_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Min Purchase (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.rules.minPurchase}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        rules: { ...form.rules, minPurchase: Number(e.target.value) },
                      })
                    }
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">
                    Max Rewards per Customer
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.rules.maxRewardPerCustomer}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        rules: { ...form.rules, maxRewardPerCustomer: e.target.value },
                      })
                    }
                    className={inputCls}
                    placeholder="Unlimited"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">
                    Max Rewards per Day (per customer)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.rules.maxRewardsPerDay}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        rules: { ...form.rules, maxRewardsPerDay: e.target.value },
                      })
                    }
                    className={inputCls}
                    placeholder="Unlimited"
                  />
                </div>
                {showMilestoneFields && (
                  <>
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">
                        Milestone Order Count
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={form.rules.milestoneOrderCount}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            rules: { ...form.rules, milestoneOrderCount: e.target.value },
                          })
                        }
                        className={inputCls}
                        placeholder="e.g. 5th order"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">
                        Milestone Spend (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={form.rules.milestoneSpendAmount}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            rules: { ...form.rules, milestoneSpendAmount: e.target.value },
                          })
                        }
                        className={inputCls}
                        placeholder="Lifetime spend threshold"
                      />
                    </div>
                  </>
                )}
                {showNewShopAge && (
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">
                      New Shop Max Age (days)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={form.rules.newShopMaxAgeDays}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          rules: { ...form.rules, newShopMaxAgeDays: e.target.value },
                        })
                      }
                      className={inputCls}
                      placeholder="e.g. 30"
                    />
                  </div>
                )}
              </div>

              {showAnyScope && (
                <>
                  <SectionTitle>Scope Filters</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(showProductScope || selectedFamily === "coupons") && (
                      <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">
                          Product IDs (comma-separated)
                        </label>
                        <input
                          value={form.rules.productIdsText}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              rules: { ...form.rules, productIdsText: e.target.value },
                            })
                          }
                          className={inputCls}
                          placeholder="Product IDs"
                        />
                      </div>
                    )}
                    {(showCategoryScope || selectedFamily === "coupons") && (
                      <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">
                          Category IDs (comma-separated)
                        </label>
                        <input
                          value={form.rules.categoryIdsText}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              rules: { ...form.rules, categoryIdsText: e.target.value },
                            })
                          }
                          className={inputCls}
                          placeholder="Category IDs"
                        />
                      </div>
                    )}
                    {(showBrandScope || selectedFamily === "coupons") && (
                      <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">
                          Brand names (comma-separated)
                        </label>
                        <input
                          value={form.rules.brandIdsText}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              rules: { ...form.rules, brandIdsText: e.target.value },
                            })
                          }
                          className={inputCls}
                          placeholder="Brand names"
                        />
                      </div>
                    )}
                    {(showShopScope || selectedFamily === "coupons") && (
                      <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">
                          Shop / Store IDs
                        </label>
                        <input
                          value={form.rules.shopIdsText}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              rules: { ...form.rules, shopIdsText: e.target.value },
                            })
                          }
                          className={inputCls}
                          placeholder="Store IDs"
                        />
                      </div>
                    )}
                    <div className="md:col-span-2">
                      <label className="text-xs font-bold text-slate-500 mb-1 block">
                        City filters (optional)
                      </label>
                      <input
                        value={form.rules.cityIdsText}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            rules: { ...form.rules, cityIdsText: e.target.value },
                          })
                        }
                        className={inputCls}
                        placeholder="e.g. Indore, Bhopal"
                      />
                    </div>
                  </div>
                </>
              )}

              <SectionTitle>Budget & Limits</SectionTitle>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">
                    Total Budget (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.budgetLimit}
                    onChange={(e) => setForm({ ...form, budgetLimit: e.target.value })}
                    className={inputCls}
                    placeholder="No limit"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Daily Limit (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.dailyLimit}
                    onChange={(e) => setForm({ ...form, dailyLimit: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">
                    Monthly Limit (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.monthlyLimit}
                    onChange={(e) => setForm({ ...form, monthlyLimit: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">{editing ? "Save Changes" : "Create Campaign"}</Button>
              </div>
            </form>
          )}
        </div>
      </Modal>


      {/* View Detail Modal */}
      <Modal isOpen={!!viewCampaign} onClose={() => setViewCampaign(null)} title="Campaign Details" size="lg">
        {viewCampaign && (
          <div className="space-y-4 text-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">{viewCampaign.name}</h2>
                <p className="text-slate-500 mt-1">{viewCampaign.description || "No description"}</p>
              </div>
              <Badge variant={statusVariant(viewCampaign.status)}>{viewCampaign.status}</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                ["Type", viewCampaign.campaignType],
                ["Subtype", viewCampaign.rewardConfig?.rewardSubtype],
                ["Reward", formatReward(viewCampaign.rewardConfig)],
                ["Funding", viewCampaign.fundingSource],
                ["Priority", viewCampaign.priority],
                ["Grants", viewCampaign.stats?.totalGrants || 0],
                ["Amount Issued", `₹${viewCampaign.stats?.totalAmount || 0}`],
                ["Budget Used", `₹${viewCampaign.budgetUsed || 0}`],
                ["Min Purchase", `₹${viewCampaign.rules?.minPurchase || 0}`],
              ].map(([k, v]) => (
                <div key={k} className="bg-slate-50 dark:bg-gray-800 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">{k}</p>
                  <p className="font-semibold capitalize mt-0.5">{String(v).replace(/_/g, " ")}</p>
                </div>
              ))}
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-xs text-blue-800 dark:text-blue-200">
              <HiOutlineClock className="inline w-4 h-4 mr-1" />
              Active from <strong>{formatDate(viewCampaign.startAt)}</strong> until <strong>{formatDate(viewCampaign.endAt)}</strong>.
              Rewards credit on <strong>{viewCampaign.rewardConfig?.creditTiming?.replace(/_/g, " ")}</strong>.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default RewardCampaigns;
