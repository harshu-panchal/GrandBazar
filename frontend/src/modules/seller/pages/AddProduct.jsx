import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import UnifiedProductForm from "@shared/components/product-form/UnifiedProductForm";
import { toProductFormData } from "@shared/components/product-form/productFormModel";
import { sellerApi } from "../services/sellerApi";

export default function AddProduct() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([sellerApi.getCategoryTree(), sellerApi.getProducts({ limit: 100 })])
      .then(([categoryResponse, productResponse]) => {
        setCategories(categoryResponse.data.results || categoryResponse.data.result || []);
        setProducts(productResponse.data.result?.items || productResponse.data.results?.items || []);
      })
      .catch(() => toast.error("Failed to load product form data"));
  }, []);

  const save = async (state, intent) => {
    setSaving(true);
    try {
      const response = await sellerApi.createProduct(toProductFormData(state, { intent }));
      toast.success(response?.data?.message || (intent === "draft" ? "Draft saved" : "Product submitted"));
      navigate("/seller/products");
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  return <div className="mx-auto max-w-6xl pb-12"><UnifiedProductForm title="Add product" categories={categories} products={products} saving={saving} onCancel={() => navigate("/seller/products")} onSave={save} /></div>;
}
