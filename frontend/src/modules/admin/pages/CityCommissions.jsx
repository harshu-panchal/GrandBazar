import React, { useEffect, useMemo, useState } from "react";
import Card from "@shared/components/ui/Card";
import { useToast } from "@shared/components/ui/Toast";
import { adminApi } from "../services/adminApi";

const defaultForm = {
  cityKey: "",
  cityName: "",
  applyCommission: true,
  adminCommissionType: "percentage",
  adminCommissionValue: 0,
  adminCommissionFixedRule: "per_qty",
};

const shopsLabel = (count) => `${count} shop${count === 1 ? "" : "s"}`;

const formFromRate = (rate) => ({
  cityKey: rate.cityKey || "",
  cityName: rate.cityName || "",
  applyCommission: rate.applyCommission === true,
  adminCommissionType: rate.adminCommissionType || "percentage",
  adminCommissionValue: Number(rate.adminCommissionValue || 0),
  adminCommissionFixedRule: rate.adminCommissionFixedRule || "per_qty",
});

const fieldClass = "w-full px-4 py-3 bg-slate-50 rounded-xl text-sm font-semibold outline-none";

const CityCommissions = () => {
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [cityRows, setCityRows] = useState([]); // configured rates
  const [cityOptions, setCityOptions] = useState([]); // cities shops actually have
  const [shopsWithoutCity, setShopsWithoutCity] = useState(0);
  const [form, setForm] = useState(defaultForm);

  const load = async () => {
    try {
      setIsLoading(true);
      const [ratesRes, optionsRes] = await Promise.all([
        adminApi.getCityCommissions({}),
        adminApi.getCityCommissionOptions(),
      ]);
      setCityRows(ratesRes?.data?.results || ratesRes?.data?.result || []);
      const options = optionsRes?.data?.result || {};
      setCityOptions(Array.isArray(options.cities) ? options.cities : []);
      setShopsWithoutCity(Number(options.shopsWithoutCity || 0));
    } catch (error) {
      showToast(error?.response?.data?.message || "Failed to load city commissions", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const ratesByKey = useMemo(
    () => new Map(cityRows.map((row) => [row.cityKey, row])),
    [cityRows],
  );
  const shopCountByKey = useMemo(
    () => new Map(cityOptions.map((city) => [city.cityKey, city.shopCount])),
    [cityOptions],
  );

  // Dropdown = every city that has shops, plus any configured rate whose key no
  // shop matches (so it can still be opened, corrected or deleted).
  const dropdownOptions = useMemo(() => {
    const known = new Set(cityOptions.map((city) => city.cityKey));
    const orphans = cityRows
      .filter((row) => !known.has(row.cityKey))
      .map((row) => ({
        cityKey: row.cityKey,
        cityName: row.cityName || row.cityKey,
        shopCount: 0,
        hasRate: true,
      }));
    return [...cityOptions, ...orphans];
  }, [cityOptions, cityRows]);

  const onSelectCity = (cityKey) => {
    if (!cityKey) {
      setForm(defaultForm);
      return;
    }
    const existing = ratesByKey.get(cityKey);
    if (existing) {
      setForm(formFromRate(existing));
      return;
    }
    const option = dropdownOptions.find((city) => city.cityKey === cityKey);
    setForm({ ...defaultForm, cityKey, cityName: option?.cityName || cityKey });
  };

  const onSave = async () => {
    if (!form.cityKey) {
      showToast("Select a city first", "error");
      return;
    }
    const value = Number(form.adminCommissionValue || 0);
    if (form.adminCommissionType === "percentage" && (value < 0 || value > 100)) {
      showToast("Percentage must be between 0 and 100", "error");
      return;
    }
    try {
      setIsSaving(true);
      await adminApi.upsertCityCommission(form.cityKey, {
        ...form,
        adminCommissionValue: value,
      });
      showToast("City commission saved", "success");
      await load();
    } catch (error) {
      showToast(error?.response?.data?.message || "Failed to save city commission", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const onDelete = async (row) => {
    const shops = shopCountByKey.get(row.cityKey) || 0;
    const message = shops
      ? `Delete the commission for ${row.cityName || row.cityKey}? ${shopsLabel(shops)} there will go back to shop, category and header rates.`
      : `Delete the commission for ${row.cityName || row.cityKey}?`;
    if (!window.confirm(message)) return;
    try {
      await adminApi.deleteCityCommission(row.cityKey);
      showToast("City commission deleted", "success");
      if (form.cityKey === row.cityKey) setForm(defaultForm);
      await load();
    } catch (error) {
      showToast(error?.response?.data?.message || "Failed to delete city commission", "error");
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

  const selectedShops = form.cityKey ? shopCountByKey.get(form.cityKey) || 0 : 0;
  const selectedIsOrphan = Boolean(form.cityKey) && selectedShops === 0;

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="admin-h1">City Commissions</h1>
        <p className="admin-description mt-1">
          Set a commission for every shop in a city. It overrides category and header rates, but a
          shop-wise or subcategory rate still wins over it.
        </p>
      </div>

      <Card className="p-5 ring-1 ring-slate-100 border-none">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
              City
            </label>
            <select
              value={form.cityKey}
              onChange={(e) => onSelectCity(e.target.value)}
              disabled={isLoading}
              className={fieldClass}
            >
              <option value="">{isLoading ? "Loading cities..." : "Select a city"}</option>
              {dropdownOptions.map((city) => (
                <option key={city.cityKey} value={city.cityKey}>
                  {city.cityName} — {shopsLabel(city.shopCount)}
                  {city.hasRate ? " · rate set" : ""}
                </option>
              ))}
            </select>
            {selectedIsOrphan && (
              <p className="mt-1.5 text-xs font-semibold text-amber-600">
                No shop currently has this city, so this rate is not applied to anyone. Delete it,
                or fix the shops' city.
              </p>
            )}
            {shopsWithoutCity > 0 && (
              <p className="mt-1.5 text-xs font-medium text-slate-500">
                {shopsLabel(shopsWithoutCity)} {shopsWithoutCity === 1 ? "has" : "have"} no city set,
                so no city rate can reach {shopsWithoutCity === 1 ? "it" : "them"}.
              </p>
            )}
          </div>

          <select
            value={form.adminCommissionType}
            onChange={(e) => setForm((f) => ({ ...f, adminCommissionType: e.target.value }))}
            disabled={!form.cityKey}
            className={fieldClass}
          >
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed</option>
          </select>
          <input
            type="number"
            min="0"
            max={form.adminCommissionType === "percentage" ? 100 : undefined}
            step="any"
            value={form.adminCommissionValue}
            onChange={(e) =>
              setForm((f) => ({ ...f, adminCommissionValue: e.target.value }))
            }
            disabled={!form.cityKey}
            placeholder="Commission value"
            className={fieldClass}
          />
          {form.adminCommissionType === "fixed" && (
            <select
              value={form.adminCommissionFixedRule}
              onChange={(e) =>
                setForm((f) => ({ ...f, adminCommissionFixedRule: e.target.value }))
              }
              disabled={!form.cityKey}
              className={fieldClass}
            >
              <option value="per_qty">Per qty</option>
              <option value="per_item">Per item</option>
            </select>
          )}
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={form.applyCommission}
              disabled={!form.cityKey}
              onChange={(e) => setForm((f) => ({ ...f, applyCommission: e.target.checked }))}
            />
            Apply commission for this city
          </label>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || !form.cityKey}
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
                  <th className="py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Shops</th>
                  <th className="py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Commission</th>
                  <th className="py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Status</th>
                  <th className="py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const shops = shopCountByKey.get(row.cityKey) || 0;
                  return (
                    <tr key={row.cityKey} className="border-b border-slate-50">
                      <td className="py-3 text-sm font-semibold text-slate-800">
                        {row.cityName || "—"}
                        <span className="block text-[10px] font-medium text-slate-400">{row.cityKey}</span>
                      </td>
                      <td className="py-3 text-sm font-semibold">
                        {shops > 0 ? (
                          <span className="text-slate-700">{shopsLabel(shops)}</span>
                        ) : (
                          <span
                            className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700"
                            title="No shop has this city, so this rate isn't applied to anyone."
                          >
                            No shops match
                          </span>
                        )}
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
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setForm(formFromRate(row))}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ring-1 ring-slate-200 hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(row)}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-rose-600 ring-1 ring-rose-100 hover:bg-rose-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default CityCommissions;
