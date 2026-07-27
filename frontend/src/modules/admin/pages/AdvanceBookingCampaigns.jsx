import React, { useCallback, useEffect, useState } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Button from "@shared/components/ui/Button";
import Input from "@shared/components/ui/Input";
import PageHeader from "@shared/components/ui/PageHeader";
import { useToast } from "@shared/components/ui/Toast";
import {
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineCalendarDays,
  HiOutlinePencilSquare,
} from "react-icons/hi2";
import { Loader2 } from "lucide-react";
import { adminApi } from "../services/adminApi";

const emptyProductRow = () => ({
  sellerId: "",
  product: "",
  allocationCap: 50,
  priceOverride: "",
});

const emptyForm = () => ({
  title: "",
  description: "",
  bookingStartAt: "",
  bookingEndAt: "",
  deliveryStartDate: "",
  deliveryEndDate: "",
  status: "active",
  products: [emptyProductRow()],
});

const toLocalDateTimeInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const toLocalDateInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const AdvanceBookingCampaigns = () => {
  const { showToast } = useToast();
  const [campaigns, setCampaigns] = useState([]);
  const [stores, setStores] = useState([]);
  const [productsBySeller, setProductsBySeller] = useState({});
  const [loadingProductsFor, setLoadingProductsFor] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());

  const extractList = (res) => {
    const payload = res?.data?.result ?? res?.data?.results ?? res?.data;
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.campaigns)) return payload.campaigns;
    return [];
  };

  const loadCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.listAdvanceBookings();
      setCampaigns(extractList(res));
    } catch (error) {
      showToast(error?.response?.data?.message || "Failed to load advance bookings", "error");
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadStores = useCallback(async () => {
    try {
      const res = await adminApi.getActiveSellers({ limit: 200 });
      const rows = extractList(res);
      setStores(
        rows
          .map((row) => ({
            id: String(row._id || row.storeId || row.id || ""),
            name: row.shopName || row.name || "Store",
          }))
          .filter((row) => row.id),
      );
    } catch {
      setStores([]);
    }
  }, []);

  const loadStoreProducts = useCallback(async (sellerId) => {
    if (!sellerId) return;
    if (productsBySeller[sellerId]) return;
    setLoadingProductsFor((prev) => ({ ...prev, [sellerId]: true }));
    try {
      const res = await adminApi.getProducts({ sellerId, limit: 200, status: "active" });
      setProductsBySeller((prev) => ({
        ...prev,
        [sellerId]: extractList(res),
      }));
    } catch {
      setProductsBySeller((prev) => ({ ...prev, [sellerId]: [] }));
    } finally {
      setLoadingProductsFor((prev) => ({ ...prev, [sellerId]: false }));
    }
  }, [productsBySeller]);

  useEffect(() => {
    loadCampaigns();
    loadStores();
  }, [loadCampaigns, loadStores]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
  };

  const updateProductRow = (idx, key, value) => {
    setForm((prev) => {
      const next = [...prev.products];
      const row = { ...next[idx], [key]: value };
      if (key === "sellerId") {
        row.product = "";
        if (value) loadStoreProducts(value);
      }
      next[idx] = row;
      return { ...prev, products: next };
    });
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = async (campaign) => {
    const productRows = (campaign.products || []).map((row) => {
      const sellerId = String(
        row.seller?._id || row.seller || campaign.seller?._id || campaign.seller || "",
      );
      return {
        sellerId,
        product: String(row.product?._id || row.product || ""),
        allocationCap: row.allocationCap ?? 50,
        priceOverride:
          row.priceOverride === null || row.priceOverride === undefined
            ? ""
            : row.priceOverride,
      };
    });

    const sellerIds = [...new Set(productRows.map((r) => r.sellerId).filter(Boolean))];
    await Promise.all(sellerIds.map((id) => loadStoreProducts(id)));

    setEditingId(campaign.campaignId);
    setForm({
      title: campaign.title || "",
      description: campaign.description || "",
      bookingStartAt: toLocalDateTimeInput(campaign.saleWindow?.startAt),
      bookingEndAt: toLocalDateTimeInput(campaign.saleWindow?.endAt),
      deliveryStartDate: toLocalDateInput(campaign.deliveryWindow?.startDate),
      deliveryEndDate: toLocalDateInput(campaign.deliveryWindow?.endDate),
      status: campaign.status || "active",
      products: productRows.length ? productRows : [emptyProductRow()],
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const buildPayload = () => {
    const products = form.products
      .filter((row) => row.product && row.sellerId)
      .map((row) => ({
        product: row.product,
        sellerId: row.sellerId,
        allocationCap: Number(row.allocationCap || 50),
        priceOverride: row.priceOverride === "" ? null : Number(row.priceOverride),
      }));
    return {
      title: form.title.trim(),
      description: form.description.trim(),
      status: form.status || "active",
      saleWindow: {
        startAt: new Date(form.bookingStartAt).toISOString(),
        endAt: new Date(form.bookingEndAt).toISOString(),
      },
      deliveryWindow: {
        startDate: new Date(form.deliveryStartDate).toISOString(),
        endDate: new Date(form.deliveryEndDate).toISOString(),
      },
      products,
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      showToast("Campaign title is required", "error");
      return;
    }
    if (!form.bookingStartAt || !form.bookingEndAt || !form.deliveryStartDate || !form.deliveryEndDate) {
      showToast("Booking and delivery windows are required", "error");
      return;
    }
    const payload = buildPayload();
    if (!payload.products.length) {
      showToast("Add at least one product (with store)", "error");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await adminApi.updateAdvanceBooking(editingId, payload);
        showToast("Advance booking updated", "success");
      } else {
        await adminApi.createAdvanceBooking(payload);
        showToast("Advance booking campaign created", "success");
      }
      resetForm();
      loadCampaigns();
    } catch (error) {
      showToast(
        error?.response?.data?.message ||
          (editingId ? "Failed to update campaign" : "Failed to create campaign"),
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (campaignId) => {
    if (!window.confirm("Cancel this advance booking campaign?")) return;
    try {
      await adminApi.cancelAdvanceBooking(campaignId, { reason: "Cancelled by admin" });
      showToast("Campaign cancelled", "success");
      if (editingId === campaignId) resetForm();
      loadCampaigns();
    } catch (error) {
      showToast(error?.response?.data?.message || "Failed to cancel", "error");
    }
  };

  const handleDelete = async (campaignId) => {
    if (
      !window.confirm(
        "Permanently delete this advance booking? This cannot be undone.",
      )
    ) {
      return;
    }
    try {
      await adminApi.deleteAdvanceBooking(campaignId);
      showToast("Advance booking deleted", "success");
      if (editingId === campaignId) resetForm();
      loadCampaigns();
    } catch (error) {
      showToast(error?.response?.data?.message || "Failed to delete", "error");
    }
  };

  const formatRange = (start, end) => {
    if (!start || !end) return "—";
    return `${new Date(start).toLocaleString("en-IN")} → ${new Date(end).toLocaleString("en-IN")}`;
  };

  const storeNamesForCampaign = (campaign) => {
    const names = [];
    const push = (s) => {
      const n = s?.shopName || s?.name;
      if (n && !names.includes(n)) names.push(n);
    };
    push(campaign.seller);
    for (const s of campaign.sellers || []) push(s);
    for (const row of campaign.products || []) push(row.seller);
    return names;
  };

  const canEdit = (campaign) =>
    campaign.status !== "cancelled" && campaign.status !== "completed";

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Advance Order Booking"
        description="Add products from one or many stores, set booking open time, and delivery window."
        actions={
          <Button
            onClick={() => {
              if (showForm) resetForm();
              else openCreate();
            }}
            className="gap-2"
          >
            <HiOutlinePlus className="h-4 w-4" />
            {showForm ? "Close form" : "New advance booking"}
          </Button>
        }
      />

      {showForm && (
        <Card className="p-5 space-y-4 border-none shadow-xl ring-1 ring-slate-100">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-700">
              {editingId ? "Edit advance booking" : "New advance booking"}
            </h2>
            {editingId ? (
              <Badge className="text-[9px] font-black uppercase bg-amber-50 text-amber-700 border-none">
                Editing
              </Badge>
            ) : null}
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Campaign title"
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="e.g. Rakhi Festival"
              required
            />

            <textarea
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              rows={2}
              placeholder="Short description for customers"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Booking starts"
                type="datetime-local"
                value={form.bookingStartAt}
                onChange={(e) => setField("bookingStartAt", e.target.value)}
                required
              />
              <Input
                label="Booking ends"
                type="datetime-local"
                value={form.bookingEndAt}
                onChange={(e) => setField("bookingEndAt", e.target.value)}
                required
              />
              <Input
                label="Delivery from"
                type="date"
                value={form.deliveryStartDate}
                onChange={(e) => setField("deliveryStartDate", e.target.value)}
                required
              />
              <Input
                label="Delivery until"
                type="date"
                value={form.deliveryEndDate}
                onChange={(e) => setField("deliveryEndDate", e.target.value)}
                required
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-600">
                    Products (any stores)
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Each row: pick a store, then a product from that store.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      products: [...prev.products, emptyProductRow()],
                    }))
                  }
                  className="text-[10px] font-black uppercase text-brand-700 shrink-0"
                >
                  + Add product
                </button>
              </div>

              {form.products.map((row, idx) => {
                const options = productsBySeller[row.sellerId] || [];
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end rounded-xl border border-slate-100 bg-slate-50/60 p-3"
                  >
                    <div className="md:col-span-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                        Store
                      </label>
                      <select
                        value={row.sellerId}
                        onChange={(e) => updateProductRow(idx, "sellerId", e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold bg-white"
                        required
                      >
                        <option value="">Select store…</option>
                        {stores.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-4">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                        Product
                      </label>
                      <select
                        value={row.product}
                        onChange={(e) => updateProductRow(idx, "product", e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold bg-white"
                        required
                        disabled={!row.sellerId || loadingProductsFor[row.sellerId]}
                      >
                        <option value="">
                          {!row.sellerId
                            ? "Select store first…"
                            : loadingProductsFor[row.sellerId]
                              ? "Loading…"
                              : "Select product…"}
                        </option>
                        {options.map((product) => (
                          <option key={product._id} value={product._id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <Input
                        label="Cap"
                        type="number"
                        min={1}
                        value={row.allocationCap}
                        onChange={(e) => updateProductRow(idx, "allocationCap", e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Input
                        label="Price override"
                        type="number"
                        min={0}
                        value={row.priceOverride}
                        onChange={(e) => updateProductRow(idx, "priceOverride", e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-1 pb-1">
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            products: prev.products.filter((_, i) => i !== idx),
                          }))
                        }
                        className="p-2.5 rounded-xl text-rose-500 hover:bg-rose-50"
                        disabled={form.products.length <= 1}
                      >
                        <HiOutlineTrash className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : editingId ? (
                  "Save changes"
                ) : (
                  "Publish advance booking"
                )}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="border-none shadow-xl ring-1 ring-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No admin advance booking campaigns yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {campaigns.map((campaign) => {
              const names = storeNamesForCampaign(campaign);
              return (
                <div key={campaign.campaignId} className="p-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-black text-slate-900">{campaign.title}</h3>
                        <Badge className="text-[9px] font-black uppercase">{campaign.status}</Badge>
                      </div>
                      <p className="text-xs font-semibold text-slate-500 mt-1">
                        Stores: {names.length ? names.join(", ") : "—"}
                      </p>
                      {campaign.description ? (
                        <p className="text-xs text-slate-500 mt-1">{campaign.description}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {canEdit(campaign) && (
                        <Button
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => openEdit(campaign)}
                        >
                          <HiOutlinePencilSquare className="h-4 w-4" />
                          Edit
                        </Button>
                      )}
                      {canEdit(campaign) && (
                        <Button
                          variant="outline"
                          onClick={() => handleCancel(campaign.campaignId)}
                        >
                          Cancel
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        className="gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50"
                        onClick={() => handleDelete(campaign.campaignId)}
                      >
                        <HiOutlineTrash className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-semibold text-slate-600">
                    <p className="flex items-start gap-2">
                      <HiOutlineCalendarDays className="h-4 w-4 text-violet-600 shrink-0 mt-0.5" />
                      <span>
                        <span className="font-black uppercase tracking-widest text-[10px] text-slate-400 block">
                          Booking window
                        </span>
                        {formatRange(campaign.saleWindow?.startAt, campaign.saleWindow?.endAt)}
                      </span>
                    </p>
                    <p className="flex items-start gap-2">
                      <HiOutlineCalendarDays className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
                      <span>
                        <span className="font-black uppercase tracking-widest text-[10px] text-slate-400 block">
                          Delivery window
                        </span>
                        {formatRange(
                          campaign.deliveryWindow?.startDate,
                          campaign.deliveryWindow?.endDate,
                        )}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(campaign.products || []).map((row) => (
                      <Badge
                        key={String(row.product?._id || row.product)}
                        className="bg-slate-100 text-slate-700 border-none text-[10px] font-bold"
                      >
                        {row.product?.name || "Product"}
                        {row.seller?.shopName ? ` · ${row.seller.shopName}` : ""}
                        {" · cap "}
                        {row.allocationCap}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};

export default AdvanceBookingCampaigns;
