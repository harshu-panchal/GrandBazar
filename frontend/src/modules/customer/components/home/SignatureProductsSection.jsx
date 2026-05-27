import React, { useState, useEffect } from "react";
import { Star } from "lucide-react";
import { customerApi } from "../../services/customerApi";
import { useLocation } from "../../context/LocationContext";
import ProductCard from "../shared/ProductCard";

const SignatureProductsSection = () => {
  const { currentLocation } = useLocation();
  const [signatureProducts, setSignatureProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSellersAndExtractSignatures = async () => {
      const hasValidLocation =
        Number.isFinite(currentLocation?.latitude) &&
        Number.isFinite(currentLocation?.longitude);

      if (!hasValidLocation) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const res = await customerApi.getNearbySellers({
          lat: currentLocation.latitude,
          lng: currentLocation.longitude,
        });

        const sellers = res.data?.results || res.data?.result || res.data || [];
        
        // Extract signature products from all nearby sellers
        const extractedProducts = [];
        sellers.forEach(seller => {
          if (seller.signatureProduct && typeof seller.signatureProduct === "object") {
            extractedProducts.push({
              ...seller.signatureProduct,
              id: seller.signatureProduct._id,
              image: seller.signatureProduct.mainImage || seller.signatureProduct.image || "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400",
              price: seller.signatureProduct.salePrice || seller.signatureProduct.price,
              originalPrice: seller.signatureProduct.price,
              weight: seller.signatureProduct.weight || "1 unit",
              storeName: seller.shopName || seller.name // Optional: track which store it came from
            });
          }
        });

        // Deduplicate by ID just in case
        const uniqueProducts = Array.from(new Map(extractedProducts.map(item => [item.id, item])).values());
        
        setSignatureProducts(uniqueProducts);
      } catch (error) {
        console.error("Error fetching signature products:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSellersAndExtractSignatures();
  }, [currentLocation?.latitude, currentLocation?.longitude]);

  if (isLoading || signatureProducts.length === 0) return null;

  return (
    <div className="w-full bg-slate-50 border-t border-slate-100 py-10 mt-6">
      <div className="container mx-auto px-4 md:px-8 lg:px-[50px]">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
              <Star size={20} className="text-amber-500 fill-amber-500" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight leading-none">
                Signature Products
              </h2>
              <p className="text-xs font-semibold text-slate-500 mt-1">
                Top picks directly from local stores around you
              </p>
            </div>
          </div>
        </div>

        <div className="flex overflow-x-auto gap-4 md:gap-6 pb-6 pt-2 -mx-4 px-4 md:mx-0 md:px-0 no-scrollbar snap-x">
          {signatureProducts.map(product => (
            <div key={product.id} className="min-w-[200px] md:min-w-[240px] max-w-[280px] shrink-0 snap-start">
              <ProductCard 
                product={product} 
                compact={false} 
                isSignature={true}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SignatureProductsSection;
