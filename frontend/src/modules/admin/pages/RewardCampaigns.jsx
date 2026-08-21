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
  HiOutlineEye,
  HiOutlineBanknotes,
  HiOutlineUsers,
  HiOutlineClock,
  HiOutlineCheckCircle,
} from "react-icons/hi2";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { adminApi } from "../services/adminApi";
import { STATUSES, CAMPAIGN_TYPES } from "./rewardCampaigns/offerConfig";
import CampaignWizardModal from "./rewardCampaigns/CampaignWizardModal";

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

const RewardCampaigns = () => {
  const { showToast } = useToast();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewCampaign, setViewCampaign] = useState(null);
  const [editing, setEditing] = useState(null);
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
    setEditing(campaign);
    setModalOpen(true);
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

      <CampaignWizardModal
        open={modalOpen}
        editing={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          fetchCampaigns();
        }}
      />

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
