import React, { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { adminApi } from "../services/adminApi";

// Shared building blocks for editing commission / handling / packing / GST /
// status straight from an admin table (categories and products), one row at a
// time or for many selected rows at once.

export const GST_SLABS = [0, 5, 12, 18, 28];

export const isCommissionApplied = (cat) =>
  cat.applyCommission === true ||
  (cat.applyCommission !== false && Number(cat.adminCommission || 0) > 0);

export const parsePercent = (raw) => {
  const text = String(raw ?? "").trim();
  if (text === "") return null;
  const percent = Number(text);
  return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : null;
};

// Blank means 0. Returns null when the input is invalid.
export const parseAmount = (raw) => {
  const text = String(raw ?? "").trim();
  if (text === "") return 0;
  const amount = Number(text);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
};

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

/* -------------------------------------------------------------------------- */
/* Click-to-edit table cell                                                    */
/* -------------------------------------------------------------------------- */

// `onSave(value)` resolves true when saved (cell closes) and false when it
// failed (cell stays open so the admin can retry).
export const EditableCell = ({ display, initialValue, onSave, options, optionLabel, prefix, suffix, max, centered = false }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const open = () => {
    setValue(String(initialValue ?? ""));
    setEditing(true);
  };

  const commit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (await onSave(value)) setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        onClick={open}
        title="Click to edit"
        className="px-2 py-1 -mx-2 rounded-md hover:bg-gray-100 hover:text-gray-900 transition-colors">
        {display}
      </button>
    );
  }

  const inputClass =
    "px-2 py-1 rounded-md border border-gray-300 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500";
  const onKeyDown = (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") setEditing(false);
  };

  return (
    <div className={cn("flex items-center gap-1", centered && "justify-center")}>
      {prefix && <span className="text-gray-400">{prefix}</span>}
      {options ? (
        <select
          autoFocus
          value={value}
          disabled={saving}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          className={inputClass}>
          {options.map((o) => (
            <option key={o} value={o}>
              {optionLabel ? optionLabel(o) : `${o}${suffix || ""}`}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="number"
          autoFocus
          min="0"
          max={max}
          step="any"
          value={value}
          disabled={saving}
          placeholder="—"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          className={cn(inputClass, "w-16")}
        />
      )}
      {suffix && !options && <span className="text-gray-400">{suffix}</span>}
      <button
        onClick={commit}
        disabled={saving}
        title="Save"
        className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-50">
        <Check className="w-4 h-4" />
      </button>
      <button
        onClick={() => setEditing(false)}
        disabled={saving}
        title="Cancel"
        className="p-1 text-gray-400 hover:bg-gray-100 rounded disabled:opacity-50">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Active / inactive toggle                                                    */
/* -------------------------------------------------------------------------- */

export const StatusToggle = ({ status, name, disabled, onToggle }) => {
  const active = status === "active";
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={`Toggle ${name || "item"} status`}
        disabled={disabled}
        onClick={onToggle}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
          active ? "bg-green-500" : "bg-gray-300",
        )}>
        <span
          className={cn(
            "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
            active ? "translate-x-4.5" : "translate-x-0.5",
          )}
        />
      </button>
      <span className={cn("text-xs font-semibold capitalize", active ? "text-green-600" : "text-gray-500")}>
        {status}
      </span>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Category API helpers                                                        */
/* -------------------------------------------------------------------------- */

// Maps the values produced by BulkRatesModal (or a single inline edit) to the
// bulk-charges request body. Only the keys present are changed server-side.
const toCategoryPayload = (ids, values) => {
  const payload = { ids };
  if (values.status !== undefined) payload.status = values.status;
  if (values.commission) {
    payload.applyCommission = values.commission.apply;
    payload.adminCommission = values.commission.percent;
  }
  if (values.handlingFees !== undefined) payload.handlingFees = values.handlingFees;
  if (values.packingFees !== undefined) payload.packingFees = values.packingFees;
  if (values.gstSlab !== undefined) payload.gstSlab = values.gstSlab;
  return payload;
};

// Local copy of what the server just saved, so a row can update without a refetch.
const toCategoryLocalPatch = (values) => {
  const patch = {};
  if (values.status !== undefined) patch.status = values.status;
  if (values.commission) {
    Object.assign(patch, {
      applyCommission: values.commission.apply,
      adminCommission: values.commission.percent,
      adminCommissionValue: values.commission.percent,
      adminCommissionType: "percentage",
    });
  }
  if (values.handlingFees !== undefined) patch.handlingFees = values.handlingFees;
  if (values.packingFees !== undefined) patch.packingFees = values.packingFees;
  if (values.gstSlab !== undefined) patch.gstSlab = values.gstSlab;
  return patch;
};

const idOf = (row) => row._id || row.id;

// Inline edits and the status toggle for a list of category rows held in the
// page's `categories` state. Rows update in place; nothing is refetched.
export const useCategoryRateActions = (setCategories) => {
  const [statusUpdatingIds, setStatusUpdatingIds] = useState([]);

  const patchRow = (id, patch) =>
    setCategories((prev) => prev.map((c) => (idOf(c) === id ? { ...c, ...patch } : c)));

  // Saves one rate on one row from the table. Returns true on success.
  const saveInlineCharge = async (cat, field, raw) => {
    const id = idOf(cat);
    let values;
    if (field === "commission") {
      const blank = String(raw ?? "").trim() === "";
      const percent = blank ? 0 : parsePercent(raw);
      if (percent === null) {
        toast.error("Commission must be between 0 and 100");
        return false;
      }
      values = { commission: { apply: !blank, percent } };
    } else if (field === "handlingFees" || field === "packingFees") {
      const amount = parseAmount(raw);
      if (amount === null) {
        toast.error("Amount must be 0 or more");
        return false;
      }
      values = { [field]: amount };
    } else {
      values = { gstSlab: Number(raw) };
    }

    try {
      await adminApi.bulkUpdateCategoryCharges(toCategoryPayload([id], values));
      patchRow(id, toCategoryLocalPatch(values));
      toast.success("Updated");
      return true;
    } catch (error) {
      toast.error(errorMessage(error, "Failed to update"));
      return false;
    }
  };

  // Flips active/inactive. Optimistic, rolled back on failure.
  const toggleStatus = async (cat) => {
    const id = idOf(cat);
    if (statusUpdatingIds.includes(id)) return;
    const previous = cat.status;
    const next = previous === "active" ? "inactive" : "active";

    setStatusUpdatingIds((prev) => [...prev, id]);
    patchRow(id, { status: next });
    try {
      await adminApi.bulkUpdateCategoryCharges({ ids: [id], status: next });
      toast.success(`${cat.name} is now ${next}`);
    } catch (error) {
      patchRow(id, { status: previous });
      toast.error(errorMessage(error, "Failed to update status"));
    } finally {
      setStatusUpdatingIds((prev) => prev.filter((x) => x !== id));
    }
  };

  // Applies BulkRatesModal values to many categories. Returns true on success.
  const bulkUpdate = async (ids, values) => {
    try {
      await adminApi.bulkUpdateCategoryCharges(toCategoryPayload(ids, values));
      toast.success(`Updated ${ids.length} categor${ids.length === 1 ? "y" : "ies"}`);
      return true;
    } catch (error) {
      toast.error(errorMessage(error, "Failed to update categories"));
      return false;
    }
  };

  return { saveInlineCharge, toggleStatus, statusUpdatingIds, bulkUpdate };
};

/* -------------------------------------------------------------------------- */
/* Bulk "Edit Rates" modal                                                     */
/* -------------------------------------------------------------------------- */

const EMPTY_FORM = {
  status: "",
  commissionMode: "keep",
  commission: "",
  handling: "",
  packing: "",
  packingMode: "keep",
  gst: "",
};

const fieldClass =
  "w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 disabled:bg-gray-50 disabled:text-gray-400";

// Every field defaults to "no change"; onSubmit receives only what was filled in:
//   { status?, commission?: { apply, percent }, handlingFees?, packingFees?, gstSlab? }
// For `override` modes (products) packingFees / gstSlab may be null = clear the
// override and fall back to the category value.
//   showStatus, showHandling: extra fields
//   packing: "amount" (category fee) | "override" (product override w/ clear)
//   gst: "slab" | "override" (adds an "Inherit from category" choice)
export const BulkRatesModal = ({
  open,
  count,
  noun = "categor",
  onClose,
  onSubmit,
  showStatus = false,
  showHandling = true,
  packing = "amount",
  gst = "slab",
  packingLabel = "Packing Charge (₹)",
}) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(EMPTY_FORM);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [open]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async () => {
    const values = {};

    if (showStatus && form.status) values.status = form.status;

    if (form.commissionMode === "set") {
      const percent = parsePercent(form.commission);
      if (percent === null) {
        toast.error("Enter a commission between 0 and 100");
        return;
      }
      values.commission = { apply: true, percent };
    } else if (form.commissionMode === "off") {
      values.commission = { apply: false, percent: 0 };
    }

    if (showHandling && String(form.handling).trim() !== "") {
      const amount = parseAmount(form.handling);
      if (amount === null) {
        toast.error("Handling fee must be 0 or more");
        return;
      }
      values.handlingFees = amount;
    }

    if (packing === "override") {
      if (form.packingMode === "set") {
        const amount = String(form.packing).trim() === "" ? null : parseAmount(form.packing);
        if (amount === null) {
          toast.error("Enter a packing charge of 0 or more");
          return;
        }
        values.packingFees = amount;
      } else if (form.packingMode === "clear") {
        values.packingFees = null;
      }
    } else if (packing && String(form.packing).trim() !== "") {
      const amount = parseAmount(form.packing);
      if (amount === null) {
        toast.error("Packing charge must be 0 or more");
        return;
      }
      values.packingFees = amount;
    }

    if (gst) {
      if (form.gst === "inherit") values.gstSlab = null;
      else if (form.gst !== "") values.gstSlab = Number(form.gst);
    }

    if (Object.keys(values).length === 0) {
      toast.error("Fill in at least one field to update");
      return;
    }

    setSaving(true);
    try {
      if (await onSubmit(values)) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-hidden overscroll-contain">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden relative z-10">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Edit Rates</h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <p className="text-sm text-gray-500">
                Applies to{" "}
                <span className="font-semibold text-gray-900">
                  {count} selected {noun === "categor" ? `categor${count === 1 ? "y" : "ies"}` : `${noun}${count === 1 ? "" : "s"}`}
                </span>
                . Only the fields you fill in are changed; the rest stay as they are.
              </p>

              {showStatus && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Status</label>
                  <select value={form.status} onChange={(e) => set({ status: e.target.value })} className={fieldClass}>
                    <option value="">No change</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Admin Commission (%)</label>
                <div className="flex gap-2">
                  <select
                    value={form.commissionMode}
                    onChange={(e) => set({ commissionMode: e.target.value })}
                    className={cn(fieldClass, "w-auto")}>
                    <option value="keep">No change</option>
                    <option value="set">Set to…</option>
                    <option value="off">Turn off</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={form.commission}
                    disabled={form.commissionMode !== "set"}
                    onChange={(e) => set({ commission: e.target.value })}
                    className={cn(fieldClass, "flex-1 min-w-0")}
                    placeholder="e.g., 10"
                  />
                </div>
              </div>

              {(showHandling || packing) && (
              <div className="grid grid-cols-2 gap-4">
                {showHandling && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Handling Fees (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={form.handling}
                      onChange={(e) => set({ handling: e.target.value })}
                      className={fieldClass}
                      placeholder="No change"
                    />
                  </div>
                )}
                {!packing ? null : packing === "amount" ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">{packingLabel}</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={form.packing}
                      onChange={(e) => set({ packing: e.target.value })}
                      className={fieldClass}
                      placeholder="No change"
                    />
                  </div>
                ) : (
                  <div className={cn("space-y-2", !showHandling && "col-span-2")}>
                    <label className="text-sm font-medium text-gray-700">{packingLabel}</label>
                    <div className="flex gap-2">
                      <select
                        value={form.packingMode}
                        onChange={(e) => set({ packingMode: e.target.value })}
                        className={cn(fieldClass, "w-auto")}>
                        <option value="keep">No change</option>
                        <option value="set">Set to…</option>
                        <option value="clear">Use category</option>
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={form.packing}
                        disabled={form.packingMode !== "set"}
                        onChange={(e) => set({ packing: e.target.value })}
                        className={cn(fieldClass, "flex-1 min-w-0")}
                        placeholder="₹"
                      />
                    </div>
                  </div>
                )}
              </div>
              )}

              {gst && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">GST Slab (%)</label>
                <select value={form.gst} onChange={(e) => set({ gst: e.target.value })} className={fieldClass}>
                  <option value="">No change</option>
                  {gst === "override" && <option value="inherit">Use category GST</option>}
                  {GST_SLABS.map((slab) => (
                    <option key={slab} value={slab}>
                      {slab}%
                    </option>
                  ))}
                </select>
              </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 shrink-0">
              <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="px-4 py-2 bg-black text-primary-foreground rounded-lg hover:bg-brand-700 font-medium disabled:opacity-50 flex items-center gap-2">
                {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Update {count}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
