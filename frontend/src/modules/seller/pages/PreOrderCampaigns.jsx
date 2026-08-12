import React, { useEffect, useMemo, useState } from "react";
import { HiOutlineMegaphone, HiOutlinePlus, HiOutlineXMark, HiOutlineTrash } from "react-icons/hi2";
import { Loader2 } from "lucide-react";
import Button from "@shared/components/ui/Button";
import Input from "@shared/components/ui/Input";
import Badge from "@shared/components/ui/Badge";
import { useToast } from "@shared/components/ui/Toast";
import { sellerApi } from "../services/sellerApi";

const STATUS_VARIANT = {
  draft: "secondary",
  active: "info",
  sale_started: "success",
  completed: "secondary",
  cancelled: "danger",
};

const emptyForm = () => ({
  title: "",
  description: "",
  status: "draft",
  saleStartAt: "",
  saleEndAt: "",
  deliveryStartDate: "",
  deliveryEndDate: "",
  timezone: "Asia/Kolkata",
  products: [],
  deliveryWindows: [],
});

const PreOrderCampaigns = () => {
  const { showToast } = useToast();
  const [campaigns, setCampaigns] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const extractArray = (res) => {
    const d = res?.data ?? res;
    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.results)) return d.results;
    if (Array.isArray(d?.result)) return d.result;
    if (Array.isArray(d?.result?.items)) return d.result.items;
    if (Array.isArray(d?.result?.campaigns)) return d.result.campaigns;
    if (Array.isArray(d?.result?.products)) return d.result.products;
    if (Array.isArray(d?.data)) return d.data;
    if (Array.isArray(d?.data?.products)) return d.data.products;
    if (Array.isArray(d?.products)) return d.products;
    if (Array.isArray(d?.items)) return d.items;
    return [];
  };

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const res = await sellerApi.listCampaigns();
      setCampaigns(extractArray(res));
    } catch (e) {
      showToast(e?.response?.data?.message || "Failed to load campaigns", "error");
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      const res = await sellerApi.getProducts({ limit: 200 });
      setProducts(extractArray(res).filter((p) => p.isPreorderEligible === true));
    } catch (e) {
      setProducts([]);
    }
  };

  useEffect(() => {
    loadCampaigns();
    loadProducts();
  }, []);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const addProductRow = () => {
    setForm((prev) => ({
      ...prev,
      products: [...prev.products, { product: "", allocationCap: 10, priceOverride: "" }],
    }));
  };

  const updateProductRow = (idx, key, value) => {
    setForm((prev) => {
      const next = [...prev.products];
      next[idx] = { ...next[idx], [key]: value };
      return { ...prev, products: next };
    });
  };

  const removeProductRow = (idx) => {
    setForm((prev) => ({ ...prev, products: prev.products.filter((_, i) => i !== idx) }));
  };

  const addSlotRow = () => {
    setForm((prev) => ({
      ...prev,
      deliveryWindows: [
        ...prev.deliveryWindows,
        { label: "", start: "09:00", end: "12:00", capacityPerDay: 50 },
      ],
    }));
  };

  const updateSlotRow = (idx, key, value) => {
    setForm((prev) => {
      const next = [...prev.deliveryWindows];
      next[idx] = { ...next[idx], [key]: value };
      return { ...prev, deliveryWindows: next };
    });
  };

  const removeSlotRow = (idx) => {
    setForm((prev) => ({ ...prev, deliveryWindows: prev.deliveryWindows.filter((_, i) => i !== idx) }));
  };

  const resetForm = () => {
    setForm(emptyForm());
    setShowForm(false);
  };

  const validate = () => {
    if (!form.title.trim()) return "Title is required";
    if (!form.saleStartAt || !form.saleEndAt) return "Sale window is required";
    if (new Date(form.saleEndAt) <= new Date(form.saleStartAt)) return "Sale end must be after start";
    if (!form.deliveryStartDate || !form.deliveryEndDate) return "Delivery window is required";
    if (new Date(form.deliveryEndDate) < new Date(form.deliveryStartDate))
      return "Delivery end must be on/after start";
    if (!form.products.length) return "Add at least one product";
    for (const p of form.products) {
      if (!p.product) return "Select a product for every row";
      if (!p.allocationCap || Number(p.allocationCap) < 1) return "Allocation cap must be at least 1";
    }
    for (const w of form.deliveryWindows) {
      if (!w.label.trim()) return "Every delivery slot needs a label";
      if (!w.start || !w.end) return "Every delivery slot needs a start and end time";
      if (!w.capacityPerDay || Number(w.capacityPerDay) < 1) return "Slot capacity must be at least 1";
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      showToast(err, "error");
      return;
    }
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      status: form.status,
      saleWindow: {
        startAt: new Date(form.saleStartAt).toISOString(),
        endAt: new Date(form.saleEndAt).toISOString(),
      },
      deliveryWindow: {
        startDate: new Date(form.deliveryStartDate).toISOString(),
        endDate: new Date(form.deliveryEndDate).toISOString(),
      },
      timezone: form.timezone,
      deliveryWindows: form.deliveryWindows.map((w) => ({
        label: w.label.trim(),
        start: w.start,
        end: w.end,
        capacityPerDay: Number(w.capacityPerDay),
      })),
      products: form.products.map((p) => ({
        product: p.product,
        allocationCap: Number(p.allocationCap),
        ...(p.priceOverride !== "" && p.priceOverride != null
          ? { priceOverride: Number(p.priceOverride) }
          : {}),
      })),
    };
    try {
      setSaving(true);
      await sellerApi.createCampaign(payload);
      showToast("Campaign created", "success");
      resetForm();
      loadCampaigns();
    } catch (e) {
      showToast(e?.response?.data?.message || "Failed to create campaign", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (campaignId) => {
    if (!window.confirm("Cancel this campaign? Active pre-orders may be affected.")) return;
    try {
      await sellerApi.cancelCampaign(campaignId, { reason: "Cancelled by seller" });
      showToast("Campaign cancelled", "success");
      loadCampaigns();
    } catch (e) {
      showToast(e?.response?.data?.message || "Failed to cancel campaign", "error");
    }
  };

  const productLabel = useMemo(() => {
    const map = new Map();
    products.forEach((p) => map.set(String(p._id), p.name || p.title || p.productName || "Product"));
    return map;
  }, [products]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <HiOutlineMegaphone className="w-8 h-8 text-primary-600" />
            Pre-Order Campaigns
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Create campaigns with a sale window and delivery window. Customers pre-order within the sale
            window; orders are processed when the sale starts.
          </p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-2">
          {showForm ? <HiOutlineXMark className="w-5 h-5" /> : <HiOutlinePlus className="w-5 h-5" />}
          {showForm ? "Close" : "New Campaign"}
        </Button>
      </div>

      {showForm && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <Input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="Diwali Pre-Order Sale" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2"
                value={form.status}
                onChange={(e) => setField("status", e.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="active">Active (schedule sale start)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <Input value={form.description} onChange={(e) => setField("description", e.target.value)} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Sale Start</label>
              <Input type="datetime-local" value={form.saleStartAt} onChange={(e) => setField("saleStartAt", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Sale End</label>
              <Input type="datetime-local" value={form.saleEndAt} onChange={(e) => setField("saleEndAt", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Delivery Window Start</label>
              <Input type="date" value={form.deliveryStartDate} onChange={(e) => setField("deliveryStartDate", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Delivery Window End</label>
              <Input type="date" value={form.deliveryEndDate} onChange={(e) => setField("deliveryEndDate", e.target.value)} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Products & Allocation</label>
              <Button variant="secondary" size="sm" onClick={addProductRow} className="flex items-center gap-1">
                <HiOutlinePlus className="w-4 h-4" /> Add Product
              </Button>
            </div>
            <div className="space-y-2">
              {form.products.map((row, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <select
                    className="col-span-6 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-2 text-sm"
                    value={row.product}
                    onChange={(e) => updateProductRow(idx, "product", e.target.value)}
                  >
                    <option value="">Select product…</option>
                    {products.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name || p.title || p.productName || "Product"}
                      </option>
                    ))}
                  </select>
                  <Input
                    className="col-span-3"
                    type="number"
                    min="1"
                    placeholder="Cap"
                    value={row.allocationCap}
                    onChange={(e) => updateProductRow(idx, "allocationCap", e.target.value)}
                  />
                  <Input
                    className="col-span-2"
                    type="number"
                    min="0"
                    placeholder="Price"
                    value={row.priceOverride}
                    onChange={(e) => updateProductRow(idx, "priceOverride", e.target.value)}
                  />
                  <button
                    type="button"
                    className="col-span-1 flex justify-center text-red-500 hover:text-red-700"
                    onClick={() => removeProductRow(idx)}
                  >
                    <HiOutlineTrash className="w-5 h-5" />
                  </button>
                </div>
              ))}
              {!form.products.length && (
                <p className="text-sm text-gray-400">No products added yet.</p>
              )}
              {!products.length && (
                <p className="text-xs text-amber-600 font-medium">
                  No products are marked "Available for future/pre-order" yet. Enable that toggle on a product in Product Management before adding it here.
                </p>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Delivery Time Slots (optional)</label>
              <Button variant="secondary" size="sm" onClick={addSlotRow} className="flex items-center gap-1">
                <HiOutlinePlus className="w-4 h-4" /> Add Slot
              </Button>
            </div>
            <p className="text-xs text-gray-400 mb-2">
              Define same-day delivery windows within the campaign's delivery date range. Leave empty to let customers pick any date in that range with no time-of-day slots.
            </p>
            <div className="space-y-2">
              {form.deliveryWindows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <Input
                    className="col-span-4"
                    placeholder="Label (e.g. 9 AM - 12 PM)"
                    value={row.label}
                    onChange={(e) => updateSlotRow(idx, "label", e.target.value)}
                  />
                  <Input
                    className="col-span-3"
                    type="time"
                    value={row.start}
                    onChange={(e) => updateSlotRow(idx, "start", e.target.value)}
                  />
                  <Input
                    className="col-span-3"
                    type="time"
                    value={row.end}
                    onChange={(e) => updateSlotRow(idx, "end", e.target.value)}
                  />
                  <Input
                    className="col-span-1"
                    type="number"
                    min="1"
                    placeholder="Cap/day"
                    value={row.capacityPerDay}
                    onChange={(e) => updateSlotRow(idx, "capacityPerDay", e.target.value)}
                  />
                  <button
                    type="button"
                    className="col-span-1 flex justify-center text-red-500 hover:text-red-700"
                    onClick={() => removeSlotRow(idx)}
                  >
                    <HiOutlineTrash className="w-5 h-5" />
                  </button>
                </div>
              ))}
              {!form.deliveryWindows.length && (
                <p className="text-sm text-gray-400">No delivery slots configured — customers will just pick a date.</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={resetForm} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Campaign
            </Button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="p-10 text-center">
            <HiOutlineMegaphone className="w-10 h-10 text-primary-400 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">No campaigns yet</h3>
            <p className="text-gray-500 dark:text-gray-400">Create your first pre-order campaign to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {campaigns.map((c) => (
              <div key={c._id || c.campaignId} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-white">{c.title}</span>
                    <Badge variant={STATUS_VARIANT[c.status] || "secondary"}>{c.status}</Badge>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    Sale: {c.saleWindow?.startAt ? new Date(c.saleWindow.startAt).toLocaleString() : "—"} →{" "}
                    {c.saleWindow?.endAt ? new Date(c.saleWindow.endAt).toLocaleString() : "—"}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {(c.products || []).length} product(s) ·{" "}
                    {(c.products || [])
                      .map((p) => productLabel.get(String(p.product?._id || p.product)) || "Product")
                      .slice(0, 3)
                      .join(", ")}
                  </p>
                </div>
                {["draft", "active", "sale_started"].includes(c.status) && (
                  <Button variant="danger" size="sm" onClick={() => handleCancel(c.campaignId)}>
                    Cancel
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PreOrderCampaigns;
