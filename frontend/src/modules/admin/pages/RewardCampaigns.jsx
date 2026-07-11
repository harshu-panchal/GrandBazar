import React, { useEffect, useState } from "react";
import Card from "@shared/components/ui/Card";
import Modal from "@shared/components/ui/Modal";
import Badge from "@shared/components/ui/Badge";
import { useToast } from "@shared/components/ui/Toast";
import { HiOutlinePlus, HiOutlineGift, HiOutlinePencilSquare, HiOutlineTrash } from "react-icons/hi2";
import { adminApi } from "../services/adminApi";

const CAMPAIGN_TYPES = ["cashback", "reward", "coupon", "referral"];
const STATUSES = ["draft", "active", "paused", "expired"];
const REWARD_SUBTYPES = [
  "instant_cashback",
  "future_cashback",
  "first_purchase",
  "repeat_purchase",
  "milestone",
  "birthday",
  "festival",
  "referral_registration",
  "referral_first_purchase",
];

const emptyForm = {
  name: "",
  description: "",
  campaignType: "cashback",
  priority: 100,
  status: "draft",
  startAt: "",
  endAt: "",
  fundingSource: "platform",
  budgetLimit: "",
  dailyLimit: "",
  rules: { minPurchase: 0, customerType: "all", maxRewardPerCustomer: "", maxRewardsPerDay: "" },
  rewardConfig: {
    rewardSubtype: "instant_cashback",
    valueType: "percent",
    value: 5,
    maxRewardAmount: 100,
    validityDays: 30,
    creditTiming: "on_delivery",
    delayedDays: 0,
  },
};

const RewardCampaigns = () => {
  const { showToast } = useToast();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getRewardCampaigns();
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

  const openModal = (campaign = null) => {
    if (campaign) {
      setEditing(campaign);
      setForm({
        ...emptyForm,
        ...campaign,
        startAt: campaign.startAt?.substring(0, 16) || "",
        endAt: campaign.endAt?.substring(0, 16) || "",
        rules: { ...emptyForm.rules, ...(campaign.rules || {}) },
        rewardConfig: { ...emptyForm.rewardConfig, ...(campaign.rewardConfig || {}) },
      });
    } else {
      setEditing(null);
      setForm(emptyForm);
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        budgetLimit: form.budgetLimit ? Number(form.budgetLimit) : null,
        dailyLimit: form.dailyLimit ? Number(form.dailyLimit) : null,
        priority: Number(form.priority) || 100,
      };
      if (editing) {
        await adminApi.updateRewardCampaign(editing._id, payload);
        showToast("Campaign updated", "success");
      } else {
        await adminApi.createRewardCampaign(payload);
        showToast("Campaign created", "success");
      }
      setModalOpen(false);
      fetchCampaigns();
    } catch (err) {
      showToast(err.response?.data?.message || "Save failed", "error");
    }
  };

  const toggleStatus = async (id, status) => {
    try {
      await adminApi.updateRewardCampaignStatus(id, status);
      showToast(`Campaign ${status}`, "success");
      fetchCampaigns();
    } catch {
      showToast("Status update failed", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this campaign?")) return;
    try {
      await adminApi.deleteRewardCampaign(id);
      showToast("Deleted", "success");
      fetchCampaigns();
    } catch {
      showToast("Delete failed", "error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HiOutlineGift className="w-8 h-8 text-primary-600" />
            Reward Campaigns
          </h1>
          <p className="text-gray-500 mt-1">Manage cashback, rewards, coupons & referral campaigns</p>
        </div>
        <button
          type="button"
          onClick={() => openModal()}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg"
        >
          <HiOutlinePlus className="w-5 h-5" /> New Campaign
        </button>
      </div>

      <Card>
        {loading ? (
          <p className="text-gray-500 p-4">Loading...</p>
        ) : campaigns.length === 0 ? (
          <p className="text-gray-500 p-8 text-center">No campaigns yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  {["Name", "Type", "Status", "Priority", "Budget Used", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c._id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 capitalize">{c.campaignType}</td>
                    <td className="px-4 py-3">
                      <Badge variant={c.status === "active" ? "success" : "default"}>{c.status}</Badge>
                    </td>
                    <td className="px-4 py-3">{c.priority}</td>
                    <td className="px-4 py-3">
                      ₹{c.budgetUsed || 0}
                      {c.budgetLimit ? ` / ₹${c.budgetLimit}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 items-center">
                        {c.status !== "active" && (
                          <button type="button" onClick={() => toggleStatus(c._id, "active")} className="text-green-600 text-xs font-medium">Activate</button>
                        )}
                        {c.status === "active" && (
                          <button type="button" onClick={() => toggleStatus(c._id, "paused")} className="text-amber-600 text-xs font-medium">Pause</button>
                        )}
                        <button type="button" onClick={() => openModal(c)} className="p-1 text-gray-500 hover:text-primary-600">
                          <HiOutlinePencilSquare className="w-5 h-5" />
                        </button>
                        <button type="button" onClick={() => handleDelete(c._id)} className="p-1 text-gray-500 hover:text-red-600">
                          <HiOutlineTrash className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Campaign" : "Create Campaign"}>
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Name</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select value={form.campaignType} onChange={(e) => setForm({ ...form, campaignType: e.target.value })} className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800">
                {CAMPAIGN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Start</label>
              <input type="datetime-local" required value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End</label>
              <input type="datetime-local" required value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Reward Subtype</label>
              <select value={form.rewardConfig.rewardSubtype} onChange={(e) => setForm({ ...form, rewardConfig: { ...form.rewardConfig, rewardSubtype: e.target.value } })} className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800">
                {REWARD_SUBTYPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Value ({form.rewardConfig.valueType})</label>
              <input type="number" min="0" value={form.rewardConfig.value} onChange={(e) => setForm({ ...form, rewardConfig: { ...form.rewardConfig, value: Number(e.target.value) } })} className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Min Purchase (₹)</label>
              <input type="number" min="0" value={form.rules.minPurchase} onChange={(e) => setForm({ ...form, rules: { ...form.rules, minPurchase: Number(e.target.value) } })} className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Budget Limit (₹)</label>
              <input type="number" min="0" value={form.budgetLimit} onChange={(e) => setForm({ ...form, budgetLimit: e.target.value })} className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg">{editing ? "Update" : "Create"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default RewardCampaigns;
