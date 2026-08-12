import React, { useEffect, useState } from "react";
import { ChevronRight, Flame } from "lucide-react";
import { useNavigate } from "react-router-dom";
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

/**
 * Real sales-volume trending, distinct from the "Lowest Price" merchandising
 * row and from trending *search terms* — see backend/app/services/
 * trendingProductsService.js.
 */
const TrendingProductsSection = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);

  useEffect(() => {
    let cancelled = false;
    customerApi
      .getTrendingProducts(12)
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
  }, []);

  if (!products.length) return null;

  return (
    <div className="mb-4 md:mb-8">
      <div className="container mx-auto px-4 md:px-8 lg:px-[50px]">
        <div className="flex justify-between items-center mb-4 md:mb-6 px-1">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100">
              <Flame size={14} className="text-orange-500" />
            </div>
            <h3 className="text-base md:text-xl font-black text-[#1A1A1A] tracking-tight uppercase leading-none">
              Trending <span className="text-orange-500">now</span>
            </h3>
          </div>
          <button
            onClick={() => navigate("/category/all")}
            className="flex items-center gap-1 bg-white px-2.5 py-1 md:px-4 md:py-2 rounded-full text-slate-700 font-bold text-[11px] md:text-sm cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.05)] md:shadow-md border border-slate-100 transition-all whitespace-nowrap active:scale-95"
          >
            See all
            <ChevronRight size={12} className="ml-0.5" strokeWidth={3} />
          </button>
        </div>

        <div className="flex overflow-x-auto gap-3 md:gap-6 pb-2 md:pb-3 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory scroll-smooth">
          {products.map((product) => (
            <div key={product.id} className="w-[126px] sm:w-[136px] md:w-[148px] shrink-0 snap-start">
              <ProductCard
                product={product}
                className="bg-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.1)] md:shadow-[0_15px_30px_rgba(0,0,0,0.05)] border-slate-100 transition-all"
                compact={true}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default React.memo(TrendingProductsSection);
