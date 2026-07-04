import React, { useEffect, useState } from "react";
import { adminApi } from "../services/adminApi";

export default function DisputeConsolePage() {
  const [disputes, setDisputes] = useState([]);
  const [note, setNote] = useState("");

  const load = () => {
    adminApi.listDisputes().then((res) => {
      setDisputes(res.data?.result?.items || res.data?.results?.items || []);
    }).catch(() => setDisputes([]));
  };

  useEffect(() => { load(); }, []);

  const resolve = async (disputeId, resolution) => {
    await adminApi.resolveDispute(disputeId, {
      resolution,
      refundAmount: resolution === "wallet_credit" ? 100 : 0,
      resolutionNote: note,
    });
    setNote("");
    load();
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-black">Dispute Console</h1>
      {disputes.map((d) => (
        <div key={d.disputeId} className="rounded-2xl border bg-white p-4">
          <div className="font-bold">#{d.disputeId} — Order {d.orderPublicId}</div>
          <p className="text-sm text-slate-600 mt-1">{d.reason}</p>
          <p className="text-xs text-slate-400 mt-1">Status: {d.status}</p>
          {d.status === "open" || d.status === "under_review" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => resolve(d.disputeId, "wallet_credit")} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white">Wallet credit</button>
              <button type="button" onClick={() => resolve(d.disputeId, "refund")} className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-bold text-white">Refund</button>
              <button type="button" onClick={() => resolve(d.disputeId, "reject")} className="rounded-lg bg-slate-200 px-3 py-1 text-xs font-bold">Reject</button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
