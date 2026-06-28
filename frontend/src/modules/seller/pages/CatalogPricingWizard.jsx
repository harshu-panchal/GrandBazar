import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Card from "@shared/components/ui/Card";
import Button from "@shared/components/ui/Button";
import { sellerApi } from "../services/sellerApi";
import { toast } from "sonner";
import {
  HiOutlineArrowLeft,
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
} from "react-icons/hi2";

const CatalogPricingWizard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [products, setProducts] = useState([]);
  const [pricingMap, setPricingMap] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [commissionPreview, setCommissionPreview] = useState({});

  const fetchCommissionPreview = useCallback(async (productId, price, categoryId) => {
    const numericPrice = Number(price);
    if (!categoryId || !Number.isFinite(numericPrice) || numericPrice <= 0) {
      setCommissionPreview((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
      return;
    }
    try {
      const response = await sellerApi.previewCommission({
        price: numericPrice,
        categoryId: String(categoryId),
        quantity: 1,
      });
      setCommissionPreview((prev) => ({
        ...prev,
        [productId]: response.data.result,
      }));
    } catch {
      setCommissionPreview((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
    }
  }, []);

  useEffect(() => {
    const timers = products.map((product) => {
      const productId = String(product._id || product.id);
      const pricing = pricingMap[productId] || {};
      const categoryId = product.headerId?._id || product.headerId;
      return setTimeout(() => {
        fetchCommissionPreview(productId, pricing.price, categoryId);
      }, 300);
    });
    return () => timers.forEach(clearTimeout);
  }, [products, pricingMap, fetchCommissionPreview]);

  const importedProductIds = location.state?.importedProductIds || [];

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      const response = await sellerApi.getUnpublishedProducts();
      let items = response.data.result || response.data.results || [];
      if (!Array.isArray(items)) items = [];

      if (importedProductIds.length) {
        const importedSet = new Set(importedProductIds.map(String));
        items = items.filter((product) => importedSet.has(String(product._id || product.id)));
      }

      setProducts(items);
      setSelectedIds(items.map((product) => String(product._id || product.id)));
      setPricingMap(
        items.reduce((acc, product) => {
          const id = String(product._id || product.id);
          acc[id] = { price: "", salePrice: "", stock: "0" };
          return acc;
        }, {}),
      );
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load products needing prices");
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const updatePricing = (productId, field, value) => {
    setPricingMap((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value,
      },
    }));
  };

  const toggleSelection = (productId) => {
    setSelectedIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId],
    );
  };

  const publishableItems = useMemo(() => {
    return selectedIds
      .map((productId) => {
        const pricing = pricingMap[productId] || {};
        const price = Number(pricing.price);
        const stock = Number(pricing.stock);
        if (!Number.isFinite(price) || price <= 0) return null;
        if (!Number.isFinite(stock) || stock < 0) return null;
        return {
          productId,
          price,
          salePrice: Number(pricing.salePrice) || 0,
          stock,
        };
      })
      .filter(Boolean);
  }, [selectedIds, pricingMap]);

  const handlePublish = async (publishAll = false) => {
    const items = publishAll
      ? products
          .map((product) => {
            const productId = String(product._id || product.id);
            const pricing = pricingMap[productId] || {};
            const price = Number(pricing.price);
            const stock = Number(pricing.stock);
            if (!Number.isFinite(price) || price <= 0) return null;
            if (!Number.isFinite(stock) || stock < 0) return null;
            return {
              productId,
              price,
              salePrice: Number(pricing.salePrice) || 0,
              stock,
            };
          })
          .filter(Boolean)
      : publishableItems;

    if (!items.length) {
      toast.error("Enter valid prices and stock for at least one selected product");
      return;
    }

    setIsPublishing(true);
    try {
      const response = await sellerApi.bulkPublishProductPricing({ items });
      const result = response.data.result || {};
      toast.success(response.data.message || "Products published");
      if (result.errors?.length) {
        toast.error(`${result.errors.length} product(s) could not be published`);
      }
      navigate("/seller/products", { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to publish products");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <button
            onClick={() => navigate("/seller/products")}
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 mb-3"
          >
            <HiOutlineArrowLeft className="h-4 w-4" />
            Back to products
          </button>
          <h1 className="text-2xl font-bold text-slate-900">Set prices to publish</h1>
          <p className="text-sm text-slate-500 mt-1">
            Imported catalogue products stay hidden from customers until you set a price and publish them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => handlePublish(false)}
            disabled={isPublishing || publishableItems.length === 0}
          >
            Publish selected
          </Button>
          <Button
            onClick={() => handlePublish(true)}
            disabled={isPublishing || products.length === 0}
          >
            {isPublishing ? "Publishing..." : "Publish all valid rows"}
          </Button>
        </div>
      </div>

      <Card className="border-none shadow-sm ring-1 ring-slate-100 overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-slate-500">
            <HiOutlineArrowPath className="h-6 w-6 animate-spin mx-auto mb-3 text-slate-400" />
            Loading imported products...
          </div>
        ) : products.length === 0 ? (
          <div className="p-10 text-center">
            <HiOutlineCheckCircle className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700">No products waiting for pricing.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Select</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Product</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Price</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Sale price</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">Stock</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">You receive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {products.map((product) => {
                  const productId = String(product._id || product.id);
                  const pricing = pricingMap[productId] || { price: "", salePrice: "", stock: "0" };
                  return (
                    <tr key={productId}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(productId)}
                          onChange={() => toggleSelection(productId)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {product.mainImage ? (
                            <img src={product.mainImage} alt="" className="h-12 w-12 rounded-lg object-cover" />
                          ) : (
                            <div className="h-12 w-12 rounded-lg bg-slate-100" />
                          )}
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{product.name}</p>
                            <p className="text-xs text-amber-600 font-semibold">Needs pricing</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={pricing.price}
                          onChange={(e) => updatePricing(productId, "price", e.target.value)}
                          className="w-28 px-3 py-2 rounded-lg bg-slate-50 text-sm font-semibold outline-none"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={pricing.salePrice}
                          onChange={(e) => updatePricing(productId, "salePrice", e.target.value)}
                          className="w-28 px-3 py-2 rounded-lg bg-slate-50 text-sm font-semibold outline-none"
                          placeholder="Optional"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={pricing.stock}
                          onChange={(e) => updatePricing(productId, "stock", e.target.value)}
                          className="w-24 px-3 py-2 rounded-lg bg-slate-50 text-sm font-semibold outline-none"
                        />
                      </td>
                      <td className="px-4 py-3">
                        {commissionPreview[productId] ? (
                          <div className="text-xs">
                            <p className="font-bold text-emerald-700">
                              ₹{commissionPreview[productId].sellerReceives?.toFixed(2)}
                            </p>
                            <p className="text-slate-400">
                              Fee ₹{commissionPreview[productId].platformCommission?.toFixed(2)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
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

export default CatalogPricingWizard;
