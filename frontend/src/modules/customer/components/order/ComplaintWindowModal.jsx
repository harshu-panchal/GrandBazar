import React, { useState } from "react";
import { customerApi } from "../../services/customerApi";
import { COMPLAINT_REASONS } from "@shared/constants/complaint";

const MAX_PHOTOS = 4;

// Customer Complaint Window (BRD section 4). Pick one or more products, a reason
// and up to 4 photos each, then submit as Feedback or Complaint. The 24h window
// is enforced server-side — this UI only guides.
export default function ComplaintWindowModal({ order, onClose, onSubmitted }) {
  const items = order?.items || [];
  const [selected, setSelected] = useState({}); // itemId -> { reason, reasonText, photos: [] }
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);

  const toggle = (id) =>
    setSelected((s) => {
      const next = { ...s };
      if (next[id]) delete next[id];
      else next[id] = { reason: COMPLAINT_REASONS[0].value, reasonText: "", photos: [] };
      return next;
    });

  const setField = (id, field, value) =>
    setSelected((s) => ({ ...s, [id]: { ...s[id], [field]: value } }));

  const addPhoto = async (id, file) => {
    if (!file) return;
    const entry = selected[id];
    if (entry.photos.length >= MAX_PHOTOS) {
      setErr(`At most ${MAX_PHOTOS} photos per product`);
      return;
    }
    setUploadingId(id);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await customerApi.uploadComplaintPhoto(fd);
      const url = res.data?.result?.url;
      if (url) setField(id, "photos", [...entry.photos, url]);
    } catch (e) {
      setErr(e.response?.data?.message || "Photo upload failed");
    } finally {
      setUploadingId(null);
    }
  };

  const selectedCount = Object.keys(selected).length;

  const submit = async (submitType) => {
    if (selectedCount === 0) {
      setErr("Select at least one product.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const payload = {
        submitType,
        items: Object.entries(selected).map(([orderItemId, v]) => ({
          orderItemId,
          reason: v.reason,
          reasonText: v.reasonText,
          photos: v.photos,
        })),
      };
      await customerApi.raiseComplaint(order.orderId || order._id, payload);
      onSubmitted?.(submitType);
      onClose?.();
    } catch (e) {
      setErr(e.response?.data?.message || "Submission failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">Report a problem</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-500">✕</button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Tick the product(s) with a problem. After 24 hours from delivery this window is disabled.
        </p>

        <div className="space-y-2 max-h-[55vh] overflow-y-auto">
          {items.map((it) => {
            const id = it._id;
            const sel = selected[id];
            return (
              <div key={id} className="rounded-xl border p-3">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={!!sel} onChange={() => toggle(id)} />
                  <b className="flex-1">{it.name}</b>
                  <span className="text-sm text-slate-500">₹{it.price}</span>
                </label>
                {sel && (
                  <div className="mt-2 space-y-2">
                    <select
                      value={sel.reason}
                      onChange={(e) => setField(id, "reason", e.target.value)}
                      className="w-full rounded-lg border px-2 py-1.5 text-sm"
                    >
                      {COMPLAINT_REASONS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    {sel.reason === "other" && (
                      <input
                        value={sel.reasonText}
                        onChange={(e) => setField(id, "reasonText", e.target.value)}
                        placeholder="Describe the problem"
                        className="w-full rounded-lg border px-2 py-1.5 text-sm"
                      />
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      {sel.photos.map((p, i) => (
                        <img key={i} src={p} alt="" className="h-12 w-12 rounded object-cover border" />
                      ))}
                      {sel.photos.length < MAX_PHOTOS && (
                        <label className="cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold text-slate-600">
                          {uploadingId === id ? "Uploading…" : `📷 Add photo (${sel.photos.length}/${MAX_PHOTOS})`}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => addPhoto(id, e.target.files?.[0])}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {err && <div className="mt-3 rounded-lg bg-red-50 text-red-600 text-sm px-3 py-2">{err}</div>}

        <div className="mt-4 flex gap-2">
          <button
            disabled={busy}
            onClick={() => submit("feedback")}
            className="rounded-lg border px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"
          >
            Submit as Feedback
          </button>
          <button
            disabled={busy}
            onClick={() => submit("complaint")}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            Submit as Complaint
          </button>
        </div>
      </div>
    </div>
  );
}
