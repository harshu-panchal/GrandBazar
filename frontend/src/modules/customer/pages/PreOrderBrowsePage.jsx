import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { customerApi } from "../services/customerApi";

export default function PreOrderBrowsePage() {
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => {
    customerApi.getActiveCampaigns().then((res) => {
      setCampaigns(res.data?.result || res.data?.results || []);
    }).catch(() => setCampaigns([]));
  }, []);

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-4">
      <h1 className="text-xl font-black text-slate-900">Pre-Order Campaigns</h1>
      {campaigns.length === 0 ? (
        <p className="text-sm text-slate-500">No active pre-order campaigns right now.</p>
      ) : (
        campaigns.map((c) => (
          <Link
            key={c.campaignId}
            to={`/preorder/${c.campaignId}`}
            className="block rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
          >
            <h2 className="font-bold text-slate-900">{c.title}</h2>
            <p className="mt-1 text-xs text-slate-500">{c.description}</p>
          </Link>
        ))
      )}
    </div>
  );
}
