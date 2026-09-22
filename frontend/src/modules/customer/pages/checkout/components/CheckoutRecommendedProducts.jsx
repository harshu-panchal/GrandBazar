import React from "react";
import ProductCard from "../../../components/shared/ProductCard";

/**
 * CheckoutRecommendedProducts
 *
 * Props:
 *   products      – array of recommended product objects
 *   cart          – current cart (passed through to ProductCard if needed)
 *   onAddToCart   – (product) => void
 *   onGetCartItem – (productId) => cartItem | undefined
 */
const CheckoutRecommendedProducts = React.memo(function CheckoutRecommendedProducts({
  products,
  isAddon = false,
}) {
  const availableProducts = React.useMemo(() => {
    if (!Array.isArray(products)) return [];
    return products.filter((product) => {
      if (!product) return false;
      const stock = Number(product.stock ?? 0);
      const isOutOfStock =
        stock <= 0 &&
        (!product.variants ||
          product.variants.length === 0 ||
          !product.variants.some((v) => Number(v.stock || 0) > 0));
      return !isOutOfStock && product.isActive !== false && product.status !== "inactive";
    });
  }, [products]);

  if (!availableProducts || availableProducts.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <h3 className="font-black text-slate-800 text-lg mb-4 flex items-center gap-2">
        {isAddon ? "Perfect with your order" : "You might also like"}
        {isAddon && (
          <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-md tracking-wider uppercase">
            Seller Recommends
          </span>
        )}
      </h3>
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar -mx-4 px-4 snap-x">
        {availableProducts.map((product) => (
          <div key={product.id || product._id} className="flex-shrink-0 w-[126px] sm:w-[136px] md:w-[160px] snap-start">
            <ProductCard product={product} compact={true} />
          </div>
        ))}
      </div>
    </div>
  );
});

export default CheckoutRecommendedProducts;
