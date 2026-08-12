import React, { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import ProductCard from "../shared/ProductCard";
import { customerApi } from "../../services/customerApi";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400";

const normalizeProduct = (p) => ({
  ...p,
  id: p._id,
  image: p.mainImage || p.image || FALLBACK_IMAGE,
  price: p.salePrice || p.price,
  originalPrice: p.price,
  weight: p.weight || "1 unit",
  deliveryTime: p.deliveryEta?.label || "8-15 mins",
});

const SimilarProductsSection = ({ productId, lat, lng }) => {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    const params = { limit: 10 };
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      params.lat = lat;
      params.lng = lng;
    }
    customerApi
      .getSimilarProducts(productId, params)
      .then((res) => {
        if (cancelled) return;
        const items = res?.data?.result?.items || [];
        setProducts(items.map(normalizeProduct));
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, lat, lng]);

  if (!products.length) return null;

  return (
    <div className="mt-12 pt-10 border-t border-slate-100">
      <div className="flex items-center gap-2 mb-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
          <Layers size={16} className="text-primary" />
        </div>
        <h3 className="text-2xl font-black text-slate-800 tracking-tight">Similar Products</h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-3 md:gap-x-4 gap-y-6 md:gap-y-10">
        {products.map((product) => (
          <div key={product.id} className="flex justify-center">
            <ProductCard product={product} compact={true} neutralBg={true} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(SimilarProductsSection);
