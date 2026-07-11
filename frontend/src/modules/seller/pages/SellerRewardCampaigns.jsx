import React, { useEffect, useState } from "react";
import { HiOutlineGift, HiOutlinePlus } from "react-icons/hi2";
import Modal from "@shared/components/ui/Modal";
import { useToast } from "@shared/components/ui/Toast";
import { sellerApi } from "../services/sellerApi";

const SellerRewardCampaigns = () => {
  const { showToast } = useToast();
  const [campaigns, setCampaigns] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    campaignType: "cashback",
    status: "draft",
    startAt: "",
    endAt: "",
    budgetLimit: 5000,
    rewardConfig: {
      rewardSubtype: "instant_cashback",
      valueType: "percent",
      value: 5,
      maxRewardAmount: 50,
      creditTiming: "on_delivery",
    },
    rules: { minPurchase: 200 },
  });

  const fetchCampaigns = async () => {
    try {
      const res = await sellerApi.getRewardCampaigns();
      setCampaigns(res.data?.result ?? []);
    } catch {
      showToast("Failed to load campaigns", "error");
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await sellerApi.createRewardCampaign(form);
      showToast("Campaign created", "success");
      setModalOpen(false);
      fetchCampaigns();
    } catch (err) {
      showToast(err.response?.data?.message || "Failed", "error");
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
          <p className="text-gray-500 mt-1">Run promotional cashback within platform limits</p>
        </div>
        <button type="button" onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg">
          <HiOutlinePlus className="w-5 h-5" /> New Campaign
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center border border-gray-100">
          <p className="text-gray-500">No campaigns yet. Create one to reward your customers.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((c) => (
            <div key={c._id} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 flex justify-between">
              <div>
                <p className="font-semibold">{c.name}</p>
                <p className="text-sm text-gray-500 capitalize">{c.campaignType} · {c.status}</p>
                <p className="text-xs text-gray-400 mt-1">Budget: ₹{c.budgetUsed || 0} / ₹{c.budgetLimit || "∞"}</p>
              </div>
              <span className="text-sm font-medium text-primary-600">{c.rewardConfig?.value}{c.rewardConfig?.valueType === "percent" ? "%" : "₹"}</span>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Create Campaign">
        <form onSubmit={handleSubmit} className="space-y-4">
          <input required placeholder="Campaign name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
          <input type="datetime-local" required value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
          <input type="datetime-local" required value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
          <input type="number" placeholder="Cashback %" value={form.rewardConfig.value} onChange={(e) => setForm({ ...form, rewardConfig: { ...form.rewardConfig, value: Number(e.target.value) } })} className="w-full border rounded-lg px-3 py-2" />
          <button type="submit" className="w-full py-2 bg-primary-600 text-white rounded-lg">Create</button>
        </form>
      </Modal>
    </div>
  );
};

export default SellerRewardCampaigns;
