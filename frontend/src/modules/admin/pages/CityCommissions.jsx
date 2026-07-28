import React, { useEffect, useMemo, useState } from "react";
import Card from "@shared/components/ui/Card";
import { useToast } from "@shared/components/ui/Toast";
import { adminApi } from "../services/adminApi";

const defaultForm = {
  cityKey: "",
  cityName: "",
  applyCommission: false,
  adminCommissionType: "percentage",
  adminCommissionValue: 0,
  adminCommissionFixedRule: "per_qty",
};

function normalizeCityKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

const CityCommissions = () => {
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [cityRows, setCityRows] = useState([]);
  const [form, setForm] = useState(defaultForm);

  const loadRows = async (q = "") => {
    try {
      setIsLoading(true);
      const response = await adminApi.getCityCommissions(
        q ? { q: String(q).trim() } : {},
      );
      setCityRows(response?.data?.results || response?.data?.result || []);
    } catch (error) {
      showToast(error?.response?.data?.message || "Failed to load city commissions", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRows("");
  }, []);

  const onSave = async () => {
    const cityKey = normalizeCityKey(form.cityKey);
    if (!cityKey) {
      showToast("City key is required", "error");
      return;
    }
    try {
      setIsSaving(true);
      await adminApi.upsertCityCommission(cityKey, {
        ...form,
        cityKey,
        cityName: String(form.cityName || "").trim(),
      });
      showToast("City commission saved", "success");
      await loadRows(query);
      setForm((prev) => ({ ...prev, cityKey }));
    } catch (error) {
      showToast(error?.response?.data?.message || "Failed to save city commission", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredRows = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return cityRows;
    return cityRows.filter((row) => {
      const key = String(row.cityKey || "").toLowerCase();
      const name = String(row.cityName || "").toLowerCase();
      return key.includes(q) || name.includes(q);
    });
  }, [cityRows, query]);

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="admin-h1">City Commissions</h1>
        <p className="admin-description mt-1">
          Search and manage city-level commission overrides.
        </p>
      </div>

      <Card className="p-5 ring-1 ring-slate-100 border-none">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            value={form.cityKey}
            onChange={(e) => setForm((f) => ({ ...f, cityKey: e.target.value }))}
            placeholder="City key (e.g. indore)"
            className="w-full px-4 py-3 bg-slate-50 rounded-xl text-sm font-semibold outline-none"
          />
          <input
            value={form.cityName}
            onChange={(e) => setForm((f) => ({ ...f, cityName: e.target.value }))}
            placeholder="City name"
            className="w-full px-4 py-3 bg-slate-50 rounded-xl text-sm font-semibold outline-none"
          />
          <select
            value={form.adminCommissionType}
            onChange={(e) => setForm((f) => ({ ...f, adminCommissionType: e.target.value }))}
            className="w-full px-4 py-3 bg-slate-50 rounded-xl text-sm font-semibold outline-none"
          >
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed</option>
          </select>
          <input
            type="number"
            min="0"
            value={form.adminCommissionValue}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                adminCommissionValue: Number(e.target.value || 0),
              }))
            }
            placeholder="Commission value"
            className="w-full px-4 py-3 bg-slate-50 rounded-xl text-sm font-semibold outline-none"
          />
          {form.adminCommissionType === "fixed" && (
            <select
              value={form.adminCommissionFixedRule}
              onChange={(e) =>
                setForm((f) => ({ ...f, adminCommissionFixedRule: e.target.value }))
              }
              className="w-full px-4 py-3 bg-slate-50 rounded-xl text-sm font-semibold outline-none"
            >
              <option value="per_qty">Per qty</option>
              <option value="per_item">Per item</option>
            </select>
          )}
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={form.applyCommission}
              onChange={(e) => setForm((f) => ({ ...f, applyCommission: e.target.checked }))}
            />
            Apply commission for this city
          </label>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save City Commission"}
          </button>
          <button
            type="button"
            onClick={() => setForm(defaultForm)}
            className="px-5 py-2.5 bg-white text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest ring-1 ring-slate-200"
          >
            Reset
          </button>
        </div>
      </Card>

      <Card className="p-5 ring-1 ring-slate-100 border-none">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-700">
            Configured Cities
          </h2>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search city..."
            className="w-64 max-w-full px-4 py-2.5 bg-slate-50 rounded-xl text-sm font-semibold outline-none"
          />
        </div>
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading city commissions...</p>
        ) : filteredRows.length === 0 ? (
          <p className="text-sm text-slate-500">No city commission found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">City</th>
                  <th className="py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">City Key</th>
                  <th className="py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Commission</th>
                  <th className="py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Status</th>
                  <th className="py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.cityKey} className="border-b border-slate-50">
                    <td className="py-3 text-sm font-semibold text-slate-800">
                      {row.cityName || "—"}
                    </td>
                    <td className="py-3 text-sm font-semibold text-slate-700">
                      {row.cityKey}
                    </td>
                    <td className="py-3 text-sm font-semibold text-slate-700">
                      {row.adminCommissionType === "percentage"
                        ? `${row.adminCommissionValue || 0}%`
                        : `₹${row.adminCommissionValue || 0} (${row.adminCommissionFixedRule || "per_qty"})`}
                    </td>
                    <td className="py-3 text-sm font-semibold">
                      <span className={row.applyCommission ? "text-green-600" : "text-slate-500"}>
                        {row.applyCommission ? "Applied" : "Not applied"}
                      </span>
                    </td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() =>
                          setForm({
                            cityKey: row.cityKey || "",
                            cityName: row.cityName || "",
                            applyCommission: row.applyCommission === true,
                            adminCommissionType: row.adminCommissionType || "percentage",
                            adminCommissionValue: Number(row.adminCommissionValue || 0),
                            adminCommissionFixedRule: row.adminCommissionFixedRule || "per_qty",
                          })
                        }
                        className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ring-1 ring-slate-200 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default CityCommissions;
