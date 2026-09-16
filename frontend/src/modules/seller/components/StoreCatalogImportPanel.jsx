import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { HiOutlineInboxStack, HiOutlineArrowPath, HiOutlineChevronDown, HiOutlineChevronUp } from "react-icons/hi2";
import { sellerApi } from "../services/sellerApi";
import Button from "@shared/components/ui/Button";
import { getProductImageUrl, handleProductImageError } from "@core/utils/imageUtils";

const StoreCatalogImportPanel = ({ className = "" }) => {
  const navigate = useNavigate();
  const [bundles, setBundles] = useState([]);
  const [selectedBundleIds, setSelectedBundleIds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [expandedBundleId, setExpandedBundleId] = useState(null);
  const [bundleProducts, setBundleProducts] = useState({});
  const [loadingProductsFor, setLoadingProductsFor] = useState(null);

  const toggleExpand = async (bundleId) => {
    if (expandedBundleId === bundleId) {
      setExpandedBundleId(null);
      return;
    }
    setExpandedBundleId(bundleId);
    if (bundleProducts[bundleId]) return;
    setLoadingProductsFor(bundleId);
    try {
      const response = await sellerApi.getCatalogBundleProducts(bundleId);
      const products = response.data?.result?.products || [];
      setBundleProducts((prev) => ({ ...prev, [bundleId]: products }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load products in this bundle");
      setBundleProducts((prev) => ({ ...prev, [bundleId]: [] }));
    } finally {
      setLoadingProductsFor(null);
    }
  };

  const loadBundles = async () => {
    setIsLoading(true);
    try {
      const response = await sellerApi.getAvailableCatalogBundles();
      const payload = response.data.result || {};
      setBundles(Array.isArray(payload.bundles) ? payload.bundles : []);
    } catch (error) {
      setBundles([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBundles();
  }, []);

  const toggleBundle = (bundleId) => {
    const id = String(bundleId);
    setSelectedBundleIds((prev) =>
      prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id],
    );
  };

  const handleImport = async () => {
    if (!selectedBundleIds.length) return;
    setIsImporting(true);
    try {
      const response = await sellerApi.importCatalogBundles({
        bundleIds: selectedBundleIds,
      });
      const result = response.data.result || {};
      toast.success(response.data.message || "Starter catalogue imported");
      navigate("/seller/products/pricing", {
        state: { importedProductIds: result.productIds || [] },
      });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to import starter catalogue");
    } finally {
      setIsImporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-500 ${className}`}>
        Checking starter catalogues...
      </div>
    );
  }

  if (!bundles.length) {
    return null;
  }

  return (
    <div className={`rounded-xl border border-brand-100 bg-brand-50/60 p-4 space-y-3 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-brand-600 shrink-0">
          <HiOutlineInboxStack className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">Import starter catalogue</p>
          <p className="text-xs text-slate-600 mt-1">
            Select one or more header bundles, import products in one click, then set prices to publish them.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {bundles.map((bundle) => {
          const bundleId = String(bundle.id || bundle._id);
          const checked = selectedBundleIds.includes(bundleId);
          const isExpanded = expandedBundleId === bundleId;
          const products = bundleProducts[bundleId];
          const isLoadingProducts = loadingProductsFor === bundleId;
          return (
            <div
              key={bundleId}
              className={`rounded-lg border ${checked ? "border-brand-300 bg-white" : "border-transparent bg-white/70"}`}
            >
              <div className="flex items-center gap-3 px-3 py-2">
                <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleBundle(bundleId)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{bundle.name}</p>
                    <p className="text-xs text-slate-500">
                      {bundle.headerName} · {bundle.productCount || 0} products
                    </p>
                  </div>
                </label>
                <button
                  type="button"
                  onClick={() => toggleExpand(bundleId)}
                  className="shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  title="View products in this bundle"
                >
                  {isExpanded ? <HiOutlineChevronUp className="h-4 w-4" /> : <HiOutlineChevronDown className="h-4 w-4" />}
                </button>
              </div>

              {isExpanded && (
                <div className="border-t border-slate-100 px-3 py-2">
                  {isLoadingProducts ? (
                    <p className="text-xs text-slate-400 py-1">Loading products...</p>
                  ) : !products || !products.length ? (
                    <p className="text-xs text-slate-400 py-1">No products found in this bundle.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {products.map((product) => (
                        <div key={product._id} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5">
                          <img
                            src={getProductImageUrl(product.mainImage || product.images?.[0])}
                            onError={handleProductImageError}
                            alt={product.name}
                            className="h-8 w-8 rounded object-cover shrink-0"
                          />
                          <span className="text-xs text-slate-700 truncate">{product.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleImport}
          disabled={!selectedBundleIds.length || isImporting}
          className="inline-flex items-center gap-2"
        >
          {isImporting ? <HiOutlineArrowPath className="h-4 w-4 animate-spin" /> : null}
          Import selected
        </Button>
        <button
          type="button"
          onClick={loadBundles}
          className="text-xs font-bold text-slate-500 hover:text-slate-700"
        >
          Refresh
        </button>
      </div>
    </div>
  );
};

export default StoreCatalogImportPanel;
