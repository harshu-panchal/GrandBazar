import React, { useEffect, useMemo, useState } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Modal from "@shared/components/ui/Modal";
import { adminApi } from "../services/adminApi";
import { toast } from "sonner";
import {
  HiOutlinePlus,
  HiOutlineArrowPath,
  HiOutlinePencilSquare,
  HiOutlineTrash,
  HiOutlineInboxStack,
  HiOutlineXMark,
} from "react-icons/hi2";
import { cn } from "@/lib/utils";

const emptyForm = {
  name: "",
  description: "",
  headerId: "",
  catalogProductIds: [],
  isActive: true,
};

const CatalogBundleManagement = () => {
  const [bundles, setBundles] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBundle, setEditingBundle] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [filterHeaderId, setFilterHeaderId] = useState("all");
  const [productSearch, setProductSearch] = useState("");

  const loadHeaders = async () => {
    const response = await adminApi.getCategoryTree();
    const tree = response.data.results || response.data.result || [];
    setHeaders(Array.isArray(tree) ? tree : []);
  };

  const loadBundles = async () => {
    setIsLoading(true);
    try {
      const params = filterHeaderId !== "all" ? { headerId: filterHeaderId } : undefined;
      const response = await adminApi.getCatalogBundles(params);
      const list = response.data.result || response.data.results || [];
      setBundles(Array.isArray(list) ? list : []);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load catalog bundles");
    } finally {
      setIsLoading(false);
    }
  };

  const loadCatalogProducts = async (headerId) => {
    if (!headerId) {
      setCatalogProducts([]);
      return;
    }
    try {
      const response = await adminApi.getCatalogProducts({
        headerId,
        limit: 200,
        status: "active",
      });
      const items = response.data.result?.items || [];
      setCatalogProducts(items);
    } catch (error) {
      setCatalogProducts([]);
      toast.error("Failed to load catalog products for this header");
    }
  };

  useEffect(() => {
    loadHeaders();
  }, []);

  useEffect(() => {
    loadBundles();
  }, [filterHeaderId]);

  useEffect(() => {
    if (isModalOpen) {
      loadCatalogProducts(formData.headerId);
    }
  }, [isModalOpen, formData.headerId]);

  const filteredCatalogProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return catalogProducts;
    return catalogProducts.filter((product) =>
      String(product.name || "").toLowerCase().includes(term),
    );
  }, [catalogProducts, productSearch]);

  const openCreateModal = () => {
    setEditingBundle(null);
    setFormData(emptyForm);
    setProductSearch("");
    setIsModalOpen(true);
  };

  const openEditModal = async (bundle) => {
    setEditingBundle(bundle);
    setFormData({
      name: bundle.name || "",
      description: bundle.description || "",
      headerId: bundle.headerId?._id || bundle.headerId || "",
      catalogProductIds: (bundle.catalogProductIds || []).map(String),
      isActive: bundle.isActive !== false,
    });
    setProductSearch("");
    setIsModalOpen(true);
  };

  const toggleProductSelection = (productId) => {
    const id = String(productId);
    setFormData((prev) => {
      const selected = new Set(prev.catalogProductIds.map(String));
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      return { ...prev, catalogProductIds: Array.from(selected) };
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.headerId || !formData.catalogProductIds.length) {
      toast.error("Name, header, and at least one catalog product are required");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        headerId: formData.headerId,
        catalogProductIds: formData.catalogProductIds,
        isActive: formData.isActive,
      };

      if (editingBundle) {
        await adminApi.updateCatalogBundle(editingBundle.id || editingBundle._id, payload);
        toast.success("Catalog bundle updated");
      } else {
        await adminApi.createCatalogBundle(payload);
        toast.success("Catalog bundle created");
      }

      setIsModalOpen(false);
      await loadBundles();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to save catalog bundle");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeactivate = async (bundle) => {
    if (!window.confirm(`Deactivate bundle "${bundle.name}"?`)) return;
    try {
      await adminApi.deleteCatalogBundle(bundle.id || bundle._id);
      toast.success("Catalog bundle deactivated");
      await loadBundles();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to deactivate bundle");
    }
  };

  return (
    <div className="ds-section-spacing pb-16">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="ds-h1 flex items-center gap-2">
            Catalog Bundles
            <Badge variant="info" className="text-[9px] uppercase">Starter Packs</Badge>
          </h1>
          <p className="ds-description mt-1">
            Curate header-based starter catalogues that approved shops can import in one click.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-black text-white rounded-xl text-sm font-bold"
        >
          <HiOutlinePlus className="h-4 w-4" />
          Create Bundle
        </button>
      </div>

      <Card className="border-none shadow-sm ring-1 ring-slate-100 p-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <select
            value={filterHeaderId}
            onChange={(e) => setFilterHeaderId(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 rounded-xl text-xs font-bold text-slate-700 outline-none"
          >
            <option value="all">All headers</option>
            {headers.map((header) => (
              <option key={header._id || header.id} value={header._id || header.id}>
                {header.name}
              </option>
            ))}
          </select>
          <button
            onClick={loadBundles}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white ring-1 ring-slate-200 rounded-xl text-xs font-bold text-slate-600"
          >
            <HiOutlineArrowPath className={cn("h-4 w-4", isLoading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </Card>

      <Card className="border-none shadow-xl ring-1 ring-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="ds-table-header-cell px-6">Bundle</th>
                <th className="ds-table-header-cell px-6">Header</th>
                <th className="ds-table-header-cell px-6">Products</th>
                <th className="ds-table-header-cell px-6">Status</th>
                <th className="ds-table-header-cell px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-16 text-center text-sm text-slate-500">
                    Loading catalog bundles...
                  </td>
                </tr>
              ) : bundles.length ? (
                bundles.map((bundle) => (
                  <tr key={bundle.id || bundle._id} className="hover:bg-slate-50/40">
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-slate-900">{bundle.name}</p>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{bundle.description || "No description"}</p>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-700">{bundle.headerName}</td>
                    <td className="px-6 py-4">
                      <Badge variant="gray">{bundle.productCount || 0} items</Badge>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={bundle.isActive ? "success" : "warning"}>
                        {bundle.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(bundle)}
                          className="h-9 w-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center"
                        >
                          <HiOutlinePencilSquare className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeactivate(bundle)}
                          className="h-9 w-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center"
                        >
                          <HiOutlineTrash className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <HiOutlineInboxStack className="h-10 w-10 text-slate-300" />
                      <p className="text-sm font-semibold text-slate-500">No catalog bundles yet</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingBundle ? "Edit Catalog Bundle" : "Create Catalog Bundle"}
        size="xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Bundle name</label>
              <input
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-50 text-sm font-semibold outline-none"
                placeholder="Grocery Starter Pack"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Header category</label>
              <select
                value={formData.headerId}
                onChange={(e) => setFormData((prev) => ({
                  ...prev,
                  headerId: e.target.value,
                  catalogProductIds: [],
                }))}
                className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-50 text-sm font-semibold outline-none"
              >
                <option value="">Select header</option>
                {headers.map((header) => (
                  <option key={header._id || header.id} value={header._id || header.id}>
                    {header.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
              className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-50 text-sm font-semibold outline-none"
              placeholder="Starter catalogue for grocery shops"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="bundleActive"
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
            />
            <label htmlFor="bundleActive" className="text-sm font-semibold text-slate-700">
              Active bundle
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <label className="text-xs font-bold text-slate-500 uppercase">
                Catalog products ({formData.catalogProductIds.length} selected)
              </label>
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products..."
                className="px-3 py-2 rounded-lg bg-slate-50 text-xs font-semibold outline-none"
              />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-50">
              {!formData.headerId ? (
                <p className="p-4 text-sm text-slate-500">Select a header to load catalog products.</p>
              ) : filteredCatalogProducts.length ? (
                filteredCatalogProducts.map((product) => {
                  const productId = String(product._id || product.id);
                  const checked = formData.catalogProductIds.includes(productId);
                  return (
                    <label
                      key={productId}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 cursor-pointer",
                        checked && "bg-primary/5",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProductSelection(productId)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 truncate">{product.name}</p>
                        <p className="text-xs text-slate-500 truncate">{product.categoryId?.name || "Catalog item"}</p>
                      </div>
                    </label>
                  );
                })
              ) : (
                <p className="p-4 text-sm text-slate-500">No active catalog products for this header.</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-black disabled:opacity-50"
            >
              {isSaving ? "Saving..." : editingBundle ? "Update Bundle" : "Create Bundle"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CatalogBundleManagement;
